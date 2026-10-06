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
 *   - The code shown before the applicant picks one comes from the browser:
 *     the Asia/Manila time zone, or a Philippine language or region, shows
 *     +63; everything else +1 (guessDialCode).
 *   - +1 keeps its 555-123-4567 format and 10 digits. Every other code keeps
 *     up to 15 digits in all, code included (the E.164 limit), in groups of
 *     three.
 *   - A typed copy of the code is taken off ("+63 917 …", "0063 917 …", and
 *     "63917…" pasted without the plus), and a pasted international number
 *     for another country switches the selector to that country.
 *   - The national "0" in front ("0917 …") may stay on screen while they
 *     type, the way they write their number, but it is never saved:
 *     "+63 0917 …" is not a number. Italy (and San Marino and the Vatican)
 *     keep their 0, because it is part of the number there.
 *
 * Import-free, so scripts/phone_number.test.mjs runs it under plain Node.
 */

/** The code shown when nothing tells us better. */
export const DEFAULT_DIAL_CODE = "+1";

/** The Philippines: the country most applicants apply from. */
export const PHILIPPINES_DIAL_CODE = "+63";

/** Codes whose numbers keep their leading 0 after the country code. */
const KEEPS_LEADING_ZERO: ReadonlySet<string> = new Set(["39", "378", "379"]);

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

/** Pure: the dial code to show before the applicant picks one. */
export function guessDialCode(hints: LocaleHints | null | undefined): string {
  if (hints?.timeZone === "Asia/Manila") return PHILIPPINES_DIAL_CODE;
  for (const raw of hints?.languages ?? []) {
    const tag = String(raw ?? "").trim().toLowerCase().replace(/_/g, "-");
    if (!tag) continue;
    const [language, ...rest] = tag.split("-");
    // Filipino ("fil") and Tagalog ("tl") in any region, or any language in
    // the Philippines ("en-PH").
    if (language === "fil" || language === "tl" || rest.includes("ph")) return PHILIPPINES_DIAL_CODE;
  }
  return DEFAULT_DIAL_CODE;
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
  let shown = `+${dialDigits(code) || "1"}`;

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
    const named = knownCodeAtStart(digits, [...(knownCodes ?? []), shown]);
    if (named) {
      shown = named;
      digits = digits.slice(dialDigits(named).length);
    }
  } else if (isPlusOne(shown)) {
    // "1 555 123 4567": the 1 is the code.
    if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  } else {
    // "639171234567" pasted without the plus: a national number is never
    // this long with the code in front of it.
    const d = dialDigits(shown);
    if (d && digits.startsWith(d) && digits.length >= d.length + 9) digits = digits.slice(d.length);
  }

  if (isPlusOne(shown)) return { code: shown, display: formatNational(shown, digits.slice(0, 10)) };

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
 * Empty when there is no number.
 */
export function phoneAnswer(code: string | null | undefined, display: string | null | undefined): string {
  const shown = `+${dialDigits(code) || "1"}`;
  // Left part-way through typing a code ("+6391"): saved as typed, never
  // with a second code in front of it.
  if (/^\s*\+/.test(String(display ?? ""))) {
    const typed = String(display).replace(/\D/g, "").slice(0, E164_MAX_DIGITS);
    return typed ? `+${typed}` : "";
  }
  const digits = nationalDigits(shown, display);
  return digits ? `${shown} ${formatNational(shown, digits)}` : "";
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
  if (isPlusOne(code)) return "123-456-7890";
  if (dialDigits(code) === "63") return "0917 123 4567";
  return "Your phone number";
}
