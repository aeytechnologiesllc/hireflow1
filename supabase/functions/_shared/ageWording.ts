/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second to fifth Phase 6 reviews).
 *
 * Every application already starts with HireFlow's own "Are you 18 or
 * older?" (src/lib/ageCheck.ts), and RA 10911 Section 5(a) makes it unlawful
 * to "require the declaration of age or birth date during the application
 * process" or to publish a job notice suggesting an age preference. The
 * models are told so (AGE_RULE), and anything they still write that asks the
 * applicant for their age, birth date, graduation year, marital status or
 * family plans, or that sets an age limit or preference, is dropped before a
 * business sees it: an item from a list, a sentence from a paragraph.
 *
 * Read one sentence at a time, in two kinds:
 *   - always the applicant's: a form label ("Age", "Date of birth (MM/DD)"),
 *     a question to them ("How old are you?", "Are you under 30?", "Which age
 *     group are you in?", "Do you plan to have children?"), "fresh graduates
 *     only", a young team or young agents wanted, a generation preferred,
 *     "single applicants preferred", "of legal age";
 *   - an age ("21-35 years old", "aged 21-30", "at least 21 years of age",
 *     "must be over 21", "ages 18-30", "21+ only"): the applicant's unless it
 *     is attached to the person it describes ("patients aged 65 and older",
 *     "a 70-year-old caller", "our customers are mostly between 25 and 40
 *     years old", "a 10 years old company"). The fifth review: a word for
 *     someone else ANYWHERE in the sentence used to keep it ("21-35 years
 *     old, with good accuracy", "between 20 and 30 years old, used to working
 *     with customers"), and any "you" dropped a question about an older
 *     customer ("How would you help a patient who is 80 years old?").
 * A time, a score, a speed, a distance or a number of hours is never an age
 * ("must be under 10 minutes", "must be 30 km or less", "QA score must be 90
 * or higher", "at least 18 months in your current role"), and a number near
 * "applicants" is not one either unless an age word goes with it
 * ("Applicants must type 40-50 WPM", "Candidates must work 12-hour shifts").
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year, marital status or family plans, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post, its requirements or its questions: every application already asks 'Are you 18 or older?' on its own.";

const re = (parts: string[], flags = "i") => new RegExp(parts.join("|"), flags);

// About the applicant, whatever else the sentence says.
const ALWAYS = re([
  // A form label on its own line, with an optional "(MM/DD/YYYY)" or "(optional)".
  String.raw`^\s*[-•*]?\s*(your\s+)?(age|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan|age range|age group|age bracket)\s*(\([^)]*\))?\s*[:?]?\s*$`,
  String.raw`^\s*[-•*]?\s*(marital|civil|relationship) status\s*(\([^)]*\))?\s*:`,
  String.raw`^\s*[-•*]?\s*status\s*:\s*(single|married|widowed|separated)\b`,
  String.raw`^\s*[-•*]?\s*(age|edad)\s*(range|group|bracket)?\s*:`,
  String.raw`\bedad\b`,
  // A question to the applicant, or a request to tell.
  String.raw`\bhow old (are you|will you be)\b`,
  String.raw`\byour (age|date of birth|birth ?date|birthday|birth year|year of birth|marital status|civil status|relationship status)\b`,
  String.raw`\byour\b[^.?!]{0,30}\bage (range|group|bracket)\b|\bage (range|group|bracket)\b[^.?!]{0,30}\b(are you|you are|you're|your)\b|^\s*[-•*]?\s*(please\s+)?(select|choose|pick)\s+(your\s+)?age\b`,
  String.raw`\b(state|enter|give|provide|list|indicate|include|share|tell us)\s+your\s+(age|birth ?date|date of birth|year of birth|marital status|civil status|birthday)\b|^\s*[-•*]?\s*(state|enter|give|provide|list)\s+(age|birth ?date|date of birth|year of birth|marital status)\b`,
  String.raw`\b(name|location|address),\s*(and\s+)?age\b|\bage,\s*(and\s+)?(location|name|where you)\b|\bname and age\b|\bage and (civil|marital) status\b`,
  String.raw`\bwhat'?s your age\b|\bwhat is your age\b`,
  String.raw`\bare you\s+(\d{2}\b|over \d{2}|under \d{2}|older than|younger than|between \d{2}|at least \d{2}|of legal age|a (fresh|recent|new) grad\w*|married|single|pregnant)`,
  String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college|finish university))\b|\bwhen were you born\b|\bwhen is your birthday\b`,
  String.raw`\bwhen did you graduate\s*\?|\bwhen did you graduate (from )?(high school|college|university|senior high)\b|\bwhen did you finish (high )?school\b|\bwhen did you finish (college|university)\b`,
  String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
  String.raw`\bmarried or single\b|\bsingle,? (or )?married\b|\bmust be (single|married|unmarried)\b|\b(single|married|unmarried) (applicants|candidates|people|women|men)\b`,
  String.raw`\bdo you (have|plan to have) (any )?(children|kids|a family)\b(?!')|\bhow many (children|kids) do you have\b|\bnumber of (children|dependents)\b|\bplanning (a family|to have children)\b|\bno (kids|children)\b[^.]{0,25}\bpreferred\b|\bmust not have (any )?(children|kids)\b`,
  String.raw`\bilang taon ka\b|\bkaarawan mo\b|\bwhat generation are you\b`,
  String.raw`\bsingle\s*\/\s*married\b(?!\s+filing)|\bmarried\s*\/\s*single\b(?!\s+filing)`,
  String.raw`\bin (your|their) (20s|30s|twenties|thirties)\b|\b(early|mid|late)-?(20s|30s)\b|\bdigital natives?\b`,
  String.raw`\bof legal age\b`,
  String.raw`\b(male|female)\b[^.]{0,20}\b\d{2}\s*(-|–|to)\s*\d{2}\b`,
  // A preference for young applicants.
  String.raw`\b(fresh|recent|new)\s+(college\s+|university\s+)?grad\w*\b[^.]{0,20}\b(only|preferred|required|need apply)\b|\bonly\s+(fresh|recent|new)\s+grad`,
  String.raw`\byoung(er)?\b[,\s]+(and\s+)?([\w-]+[,\s]+){0,3}(team|team players?|talent|blood|crowd)\b|\byoung,?\s+(and\s+)?(energetic|dynamic|vibrant|fresh|fun)\b|\byouthful,?\s+(and\s+)?(energy|energetic|team|vibe)\b`,
  String.raw`\b(want|wants|wanted|seeking|looking for|hiring|prefer|preferred|welcome|only)\b[^.]{0,30}\byoung(er)?\b[,\s]+([\w-]+[,\s]+){0,2}(people|applicants|candidates|agents|reps|representatives|staff|professionals|workers|employees|graduates)\b|\byoung(er)?\s+(applicants|candidates)\b|\b(applicants|candidates|people|someone)\s+who\s+(are|is)\s+young\b|\byoung professionals (welcome|wanted|only|preferred)\b`,
  String.raw`\b(millennials?|gen ?z|generation z|digital natives?)\b[^.]{0,40}\b(preferred|only|applicants|candidates|reps|agents|wanted|mindset)\b`,
  String.raw`\b(ideal|preferred|max(imum)?|min(imum)?)\s+age\b|\bage\s*(limit|requirement|range|bracket)s?\b(?![^.]{0,20}\b(groups? of (our|the) (customers|patients|members|users)|of (our|the) (customers|patients|members|users)))`,
]);

// Ages. Each is the applicant's unless it is attached to someone else.
const UNITS = String.raw`(?!\s*(%|percent|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|words?|wpm|km|kms|kilometers?|kilometres?|miles?|mbps|gb|mb|points?|calls|chats|tickets|replies|per\b|or (higher|more|better)|on\b|in\b|am\b|pm\b|:))`;
const AGE_NUMBER = [
  String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?\s?o\.?|y\/o)(?=\W|$)`,
  String.raw`\b\d{2}\s*(years?|yrs?)[\s-]*(old|of age)\b|\b\d{2}\s*y\/o\b|\b\d{2}\s*y\.o\.?(?=\W|$)`,
  // "21 years or older", "aged 18 and over"; never a bare "85 or above" (a score).
  String.raw`\b\d{2}\s*years?\s*(or|and)\s+(older|above|below|under|younger|over)\b|\b(be|aged?|ages?|applicants?|candidates?|persons?)\s+\d{2}\s*(or|and)\s+(older|above|below|under|younger|over)\b`,
  String.raw`\b(at least|over|under|below|above|not more than|no more than|not over|not older than|no older than|younger than|older than|max(imum)?|min(imum)?)\s+\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?o\.?|y\/o)(?=\W|$)`,
  String.raw`\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(at least\s+|over\s+|under\s+|below\s+|above\s+|older than\s+|younger than\s+|more than\s+|less than\s+|no more than\s+|not more than\s+|not older than\s+|no older than\s+|between\s+)?\d{2}\b${UNITS}`,
  String.raw`\b(not|no)\s+(older|more)\s+than\s+\d{2}\b${UNITS}`,
  String.raw`\bages?\s+(of\s+)?\d{2}\s*(\+|-|–|to|and|or)|\bages?\s*:\s*\d{2}|\baged?\s+\d{2}\b|\bbetween the ages of\b|\baged?\s+between\s+\d{2}\s+and\s+\d{2}\b`,
  String.raw`\bprefer\w*\b[^.]{0,30}\b(under|below|over|above|younger than|older than)\s+\d{2}\b${UNITS}`,
  String.raw`^\s*[-•*]?\s*(\d{2}\s*(-|–|to)\s*\d{2}|(below|under|over|above)\s+\d{2})\s*(only|years old|yrs old|years)?\s*$`,
  String.raw`^\s*[-•*]?\s*\d{2}\s*(years old\s*)?(and|or) (below|under|younger)\s*$|\b\d{2}\s*\+\s*only\b|^\s*[-•*]?\s*(must be\s+)?\d{2}\s*\+\s*$`,
  String.raw`\bpreferably\s+\d{2}\s*(-|–|to)\s*\d{2}\b`,
];
// A score, a time or a speed is the subject: "QA score must be 90", "reply time should be under 60".
const METRIC_SUBJECT = /\b(score|scores|rate|rates|speed|accuracy|csat|nps|aht|time|times|reply|replies|response|wpm|typing|qa|quality|sla|target|targets|internet|laptop|computer|ram|average)\b[^.]{0,25}$/i;
// Someone the age can belong to, written just before it.
const SOMEONE_ELSE_BEFORE = /\b(customers?|clients?|callers?|patients?|members?|users?|players?|gamers?|guests?|children|kids|students?|seniors?|senior citizens|parents|policyholders?|account holders?|buyers?|shoppers?|drivers?|famil(y|ies)|travel+ers?|residents?|people|readers?|viewers?|subscribers?|visitors?|son|daughter|mother|father|grandmother|grandfather|she|he|they|who)\b[^.]{0,40}$/i;
// "A 70-year-old caller", "a 16-year-old", "our 10 years old company", an app rated "18+".
const SOMEONE_ELSE_AT = /^(an?|the|our|this|my)\s+\d{2}[\s-]*(years?|yrs?)[\s-]*old\b|^\d{2}[\s-]*(years?|yrs?)[\s-]*old\s+(company|business|brand|firm|clinic|store|shop|app|website|platform|product|account|car|house)\b/i;
const SOMEONE_ELSE_AFTER = /^[^.]{0,15}\b(game|games|ratings?|rated|app|apps|content|movie|plan|plans|account|accounts|discount|discounts)\b/i;
// The sentence speaks to or about the applicant.
const NAMES_APPLICANT = /\b(applicants?|candidates?|ideal (candidate|age)|we('re| are) (looking|hiring|seeking)|seeking|looking for|you must|you should|you need|you have to|are you|your age)\b|^\s*[-•*]?\s*must\b/i;

function ageMatches(sentence: string): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  for (const pattern of AGE_NUMBER) {
    for (const m of sentence.matchAll(new RegExp(pattern, "gi"))) out.push({ at: m.index ?? 0, text: m[0] });
  }
  return out;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n/).filter((s) => s.trim());
}

function sentenceAsks(sentence: string): boolean {
  if (ALWAYS.test(sentence)) return true;
  // "Fresh graduates only, customer service training" names the job, not a customer.
  const plain = sentence.replace(/\bcustomer (service|support|care|success|experience)\b/gi, "service work");
  for (const m of ageMatches(plain)) {
    const before = plain.slice(0, m.at);
    const digit = m.text.search(/\d/);
    // From the number itself ("Over 10 years old company" reads from "10").
    const fromNumber = plain.slice(m.at + Math.max(0, digit));
    const after = plain.slice(m.at + m.text.length);
    if (/^(must|should|need|needs|has|have)\b/i.test(m.text) && METRIC_SUBJECT.test(before)) continue;
    if (SOMEONE_ELSE_AT.test(fromNumber)) continue;
    // "A 70 year old patient": an article, then the age, then the person.
    if (/\b(an?|the|our|this|my)\s*$/i.test(plain.slice(0, m.at + Math.max(0, digit)))) continue;
    if (SOMEONE_ELSE_BEFORE.test(before) && !NAMES_APPLICANT.test(before.slice(-40))) continue;
    // "Ages 12+ game ratings", "the app is 18+": a product's rating.
    if ((/\+\s*$/.test(m.text) || /^\s*\+/.test(after)) && SOMEONE_ELSE_AFTER.test(after.replace(/^\s*\+/, ""))) continue;
    return true;
  }
  return false;
}

/** True when the text asks the applicant for age, a birth date, marital status or family plans, or sets an age limit or preference. */
export function asksAgeOrStatus(text: unknown): boolean {
  if (typeof text !== "string") return false;
  return sentencesOf(text).some(sentenceAsks);
}

/**
 * A question with answer options: the question's own words decide, and an
 * option only when it names an age ("18-25 years old", "Born before 1990").
 * Joined together, ordinary number options ("Under 20 / 20-30 / 30-40" hours,
 * "0-2 / 3-5 / 6-10" years of experience) read as an age bracket and the
 * whole question went (the fifth Phase 6 review).
 */
export function questionAsksAge(question: unknown, options: readonly unknown[] | null | undefined = []): boolean {
  if (asksAgeOrStatus(question)) return true;
  return (Array.isArray(options) ? options : []).some(
    (option) => typeof option === "string" && /\b(years?\s*old|yrs?\s*old|y\/o|of age|age|born|birth|marital|civil status)\b/i.test(option) && asksAgeOrStatus(option),
  );
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

/**
 * A text in place, emptied when it asks for age: for lists read by position
 * (generate-flow's phaseRationales, each the note of the step at its index),
 * where dropping one shifted every later note onto the wrong step (the fifth
 * review). The page shows its own note for an empty one.
 */
export function blankAgeAsks(items: readonly unknown[] | null | undefined): unknown[] {
  return Array.isArray(items) ? items.map((item) => (typeof item === "string" && asksAgeOrStatus(item) ? "" : item)) : [];
}
