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
  // ("U.S." with its dots: "Remote - U.S. only" had no country, so it was in no
  // feed; the fourteenth Phase 4 review.)
  [/\b(united states|u\.s\.a\.?|usa|us)\b|\bu\.s\.?(?!\w)/i, "US"],
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
// (Exported for the job classifier's "our stores throughout Texas"; the fourteenth Phase 4 review.)
export const US_STATE_NAMES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
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
// (Never negated: "Onsite only, no WFH", "This is not a work from home job"; the fourteenth Phase 4 review, when the job
// builder began reading these words as Publish does, briefFromForm.)
const DEFINITIVE_REMOTE_HINT = /(?<!\b(?:not|no|non|never|isn'?t)[-\s]+(?:(?:a|an|the)\s+)?)\b(fully remote|100% remote|remote only|work from home|wfh|telecommute)\b/i;
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
 *  "Iloilo (US healthcare)" (the fifth product review: still US jobs).
 *  "-based" only before a client word: "US-based applicants only", "UK-based
 *  team" are where the people are (the thirteenth Phase 4 review: those had
 *  no country, so a job the geocoder missed was in no feed).
 *  The fourteenth: "-based" is an optional prefix on the kind-words and
 *  industry forms, not a form of its own, and a company, brand, business or
 *  startup is a client word: "Makati (US-based healthcare account)", "Ortigas
 *  (US-based mortgage company)", "BGC Taguig - US-based tech startup" were
 *  saved as US jobs paid in dollars when the geocoder missed. Applicants,
 *  candidates, employees and a team are still where the people are.
 *  The fifteenth: that list of kinds missed every other kind of business
 *  ("Makati (US-based BPO)", "Taguig (UK-based BPO)", "Cebu City - US-based
 *  call center", "Quezon City (US-based agency)" were US and GB jobs again),
 *  so "-based" before any word is the client's, as the twelfth had it, except
 *  a short closed list of words for people ("US-based applicants only",
 *  "US-based team", "Canada-based employees only", "US-based agents",
 *  "US-based preferred"). And a company, brand, business or startup is a
 *  client only after "-based", as the thirteenth had it: "Remote (US
 *  company)", "Remote - US brand" are the US (the fourteenth had made them
 *  no country, so a job the geocoder missed was in no feed).
 *  The sixteenth: each of those fixed one side and broke the other. "-based"
 *  before any word took the country from a remote job whose place is that
 *  country ("Remote (US-based position)", "Remote (UK-based role)", "Remote
 *  (US-based reps)": no country, in no feed), and a bare company read a
 *  Philippine site as the US ("Cebu City (US company)" was saved as a US job
 *  paid in dollars). So those two forms (CLIENT_IF_ELSEWHERE) are the
 *  client's only when what is left still names a place: "Makati (US-based
 *  BPO)" and "Cebu City (US company)" are the Philippines, "Remote
 *  (US-based position)" and "Remote (US company)" the US. The kinds of
 *  account, client or customer, the hours, the market and the industries
 *  (CLIENT_COUNTRY) are always the client's.
 *  The seventeenth: when what was left named a real city the hints do not
 *  know ("Mandaluyong (US-based BPO)", "Pasay City - US-based call center",
 *  "Lapu-Lapu City (US-based BPO)"), the client's country came back from the
 *  whole text, and Publish saved a Philippine job paid in dollars, the very
 *  bug the sixteenth fixed for "Cebu City (US company)". So whatever is left
 *  once the client's words go is the place, a place the hints know or not
 *  ("Mandaluyong" has no country, so no currency is guessed), and the whole
 *  text is read only when nothing but the setup is left. And "-based" before
 *  a business (CLIENT_BASED: a BPO, company, firm, agency, startup, brand,
 *  call centre, clinic, practice, office or store, the fourteenth's and
 *  fifteenth's evidence) is the client's whatever is left, as the fifteenth
 *  had it, so "Remote - US-based BPO" and "Work from home (US-based company)"
 *  have no country either: the US is the business's, not the job's. Any
 *  other word after "-based" is still the sixteenth's, the client's only when
 *  a place is left, taken with the words after it ("Remote (US-based
 *  staffers)", "Remote (US-based moms welcome)", "Remote - US-based support
 *  role" are the US), and so is a bare company: "Remote (US company)" is the
 *  US, "Las Pinas (US company)" has no country. */
const COUNTRY_WORD = String.raw`(united states|u\.s\.a\.?|usa|us|u\.s\.|uk|united kingdom|canada|canadian|australia|australian)`;
const CLIENT_COUNTRY = new RegExp(String.raw`\b${COUNTRY_WORD}(?:(?:-based)?\s+(?:(?!(?:remote|only|residents?|citizens?)\b)[\w-]+\s+){0,2}?(?:accounts?|shifts?|clients?|customers?|time(?:zone)?|hours|market|campaigns?)\b|(?:-based)?\s+(?:healthcare|health care|mortgage|telco|insurance|banking|retail|e-?commerce)\b)`, "gi");
// Words for the people after "-based", which say where they are: never a client's (the thirteenth to fifteenth).
const PEOPLE = String.raw`applicants?|candidates?|employees?|teams?|staff|workers?|people|talent|hires?|residents?|citizens?|only|preferred|remote|professionals?|agents?|freelancers?|contractors?|individuals?|persons?`;
const BUSINESS = String.raw`bpos?|compan(y|ies)|firms?|agenc(y|ies)|startups?|business(es)?|brands?|(call|contact) cent(er|re)s?|clinics?|practices?|offices?|stores?|shops?`;
const CLIENT_BASED = new RegExp(String.raw`\b${COUNTRY_WORD}-based\s+(?:(?!(?:${PEOPLE})\b)[\w-]+\s+){0,2}?(?:${BUSINESS})\b`, "gi");
const CLIENT_IF_ELSEWHERE = new RegExp(String.raw`\b${COUNTRY_WORD}(?:-based\s+(?!(?:${PEOPLE})\b)[\w-]+(?:\s+(?!(?:${PEOPLE})\b)[\w-]+){0,2}|\s+(?:(?!(?:remote|only|residents?|citizens?)\b)[\w-]+\s+){0,2}?(?:compan(?:y|ies)|brands?|business(?:es)?|startups?)\b)`, "gi");
// What names no place: how and where from the work is done, and who does it ("Remote", "Work from home", "applicants only").
const NOT_A_PLACE = new RegExp(String.raw`\b(fully|permanent(ly)?|remote(ly)?|work(ing)?[-\s]?(from|at)[-\s]?home|wfh|home[-\s]?based|telecommut\w*|online|anywhere|worldwide|setup|set-up|positions?|roles?|jobs?|${PEOPLE})\b`, "gi");

export function inferCountryCode(locationText?: string | null): string | null {
  const kept = (locationText ?? "").trim().replace(CLIENT_COUNTRY, " ").replace(CLIENT_BASED, " ");
  const elsewhere = kept.replace(CLIENT_IF_ELSEWHERE, " ");
  // (Anything left but the setup is the place, whether the hints know it or not; the seventeenth.)
  const placeLeft = /[a-z]/i.test(elsewhere.replace(NOT_A_PLACE, " "));
  return countryOfText(placeLeft ? elsewhere : kept);
}
function countryOfText(text: string): string | null {
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
// (...and the next word in a list after it: "Remote (no hybrid or onsite)", "Remote, never onsite or hybrid"; the thirteenth
// Phase 4 review. A comma ends the negation: "No hybrid, onsite only" is on-site.)
// (...whichever word the list starts with: "Onsite (no remote or hybrid)", "No WFH or hybrid. Onsite in Taguig" were hybrid
// jobs; the fourteenth.)
const NEGATED = String.raw`(?<!\b(?:no|not|non|never)[-\s]+(?:(?:hybrid|on[-\s]?site|onsite|in[-\s]?office|office[-\s]based|remote|wfh|work[-\s]from[-\s]home)\s*(?:or|nor|\/)\s*)?)`;
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
// (Exported for the job classifier's "our stores across the US"; the thirteenth Phase 4 review.)
export const A_COUNTRY = COUNTRY_TEXT_HINTS.map(([pattern]) => pattern.source).join("|");
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
