/**
 * HireFlow job feed — /jobs.xml (rewritten to /api/job-feed).
 *
 * Standard aggregator XML feed ("Indeed-style" <source><job> format) of every
 * PUBLISHED job, each under its REAL employer's company name. This makes
 * HireFlow its own job source: aggregators that accept feeds self-serve
 * (Adzuna, Jooble, Talent.com, Careerjet, …) ingest this URL and list our jobs
 * for free; every click lands on hireflownow.com/candidate/job/:id (which is
 * prerendered for bots) and applications flow into Ava's screening.
 *
 * DELIBERATELY self-contained plain-JS ESM (.mjs, ZERO imports) — same hard
 * lesson as job-prerender.mjs: importing from ../src crashes Vercel's runtime
 * at module load. Keep this file dependency-free.
 */

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
export const ORIGIN = "https://hireflownow.com";

const JOB_FIELDS =
  "id,title,description,responsibilities,requirements,location,job_type,salary_min,salary_max,salary_currency,salary_period,created_at,application_deadline,job_code,location_city,location_region,location_country,location_country_code,is_remote,employer_id,exclude_from_feed";

/** Aggregators reject a listing whose description is thinner than this (plain-text characters). */
const MIN_DESCRIPTION_CHARS = 100;

/** US state name (lower-case) → postal abbreviation. A state is never a city. */
const US_STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const US_STATE_ABBRS = new Set(Object.values(US_STATES));

/**
 * Country names and codes (lower-case) that must never be mistaken for a city.
 * The gate also checks the job's OWN stored country name/code, so this list only
 * has to catch the common ways an employer writes a country into a location.
 */
const COUNTRY_TOKENS = new Set([
  "united states", "united states of america", "usa", "us", "u.s.", "u.s.a.", "america",
  "united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "gb",
  "canada", "ca", "pakistan", "pk", "india", "in", "australia", "au", "new zealand", "nz",
  "united arab emirates", "uae", "ae", "saudi arabia", "sa", "qatar", "qa", "kuwait", "kw", "bahrain", "bh", "oman", "om",
  "germany", "de", "france", "fr", "spain", "es", "italy", "it", "netherlands", "the netherlands", "nl",
  "ireland", "ie", "belgium", "be", "portugal", "pt", "sweden", "se", "norway", "no", "denmark", "dk",
  "finland", "fi", "switzerland", "ch", "austria", "at", "poland", "pl",
  "mexico", "mx", "brazil", "br", "argentina", "ar", "colombia", "co", "chile", "cl",
  "philippines", "ph", "indonesia", "id", "malaysia", "my", "singapore", "sg", "thailand", "th", "vietnam", "vn",
  "bangladesh", "bd", "sri lanka", "lk", "nepal", "np", "china", "cn", "japan", "jp", "south korea", "korea", "kr",
  "nigeria", "ng", "kenya", "ke", "south africa", "za", "egypt", "eg", "ghana", "gh", "morocco", "ma",
  "turkey", "türkiye", "tr", "israel", "il", "remote",
]);

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** CDATA-safe: a literal "]]>" inside content would break the XML. */
export function cdata(s) {
  return `<![CDATA[${String(s ?? "").replaceAll("]]>", "]]&gt;")}]]>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Descriptions written in the rich editor are stored as HTML already. */
function looksLikeHtml(s) {
  return /<[a-z][\s\S]*>/i.test(String(s ?? ""));
}

const BULLET = /^[•\-*·]\s*/;

/** Plain text (blank-line paragraphs, "•"/"-" bullets, **bold**) → simple HTML. */
function textToHtml(text) {
  const inline = (line) => escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const list = (lines) => `<ul>${lines.map((l) => `<li>${inline(l.replace(BULLET, ""))}</li>`).join("")}</ul>`;

  return String(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return "";
      const bulletCount = lines.filter((l) => BULLET.test(l)).length;
      if (bulletCount === lines.length) return list(lines);
      // "What you'll do:" followed by its bullets — a lead line, then the list.
      if (bulletCount > 0 && bulletCount === lines.length - 1 && !BULLET.test(lines[0])) {
        return `<p>${inline(lines[0])}</p>${list(lines.slice(1))}`;
      }
      return `<p>${lines.map(inline).join("<br/>")}</p>`;
    })
    .join("");
}

function sectionHtml(text) {
  return looksLikeHtml(text) ? String(text) : textToHtml(text);
}

/** The listing body as HTML — what every aggregator expects inside <description>. */
function descriptionHtml(job) {
  const parts = [];
  if (job.description) parts.push(sectionHtml(job.description));
  if (job.responsibilities) parts.push(`<h3>What you'll do</h3>${sectionHtml(job.responsibilities)}`);
  if (job.requirements) parts.push(`<h3>What we're looking for</h3>${sectionHtml(job.requirements)}`);
  return parts.join("");
}

function plainTextLength(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/**
 * Is this comma-token a real city? Not when it is a country (by name or code —
 * the job's own stored country included), a US state, or the word "Remote".
 * Case-insensitive throughout.
 */
function isCityToken(token, job) {
  const t = String(token ?? "").trim();
  const lower = t.toLowerCase();
  if (!t) return false;
  if (COUNTRY_TOKENS.has(lower)) return false;
  if (job.location_country && lower === String(job.location_country).trim().toLowerCase()) return false;
  if (job.location_country_code && lower === String(job.location_country_code).trim().toLowerCase()) return false;
  if (US_STATES[lower] || US_STATE_ABBRS.has(t.toUpperCase())) return false;
  return true;
}

/**
 * The job's city, or "" when it has none we can stand behind. A stored
 * location_city wins; otherwise the text before the first comma qualifies only
 * when there IS a comma, the location is not just "Remote", and the token is not
 * itself a country or a state. "Pakistan" alone used to come through as a city —
 * this is what stops that.
 */
function cityOf(job) {
  const stored = String(job.location_city ?? "").trim();
  if (stored) return stored;
  const loc = String(job.location ?? "").trim();
  if (!loc || /^remote$/i.test(loc) || !loc.includes(",")) return "";
  // "Remote — Lahore, Pakistan" still names Lahore.
  const first = loc.split(",")[0].replace(/^remote\b[\s—–\-:|]*/i, "").trim();
  return isCityToken(first, job) ? first : "";
}

/** 2-letter state when we know it (US names → postal codes); otherwise the region as stored. */
function stateOf(job) {
  const r = String(job.location_region ?? "").trim();
  if (!r) return "";
  const abbr = US_STATES[r.toLowerCase()];
  if (abbr) return abbr;
  if (/^[a-z]{2}$/i.test(r)) return r.toUpperCase();
  return r;
}

function salaryPeriod(job) {
  const per = String(job.salary_period ?? "").toLowerCase();
  return ["hour", "day", "week", "month", "year"].includes(per) ? per : "";
}

function salaryText(job) {
  const cur = job.salary_currency || "USD";
  const per = salaryPeriod(job);
  const perText = per ? ` per ${per}` : "";
  if (job.salary_min && job.salary_max) return `${cur} ${job.salary_min} - ${job.salary_max}${perText}`;
  if (job.salary_min) return `${cur} ${job.salary_min}+${perText}`;
  if (job.salary_max) return `up to ${cur} ${job.salary_max}${perText}`;
  return "";
}

/** Controlled vocabulary aggregators map cleanly: Full time / Part-time / Contract / Temporary / Internship. */
function jobTypeText(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("full")) return "Full time";
  if (s.includes("part")) return "Part-time";
  if (s.includes("contract")) return "Contract";
  if (s.includes("intern")) return "Internship";
  if (s.includes("temp")) return "Temporary";
  return "Full time";
}

/** YYYY-MM-DD, or "" for an unparseable date. */
function isoDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Load every job that may leave the building, already normalised for any
 * aggregator format. Shared by /jobs.xml (Indeed/Talent.com style),
 * /jooble.xml and /adzuna.xml so the quality gate lives in exactly one place.
 */
export async function loadFeedJobs() {
  const now = Date.now();
  const raw =
    (await sb(`published_jobs_public?select=${encodeURIComponent(JOB_FIELDS)}&order=created_at.desc&limit=1000`)) ?? [];

  // Company names per employer (one query for all).
  const employerIds = [...new Set(raw.map((j) => j.employer_id).filter(Boolean))];
  const companies = new Map();
  if (employerIds.length > 0) {
    const list = employerIds.map((id) => `"${id}"`).join(",");
    // employer_public_branding = safe public view (name+logo only); raw profiles are RLS-locked.
    const profiles = await sb(`employer_public_branding?user_id=in.(${encodeURIComponent(list)})&select=user_id,company_name`);
    for (const p of profiles ?? []) {
      if (p.company_name) companies.set(p.user_id, p.company_name);
    }
  }

  /**
   * QUALITY GATE. Aggregators (and Google for Jobs) reject — and can blacklist a
   * whole source over — listings with no employer, no real location, or an
   * expired date. A job only reaches the feed when it can stand on its own:
   *   - not explicitly excluded (QA/demo jobs)
   *   - deadline not passed
   *   - a REAL company name (never the "Private employer" placeholder)
   *   - a REAL city (never a country or a state standing in for one) and a country
   *   - a description with at least MIN_DESCRIPTION_CHARS of actual text
   * Anything failing is silently held back rather than poisoning the source.
   */
  return raw
    .map((job) => ({ job, city: cityOf(job), html: descriptionHtml(job) }))
    .filter(({ job, city, html }) => {
      if (job.exclude_from_feed) return false;
      if (job.application_deadline && new Date(job.application_deadline).getTime() < now) return false;
      const company = companies.get(job.employer_id);
      if (!company || !String(company).trim()) return false;
      if (!city) return false;
      if (!(job.location_country_code || job.location_country)) return false;
      if (plainTextLength(html) < MIN_DESCRIPTION_CHARS) return false;
      return true;
    })
    .map(({ job, city, html }) => ({
      job,
      company: companies.get(job.employer_id),
      city,
      state: stateOf(job),
      country: job.location_country_code || job.location_country || "US",
      html,
      plainLength: plainTextLength(html),
      salary: salaryText(job),
      hasStructuredSalary: job.salary_min != null || job.salary_max != null,
      period: salaryPeriod(job),
      expires: job.application_deadline ? isoDay(job.application_deadline) : "",
      jobType: jobTypeText(job.job_type),
      isRemote: Boolean(job.is_remote),
      reference: job.job_code || job.id,
      posted: new Date(job.created_at),
      urlFor: (source) => `${ORIGIN}/candidate/job/${job.id}?utm_source=${source}&utm_medium=organic`,
    }));
}

/** Serve valid XML no matter what — a crawler must never see a broken URL. */
export function sendXml(res, xml) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Cache at the edge for 15 min; aggregators poll on their own schedule anyway.
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).send(xml);
}

export default async function handler(req, res) {
  try {
    const entries = await loadFeedJobs();
    const items = entries.map((e) => {
      const { job } = e;
      const url = e.urlFor("jobfeed");
      return [
        "  <job>",
        `    <title>${cdata(job.title)}</title>`,
        // Both spellings: <date> (Indeed-style RFC-1123) and <dateposted> (ISO-8601,
        // required by Talent.com and others). Emitting one only fails validation.
        `    <date>${cdata(e.posted.toUTCString())}</date>`,
        `    <dateposted>${cdata(e.posted.toISOString())}</dateposted>`,
        e.expires ? `    <expirationdate>${cdata(e.expires)}</expirationdate>` : null,
        `    <referencenumber>${cdata(e.reference)}</referencenumber>`,
        `    <url>${cdata(url)}</url>`,
        `    <company>${cdata(e.company)}</company>`,
        `    <city>${cdata(e.city)}</city>`,
        `    <state>${cdata(e.state)}</state>`,
        `    <country>${cdata(e.country)}</country>`,
        `    <description>${cdata(e.html)}</description>`,
        e.salary ? `    <salary>${cdata(e.salary)}</salary>` : null,
        job.salary_min != null ? `    <salarymin>${cdata(job.salary_min)}</salarymin>` : null,
        job.salary_max != null ? `    <salarymax>${cdata(job.salary_max)}</salarymax>` : null,
        e.hasStructuredSalary ? `    <salarycurrency>${cdata(job.salary_currency || "USD")}</salarycurrency>` : null,
        e.hasStructuredSalary && e.period ? `    <salaryperiod>${cdata(e.period)}</salaryperiod>` : null,
        `    <jobtype>${cdata(e.jobType)}</jobtype>`,
        `    <isremote>${cdata(e.isRemote ? "yes" : "no")}</isremote>`,
        // Kept for feeds that already read the older spelling.
        e.isRemote ? `    <remote>${cdata("yes")}</remote>` : null,
        "  </job>",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      "<source>",
      `  <publisher>${cdata("HireFlow")}</publisher>`,
      `  <publisherurl>${cdata(ORIGIN)}</publisherurl>`,
      `  <lastBuildDate>${cdata(new Date().toUTCString())}</lastBuildDate>`,
      ...items,
      "</source>",
      "",
    ].join("\n");
    sendXml(res, xml);
  } catch (e) {
    // Never break the URL for a crawler — serve an empty valid feed on error.
    sendXml(res, `<?xml version="1.0" encoding="UTF-8"?>\n<source><publisher>HireFlow</publisher><publisherurl>${ORIGIN}</publisherurl></source>\n`);
  }
}
