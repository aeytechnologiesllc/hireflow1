/**
 * Pure, deterministic pieces of the chat-simulation "evaluate" write — split
 * out of index.ts so they're testable under plain Node (scripts/
 * chat_simulation_grading.test.mjs) as well as Deno. Its one import is
 * _shared/reviewText.ts, itself import-free: no `https://` URL specifiers,
 * nothing Deno-only, so this file's exports run unmodified under either
 * runtime (same reasoning as _shared/trustedResults.ts's module comment).
 *
 * Everything here is the SAME shape ChatSimulationPhase.tsx's own client
 * code used to build locally (before this phase moved server-side) — see
 * the per-field comments below and docs/TRUSTED-RESULTS.md's result_key
 * table. The marks themselves come from the reviewer model (index.ts, via
 * callOpenAIJson, server-side — never from a request body); this module only
 * reads them: for the escalated team-leader rubric it computes the score from
 * the six item marks and applies the new-promise cap (leadEvaluationFrom),
 * and a chat nobody could mark is recorded as `graded: false` with no score
 * (ungradedEvaluation), never as a made-up 70.
 */

import {
  clampScore,
  cleanText,
  containsExact,
  flattenForReview,
  quoteIsApplicants,
  readFlag,
  readLineNumber,
  textList,
  words,
} from "../_shared/reviewText.ts";

// The reviewer-text helpers live in _shared/reviewText.ts (import-free, also
// read by ai-chat-interview); re-exported here for the callers and tests
// that have always imported them from this file.
export { clampScore, containsExact, flattenForReview, quoteIsApplicants, readFlag };

/** The types the page has always sent. Since 2026-10-06 the list can also
 *  come from the integrity events the page recorded (assessmentSession.ts
 *  integrityEventsToViolations), which adds "devtools", "page_closed" and
 *  "other"; those count in totalViolations / violationCount only. */
export type KnownAntiCheatType = "tab_switch" | "copy_attempt" | "paste_attempt" | "screenshot_attempt" | "right_click";

export interface AntiCheatViolation {
  type: KnownAntiCheatType | (string & {});
  timestamp: string;
  details: string;
}

export interface AntiCheatLog {
  violations: AntiCheatViolation[];
  totalViolations: number;
  tabSwitches: number;
  copyAttempts: number;
  pasteAttempts: number;
  screenshotAttempts: number;
  rightClickAttempts: number;
}

/** Exactly ChatSimulationPhase.tsx's own antiCheatLog construction
 *  (pre-conversion) — client-observed telemetry (tab switches, copy/paste,
 *  right-click, screenshot attempts) the server cannot itself observe, so
 *  it's trusted as-is and only ever summarized, never scored. */
export function buildAntiCheatLog(violations: AntiCheatViolation[]): AntiCheatLog {
  return {
    violations,
    totalViolations: violations.length,
    tabSwitches: violations.filter((v) => v.type === "tab_switch").length,
    copyAttempts: violations.filter((v) => v.type === "copy_attempt").length,
    pasteAttempts: violations.filter((v) => v.type === "paste_attempt").length,
    screenshotAttempts: violations.filter((v) => v.type === "screenshot_attempt").length,
    rightClickAttempts: violations.filter((v) => v.type === "right_click").length,
  };
}

export interface ChatSimulationEvaluation {
  /** null only when the chat was not graded (`graded: false`). */
  score: number | null;
  empathy: number | null;
  problemSolving: number | null;
  strengths: string[];
  improvements: string[];
  /** false when the grader's model call failed or its answer could not be
   *  read: nobody marked this chat. Absent means graded. */
  graded?: boolean;
  [key: string]: unknown;
}

/** The six marked items of the escalated (team leader) rubric, in order,
 *  with their weight in the score. prompts.ts builds the reviewer's rubric
 *  from this same list, so the prompt and the score name the same items. */
export const LEAD_ITEMS = [
  { key: "ownership", weight: 0.2 },
  { key: "correctedAgent", weight: 0.15 },
  { key: "accuracy", weight: 0.2 },
  { key: "infoAsked", weight: 0.1 },
  { key: "nextStep", weight: 0.15 },
  { key: "tone", weight: 0.2 },
] as const;

export type LeadItemKey = (typeof LEAD_ITEMS)[number]["key"];

/** The one item the reviewer may leave unmarked (null): the situation names
 *  no earlier mistake to correct. Any other item missing or unreadable makes
 *  the whole answer unreadable (the chat is then recorded as not graded). */
export const LEAD_OPTIONAL_ITEMS: ReadonlySet<LeadItemKey> = new Set<LeadItemKey>(["correctedAgent"]);

/** Any new date, refund, bonus, speed-up or extra caps the mark here. */
export const LEAD_NEW_PROMISE_CAP = 40;

/** Insulting, blaming or mocking the player caps the mark here too: a kind
 *  lead who slips into one promise must not rank below a rude one. */
export const LEAD_DISRESPECT_CAP = 40;

/** A tone mark below this caps the score at tone + LEAD_TONE_ALLOWANCE. */
export const LEAD_TONE_FLOOR = 40;
export const LEAD_TONE_ALLOWANCE = 25;

/** What lowered a lead's mark below the weighted items. */
export type LeadCap = "new_promise" | "disrespect" | "tone";

export interface LeadChatEvaluation extends ChatSimulationEvaluation {
  rubric: "team_lead";
  graded: true;
  score: number;
  ownership: number | null;
  correctedAgent: number | null;
  accuracy: number | null;
  infoAsked: number | null;
  nextStep: number | null;
  tone: number | null;
  /** true only when the reviewer flagged it AND the server confirmed it is
   *  the lead's own new commitment (verifyFlag). */
  newPromiseMade: boolean;
  newPromiseQuote: string | null;
  /** The numbered transcript line the promise is on, when confirmed by line. */
  newPromiseLine: number | null;
  /** The reviewer flagged a promise the server could not confirm as the
   *  lead's own new one (not on a LEAD line, a negated sentence, or the
   *  earlier agent's words): kept for staff, never capped on. */
  newPromiseUnverified: string | null;
  /** Confirmed: the lead insulted, blamed or mocked the player. */
  disrespectMade: boolean;
  disrespectQuote: string | null;
  disrespectUnverified: string | null;
  /** The mark before the caps, when a cap lowered it. */
  scoreBeforeCap: number | null;
  /** The caps that applied (empty when none did). One counts even when
   *  another already held the mark lower. */
  cappedBy: LeadCap[];
  /** A person should read this chat: a flag the server could not confirm,
   *  or promise words in the lead's own lines the reviewer did not flag. */
  needsReview: boolean;
  /** Why, in plain words for staff. */
  reviewReasons: string[];
  /** Each item's quoted line, only when it is the lead's own words (quoteIsApplicants). */
  evidence: Partial<Record<LeadItemKey, string>>;
  /** Quotes the reviewer gave that are NOT in the lead's own lines (the
   *  player's, or the brief's): never shown as the applicant's words. */
  evidenceUnverified: Partial<Record<LeadItemKey, string>>;
  overallFeedback: string | null;
}

export interface ChatSimulationResult {
  scenario: string;
  messageCount: number;
  score: number | null;
  empathy: number | null;
  problemSolving: number | null;
  strengths: string[];
  improvements: string[];
  completed: true;
  antiCheatSummary: {
    hasViolations: boolean;
    violationCount: number;
    tabSwitches: number;
    copyPasteAttempts: number;
  };
  /** Present (false) only when nobody marked the chat. */
  graded?: false;
  /** The conversation, kept on the result itself when it was not graded, so it can be re-graded. */
  transcript?: SimulationChatMessage[];
  scenarioId?: string;
  /** The escalated (team leader) rubric's own fields; absent for the support-agent rubric. */
  rubric?: "team_lead";
  ownership?: number | null;
  correctedAgent?: number | null;
  accuracy?: number | null;
  infoAsked?: number | null;
  nextStep?: number | null;
  tone?: number | null;
  newPromiseMade?: boolean;
  newPromiseQuote?: string | null;
  evidence?: Partial<Record<LeadItemKey, string>>;
  /** A flag the server could not confirm, kept for staff (lead rubric). */
  newPromiseUnverified?: string | null;
  disrespectMade?: boolean;
  disrespectQuote?: string | null;
  cappedBy?: LeadCap[];
  /** A person should read this chat before its mark is trusted. */
  needsReview?: true;
  reviewReasons?: string[];
  /** "browser": graded from the transcript the page sent, because the
   *  record of the attempt was not available (the record system not
   *  deployed). Absent when graded from the stored turns. */
  transcriptSource?: "browser";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ============================================================================
// The transcript as the reviewer reads it: one numbered line per message
// ============================================================================

export interface ReviewLine {
  /** 1-based, counting only the non-empty messages: what the reviewer sees. */
  n: number;
  /** "user" is the applicant. */
  role: "user" | "assistant";
  text: string;
}

/** The chat as numbered lines, oldest first; empty messages are left out. */
export function reviewLines(messages: readonly SimulationChatMessage[]): ReviewLine[] {
  const out: ReviewLine[] = [];
  for (const m of messages) {
    const text = typeof m?.content === "string" ? flattenForReview(m.content) : "";
    if (!text) continue;
    out.push({ n: out.length + 1, role: m.role === "user" ? "user" : "assistant", text });
  }
  return out;
}

/** A sentence that says what will NOT happen is a correction, not a promise. */
const NEGATION = /\b(can'?t|cannot|can not|won'?t|not|never|no one|nobody|unable)\b/i;

function hasNegation(text: string): boolean {
  return NEGATION.test(text.replace(/[‘’]/g, "'"));
}

/** The sentence of `line` the quote sits in (the whole line when it cannot be placed). */
function sentenceWith(line: string, quote: string | null): string {
  if (!quote) return line;
  const sentences = line.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => containsExact(s, quote)) ?? line;
}

/**
 * Words that can mean a new commitment. A LEAD sentence that uses one of them
 * AS a commitment (below), and is not negated, marks the chat for a person to
 * read when the reviewer did not flag a promise. It never caps the mark by
 * itself, and the scorecard shows it without holding the card
 * (_shared/autopilot.ts isPromiseWordsOnlyReason): it is a pointer, not a
 * finding.
 *
 * A word alone is not a promise (2026-10-06): every correct lead line tried
 * on the live cases was flagged, because the cases GIVE the lead these words
 * as facts ("the phone check started today", "I'm sorry about how tonight
 * went", "I understand why the bonus matters to you"). So each word counts
 * only in the construction that makes it a promise:
 *   - a WHEN word (today, tonight, tomorrow, within the hour, rush) only in a
 *     sentence that commits to an outcome: "you'll have it by tonight", not
 *     "the rule changed today", and not the lead's own next step ("I'll look
 *     into it today", "I'll write up your complaint today");
 *   - a GIFT word (bonus, credit) only in a sentence that gives something:
 *     "I'll add a $10 bonus for the trouble", "you'll get a credit", not "it
 *     will show as a credit once we find it";
 *   - a CLAIM (guaranteed, approved, something extra, front of the line) when
 *     the case never says it, or in a sentence that commits.
 * Someone else's words never count: what the lead puts in quotation marks,
 * and a quote from the case the lead repeats word for word to correct the
 * earlier agent.
 */
const PROMISE_WORDS =
  /\b(tonight|tomorrow|today|within (?:the|an|one) hour|guarantee\w*|approved|bonus|credit|something extra|rush|front of the (?:line|queue))\b/gi;

type PromiseWordKind = "when" | "gift" | "claim";

function promiseWordKind(hit: string): PromiseWordKind {
  const w = hit.toLowerCase();
  if (/^(tonight|tomorrow|today|rush)$/.test(w) || w.startsWith("within ")) return "when";
  if (w === "bonus" || w === "credit") return "gift";
  return "claim";
}

/** A future: "I'll", "it will", "we're going to" (apostrophes already straightened). */
const FUTURE = /(?:'ll|\bwill|\bshall|\bgoing to|\bgonna)\s+/gi;

/** Words between the future and its verb that say nothing about which verb it is. */
const FUTURE_FILLER = new Set([
  "personally", "also", "definitely", "certainly", "absolutely", "really", "still", "just", "now", "then", "right",
  "first", "both", "all", "gladly", "happily", "immediately", "quickly", "soon", "be", "myself", "make", "sure",
]);

/**
 * The lead's OWN next step: committing to look into it, write it up, pass it
 * on or keep the player posted is what a lead should do, not a promise of an
 * outcome the player can hold them to. ("make sure" is skipped above, so "I'll
 * make sure you get it" reads its real verb.)
 */
const PROCESS_VERB =
  /^(?:look|check|writ|pass|escalat|ask|review|follow|talk|speak|contact|report|find out|dig|investigat|keep|updat|messag|note|log|flag|let|reach|rais|shar|read|explain|help|stay|listen|wait|get back|be in touch)/;

/** Handing the case on: "I'll send it to the manager", "take this to the team". */
const HANDOFF = /^(?:send|forward|hand|take|bring|put)\b.*\bto (?:the|a|my|our) (?:manager|team|supervisor|lead|payments team)\b/;

/** A present-tense commitment: "you're getting it today", "I'm sending it now". */
const PRESENT_COMMITMENT =
  /\b(?:you're getting|you are getting|it's being|it is being|i'm (?:sending|adding|giving|putting|paying|approving|processing|pushing|rushing|getting you)|we're (?:sending|adding|giving|putting|paying|approving|processing|pushing|rushing|getting you)|i am (?:sending|adding|giving|putting|paying|approving|processing|pushing|rushing)|we are (?:sending|adding|giving|putting|paying|approving|processing|pushing|rushing))\b/i;

/** A deadline: "by tonight", "within the hour". */
const DEADLINE = /\bby (?:tonight|tomorrow|today|end of (?:the )?day|the end of (?:the )?(?:day|today|tonight))\b|\bwithin (?:the|an|one) hour\b/i;

/** "guaranteed" / "I promise": a commitment on its own. */
const ASSURANCE = /\b(?:guarantee\w*|i promise|promise you)\b/i;

/**
 * Giving the player something: "I'll add a $10 bonus", "you'll get a credit",
 * "for the trouble". Not the case's own money landing ("it will show as a
 * credit once we find it").
 */
const GIVING =
  /\b(?:giv(?:e|ing) (?:you|him|her)\b|get(?:ting)? you (?:a|an|some)\b|get(?:ting)? you \$|send(?:ing)? you (?:a|an|some)\b|hook you up|throw(?:ing)? in\b|on us\b|on the house|for (?:the|your) (?:trouble|wait|inconvenience|hassle)|to make (?:it|this|that) up|make it up to you|add(?:ing|ed)? (?:a|an|some|another)\b|add(?:ing|ed)? \$|(?:you'll|you will|you're going to|you are going to) (?:get|have|receive) (?:a|an|some)\b|(?:you'll|you will|you're going to|you are going to) (?:get|have|receive) \$|(?:i've|we've|i have|we have|i just|we just) (?:added|given|put|sent|applied|credited|approved|issued)\b|here(?:'s| is) (?:a|an|some|your)\b|here(?:'s| is) \$)/i;

function straighten(sentence: string): string {
  return sentence.replace(/[‘’]/g, "'").toLowerCase();
}

/**
 * Does the sentence commit to an OUTCOME? A future clause whose verb is not
 * the lead's own next step; a present-tense "you're getting it"; a deadline
 * ("by tonight") that is not on the lead's own next step; or an assurance.
 */
function commitsToOutcome(sentence: string): boolean {
  const s = straighten(sentence);
  if (ASSURANCE.test(s) || PRESENT_COMMITMENT.test(s)) return true;
  let outcome = false;
  let process = false;
  for (const m of s.matchAll(FUTURE)) {
    // The clause the future governs: up to the next punctuation or joining
    // word ("I'll check, and you'll have it" is two clauses).
    const clause = s.slice((m.index ?? 0) + m[0].length).split(/[,.;:!?]|\s(?:and|but|so|once|when|after)\s/)[0].trim();
    const after = clause.split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < after.length && FUTURE_FILLER.has(after[i])) i += 1;
    // "be in touch" reads as written; "be" alone is filler ("it will be added").
    const rest = clause.startsWith("be in touch") ? clause : after.slice(i).join(" ");
    if (!rest) continue;
    if (PROCESS_VERB.test(rest) || HANDOFF.test(rest)) process = true;
    else outcome = true;
  }
  if (outcome) return true;
  return DEADLINE.test(s) && !process;
}

/** The case's quotes: the earlier agent's own words ("Your refund is approved, you'll have it tomorrow."). */
function quotesIn(text: string): string[] {
  return [...String(text ?? "").matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
}

/**
 * The words in this sentence that are someone else's: anything the lead put
 * in quotation marks, and a quote from the case the lead repeats word for
 * word to correct it. Before 2026-10-06 every word the case quoted was
 * skipped in EVERY sentence, so in Angela's case "tomorrow" never counted:
 * "I'll make sure it's back by tomorrow" read as clean.
 */
function othersWords(sentence: string, caseQuotes: readonly string[]): string {
  const repeated = caseQuotes.filter((quote) => containsExact(sentence, quote));
  return ` ${words([...quotesIn(sentence), ...repeated].join(" ")).join(" ")} `;
}

/** Same word, allowing an ending: "bonus" / "bonuses", "approved" / "approve" (reviewText.ts sameWord). */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/** Is this word or phrase anywhere in the case the applicant read (situation and what the lead knows)? */
function inCase(hit: string, caseWords: readonly string[], caseText: string): boolean {
  const hitWords = words(hit);
  if (hitWords.length === 0) return false;
  if (hitWords.length > 1) return containsExact(caseText, hit);
  return caseWords.some((w) => sameStem(w, hitWords[0]));
}

function sentenceMakesPromise(sentence: string, caseQuotes: readonly string[], caseWords: readonly string[], caseText: string): boolean {
  const hits = [...sentence.matchAll(PROMISE_WORDS)].map((m) => m[0]);
  if (hits.length === 0) return false;
  const others = othersWords(sentence, caseQuotes);
  let commits: boolean | null = null;
  const commitment = () => (commits ??= commitsToOutcome(sentence));
  for (const hit of hits) {
    // Someone else's words, repeated (the earlier agent's, to correct them).
    if (others.includes(` ${words(hit).join(" ")} `)) continue;
    const kind = promiseWordKind(hit);
    if (kind === "when" && commitment()) return true;
    if (kind === "gift" && GIVING.test(straighten(sentence))) return true;
    if (kind === "claim" && (!inCase(hit, caseWords, caseText) || commitment())) return true;
  }
  return false;
}

export function promiseWordsInLeadLines(lines: readonly ReviewLine[], caseText: string): string[] {
  const text = String(caseText ?? "");
  const caseQuotes = quotesIn(text);
  const caseWords = words(text);
  const seen: string[] = [];
  for (const line of lines) {
    if (line.role !== "user") continue;
    for (const sentence of line.text.split(/(?<=[.!?])\s+/)) {
      if (hasNegation(sentence)) continue;
      if (sentenceMakesPromise(sentence, caseQuotes, caseWords, text)) {
        seen.push(`line ${line.n}: "${sentence.slice(0, 200)}"`);
        break;
      }
    }
    if (seen.length >= 3) break;
  }
  return seen;
}

/** The start of the reason promiseWordsInLeadLines puts on a chat: _shared/autopilot.ts
 *  recognises it (isPromiseWordsOnlyReason) and shows it without holding the card. */
export const PROMISE_WORDS_REASON_PREFIX = "Promise words in the lead's own lines that the review did not flag";

type FlagCheck =
  | { state: "none" }
  | { state: "confirmed"; quote: string; line: number }
  | { state: "unconfirmed"; quote: string; why: string };

/**
 * The server's own check of a flag the reviewer raised (a new promise, or
 * disrespect). The reviewer names the numbered line and quotes it; the flag
 * is CONFIRMED only when:
 *   - the line is one of the LEAD's (the number names a LEAD line, or the
 *     quote is word for word in one): never the player's line or the brief;
 *   - and, for a promise, that sentence is not a negation ("I can't promise
 *     a refund tomorrow" corrects a promise, it does not make one);
 *   - and the quote is not the earlier agent's own words from the situation,
 *     which a lead repeats to correct them.
 * Anything else is UNCONFIRMED: kept for staff, never capped on.
 */
function verifyFlag(
  raw: Record<string, unknown>,
  keys: { flag: string; line: string; quote: string },
  lines: readonly ReviewLine[],
  situation: string,
  checkNegation: boolean,
): FlagCheck {
  if (!readFlag(raw[keys.flag])) return { state: "none" };
  const quote = cleanText(raw[keys.quote]);
  const lineNo = readLineNumber(raw[keys.line]);
  const byNumber = lineNo !== null ? lines.find((l) => l.n === lineNo && l.role === "user") ?? null : null;
  const byQuote = quote
    ? (byNumber && containsExact(byNumber.text, quote) ? byNumber : lines.find((l) => l.role === "user" && containsExact(l.text, quote))) ?? null
    : null;
  const located = byQuote ?? byNumber;
  const shown = quote ?? (located ? located.text.slice(0, 300) : "");
  if (!located) {
    return { state: "unconfirmed", quote: shown, why: lineNo !== null ? `line ${lineNo} is not one of the lead's` : "not found in the lead's own lines" };
  }
  if (quote && situation && containsExact(situation, quote)) {
    return { state: "unconfirmed", quote: shown, why: "the earlier agent's words from the situation" };
  }
  if (checkNegation && hasNegation(sentenceWith(located.text, byQuote ? quote : null))) {
    return { state: "unconfirmed", quote: shown, why: "the lead's sentence says what will NOT happen" };
  }
  return { state: "confirmed", quote: quote ?? located.text.slice(0, 300), line: located.n };
}

/**
 * The reviewer's answer for the escalated (team leader) rubric, made into
 * the mark the server records. Built from the known keys ONLY: nothing the
 * model adds (a "graded", a "rubric", a "score") is carried over.
 *
 * The score is computed HERE from the six item scores (LEAD_ITEMS weights).
 * Only correctedAgent may be null (no earlier mistake to correct; the rest
 * re-weighted); any other item missing or unreadable makes the answer
 * unreadable: null, and the caller records the chat as not graded, never a
 * guess. Then the caps, each the server's own decision:
 *   - a new promise the server CONFIRMED as the lead's own (verifyFlag):
 *     at most LEAD_NEW_PROMISE_CAP;
 *   - disrespect to the player, confirmed the same way: at most
 *     LEAD_DISRESPECT_CAP;
 *   - a tone mark below LEAD_TONE_FLOOR: at most tone + LEAD_TONE_ALLOWANCE.
 * A flag that cannot be confirmed, or promise words in the lead's own lines
 * the reviewer did not flag, mark the chat needsReview for a person.
 *
 * `caseText` is the case the applicant read (situation and what the team
 * leader knows): a quote that is the earlier agent's words, or a fact the
 * lead was given, is never the lead's new promise.
 */
export function leadEvaluationFrom(
  raw: unknown,
  messages: readonly SimulationChatMessage[],
  options: { caseText?: string | null } = {},
): LeadChatEvaluation | null {
  if (!isRecord(raw)) return null;
  const scores = {} as Record<LeadItemKey, number | null>;
  const evidence: Partial<Record<LeadItemKey, string>> = {};
  const evidenceUnverified: Partial<Record<LeadItemKey, string>> = {};
  let weighted = 0;
  let weights = 0;
  for (const item of LEAD_ITEMS) {
    const entry = raw[item.key];
    const score = clampScore(isRecord(entry) ? entry.score : entry);
    if (score === null && !LEAD_OPTIONAL_ITEMS.has(item.key)) return null;
    scores[item.key] = score;
    const quote = isRecord(entry) ? cleanText(entry.quote) : null;
    // Shown to staff as the applicant's own words only when they are.
    if (quote) (quoteIsApplicants(quote, messages) ? evidence : evidenceUnverified)[item.key] = quote;
    if (score !== null) {
      weighted += score * item.weight;
      weights += item.weight;
    }
  }
  if (weights === 0) return null;

  const lines = reviewLines(messages);
  const caseText = typeof options.caseText === "string" ? options.caseText : "";
  const promise = verifyFlag(raw, { flag: "newPromiseMade", line: "newPromiseLine", quote: "newPromiseQuote" }, lines, caseText, true);
  const disrespect = verifyFlag(raw, { flag: "playerDisrespected", line: "disrespectLine", quote: "disrespectQuote" }, lines, caseText, false);

  const uncapped = Math.round(weighted / weights);
  let score = uncapped;
  const cappedBy: LeadCap[] = [];
  const cap = (limit: number, why: LeadCap) => {
    if (score > limit) score = limit;
    cappedBy.push(why);
  };
  if (promise.state === "confirmed") cap(LEAD_NEW_PROMISE_CAP, "new_promise");
  if (disrespect.state === "confirmed") cap(LEAD_DISRESPECT_CAP, "disrespect");
  if (scores.tone !== null && scores.tone < LEAD_TONE_FLOOR) cap(scores.tone + LEAD_TONE_ALLOWANCE, "tone");

  const reviewReasons: string[] = [];
  if (promise.state === "unconfirmed") {
    reviewReasons.push(`Possible new promise, not confirmed (${promise.why}): "${promise.quote}"`);
  }
  if (disrespect.state === "unconfirmed") {
    reviewReasons.push(`Possible disrespect to the player, not confirmed (${disrespect.why}): "${disrespect.quote}"`);
  }
  if (promise.state === "none") {
    const seen = promiseWordsInLeadLines(lines, caseText);
    if (seen.length > 0) reviewReasons.push(`${PROMISE_WORDS_REASON_PREFIX}: ${seen.join("; ")}`);
  }

  const solving = [scores.accuracy, scores.infoAsked, scores.nextStep].filter((s): s is number => s !== null);
  return {
    rubric: "team_lead",
    graded: true,
    score,
    // The two numbers every older reader shows, from this rubric's own items.
    empathy: scores.tone ?? score,
    problemSolving: solving.length > 0 ? Math.round(solving.reduce((a, b) => a + b, 0) / solving.length) : score,
    ...scores,
    newPromiseMade: promise.state === "confirmed",
    newPromiseQuote: promise.state === "confirmed" ? promise.quote : null,
    newPromiseLine: promise.state === "confirmed" ? promise.line : null,
    newPromiseUnverified: promise.state === "unconfirmed" ? promise.quote : null,
    disrespectMade: disrespect.state === "confirmed",
    disrespectQuote: disrespect.state === "confirmed" ? disrespect.quote : null,
    disrespectUnverified: disrespect.state === "unconfirmed" ? disrespect.quote : null,
    scoreBeforeCap: score < uncapped ? uncapped : null,
    cappedBy,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    evidence,
    evidenceUnverified,
    strengths: textList(raw.strengths),
    improvements: textList(raw.improvements),
    overallFeedback: cleanText(raw.overallFeedback, 600),
  };
}

/** The support-agent rubric's answer (the one every non-lead job has always
 *  had), its numbers clamped to 0-100. Built from the known keys ONLY, never
 *  by spreading the model's JSON: an answer that adds "graded": false or a
 *  "rubric" cannot mark itself not graded or borrow the lead fields. Null
 *  when there is no overall score: recorded as not graded. */
export function supportEvaluationFrom(raw: unknown): ChatSimulationEvaluation | null {
  if (!isRecord(raw)) return null;
  const score = clampScore(raw.score);
  if (score === null) return null;
  return {
    graded: true,
    score,
    empathy: clampScore(raw.empathy),
    problemSolving: clampScore(raw.problemSolving),
    communication: clampScore(raw.communication),
    professionalism: clampScore(raw.professionalism),
    strengths: textList(raw.strengths),
    improvements: textList(raw.improvements),
    overallFeedback: cleanText(raw.overallFeedback, 600),
  };
}

/** Nobody marked this chat (the model call failed, or its answer could not
 *  be read). It is NOT a 70: no score at all, and the conversation is kept. */
export function ungradedEvaluation(reason: string): ChatSimulationEvaluation {
  return {
    graded: false,
    score: null,
    empathy: null,
    problemSolving: null,
    strengths: [],
    improvements: [],
    gradingError: reason,
  };
}

function isLeadEvaluation(evaluation: ChatSimulationEvaluation): evaluation is LeadChatEvaluation {
  return evaluation.rubric === "team_lead" && evaluation.graded === true;
}

/** The exact `notes.chatSimulationResult` shape ChatSimulationPhase.tsx has
 *  always written (see docs/TRUSTED-RESULTS.md's result_key table) — every
 *  existing reader (trigger-ava-analysis, the cockpit, CondensedAIAnalysis,
 *  ai-shortlist, ai-chat-interview, generate-applicant-dossier,
 *  ava-voice-session/ava-voice-tools, ai-generate-performance-report) keeps
 *  reading this shape unchanged. Two additions, each only when it applies:
 *  `graded: false` + the transcript when nobody marked the chat (score,
 *  empathy and problemSolving are then null), and the escalated rubric's own
 *  items (ownership, correctedAgent, …, newPromiseMade, evidence) for a team
 *  lead job. */
export function buildChatSimulationResult(input: {
  scenario: string;
  messageCount: number;
  evaluation: ChatSimulationEvaluation;
  violations: AntiCheatViolation[];
  /** Kept on the result only when the chat was not graded. */
  transcript?: readonly SimulationChatMessage[];
  scenarioId?: string | null;
  /** "browser" when the transcript graded is the one the page sent (no
   *  record of the attempt to read): said on the result for every reader. */
  transcriptSource?: "stored" | "browser";
}): ChatSimulationResult {
  const antiCheatLog = buildAntiCheatLog(input.violations);
  const ungraded = input.evaluation.graded === false;
  const result: ChatSimulationResult = {
    scenario: input.scenario,
    messageCount: input.messageCount,
    score: ungraded ? null : input.evaluation.score,
    empathy: ungraded ? null : input.evaluation.empathy,
    problemSolving: ungraded ? null : input.evaluation.problemSolving,
    strengths: ungraded ? [] : input.evaluation.strengths,
    improvements: ungraded ? [] : input.evaluation.improvements,
    completed: true,
    antiCheatSummary: {
      hasViolations: input.violations.length > 0,
      violationCount: input.violations.length,
      tabSwitches: antiCheatLog.tabSwitches,
      copyPasteAttempts: antiCheatLog.copyAttempts + antiCheatLog.pasteAttempts,
    },
  };
  if (input.scenarioId) result.scenarioId = input.scenarioId;
  if (input.transcriptSource === "browser") result.transcriptSource = "browser";
  if (ungraded) {
    result.graded = false;
    result.transcript = (input.transcript ?? []).map((m) => ({ role: m.role, content: m.content }));
    return result;
  }
  if (isLeadEvaluation(input.evaluation)) {
    const e = input.evaluation;
    result.rubric = "team_lead";
    result.ownership = e.ownership;
    result.correctedAgent = e.correctedAgent;
    result.accuracy = e.accuracy;
    result.infoAsked = e.infoAsked;
    result.nextStep = e.nextStep;
    result.tone = e.tone;
    result.newPromiseMade = e.newPromiseMade;
    result.newPromiseQuote = e.newPromiseQuote;
    result.evidence = e.evidence;
    // What the server could not confirm, and the other caps, for staff and
    // the scorer: a promise the reviewer flagged on a line that is not the
    // lead's own is kept here, never capped on and never dropped.
    result.newPromiseUnverified = e.newPromiseUnverified;
    result.disrespectMade = e.disrespectMade;
    result.disrespectQuote = e.disrespectQuote;
    result.cappedBy = e.cappedBy;
    if (e.needsReview) {
      result.needsReview = true;
      result.reviewReasons = e.reviewReasons;
    }
  }
  return result;
}

const UNGRADED_ANALYSIS = "Chat simulation: sent, not graded yet (the check failed). The conversation is kept for re-grading.";

/** The exact `phase_ai_analysis` text ChatSimulationPhase.tsx has always
 *  written alongside notes — a display-only summary column recordStepResult
 *  itself doesn't own. A chat nobody marked says so instead of a number, and
 *  a lead's new promise is named. */
export function buildPhaseAiAnalysis(evaluation: ChatSimulationEvaluation): string {
  if (evaluation.graded === false || typeof evaluation.score !== "number") return UNGRADED_ANALYSIS;
  const parts = [`Chat simulation: ${evaluation.score}%. Empathy: ${evaluation.empathy}%, Problem-solving: ${evaluation.problemSolving}%.`];
  const quote = typeof evaluation.newPromiseQuote === "string" && evaluation.newPromiseMade === true ? evaluation.newPromiseQuote : null;
  if (quote) parts.push(`Made a new promise: "${quote}".`);
  const rude = typeof evaluation.disrespectQuote === "string" && evaluation.disrespectMade === true ? evaluation.disrespectQuote : null;
  if (rude) parts.push(`Was disrespectful to the player: "${rude}".`);
  if (evaluation.needsReview === true) parts.push("Needs a person to read the chat.");
  return parts.join(" ");
}

/**
 * The same text, rebuilt from the result already on file
 * (notes.chatSimulationResult, which carries score, empathy and
 * problemSolving), for the answer to a send that was already recorded. That
 * answer used to echo the applications.phase_ai_analysis column as it stood,
 * and by then trigger-ava-analysis has usually replaced it with the hiring
 * team's own summary (a decline note included). Null when the stored result
 * does not carry the three scores (and is not a chat nobody marked).
 */
export function phaseAiAnalysisFromStoredResult(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;
  if (r.graded === false) return UNGRADED_ANALYSIS;
  const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!isScore(r.score) || !isScore(r.empathy) || !isScore(r.problemSolving)) return null;
  return buildPhaseAiAnalysis({
    score: r.score,
    empathy: r.empathy,
    problemSolving: r.problemSolving,
    strengths: [],
    improvements: [],
    newPromiseMade: r.newPromiseMade === true,
    newPromiseQuote: typeof r.newPromiseQuote === "string" ? r.newPromiseQuote : null,
    disrespectMade: r.disrespectMade === true,
    disrespectQuote: typeof r.disrespectQuote === "string" ? r.disrespectQuote : null,
    needsReview: r.needsReview === true,
  });
}

/** The transcript shape the page sends and the record stores: "user" is the
 *  applicant (the support agent), "assistant" the simulated customer. */
export interface SimulationChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** The message list ai-chat-simulation sends the model for the PLAYER's next
 *  message (start / respond; the reviewer gets prompts.ts
 *  buildEvaluatorMessages instead), built the one way it always has been,
 *  whether the transcript came from the request (a page on the previous
 *  build) or from the stored turns: the system prompt, every
 *  message with its role FLIPPED ("user" <-> "assistant"; the comment in
 *  index.ts says the agent's messages are meant to become "user" since the
 *  model is the customer, yet the flip sends them as "assistant". Kept
 *  exactly as it is: changing it changes how every customer behaves, which
 *  is a separate decision), then the instruction for this turn. */
export function buildSimulationApiMessages(
  systemPrompt: string,
  messages: readonly SimulationChatMessage[],
  userContent: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "user" ? ("assistant" as const) : ("user" as const), // Flip roles for AI perspective
      content: m.content,
    })),
    { role: "user", content: userContent },
  ];
}
