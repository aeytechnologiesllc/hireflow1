/**
 * Pure, employer-facing mirror of the REAL job-board gate so the Jobs list can
 * show a truthful "Job boards" chip instead of an always-on one. (It also
 * mirrored the sitemap's gate for a "Google for Jobs" chip; Google Jobs was
 * removed on 2026-10-05, owner: "remove google jobs".)
 *
 * This intentionally duplicates logic rather than importing it:
 * api/job-feed.mjs (loadFeedJobs' QUALITY GATE) must stay a dependency-free,
 * self-contained .mjs (see its own file header) — it cannot be imported from
 * the Vite/browser bundle. Keep the gate below in sync with it whenever it
 * changes. scripts/listing_eligibility.test.mjs proves this file agrees with
 * the REAL loadFeedJobs() (imported live) over a shared set of fixtures.
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

/**
 * Mirrors api/job-feed.mjs remoteCountryCode (scripts/listing_eligibility.test.mjs
 * checks both give the same answers). The country a REMOTE job names in its location text, for a job with no
 * stored country ("Remote - Philippines", "Remote (Canada only)"). Country
 * names only, plus USA / U.S. / UK and a capital "US" or "PH": a lower-case
 * "us" ("work with us") is never a country here. Two different countries, or
 * none, give null: "Remote (worldwide)" still has no country and stays out.
 *
 *   - Who they will serve and when is not where the job is: "US shift",
 *     "US & Canada clients", "US healthcare clients", "for a US company",
 *     "US patients" are taken out before anything is read (Philippine posts
 *     say this all the time). A post that names only that has no country.
 *   - A country ruled out is not the job's country: "no US", "non-US",
 *     "not open to India", "except Canada", "outside the US", "US excluded".
 *     A word like "except" that rules out something else ("except
 *     weekends") changes nothing.
 *   - A time zone alone keeps its country ("Remote (US Eastern Time)" is
 *     US), unless another country is named too ("Remote PH (US EST)" is PH).
 *
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 7; the fifth Pass C review.)
 */
const REMOTE_COUNTRY_NAMES: Array<[RegExp, string]> = [
  [/\busx\b|\bunited states(?: of america)?\b/i, "US"],
  [/\bphilippines\b|\bphx\b/i, "PH"],
  [/\bcanada\b/i, "CA"],
  [/\bunited kingdom\b|\buk\b|\bu\.k\.(?=\s|$|[),;])|\bgreat britain\b/i, "GB"],
  [/\bindia\b/i, "IN"],
  [/\bpakistan\b/i, "PK"],
  [/\baustralia\b/i, "AU"],
  [/\bmexico\b/i, "MX"],
  [/\bsouth africa\b/i, "ZA"],
  [/\bnigeria\b/i, "NG"],
  [/\bkenya\b/i, "KE"],
  [/\bcolombia\b/i, "CO"],
  [/\bireland\b/i, "IE"],
];
const COUNTRY_WORD = String.raw`(?:usx|phx|united states(?: of america)?|uk|u\.k\.|united kingdom|great britain|canada|australia|philippines|india|pakistan|mexico|south africa|nigeria|kenya|colombia|ireland)`;
const COUNTRY_LIST = String.raw`${COUNTRY_WORD}(?:\s*(?:\/|&|\+|,|\band\b|\bor\b)\s*${COUNTRY_WORD})*`;
const ZONE_WORD = String.raw`(?:est|edt|pst|pdt|cst|cdt|mst|mdt|et|pt|ct|mt|eastern|pacific|central|mountain)`;
const SERVE_WORD = String.raw`(?:night|day|morning|evening|graveyard|overnight|mid|time|zone|timezone|based|${ZONE_WORD}|healthcare|medical|dental|insurance|e-?commerce|retail|real estate|saas|tech|b2b|b2c|english[\s-]speaking)`;
const SERVE_NOUN = String.raw`(?:shifts?|clients?|customers?|patients?|callers?|consumers?|markets?|accounts?|campaigns?|business hours|working hours|office hours|hours)`;
const FOR_WHOM = new RegExp(String.raw`\bfor\s+(?:an?\s+|the\s+)?${COUNTRY_LIST}(?:[\s-]+based)?\s+(?:company|companies|clients?|customers?|business(?:es)?|brands?|teams?|employers?|agency|agencies|firms?|startups?)\b`, "gi");
const SERVING = new RegExp(String.raw`${COUNTRY_LIST}(?:[\s-]+${SERVE_WORD}){0,3}[\s-]+${SERVE_NOUN}\b`, "gi");
const RULED_OUT_BEFORE = new RegExp(String.raw`\b(?:not|no|except|excluding|exclude|outside(?:\s+of)?|non)[\s-]+(?:(?:open|available)\s+(?:to|in)\s+|for\s+|in\s+|from\s+|the\s+|applicants?\s+from\s+)*(${COUNTRY_LIST})`, "gi");
const RULED_OUT_AFTER = new RegExp(String.raw`(${COUNTRY_LIST})(?:[\s-]+(?:applicants?|residents?|candidates?))?[\s-]+(?:is\s+|are\s+)?(?:excluded|not\s+(?:eligible|accepted|allowed|open))`, "gi");
const US_HOURS = new RegExp(String.raw`\busx[\s-]+${ZONE_WORD}\b`, "gi");

const countriesIn = (text: string) => new Set(REMOTE_COUNTRY_NAMES.filter(([re]) => re.test(text)).map(([, code]) => code));

export function remoteCountryCode(locationText?: string | null): string | null {
  // A capital "US" / "U.S." / "USA" (or "PH") is the country; "us" never is.
  let where = ` ${String(locationText ?? "")} `
    .replace(/(?<![A-Za-z.])(?:U\.S\.A\.?|U\.S\.?|USA|US)(?![A-Za-z])/g, " usx ")
    .replace(/(?<![A-Za-z])PH(?![A-Za-z])/g, " phx ");
  where = where.replace(FOR_WHOM, " ").replace(SERVING, " ");
  const ruledOut = new Set<string>();
  const ruleOut = (_m: string, list: string) => {
    for (const code of countriesIn(list)) ruledOut.add(code);
    return " ";
  };
  where = where.replace(RULED_OUT_BEFORE, ruleOut).replace(RULED_OUT_AFTER, ruleOut);
  const pick = (text: string) => [...countriesIn(text)].filter((code) => !ruledOut.has(code));
  let found = pick(where);
  if (found.length > 1 && found.includes("US")) found = pick(where.replace(US_HOURS, " "));
  return found.length === 1 ? found[0] : null;
}

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
  /** Mirrors api/job-feed.mjs's loadFeedJobs() quality gate (jobs.xml / jooble.xml / adzuna.xml). */
  boards: boolean;
  /** The first thing the employer can fix, or null when the role is already on the boards. */
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
 * Whether a published job would actually reach the outside aggregators via
 * /jobs.xml ("boards"), mirroring the real gate exactly — plus a plain-English
 * `reason` naming the first thing the employer can fix.
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
  const countryLiteral = Boolean(job.location_country_code || job.location_country || (remote && remoteCountryCode(job.location)));
  const countryInferred = countryLiteral || Boolean(inferCountryCode(job.location));
  const descLen = plainTextLength(descriptionHtml(job));

  const boards =
    !excluded && !deadlinePassed && hasCompany && countryInferred && hasLocation &&
    countryLiteral && descLen >= MIN_DESCRIPTION_CHARS;

  let reason: string | null = null;
  if (!boards) {
    if (excluded) {
      reason = "This role is marked excluded from outside listings.";
    } else if (deadlinePassed) {
      reason = "This role's application deadline has passed.";
    } else if (!hasCompany) {
      reason = "Add your company name in Settings so job boards can list this role.";
    } else if (!countryInferred) {
      reason = "Add a country to this role's location so job boards can list this role.";
    } else if (!hasLocation) {
      reason = "Add a city to this role's location (or mark it remote) so job boards can list this role.";
    } else if (!countryLiteral) {
      reason = "Add a country to this role's location so job boards can list this role.";
    } else if (descLen < MIN_DESCRIPTION_CHARS) {
      reason = "Add a few more sentences to the description so job boards will list this role.";
    }
  }

  return { boards, reason };
}
