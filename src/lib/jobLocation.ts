const COUNTRY_TEXT_HINTS: Array<[RegExp, string]> = [
  // Most applicants and many businesses are here; it was missing, so "Manila,
  // Philippines" got no country and no currency (the second Phase 7 product audit).
  [/\bphilippines\b/i, "PH"],
  [/\bsingapore\b/i, "SG"],
  [/\bnew zealand\b/i, "NZ"],
  // Not "New Mexico" (the third Phase 7 product audit: Albuquerque was Mexico).
  [/(?<!\bnew\s)\bmexico\b/i, "MX"],
  [/\bsouth africa\b/i, "ZA"],
  [/\bmalaysia\b/i, "MY"],
  [/\bindonesia\b/i, "ID"],
  [/\bvietnam\b|\bviet nam\b/i, "VN"],
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
const NOT_FULLY_REMOTE_HINT = /\b(hybrid|remote[-\s]?friendly|remote optional|occasional(?:ly)? remote|some remote|partly remote|partial(?:ly)? remote|negotiable|office|on[-\s]?site|onsite)\b/i;
const DEFINITIVE_REMOTE_HINT = /\b(fully remote|100% remote|remote only|work from home|wfh|telecommute)\b/i;
const REMOTE_PREFIX = /^remote(?:\b|[\s—–\-,:|])/i;

/** Philippine cities and provinces named without the country. Read after a
 *  US state, so "Laguna Beach, CA" stays in the US (the third Phase 7 product
 *  audit: it was the Philippines). */
const PH_PLACE_HINT = /\b(metro manila|manila|quezon city|makati|pasig|taguig|cebu|davao|baguio|iloilo|cagayan de oro|bacolod|pampanga|cavite|laguna(?!\s+(?:niguel|hills|beach|woods)))\b/i;

export function inferCountryCode(locationText?: string | null): string | null {
  const text = (locationText ?? "").trim();
  if (!text) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text) || US_STATE_NAME_HINT.test(text)) return "US";
  if (PH_PLACE_HINT.test(text)) return "PH";
  return null;
}

/** What a place (or the builder's Type field) says about working from home:
 *  "remote", "not_remote" (hybrid, an office, on-site, "remote-friendly"), or
 *  null when it says neither ("Cebu", "Austin, TX"). Not only a leading
 *  "Remote": "Home-based, Philippines", "Philippines (Remote)", "Makati
 *  (WFH)", "Anywhere" and "100% Remote" are how businesses write it (the third
 *  Phase 7 product audit: those were built as on-site jobs). */
const PLACE_NOT_REMOTE = /\b(hybrid|on[-\s]?site|onsite|in[-\s]?office|office|remote[-\s]?friendly|remote[-\s]optional|partly remote|partially remote|some remote|occasional(?:ly)? remote|not remote|no remote)\b/i;
const PLACE_REMOTE = /\b(remote|work(?:ing)?[-\s]?from[-\s]?home|wfh|home[-\s]?based|telecommut\w*|anywhere|worldwide)\b/i;
export function placeSaysRemote(text?: string | null): "remote" | "not_remote" | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (PLACE_NOT_REMOTE.test(t)) return "not_remote";
  return PLACE_REMOTE.test(t) ? "remote" : null;
}

// What a description says about the place of work. Not every "office" in it:
// "answer calls for our dental office" is a remote job when the place says
// Remote (the second Phase 7 product audit: that word made it on-site), and
// not every "on-site" either: "book on-site repair visits" is a home-services
// business's work, not where its agent sits (the third).
const DESCRIPTION_ON_SITE_HINT = /\b(hybrid|in[-\s]office|office[-\s]based|(?<!\bno\s)(?<!\bnot\s(?:an?\s)?)on[-\s]?site (?:role|position|job|work)|(?:work|working|report|reporting|based) on[-\s]?site|(?:work|working|report|reporting|come|based)\s+(?:in|to|at|from|out of)\s+(?:the|our)\s+office)\b/i;

/** Whether a job is fully remote, from what the business wrote: the place
 *  first, then the job type, and the description only when it says so in so
 *  many words. */
export function isFullyRemoteText(location?: string | null, jobType?: string | null, description?: string | null): boolean {
  const place = placeSaysRemote(location);
  const type = placeSaysRemote(jobType);
  const about = (description ?? "").trim();
  const aboutOnSite = DESCRIPTION_ON_SITE_HINT.test(about);
  if (place === "not_remote") return false;
  if (place === "remote" || type === "remote") return type !== "not_remote" && !aboutOnSite;
  if (type === "not_remote") return false;
  return DEFINITIVE_REMOTE_HINT.test(about) && !aboutOnSite;
}

/** Whether a job is remote after "Edit job" changes its place. A place that
 *  says remote or not decides; a place that says neither ("Cebu" for
 *  "Philippines") keeps what the job was, so a job made remote by the
 *  builder's Type field does not turn on-site when its city is edited (the
 *  third product audit). */
export function remoteAfterPlaceEdit(wasRemote: boolean | null | undefined, location?: string | null, jobType?: string | null, description?: string | null): boolean {
  const place = placeSaysRemote(location);
  if (place === "not_remote") return false;
  if (place === "remote") return !DESCRIPTION_ON_SITE_HINT.test((description ?? "").trim());
  if (typeof wasRemote === "boolean") return wasRemote;
  return isFullyRemoteText(location, jobType, description);
}
