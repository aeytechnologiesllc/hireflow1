/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second and third Phase 6 reviews).
 *
 * Every application already starts with HireFlow's own "Are you 18 or
 * older?" (src/lib/ageCheck.ts), and RA 10911 Section 5(a) makes it unlawful
 * to "require the declaration of age or birth date during the application
 * process" or to publish a job notice suggesting an age preference. The
 * models are told so (AGE_RULE), and anything they still write that asks the
 * applicant for their age, birth date, birth or graduation year or marital
 * status, or that sets an age limit or preference, is dropped before a
 * business sees it: a line from a list, a sentence from a paragraph.
 *
 * About the applicant only: a customer's or patient's date of birth (identity
 * checks), "patients over 60", "the age of your computer", a CSAT "above 90"
 * and "civil status requests for policyholders" stay.
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year or marital status, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post or its requirements: every application already asks 'Are you 18 or older?' on its own.";

const AGE_ASK = new RegExp(
  [
    // A question or a form label for the applicant's own age, birth or status.
    String.raw`\bhow old are you\b`,
    String.raw`\byour (age|date of birth|birth ?date|birthday|birth year|year of birth|marital status|civil status|relationship status)\b`,
    String.raw`^\s*[-•*]?\s*(age|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan)\s*(\([^)]*\))?\s*[:?]?\s*$`,
    // ...and in Filipino ("Ilang taon ka na?").
    String.raw`\bilang taon ka\b|\bpetsa ng kapanganakan\b|\bwhat generation are you\b`,
    String.raw`\b(state|enter|give|provide|list)\s+(your\s+)?(age|birth ?date|date of birth|year of birth|marital status)\b`,
    String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college))\b|\bwhen were you born\b|\bwhen did you graduate (from )?(high school|college|university|senior high)\b`,
    String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
    String.raw`\bare you (married|single)\b|\bmarried or single\b|\bsingle\s*\/\s*married\b|\bmarried\s*\/\s*single\b`,
    String.raw`\bdo you have (children|kids)\b|\bnumber of (children|dependents)\b`,
    // An age limit or preference on the applicant.
    String.raw`\bages? (of )?\d{2}\b(?!\+)|\baged \d{2}\b|\bbetween the ages of\b|\baged? between \d{2} and \d{2}\b|\bage\s*:\s*\d{2}`,
    String.raw`\bmax(imum)? age\b|\bage (limit|requirement|range|bracket)s?\s*(:|is|of)?\s*\d{2}`,
    String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years|yrs)( old| of age)?\b(?!\s+of\s+(experience|work|service))`,
    String.raw`\b\d{2}\s*(years|yrs) (old|of age)\b|\b\d{2}\s*y\.?o\.?(?=\W|$)`,
    String.raw`\b(must|should) (be|not be)\s+(\d{2}\s*(-|–|to)\s*\d{2}|(below|under|over|above|older than|younger than|not older than|no older than)\s+\d{2})\b(?!\s*%)`,
    String.raw`\b(not|no) older than \d{2}\b|\bin (your|their) (20s|30s|twenties|thirties)\b|\b(early|mid|late)-?(20s|30s)\b`,
    String.raw`^\s*[-•*]?\s*(\d{2}\s*(-|–|to)\s*\d{2}|(below|under|over|above)\s+\d{2})\s*(only|years old|yrs old|years)?\s*$`,
    String.raw`^\s*[-•*]?\s*\d{2}\s*(years old\s*)?(and|or) (below|under|younger)\s*$|\baged? \d{2}\s*(and|or) (below|under|younger|above|older)\b`,
    String.raw`\b(below|under) \d{2}\s*(years|yrs)( old| of age)?\b(?!\s+of\s+(experience|work|service))`,
    String.raw`\b(fresh|recent|new) grad\w*\b[^.]{0,15}\b(only|preferred|required)\b`,
    String.raw`\byoung(er)?\b[,\s]+(and\s+)?(\w+[,\s]+){0,2}(team|applicants|people|professionals|candidates|crowd|blood|talent)\b|\byoung and (energetic|dynamic|vibrant|fresh)\b|\byouthful\b`,
    String.raw`\b(millennials?|gen ?z|generation z|digital natives?)\b`,
    String.raw`\b(single|married|unmarried) (applicants|candidates|people|women|men)\b`,
  ].join("|"),
  "i",
);
// The line is about someone or something else (a customer's identity check,
// the patients or children served, a device, the company, a product), not
// the applicant.
const ABOUT_SOMEONE_ELSE = /\b(customers?|patients?|callers?|clients?|members?|policyholders?|guests?|users?|account holders?|shoppers?|students?|residents?|children|kids|parents)'?s?\b|\b(their|his|her)\b(?! (20s|30s|twenties|thirties))|\b(company|business|brand|products?|firm|plans?|coverage|policy)\b/i;
const ABOUT_A_DEVICE = /\b(computer|laptop|pc|device|phone|headset|router|internet|equipment)\b/i;

/** True when the text asks the applicant for age, a birth date or marital status, or sets an age limit or preference. */
export function asksAgeOrStatus(text: unknown): boolean {
  if (typeof text !== "string" || !AGE_ASK.test(text)) return false;
  if (ABOUT_A_DEVICE.test(text)) return false;
  // "Applicants must be 21-35" is about the applicant even beside another word.
  if (/\b(you|your|applicants?|candidates?|must be|should be)\b/i.test(text) && !/\b(customers?|patients?|callers?|clients?|members?|policyholders?)'s?\b/i.test(text)) return true;
  return !ABOUT_SOMEONE_ELSE.test(text);
}

/** The list without any item that asks for age, a birth date or marital status, or sets an age limit. */
export function withoutAgeAsks<T>(items: readonly T[] | null | undefined, textOf: (item: T) => unknown = (item) => item): T[] {
  return Array.isArray(items) ? items.filter((item) => !asksAgeOrStatus(textOf(item))) : [];
}

/** A paragraph (or a "• one\n• two" list) without the sentences or lines that do. */
export function textWithoutAgeAsks(text: unknown): unknown {
  if (typeof text !== "string") return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!asksAgeOrStatus(line)) {
      out.push(line);
      continue;
    }
    // Keep the line's other sentences ("Good English. Must be 21-35 years old. Two years in a call center.").
    const kept = line.split(/(?<=[.!?])\s+|\s+(?=[•·]\s)/).filter((sentence) => !asksAgeOrStatus(sentence)).join(" ");
    if (kept.trim()) out.push(kept);
  }
  return out.join("\n");
}

/** A "• one\n• two" bullet list without its age lines (kept for its callers; the same rule as textWithoutAgeAsks). */
export function bulletsWithoutAgeAsks(text: unknown): unknown {
  return textWithoutAgeAsks(text);
}

/** A comma-separated list ("skills", "benefits") without its age items. */
export function commaListWithoutAgeAsks(text: unknown): unknown {
  if (typeof text !== "string") return text;
  return text
    .split(",")
    .filter((item) => !asksAgeOrStatus(item))
    .join(",")
    .trim();
}
