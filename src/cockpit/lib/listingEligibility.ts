/**
 * Pure, employer-facing mirror of the two REAL distribution gates so the
 * Jobs list can show truthful "Google for Jobs" / "Job boards" chips instead
 * of always-on ones.
 *
 * This intentionally duplicates logic rather than importing it:
 *   - api/job-feed.mjs (loadFeedJobs' QUALITY GATE) must stay a dependency-
 *     free, self-contained .mjs (see its own file header) — it cannot be
 *     imported from the Vite/browser bundle.
 *   - supabase/functions/sitemap/index.ts (indexableJobs) runs in Deno and
 *     is likewise not importable here.
 *
 * Keep both gates below byte-for-byte in sync with their sources whenever
 * either changes. scripts/listing_eligibility.test.mjs proves this file
 * agrees with the REAL loadFeedJobs() (imported live) and a ported copy of
 * the sitemap filter, over a shared set of fixtures.
 */

/** Aggregators reject a listing whose description is thinner than this (plain-text characters). Mirrors api/job-feed.mjs. */
const MIN_DESCRIPTION_CHARS = 100;

/** US state name (lower-case) → postal abbreviation. A state is never a city. Mirrors api/job-feed.mjs. */
const US_STATES: Record<string, string> = {
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
 * Mirrors api/job-feed.mjs / supabase/functions/sitemap/index.ts.
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

/** Loose country hints in free-text `location` — mirrors sitemap/index.ts's inferCountryCode. */
const COUNTRY_TEXT_HINTS: Array<[RegExp, string]> = [
  [/\b(united states|u\.s\.a\.?|usa|us)\b/i, "US"],
  [/\bcanada\b/i, "CA"],
  [/\bpakistan\b/i, "PK"],
  [/\bunited kingdom\b|\buk\b|\bgreat britain\b/i, "GB"],
  [/\bindia\b/i, "IN"],
  [/\baustralia\b/i, "AU"],
  [/\bunited arab emirates\b|\buae\b/i, "AE"],
  [/\bgermany\b/i, "DE"],
  [/\bfrance\b/i, "FR"],
  [/\bspain\b/i, "ES"],
  [/\bitaly\b/i, "IT"],
  [/\bnetherlands\b/i, "NL"],
  [/\bireland\b/i, "IE"],
];
const US_STATE_HINT = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i;
const US_STATE_NAME_HINT = /,\s*(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

function inferCountryCode(locationText?: string | null): string | null {
  const text = (locationText ?? "").trim();
  if (!text) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text) || US_STATE_NAME_HINT.test(text)) return "US";
  return null;
}

/** The shape both gates read. A subset of the `jobs` row — every field is optional/nullable. */
export interface ListingEligibilityJob {
  exclude_from_feed?: boolean | null;
  application_deadline?: string | null;
  location?: string | null;
  location_city?: string | null;
  location_country?: string | null;
  location_country_code?: string | null;
  is_remote?: boolean | null;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
}

export interface ListingEligibility {
  /** Mirrors supabase/functions/sitemap/index.ts's indexableJobs filter. */
  google: boolean;
  /** Mirrors api/job-feed.mjs's loadFeedJobs() quality gate (jobs.xml / jooble.xml / adzuna.xml). */
  boards: boolean;
  /** The first thing the employer can fix, or null when both chips are already true. */
  reason: string | null;
}

/**
 * Is this comma-token a real city? Not when it is a country (by name or code —
 * the job's own stored country included), a US state, or the word "Remote".
 * Mirrors isCityToken in both api/job-feed.mjs and sitemap/index.ts.
 */
function isCityToken(token: string, job: ListingEligibilityJob): boolean {
  const t = String(token ?? "").trim();
  const lower = t.toLowerCase();
  if (!t) return false;
  if (COUNTRY_TOKENS.has(lower)) return false;
  if (job.location_country && lower === String(job.location_country).trim().toLowerCase()) return false;
  if (job.location_country_code && lower === String(job.location_country_code).trim().toLowerCase()) return false;
  if (US_STATES[lower] || US_STATE_ABBRS.has(t.toUpperCase())) return false;
  return true;
}

/** Mirrors cityOf in both api/job-feed.mjs and sitemap/index.ts (identical rule in both). */
function cityOf(job: ListingEligibilityJob): string {
  const stored = String(job.location_city ?? "").trim();
  if (stored) return stored;
  const loc = String(job.location ?? "").trim();
  if (!loc || /^remote$/i.test(loc) || !loc.includes(",")) return "";
  const first = loc.split(",")[0].replace(/^remote\b[\s—–\-:|]*/i, "").trim();
  return isCityToken(first, job) ? first : "";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(s ?? ""));
}

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "a", "code", "pre", "hr",
]);
const SAFE_HREF = /^(?:https?:|mailto:|tel:|\/|#)/i;

/** Mirrors sanitizeFeedHtml in api/job-feed.mjs — only used here to measure plain-text length. */
function sanitizeFeedHtml(html: string): string {
  return String(html ?? "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, (tag) => {
      const m = /^<\/?([a-zA-Z0-9]+)/.exec(tag);
      const name = m ? m[1].toLowerCase() : "";
      if (!ALLOWED_TAGS.has(name)) return "";
      const closing = /^<\//.test(tag);
      if (closing) return `</${name}>`;
      if (name === "a") {
        const hrefMatch = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(tag);
        const href = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? "") : "";
        return SAFE_HREF.test(href.trim())
          ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">`
          : "<a>";
      }
      return `<${name}>`;
    });
}

const BULLET = /^[•\-*·]\s*/;

/** Plain text (blank-line paragraphs, "•"/"-" bullets, **bold**) → simple HTML. Mirrors api/job-feed.mjs's textToHtml. */
function textToHtml(text: string): string {
  const inline = (line: string) => escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const list = (lines: string[]) => `<ul>${lines.map((l) => `<li>${inline(l.replace(BULLET, ""))}</li>`).join("")}</ul>`;

  return String(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return "";
      const bulletCount = lines.filter((l) => BULLET.test(l)).length;
      if (bulletCount === lines.length) return list(lines);
      if (bulletCount > 0 && bulletCount === lines.length - 1 && !BULLET.test(lines[0])) {
        return `<p>${inline(lines[0])}</p>${list(lines.slice(1))}`;
      }
      return `<p>${lines.map(inline).join("<br/>")}</p>`;
    })
    .join("");
}

function sectionHtml(text: string): string {
  return looksLikeHtml(text) ? sanitizeFeedHtml(text) : textToHtml(text);
}

/** Mirrors descriptionHtml in api/job-feed.mjs. */
function descriptionHtml(job: ListingEligibilityJob): string {
  const parts: string[] = [];
  if (job.description) parts.push(sectionHtml(job.description));
  if (job.responsibilities) parts.push(`<h3>What you'll do</h3>${sectionHtml(job.responsibilities)}`);
  if (job.requirements) parts.push(`<h3>What we're looking for</h3>${sectionHtml(job.requirements)}`);
  return parts.join("");
}

function plainTextLength(html: string): number {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/**
 * Whether a published job would actually reach Google for Jobs ("google") and
 * outside aggregators via /jobs.xml ("boards"), mirroring the two real gates
 * exactly — plus a plain-English `reason` naming the first thing the
 * employer can fix.
 *
 * `boards` is always at least as strict as `google` (it additionally
 * requires a literal country field, not just an inferred one, and a
 * description of real length), so the only failure combinations are:
 * both false, or boards false with google true.
 */
export function listingEligibility(
  job: ListingEligibilityJob,
  companyName: string | null | undefined,
  now: number = Date.now(),
): ListingEligibility {
  const company = String(companyName ?? "").trim();
  const hasCompany = company.length > 0;
  const excluded = Boolean(job.exclude_from_feed);
  const deadlinePassed = Boolean(job.application_deadline) && new Date(job.application_deadline as string).getTime() < now;
  const city = cityOf(job);
  const remote = Boolean(job.is_remote);
  const hasLocation = Boolean(city) || remote;
  const countryLiteral = Boolean(job.location_country_code || job.location_country);
  const countryInferred = countryLiteral || Boolean(inferCountryCode(job.location));
  const descLen = plainTextLength(descriptionHtml(job));

  const google = !excluded && !deadlinePassed && hasCompany && countryInferred && hasLocation;
  const boards = google && countryLiteral && descLen >= MIN_DESCRIPTION_CHARS;

  let reason: string | null = null;
  if (!google || !boards) {
    if (excluded) {
      reason = "This role is marked excluded from outside listings.";
    } else if (deadlinePassed) {
      reason = "This role's application deadline has passed.";
    } else if (!hasCompany) {
      reason = "Add your company name in Settings so Google and job boards can list this role.";
    } else if (!countryInferred) {
      reason = "Add a country to this role's location so it can be listed automatically.";
    } else if (!hasLocation) {
      reason = "Add a city to this role's location (or mark it remote) so it can be listed automatically.";
    } else if (!countryLiteral) {
      reason = "Add a country to this role's location so job boards can list this role.";
    } else if (descLen < MIN_DESCRIPTION_CHARS) {
      reason = "Add a few more sentences to the description so job boards will list this role.";
    }
  }

  return { google, boards, reason };
}
