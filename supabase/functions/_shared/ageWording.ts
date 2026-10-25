/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second Phase 6 review).
 *
 * Every application already starts with HireFlow's own "Are you 18 or
 * older?" (src/lib/ageCheck.ts), and RA 10911 Section 5(a) makes it unlawful
 * to "require the declaration of age or birth date during the application
 * process" or to publish a job notice suggesting an age preference. The
 * models are told so (AGE_RULE), and anything they still write that asks for
 * age, a birth date, the year someone was born or graduated, or marital
 * status, or that sets an age limit, is dropped before a business sees it.
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year or marital status, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post or its requirements: every application already asks 'Are you 18 or older?' on its own.";

const AGE_ASK = new RegExp(
  [
    String.raw`\bhow old\b`,
    String.raw`\byour age\b`,
    String.raw`\bage\s*(:|\?|range|limit|requirement|bracket|group)`,
    String.raw`\b(what|state|enter|give|provide|list)\b[^.?!]{0,20}\bage\b`,
    String.raw`\bdate of birth\b|\bbirth ?(date|day|year|place)\b|\byear of birth\b|\bborn (in|on)\b|\b(were|was) you born\b|\bdob\b`,
    String.raw`\b(year|date) (you )?(graduated|of graduation)\b|\bgraduation (year|date)\b`,
    String.raw`\bmarital\b|\bcivil status\b|\bare you (married|single)\b|\bmarried or single\b`,
    String.raw`\bages? (of )?\d{2}\b|\baged \d{2}\b`,
    String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years|yrs)( old)?\b(?!\s+of)`,
    String.raw`\b\d{2}\s*(years|yrs) old\b|\b\d{2}\s*y\.?o\b`,
    String.raw`\b(below|under|over|above|not older than|not over|no older than|maximum|max\.?|at most)\s+(the age of\s+)?\d{2}\s*(years|yrs|y\.?o\.?)?\s*(old)?\s*$`,
    String.raw`\b(below|under|not older than|no older than)\s+(the age of\s+)?\d{2}\s*(years|yrs|y\.?o\.?)\b(?!\s+of)`,
    String.raw`\bfresh grad\w*( only)\b|\byoung(er)? (applicants|people|professionals|candidates|team members)\b`,
  ].join("|"),
  "i",
);

/** True when the text asks for age, a birth date or marital status, or sets an age limit. */
export function asksAgeOrStatus(text: unknown): boolean {
  return typeof text === "string" && AGE_ASK.test(text);
}

/** The list without any line that asks for age, a birth date or marital status, or sets an age limit. */
export function withoutAgeAsks<T>(items: readonly T[] | null | undefined, textOf: (item: T) => unknown = (item) => item): T[] {
  return Array.isArray(items) ? items.filter((item) => !asksAgeOrStatus(textOf(item))) : [];
}

/** A "• one\n• two" bullet list without its age lines. */
export function bulletsWithoutAgeAsks(text: unknown): unknown {
  if (typeof text !== "string") return text;
  return text
    .split("\n")
    .filter((line) => !asksAgeOrStatus(line))
    .join("\n");
}
