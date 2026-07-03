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
const NOT_FULLY_REMOTE_HINT = /\b(hybrid|remote[-\s]?friendly|remote optional|occasional(?:ly)? remote|some remote|partly remote|partial(?:ly)? remote|negotiable|office|on[-\s]?site|onsite)\b/i;
const DEFINITIVE_REMOTE_HINT = /\b(fully remote|100% remote|remote only|work from home|wfh|telecommute)\b/i;
const REMOTE_PREFIX = /^remote(?:\b|[\s—–\-,:|])/i;

export function inferCountryCode(locationText?: string | null): string | null {
  const text = (locationText ?? "").trim();
  if (!text) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text)) return "US";
  return null;
}

export function isFullyRemoteText(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ").trim();
  if (!text) return false;
  if (DEFINITIVE_REMOTE_HINT.test(text)) return true;
  if (NOT_FULLY_REMOTE_HINT.test(text)) return false;
  return REMOTE_PREFIX.test(text);
}
