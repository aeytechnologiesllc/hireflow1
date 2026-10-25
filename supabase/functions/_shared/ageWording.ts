/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second, third and fourth Phase 6 reviews).
 *
 * Every application already starts with HireFlow's own "Are you 18 or
 * older?" (src/lib/ageCheck.ts), and RA 10911 Section 5(a) makes it unlawful
 * to "require the declaration of age or birth date during the application
 * process" or to publish a job notice suggesting an age preference. The
 * models are told so (AGE_RULE), and anything they still write that asks the
 * applicant for their age, birth date, graduation year or marital status, or
 * that sets an age limit or preference, is dropped before a business sees it:
 * an item from a list, a sentence from a paragraph.
 *
 * Read one sentence at a time, in two kinds:
 *   - always the applicant's: a form label ("Age", "Date of birth"), a
 *     question to them ("How old are you?", "your date of birth"), "fresh
 *     graduates only", a young team, a generation preferred, "must be single";
 *   - an age limit ("must be 21-35", "aged 21-30", "below 30 years old",
 *     "21+ only"): the applicant's unless the sentence is about someone else
 *     and names no applicant ("Customers must be 18+ to open an account",
 *     "plans for members aged 65 and above", "Ages 12+ game ratings").
 * A time, a score or a speed is never an age ("must be under 10 minutes",
 * "QA scores must be above 85").
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year or marital status, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post or its requirements: every application already asks 'Are you 18 or older?' on its own.";

const re = (parts: string[]) => new RegExp(parts.join("|"), "i");

// About the applicant, whatever else the sentence says.
const ALWAYS = re([
  // A form label on its own line.
  String.raw`^\s*[-•*]?\s*(age|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan)\s*(\([^)]*\))?\s*[:?]?\s*$`,
  String.raw`^\s*[-•*]?\s*(marital|civil|relationship) status\s*:`,
  // A question to the applicant.
  String.raw`\bhow old (are you|will you be)\b`,
  String.raw`\byour (age|date of birth|birth ?date|birthday|birth year|year of birth|marital status|civil status|relationship status)\b`,
  String.raw`\b(state|enter|give|provide|list)\s+your\s+(age|birth ?date|date of birth|year of birth|marital status)\b|^\s*[-•*]?\s*(state|enter|give|provide|list)\s+(age|birth ?date|date of birth|year of birth|marital status)\b`,
  String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college))\b|\bwhen were you born\b`,
  String.raw`\bwhen did you graduate\s*\?|\bwhen did you graduate (from )?(high school|college|university|senior high)\b`,
  String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
  String.raw`\bare you (married|single)\b|\bmarried or single\b|\bmust be (single|married|unmarried)\b|\b(single|married|unmarried) (applicants|candidates|people|women|men)\b`,
  String.raw`\bdo you have (children|kids)\b(?!')|\bhow many (children|kids) do you have\b|\bnumber of (children|dependents)\b`,
  String.raw`\bilang taon ka\b|\bwhat generation are you\b`,
  String.raw`\bsingle\s*\/\s*married\b(?!\s+filing)|\bmarried\s*\/\s*single\b(?!\s+filing)`,
  String.raw`\bin (your|their) (20s|30s|twenties|thirties)\b|\b(early|mid|late)-?(20s|30s)\b|\bdigital natives?\b`,
  // A preference for young applicants.
  String.raw`\b(fresh|recent|new) grad\w*\b[^.]{0,15}\b(only|preferred|required)\b`,
  String.raw`\byoung(er)?\b[,\s]+(and\s+)?([\w-]+[,\s]+){0,3}(team|team players?|talent|blood|crowd)\b|\byoung and (energetic|dynamic|vibrant|fresh)\b|\byouthful (energy|team|vibe)\b`,
  String.raw`\b(millennials?|gen ?z|generation z|digital natives?)\b[^.]{0,40}\b(preferred|only|applicants|candidates|reps|agents|wanted)\b`,
]);

// An age limit: the applicant's unless the sentence is about someone else.
const LIMIT = re([
  String.raw`\b(must|should|need to|has to|have to)\s+(not\s+)?be\s+(at least\s+|between\s+|under\s+|below\s+|over\s+|above\s+|older than\s+|younger than\s+|no more than\s+|not more than\s+|not older than\s+|no older than\s+)?\d{2}\b(?!\s*(%|percent|minutes?|mins?|seconds?|secs?|hours?|words?|wpm|points?|per\b|calls|chats|tickets|replies|days?))`,
  String.raw`\b(must|should)\s+(not\s+)?be\s+(more|older) than\s+\d{2}\b`,
  String.raw`\b(applicants?|candidates?)\b[^.]{0,30}\b\d{2}\s*(\+|-|–|to|or older|or above|and above|years?)`,
  String.raw`\bages? (of )?\d{2}\s*(\+|-|–|to|and|or)|\bages? \d{2}\b|\baged? \d{2}\b|\bbetween the ages of\b|\baged? between \d{2} and \d{2}\b|\bage\s*:\s*\d{2}`,
  String.raw`\bmax(imum)? age\b|\bage (limit|requirement|range|bracket)s?\s*(:|is|of)?\s*\d{2}`,
  String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years old|yrs old|years of age|y\.?o\.?)(?=\W|$)|\(\s*\d{2}\s*(-|–|to)\s*\d{2}\s*(years old|yrs old|y\.?o\.?)?\s*\)`,
  String.raw`\b\d{2}\s*(years|yrs) (old|of age)\b|\b\d{2}\s*y\.?o\.?(?=\W|$)`,
  String.raw`\b(below|under|not more than|no more than|not older than|no older than) \d{2}\s*(years|yrs)( old| of age)?\b(?!\s+of\s+(experience|work|service))`,
  String.raw`\b(not|no) (older|more) than \d{2}\b(?!\s*(%|minutes?|seconds?|words?))`,
  String.raw`^\s*[-•*]?\s*(\d{2}\s*(-|–|to)\s*\d{2}|(below|under|over|above)\s+\d{2})\s*(only|years old|yrs old|years)?\s*$`,
  String.raw`^\s*[-•*]?\s*\d{2}\s*(years old\s*)?(and|or) (below|under|younger)\s*$|\baged? \d{2}\s*(and|or) (below|under|younger|above|older)\b|\b\d{2}\s*\+\s*only\b|^\s*[-•*]?\s*(must be\s+)?\d{2}\s*\+\s*$`,
  String.raw`\bpreferably\s+\d{2}\s*(-|–|to)\s*\d{2}\b`,
  String.raw`\byoung professionals\b`,
]);
// Someone else the sentence may be about (a customer's age at the counter,
// the people served, a product's rating), and words that name the applicant.
const SOMEONE_ELSE = /\b(customers?|buyers?|members?|children|kids|parents|patients?|clients?|callers?|users?|gamers?|seniors?|senior citizens|students?|shoppers?|travel+ers?|guests?|policyholders?|account holders?|their|his|her|ratings?|rated|restrictions?|products?|discounts?|plans?|polic(y|ies)|games?|apps?|accounts?|orders?|apartments?|company|companies|business|brand|firm|scores?|rates?|csat|nps|aht|targets?|speed|accuracy|times?)\b/i;
const NAMES_APPLICANT = /\b(applicants?|candidates?|you|your|we are looking for|we're looking for|hiring)\b|^\s*[-•*]?\s*must\b/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n/).filter((s) => s.trim());
}

function sentenceAsks(sentence: string): boolean {
  if (ALWAYS.test(sentence)) return true;
  if (!LIMIT.test(sentence)) return false;
  // "We help young professionals find apartments" is who the business serves.
  if (/\b(help(ing|s)?|serv(e|es|ing)|for) young professionals\b/i.test(sentence)) return false;
  // "Fresh graduates only, customer service training" names the job, not a customer.
  const plain = sentence.replace(/\bcustomer (service|support|care|success|experience)\b/gi, " ");
  return !(SOMEONE_ELSE.test(plain) && !NAMES_APPLICANT.test(plain));
}

/** True when the text asks the applicant for age, a birth date or marital status, or sets an age limit or preference. */
export function asksAgeOrStatus(text: unknown): boolean {
  if (typeof text !== "string") return false;
  return sentencesOf(text).some(sentenceAsks);
}

/** The list without any item that asks for age, a birth date or marital status, or sets an age limit. */
export function withoutAgeAsks<T>(items: readonly T[] | null | undefined, textOf: (item: T) => unknown = (item) => item): T[] {
  return Array.isArray(items) ? items.filter((item) => !asksAgeOrStatus(textOf(item))) : [];
}

/** A paragraph (or a "• one\n• two" list) without the sentences or lines that do; a list as a list. */
export function textWithoutAgeAsks(text: unknown): unknown {
  if (Array.isArray(text)) return withoutAgeAsks(text as unknown[], (item) => (typeof item === "string" ? item : JSON.stringify(item)));
  if (typeof text !== "string") return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!asksAgeOrStatus(line)) {
      out.push(line);
      continue;
    }
    // Keep the line's other sentences ("Good English. Must be 21-35 years old. Two years in a call center.").
    const kept = line.split(/(?<=[.!?;])\s+|\s+(?=[•·]\s)/).filter((sentence) => !asksAgeOrStatus(sentence)).join(" ");
    if (kept.trim()) out.push(kept);
  }
  return out.join("\n");
}

/** A "• one\n• two" bullet list without its age lines (the same rule as textWithoutAgeAsks). */
export function bulletsWithoutAgeAsks(text: unknown): unknown {
  return textWithoutAgeAsks(text);
}

/** A comma-separated list ("skills", "benefits"), or the same as an array, without its age items. */
export function commaListWithoutAgeAsks(text: unknown): unknown {
  if (Array.isArray(text)) return withoutAgeAsks(text as unknown[]);
  if (typeof text !== "string") return text;
  return text
    .split(",")
    .filter((item) => !asksAgeOrStatus(item))
    .join(",")
    .trim();
}
