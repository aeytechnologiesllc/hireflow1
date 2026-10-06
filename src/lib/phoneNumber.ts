/**
 * phoneNumber.ts — the application form's phone field.
 *
 * The field used to assume a US number: the country selector showed "+1"
 * but the code was saved only when the applicant changed it, and the
 * formatter kept the first 10 digits in a 3-3-4 dash pattern. A Manila
 * applicant typing "0917 123 4567" was saved as "091-712-3456", and
 * "+63 917 123 4567" as "639-171-2345": a number nobody can call or
 * message.
 *
 * The rules now, each made here once:
 *
 *   - The code shown is the code saved (phoneAnswer always prefixes it).
 *   - The code shown before the applicant picks one comes from the browser
 *     (guessDialCode): a Filipino language, a language naming a country other
 *     than the usual defaults (en-NG, en-IN), the IANA time zone, and only
 *     then en-US / en-GB. When none of them says where they are, NO code is
 *     shown and they pick one: a guessed +1 used to be saved on an Indian
 *     number and looked like a real US one.
 *   - +1 keeps its 555-123-4567 format and 10 digits, but only for a number
 *     that can be a +1 number. One starting with 0 or 1, or longer than 11
 *     digits, is kept whole and unformatted with a hint to pick the country,
 *     so switching the country re-reads every digit ("0917 123 4567" typed
 *     under a guessed +1 used to lose its last digit for good). Submit takes
 *     a +1 number only with exactly 10 digits starting 2-9 (phoneProblem).
 *   - Every other code keeps up to 15 digits in all, code included (the
 *     E.164 limit), in groups of three.
 *   - A typed copy of the code is taken off ("+63 917 …", "0063 917 …",
 *     "63917…" pasted without the plus, and a code pasted twice), and a
 *     pasted international number for another country switches the
 *     selector to that country.
 *   - The national "0" in front ("0917 …") may stay on screen while they
 *     type, the way they write their number, but it is never saved:
 *     "+63 0917 …" is not a number. Italy, San Marino, the Vatican, Côte
 *     d'Ivoire (10-digit numbers since 2021) and the Republic of the Congo
 *     keep their 0, because it is part of the number there.
 *
 * Import-free, so scripts/phone_number.test.mjs runs it under plain Node.
 */

/** The +1 numbering plan's code. Never shown by default any more: a code is
 *  guessed only when the browser says where the applicant is. */
export const DEFAULT_DIAL_CODE = "+1";

/** The Philippines: the country most applicants apply from. */
export const PHILIPPINES_DIAL_CODE = "+63";

/**
 * Codes whose numbers keep their leading 0 after the country code: Italy,
 * San Marino and the Vatican; Côte d'Ivoire (+225, 10-digit numbers that
 * start with 0 since 2021); the Republic of the Congo (+242, 9-digit numbers
 * that start with 0). Gabon (+241) is unconfirmed and left out.
 */
const KEEPS_LEADING_ZERO: ReadonlySet<string> = new Set(["39", "378", "379", "225", "242"]);

/** E.164: at most 15 digits, country code included. */
const E164_MAX_DIGITS = 15;

/** A "+" number typed key by key is read for its country once it has this
 *  many digits (the longest code is 4, the shortest number after it 3+). */
const INTERNATIONAL_READ_AT = 7;

export interface LocaleHints {
  /** The IANA time zone ("Asia/Manila"). */
  timeZone?: string | null;
  /** navigator.languages, most preferred first ("en-PH", "fil"). */
  languages?: readonly (string | null | undefined)[] | null;
}

/** A country the selector offers: its dial code and ISO code ("+44", "GB"). */
export interface DialCountry {
  code: string;
  country: string;
}

/** For a code several countries share, the one the selector shows. */
export const PRIMARY_COUNTRY_FOR_CODE: Readonly<Record<string, string>> = {
  "+1": "US",
  "+7": "RU",
  "+44": "GB",
  "+47": "NO",
  "+61": "AU",
  "+212": "MA",
  "+262": "RE",
  "+590": "GP",
};

/**
 * IANA time zones → the country they are in, for the countries applicants
 * most often apply from (and the US and Canada). A zone not listed says
 * nothing, and neither does UTC.
 */
const TIME_ZONE_COUNTRY: Readonly<Record<string, string>> = {
  // The US and Canada (+1); more US zones by prefix below.
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US",
  "America/Los_Angeles": "US", "America/Anchorage": "US", "America/Adak": "US", "America/Boise": "US",
  "America/Detroit": "US", "America/Indianapolis": "US", "America/Louisville": "US", "America/Juneau": "US",
  "America/Sitka": "US", "America/Nome": "US", "America/Yakutat": "US", "America/Metlakatla": "US",
  "America/Menominee": "US", "Pacific/Honolulu": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA",
  "America/Halifax": "CA", "America/St_Johns": "CA", "America/Regina": "CA", "America/Montreal": "CA",
  "America/Moncton": "CA", "America/Whitehorse": "CA", "America/Yellowknife": "CA", "America/Iqaluit": "CA",
  // The Caribbean and Latin America.
  "America/Puerto_Rico": "PR", "America/Jamaica": "JM", "America/Port_of_Spain": "TT", "America/Nassau": "BS",
  "America/Barbados": "BB", "America/Santo_Domingo": "DO", "America/Mexico_City": "MX", "America/Monterrey": "MX",
  "America/Cancun": "MX", "America/Tijuana": "MX", "America/Bogota": "CO", "America/Lima": "PE",
  "America/Santiago": "CL", "America/Buenos_Aires": "AR", "America/Sao_Paulo": "BR", "America/Caracas": "VE",
  "America/Guayaquil": "EC", "America/La_Paz": "BO", "America/Asuncion": "PY", "America/Montevideo": "UY",
  "America/Guatemala": "GT", "America/El_Salvador": "SV", "America/Tegucigalpa": "HN", "America/Managua": "NI",
  "America/Costa_Rica": "CR", "America/Panama": "PA",
  // Asia and the Middle East.
  "Asia/Manila": "PH", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Asia/Jakarta": "ID", "Asia/Makassar": "ID", "Asia/Jayapura": "ID",
  "Asia/Pontianak": "ID", "Asia/Kuala_Lumpur": "MY", "Asia/Kuching": "MY", "Asia/Singapore": "SG",
  "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Saigon": "VN", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW",
  "Asia/Shanghai": "CN", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Dubai": "AE", "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Asia/Jerusalem": "IL",
  "Asia/Amman": "JO", "Asia/Beirut": "LB", "Asia/Baghdad": "IQ", "Asia/Tehran": "IR", "Asia/Kabul": "AF",
  "Asia/Tashkent": "UZ", "Asia/Almaty": "KZ", "Asia/Yangon": "MM", "Asia/Phnom_Penh": "KH",
  // Africa.
  "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Accra": "GH", "Africa/Johannesburg": "ZA",
  "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN",
  "Africa/Addis_Ababa": "ET", "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ", "Africa/Kigali": "RW",
  "Africa/Lusaka": "ZM", "Africa/Harare": "ZW", "Africa/Abidjan": "CI", "Africa/Dakar": "SN", "Africa/Douala": "CM",
  "Africa/Kinshasa": "CD", "Africa/Lubumbashi": "CD", "Africa/Brazzaville": "CG", "Africa/Luanda": "AO",
  "Africa/Maputo": "MZ", "Africa/Windhoek": "NA", "Africa/Gaborone": "BW", "Africa/Khartoum": "SD",
  "Africa/Tripoli": "LY", "Africa/Monrovia": "LR", "Africa/Freetown": "SL",
  // Europe.
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES",
  "Europe/Rome": "IT", "Europe/Lisbon": "PT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Zurich": "CH",
  "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Sofia": "BG",
  "Europe/Athens": "GR", "Europe/Istanbul": "TR", "Europe/Kiev": "UA", "Europe/Kyiv": "UA", "Europe/Moscow": "RU",
  "Europe/Belgrade": "RS", "Europe/Zagreb": "HR",
  // Oceania.
  "Pacific/Auckland": "NZ", "Pacific/Port_Moresby": "PG", "Pacific/Fiji": "FJ",
};

/** Zone prefixes that are one country throughout. */
const TIME_ZONE_PREFIX_COUNTRY: ReadonlyArray<[string, string]> = [
  ["America/Indiana/", "US"],
  ["America/Kentucky/", "US"],
  ["America/North_Dakota/", "US"],
  ["US/", "US"],
  ["Canada/", "CA"],
  ["America/Argentina/", "AR"],
  ["Australia/", "AU"],
];

/** The country an IANA time zone is in, when we know it. */
export function countryForTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  if (TIME_ZONE_COUNTRY[timeZone]) return TIME_ZONE_COUNTRY[timeZone];
  for (const [prefix, country] of TIME_ZONE_PREFIX_COUNTRY) if (timeZone.startsWith(prefix)) return country;
  return null;
}

/** A browser's default language region, which says little about where someone is. */
const DEFAULT_LANGUAGE_REGIONS: ReadonlySet<string> = new Set(["US", "GB"]);

/** Time zones that say nothing about a country. */
function saysNothing(timeZone: string | null | undefined): boolean {
  return !timeZone || /^(UTC|GMT|Etc\/|Universal|Zulu)/i.test(timeZone);
}

/**
 * Pure: the dial code to show before the applicant picks one, or null when
 * the browser does not say where they are (the applicant then picks; no code
 * is ever assumed). In order:
 *   1. a Filipino or Tagalog language → +63;
 *   2. a language naming a region other than the browser defaults US and GB
 *      ("en-NG", "en-IN", "en-PH"): a deliberate setting;
 *   3. the IANA time zone's country ("Asia/Manila", "Africa/Lagos");
 *   4. only when the time zone says nothing (missing, UTC): an en-US or
 *      en-GB region.
 * `countries` turns a country into its code (the selector's own list). With
 * none given, only the Philippines and the US/Canada can be named.
 */
export function guessDialCode(hints: LocaleHints | null | undefined, countries?: readonly DialCountry[] | null): string | null {
  const codeFor = (iso: string): string | null => {
    const upper = iso.toUpperCase();
    const own = (countries ?? []).filter((c) => c.country.toUpperCase() === upper).map((c) => c.code);
    if (own.length > 0) return own[0];
    if (upper === "PH") return PHILIPPINES_DIAL_CODE;
    if (upper === "US" || upper === "CA") return DEFAULT_DIAL_CODE;
    return null;
  };
  const regions: string[] = [];
  for (const raw of hints?.languages ?? []) {
    const tag = String(raw ?? "").trim().replace(/_/g, "-");
    if (!tag) continue;
    const [language, ...rest] = tag.split("-");
    if (/^(fil|tl)$/i.test(language)) return PHILIPPINES_DIAL_CODE;
    const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part));
    if (region) regions.push(region.toUpperCase());
  }
  for (const region of regions) {
    if (DEFAULT_LANGUAGE_REGIONS.has(region)) continue;
    const code = codeFor(region);
    if (code) return code;
  }
  const zoneCountry = countryForTimeZone(hints?.timeZone ?? null);
  if (zoneCountry) return codeFor(zoneCountry);
  if (saysNothing(hints?.timeZone ?? null)) {
    for (const region of regions) {
      if (!DEFAULT_LANGUAGE_REGIONS.has(region)) continue;
      const code = codeFor(region);
      if (code) return code;
    }
  }
  return null;
}

/** What this browser says about where it is. Never throws. */
export function browserLocaleHints(): LocaleHints {
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timeZone = null;
  }
  let languages: string[] = [];
  try {
    if (typeof navigator !== "undefined") {
      languages = [...(navigator.languages ?? []), navigator.language].filter((l): l is string => typeof l === "string");
    }
  } catch {
    languages = [];
  }
  return { timeZone, languages };
}

/** "+63" → "63". */
export function dialDigits(code: string | null | undefined): string {
  return String(code ?? "").replace(/\D/g, "");
}

/** The +1 numbering plan (the US, Canada and their neighbours on +1). */
export function isPlusOne(code: string | null | undefined): boolean {
  return dialDigits(code) === "1";
}

/** How many digits may follow the code. */
export function maxNationalDigits(code: string | null | undefined): number {
  if (isPlusOne(code)) return 10;
  return Math.max(4, E164_MAX_DIGITS - (dialDigits(code).length || 1));
}

/** Digits that can be a +1 number: ten, the first 2-9 (an area code never starts 0 or 1). */
function looksPlusOne(digits: string): boolean {
  return digits.length === 10 && /^[2-9]/.test(digits);
}

/** "The code was typed in front of the number again": the same rule as a
 *  code pasted without its plus. A national number is never this long with
 *  the code in front of it. */
function startsWithCodeCopy(digits: string, code: string): boolean {
  const d = dialDigits(code);
  return !!d && digits.startsWith(d) && digits.length >= d.length + (isPlusOne(code) ? 10 : 9);
}

function keepsLeadingZero(code: string | null | undefined): boolean {
  return KEEPS_LEADING_ZERO.has(dialDigits(code));
}

/** "9171234567" → "917 123 4567"; +1: "555-123-4567". */
function formatNational(code: string, digits: string): string {
  if (isPlusOne(code)) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** The longest known code that starts these digits ("4479…" → "+44"). */
function knownCodeAtStart(digits: string, knownCodes: readonly string[] | null | undefined): string | null {
  let best: string | null = null;
  for (const code of knownCodes ?? []) {
    const d = dialDigits(code);
    if (d && digits.startsWith(d) && (!best || d.length > dialDigits(best).length)) best = `+${d}`;
  }
  return best;
}

/**
 * Pure: what the applicant typed or pasted, cleaned for the field, and the
 * code it belongs to (the selected one, or another when they pasted an
 * international number for a different country).
 */
export function cleanPhoneInput(
  input: string | null | undefined,
  code: string,
  knownCodes?: readonly string[] | null,
): { code: string; display: string } {
  const text = String(input ?? "");
  const trimmed = text.trim();
  let digits = text.replace(/\D/g, "");
  // No code yet ("") when the browser did not say where they are.
  let shown = dialDigits(code) ? `+${dialDigits(code)}` : "";

  if (/^(\+|00)/.test(trimmed)) {
    // International: "+63 917 …" or "0063 917 …". Take the code off; when it
    // is not the selected one, the number moves to the country it names.
    if (trimmed.startsWith("00")) digits = digits.slice(2);
    if (trimmed.startsWith("+") && digits.length < INTERNATIONAL_READ_AT) {
      // Still typing the code, key by key ("+6", "+63 91"): keep the plus,
      // so the number can still be read as international once it is long
      // enough to say which country it is. Dropping it here is how
      // "+63 917 …" typed into a +1 field became "639-171-2345".
      return { code: shown, display: `+${digits}` };
    }
    // The longest code that starts it, the selected one included ("+1 242 …"
    // is the Bahamas, not +1 with "242" in front).
    const named = knownCodeAtStart(digits, [...(knownCodes ?? []), ...(shown ? [shown] : [])]);
    if (named) {
      shown = named;
      digits = digits.slice(dialDigits(named).length);
    } else if (!shown) {
      // No country picked and none this code names: kept as typed.
      return { code: "", display: `+${digits.slice(0, E164_MAX_DIGITS)}` };
    }
  }

  // A copy of the code in front of the number ("639171234567" pasted
  // without the plus, "1 555 123 4567", or the code pasted twice: "+63 +63
  // 917 …"): taken off, as many times as it was typed.
  while (shown && startsWithCodeCopy(digits, shown)) digits = digits.slice(dialDigits(shown).length);

  if (isPlusOne(shown)) {
    // Not a +1 number (a national 0 in front, a 1 the area code cannot
    // start with, or too long): kept whole and unformatted, so picking the
    // right country re-reads every digit. The field says to pick the country
    // (phoneHint), and submit refuses it (phoneProblem). Cutting it to ten
    // here lost the last digit of "0917 123 4567" for good.
    if (/^[01]/.test(digits) || digits.length > 11) return { code: shown, display: digits.slice(0, E164_MAX_DIGITS) };
    return { code: shown, display: formatNational(shown, digits.slice(0, 10)) };
  }

  // The national 0 stays on screen while they type; phoneAnswer drops it.
  const trunk = !keepsLeadingZero(shown) && digits.startsWith("0") ? "0" : "";
  const national = digits.slice(trunk.length, trunk.length + maxNationalDigits(shown));
  return { code: shown, display: `${trunk}${formatNational(shown, national)}` };
}

/** The digits that follow the code, as they are saved: no national 0. */
export function nationalDigits(code: string, display: string | null | undefined): string {
  let digits = String(display ?? "").replace(/\D/g, "");
  if (!isPlusOne(code) && !keepsLeadingZero(code)) digits = digits.replace(/^0/, "");
  return digits.slice(0, maxNationalDigits(code));
}

/**
 * Pure: the phone answer as it is saved, "+63 917 123 4567" or
 * "+1 555-123-4567": always the code that was shown, never a national 0.
 * Empty when there is no number. (Submit refuses a number with no code, or
 * one that is not a whole number for its code: phoneProblem.)
 */
export function phoneAnswer(code: string | null | undefined, display: string | null | undefined): string {
  // Left part-way through typing a code ("+6391"): saved as typed, never
  // with a second code in front of it.
  if (/^\s*\+/.test(String(display ?? ""))) {
    const typed = String(display).replace(/\D/g, "").slice(0, E164_MAX_DIGITS);
    return typed ? `+${typed}` : "";
  }
  const d = dialDigits(code);
  // No code picked: the number as typed, with no code put in front of it.
  if (!d) return String(display ?? "").replace(/\s+/g, " ").trim();
  const shown = `+${d}`;
  if (isPlusOne(shown)) {
    const all = String(display ?? "").replace(/\D/g, "").slice(0, E164_MAX_DIGITS);
    // Typed under +1 but not a +1 number: every digit kept, never cut to ten.
    if (all && !looksPlusOne(all) && (/^[01]/.test(all) || all.length > 10)) return `${shown} ${all}`;
  }
  const digits = nationalDigits(shown, display);
  return digits ? `${shown} ${formatNational(shown, digits)}` : "";
}

/** The hint under the field, while they type. */
export const PLUS_ONE_MISMATCH = "This doesn't look like a +1 number: pick your country.";
export const PICK_A_COUNTRY = "Pick your country, then type your number.";
export const WHOLE_NUMBER = "Enter the full number, with your country picked.";

/** Pure: a hint to show under the field as they type, or null. */
export function phoneHint(code: string | null | undefined, display: string | null | undefined): string | null {
  const text = String(display ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits || text.startsWith("+")) return null;
  if (!dialDigits(code)) return PICK_A_COUNTRY;
  if (isPlusOne(code) && (/^0/.test(digits) || digits.length > 10)) return PLUS_ONE_MISMATCH;
  return null;
}

/**
 * Pure: why this number cannot be sent, or null when it can (or is empty:
 * whether it is required is the form's own check). A code still being typed,
 * no code picked, a +1 number that is not ten digits starting 2-9, or fewer
 * than seven digits after any other code.
 */
export function phoneProblem(code: string | null | undefined, display: string | null | undefined): string | null {
  const text = String(display ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  if (text.startsWith("+")) return WHOLE_NUMBER;
  if (!dialDigits(code)) return PICK_A_COUNTRY;
  if (isPlusOne(code)) {
    if (looksPlusOne(digits)) return null;
    return /^[01]/.test(digits) || digits.length > 10 ? PLUS_ONE_MISMATCH : WHOLE_NUMBER;
  }
  return nationalDigits(code!, display).length < 7 ? WHOLE_NUMBER : null;
}

/**
 * Pure: a stored number ("+63 917 123 4567", "+639171234567",
 * "917-123-4567") split into the code and the field's text, for prefilling
 * the form from a profile.
 */
export function splitStoredPhone(
  stored: string | null | undefined,
  fallbackCode: string,
  knownCodes?: readonly string[] | null,
): { code: string; display: string } {
  const text = String(stored ?? "").trim();
  if (!text) return { code: fallbackCode, display: "" };
  if (/^(\+|00)/.test(text)) {
    // "+63 917 …": the code is the part before the first space, when it is
    // a known one; "+639171234567" has no space, so the known codes decide.
    const spaced = /^\+(\d{1,4})[\s-]+(.*)$/.exec(text);
    if (spaced && (knownCodes ?? []).some((c) => dialDigits(c) === spaced[1])) {
      return cleanPhoneInput(spaced[2], `+${spaced[1]}`, knownCodes);
    }
    return cleanPhoneInput(text, fallbackCode, knownCodes);
  }
  return cleanPhoneInput(text, fallbackCode, knownCodes);
}

/** The field's placeholder for a code: an example in that country's own form. */
export function phonePlaceholder(code: string | null | undefined): string {
  if (!dialDigits(code)) return "Pick your country, then type your number";
  if (isPlusOne(code)) return "123-456-7890";
  if (dialDigits(code) === "63") return "0917 123 4567";
  return "Your phone number";
}
