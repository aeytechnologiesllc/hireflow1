const COUNTRY_TEXT_HINTS: Array<[RegExp, string]> = [
  // Most applicants and many businesses are here; it was missing, so "Manila,
  // Philippines" got no country and no currency (the second Phase 7 product audit).
  // ("Remote, PH" is how many write it; the fifth product review: it had no country.)
  [/\bphilippines\b|\bph\b/i, "PH"],
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

// In capitals, as a state is written: ", or Makati" is no Oregon (the eleventh
// Phase 4 review: "Pasig, Mandaluyong, or Makati" was a US job).
const US_STATE_CODES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY";
const US_STATE_NAMES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
const US_STATE_HINT = new RegExp(String.raw`,\s*(${US_STATE_CODES})\b`);
const US_STATE_NAME_HINT = new RegExp(String.raw`,\s*(${US_STATE_NAMES})\b`, "i");
const ONLY_A_US_STATE = new RegExp(String.raw`^(?:${US_STATE_NAMES}|district of columbia)\.?$`, "i");
const ONLY_A_US_STATE_CODE = new RegExp(String.raw`^(?:${US_STATE_CODES}|DC)$`);

/** A US state and nothing more ("Texas", "New York", "TX"): somewhere in the
 *  country, not a place someone goes to work (the sixth product review: an
 *  offer letter read "In person, at Texas"). The two letters in capitals, as
 *  a state is written. */
export function isOnlyAUsState(text?: string | null): boolean {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  return ONLY_A_US_STATE.test(t) || ONLY_A_US_STATE_CODE.test(t);
}
const NOT_FULLY_REMOTE_HINT = /\b(hybrid|remote[-\s]?friendly|remote optional|occasional(?:ly)? remote|some remote|partly remote|partial(?:ly)? remote|negotiable|office|on[-\s]?site|onsite)\b/i;
const DEFINITIVE_REMOTE_HINT = /\b(fully remote|100% remote|remote only|work from home|wfh|telecommute)\b/i;
const REMOTE_PREFIX = /^remote(?:\b|[\s—–\-,:|])/i;

/** Philippine cities and provinces named without the country. Read after a
 *  US state, so "Laguna Beach, CA" stays in the US (the third Phase 7 product
 *  audit: it was the Philippines). */
// (BGC and Ortigas too: "BGC (U.S. client)" had no country; the fifth product review.)
const PH_PLACE_HINT = /\b(metro manila|manila|quezon city|makati|pasig|taguig|bgc|bonifacio global city|ortigas|cebu|davao|baguio|iloilo|cagayan de oro|bacolod|pampanga|cavite|laguna(?!\s+(?:niguel|hills|beach|woods)))\b/i;

/** A country named for the clients or the hours, not the place: "Makati City
 *  (US Account)", "Cebu City (US Shift)" (the eleventh Phase 4 review: those
 *  became US jobs). With what kind of account or hours between, or "-based"
 *  after it: "Cebu - US healthcare account", "Quezon City (US Mortgage
 *  Account)", "Remote, US office hours", "Makati (US-based clients)",
 *  "Iloilo (US healthcare)" (the fifth product review: still US jobs). */
const CLIENT_COUNTRY = /\b(united states|u\.s\.a\.?|usa|us|u\.s\.|uk|united kingdom|canada|canadian|australia|australian)(?:-based\s+[\w-]+|\s+(?:(?!(?:remote|only|residents?|citizens?)\b)[\w-]+\s+){0,2}?(?:accounts?|shifts?|clients?|customers?|time(?:zone)?|hours|market|campaigns?)\b|\s+(?:healthcare|health care|mortgage|telco|insurance|banking|retail|e-?commerce)\b)/gi;

export function inferCountryCode(locationText?: string | null): string | null {
  const text = (locationText ?? "").trim().replace(CLIENT_COUNTRY, " ");
  if (!text.trim()) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text) || US_STATE_NAME_HINT.test(text)) return "US";
  if (PH_PLACE_HINT.test(text)) return "PH";
  return null;
}

// (An on-site, office or hybrid word that is negated says remote: "Remote (no
// onsite)", "Remote; not on-site", "Remote — never on-site", "Fully remote -
// non-office based", "Remote (100%, no hybrid)"; the fifth product review:
// those were on-site or hybrid jobs.)
const NEGATED = String.raw`(?<!\b(?:no|not|non|never)[-\s]+)`;
/** What a place (or the builder's Type field) says about working from home:
 *  "remote", "not_remote" (hybrid, an office, on-site, "remote-friendly"), or
 *  null when it says neither ("Cebu", "Austin, TX"). Not only a leading
 *  "Remote": "Home-based, Philippines", "Philippines (Remote)", "Makati
 *  (WFH)", "Anywhere" and "100% Remote" are how businesses write it (the third
 *  Phase 7 product audit: those were built as on-site jobs). */
const PLACE_NOT_REMOTE = new RegExp(String.raw`\b(${NEGATED}(?:hybrid|on[-\s]?site|onsite|in[-\s]?office|office[-\s]based)|remote[-\s]?friendly|remote[-\s]optional|partly remote|partially remote|some remote|occasional(?:ly)? remote|not remote|no remote|non[-\s]?remote|(?:not|no)\s+(?:wfh|work(?:ing)?[-\s]from[-\s]home))\b`, "i");
// "Anywhere" is remote, and so is anywhere in a country ("Anywhere in the
// Philippines"), never anywhere in a city or a region ("Anywhere in Metro
// Manila"; the twelfth Phase 4 review: the first was an on-site job).
// "Online" is how many Philippine posts say it ("Philippines (online)"; the
// fifth product review).
const A_COUNTRY = COUNTRY_TEXT_HINTS.map(([pattern]) => pattern.source).join("|");
const PLACE_REMOTE = new RegExp(String.raw`\b(remote|work(?:ing)?[-\s]?(?:from|at)[-\s]?home|wfh|home[-\s]?based|telecommut\w*|telework\w*|virtual|online|anywhere(?!\s+in\s+(?!(?:the\s+)?(?:${A_COUNTRY}|world|globe)))|worldwide)\b`, "i");
/** An office named with no remote word ("Makati office") is on-site; with
 *  one, it is the hours or the kind of work ("Remote (US office hours)",
 *  "Remote - back office support", "Fully remote (no office)"): the fourth
 *  product audit, where any "office" made those on-site. */
const PLACE_OFFICE = /\boffice\b/i;
export function placeSaysRemote(text?: string | null): "remote" | "not_remote" | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (PLACE_NOT_REMOTE.test(t)) return "not_remote";
  if (PLACE_REMOTE.test(t)) return "remote";
  return PLACE_OFFICE.test(t) ? "not_remote" : null;
}

/** A place that is partly at home: hybrid, not negated ("Hybrid (Taguig)",
 *  never "Remote (100%, no hybrid)"), occasional on-site days, or home or
 *  on-site either way ("Remote with occasional onsite", "WFH or Onsite
 *  (Makati)"; the twelfth Phase 4 review: those were on-site jobs). */
const PLACE_HYBRID = new RegExp(String.raw`\b(${NEGATED}hybrid|occasional(?:ly)?\s+on[-\s]?site|(?:remote|wfh|work[-\s]from[-\s]home)\s*(?:or|\/)\s*on[-\s]?site|on[-\s]?site\s*(?:or|\/)\s*(?:remote|wfh|work[-\s]from[-\s]home))\b`, "i");
export function placeSaysHybrid(text?: string | null): boolean {
  return PLACE_HYBRID.test((text ?? "").trim());
}

// What a description says about the place of work. Not every "office" in it:
// "answer calls for our dental office" is a remote job when the place says
// Remote (the second Phase 7 product audit: that word made it on-site), and
// not every "on-site" either: "book on-site repair visits" is a home-services
// business's work, not where its agent sits (the third).
// …nor "book in-office appointments" or "report to our office manager" (the
// fourth product audit: those turned a remote job on-site).
const DESCRIPTION_ON_SITE_HINT = /\b(hybrid(?! (?:coffee|car|plans?)\b)|in[-\s]office(?!\s+(?:appointments?|visits?|consultations?|procedures?|hours|staff))|office[-\s]based|(?<!\bno\s)(?<!\bnot\s(?:an?\s)?)on[-\s]?site (?:role|position|job|work)|(?:work|working|report|reporting|based) on[-\s]?site|(?:work|working|report|reporting|come|based)\s+(?:in|to|at|from|out of)\s+(?:the|our)\s+office(?!\s+(?:manager|administrator|hours|staff|team|supplies)))\b/i;

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

/** The place as a list shows it: a remote job keeps what the business wrote
 *  ("Remote (US only)", "Philippines"), never just "Remote" (the fourth
 *  product audit: "Remote (US only)" reached Philippine applicants as
 *  "Remote"). */
export function placeLine(location: string | null | undefined, isRemote: boolean | null | undefined): string | null {
  const place = (location ?? "").trim();
  if (isRemote === false) return place || null;
  if (!place) return "Remote";
  return placeSaysRemote(place) === "remote" ? place : `Remote · ${place}`;
}
