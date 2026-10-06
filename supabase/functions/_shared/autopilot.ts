export type RecommendedAction = "advance" | "review" | "reject";
export type AutopilotAction = "advance" | "reject" | "defer";
export type AvaDecisionState = "ready_for_decision" | "needs_more_evidence";

export interface AvaScorecard {
  overallScore: number;
  confidence: number;
  recommendedAction: RecommendedAction;
  directMatchScore: number;
  transferableFitScore: number;
  learningSignalScore: number;
  transferableEvidence: string[];
  hardRequirementStatus: "met" | "mixed" | "at_risk";
  dimensionScores: {
    hard_requirements: number;
    role_competency: number;
    communication: number;
    execution_reliability: number;
    work_style_fit: number;
    evidence_quality: number;
  };
  riskFlags: string[];
  rationale: string;
  evidenceRefs: string[];
  evidenceFingerprint: string;
  evidenceFloorMet: boolean;
  pendingHighSignalPhases: string[];
  completedHighSignalPhases: string[];
  autopilotAction: AutopilotAction;
  decisionState: AvaDecisionState;
  hardRejectReason: string | null;
  /**
   * Deal-breakers no test can change (visa, schedule, wrong resume, likely
   * fabricated, ...), highlighted for the owner. In auto mode these never stop
   * anyone part-way: every applicant takes every test and the owner decides at
   * the end, so while tests are still ahead they live here and not in
   * hardRejectReason. Optional so scorecards stored before 2026-10-05 still
   * type-check; new scorecards always carry it.
   */
  dealBreakerFlags?: string[];
  /**
   * The facts behind the number, as the owner reads them (2026-10-06): what
   * pushed this applicant up and what pulled them down, each a short phrase
   * built from the evidence (tests, form answers, the judge's leadership read),
   * never a sentence chosen by job family. The same lines end the rationale.
   * Optional so older scorecards still type-check.
   */
  whyUp?: string[];
  whyDown?: string[];
  /** inferJobFamily's answer for this job, so a reader knows which weights applied. */
  jobFamily?: string;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeList(value: string[] | null | undefined, limit = 6) {
  return Array.from(new Set((value || []).map((entry) => String(entry || "").trim()).filter(Boolean))).slice(0, limit);
}

/**
 * A "conflict" that only says a LATER step has not happened yet is not a conflict.
 * The judge is told never to count a pending phase against anyone, and still writes
 * notes like "Required typing speed and accuracy have not yet been verified; the
 * typing test is pending." into hardRequirementConflicts. The word "required" in it
 * then made it the hard reject reason, so on 2026-10-05 every applicant to a role
 * with a typing test was held at step 1, recommended for decline, over a step that
 * comes after it. Missing evidence is what the next phase is for.
 *
 * A note is dropped only when the "still to come" is about an assessment step
 * itself: "the typing test is pending", "awaiting the interview", "will be
 * assessed in the chat simulation". "Work visa is pending" names no step, so it
 * stays a blocker.
 *
 * 2026-10-06 (second pass): the two halves used to be tested anywhere in the
 * note, so "the candidate has not yet led a team at any stage" read as a
 * pending step ("not yet" + "stage") and a real leadership gap vanished. The
 * "not done yet" words now have to sit next to the step they are about, and
 * realHardConflicts only asks this question while a test really is ahead.
 */
const STEP_NOUN =
  String.raw`(?:typing(?: test)?|quiz(?:zes)?|skills? check|simulation|chat practice|practice chat|role[- ]?play|interview|video(?: response| intro)?|portfolio(?: review)?|assessments?|tests?|phases?|steps?|stages?|workflow)`;
const PENDING_PHASE_PATTERNS = [
  // "the typing test is pending", "Quiz results are awaiting completion",
  // "the typing test has not been completed", "the interview is still to come".
  new RegExp(
    String.raw`\b${STEP_NOUN}\b[^.;]{0,30}?\b(?:is|are|was|were|has|have|remains?)\b(?: still| not)?(?: yet)?(?: been)? (?:pending|outstanding|awaiting|upcoming|to come|ahead|not (?:yet )?(?:been )?(?:taken|completed|done|started|finished|reached|submitted|scored|graded)|yet to (?:be )?(?:taken|completed|done|started|finished|reached|submitted|scored|graded))\b`,
    "i",
  ),
  // "pending quiz", "the upcoming interview", "a later stage", "awaiting the typing test".
  new RegExp(String.raw`\b(?:pending|upcoming|outstanding|remaining|later|next|future|awaiting(?: the| their| a)?)\s+(?:[\w-]+\s+){0,2}?${STEP_NOUN}\b`, "i"),
  // "has not yet taken the quiz", "yet to complete the typing test".
  new RegExp(
    String.raw`\b(?:not yet|yet to|has not|have not|hasn't|haven't)\s+(?:been\s+)?(?:taken|completed|done|started|finished|reached|sat|take|complete|start|finish|reach|sit)\b[^.;]{0,25}?\b${STEP_NOUN}\b`,
    "i",
  ),
  // "will be assessed in the chat simulation", "is verified by the typing test later".
  new RegExp(
    String.raw`\bwill be (?:verified|tested|assessed|checked|evaluated|measured|confirmed|probed|explored)\b[^.;]{0,30}?\b(?:in|by|during|at|through|with)\b[^.;]{0,15}?\b${STEP_NOUN}\b`,
    "i",
  ),
];

export function isPendingPhaseNote(note: string) {
  const text = normalizeQuotes(note);
  return PENDING_PHASE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Curly quotes and apostrophes as plain ones: the live judge writes "can’t". */
function normalizeQuotes(text: string) {
  return String(text || "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

/**
 * What each test measures, keyed by the labels pendingHighSignalPhases uses. The
 * judge words the same non-reason many ways ("…have not yet been verified; the
 * typing test is pending", "No evidence is provided for the required 45+ WPM
 * typing threshold"), so a phrase list alone kept missing it: while a test is
 * still to come, a note about what that test measures is the test's job, not a
 * reason to stop anyone before it.
 */
const PHASE_TOPICS: Record<string, RegExp> = {
  // Not "types": "all types of player escalations" is a requirement, not typing.
  "typing test": /\b(?:typ(?:ing|ed|e speed)|wpm|words? (?:a|per) minute|keyboard\w*)\b/i,
  quiz: /\b(?:quiz\w*|skills? check|knowledge (?:test|check))\b/i,
  "chat simulation": /\b(?:chat (?:simulation|practice)|simulat\w*|role[- ]?play\w*|practice chat)\b/i,
  "sales simulation": /\b(?:sales (?:simulation|role[- ]?play|call)|simulat\w*)\b/i,
  "chat interview": /\binterview\w*\b/i,
  "Ava interview": /\b(?:interview\w*|spoken|speaking|verbal)\b/i,
  "portfolio review": /\b(?:portfolio|work samples?)\b/i,
  "video response": /\bvideo\b/i,
  // The computer and connection check (docs/EQUIPMENT-CHECK.md): evidence, never
  // a high signal and never a conflict (buildAvaScorecard drops a note on this
  // topic whenever the job has the check). Network meanings only: a bare
  // "connection" ("no connection between their retail background and the
  // CRM skills") or "ping" is about something else and must stay a conflict.
  "connection check":
    /\b(?:internet|bandwidth|mbps|speed ?tests?|(?:download|upload) speeds?|latency|wi-?fi|(?:internet|network|broadband|home) connections?|connections? (?:speed|quality|check)|own (?:computer|laptop|device|equipment)|equipment check|home office setup)\b/i,
};

/**
 * Deal-breakers no test can change: who the person is, whether they may and can
 * do the job at all. A note that names one is never dropped as "the test's job".
 * In auto mode they are a highlighted flag for the owner (dealBreakerFlags) and
 * never stop anyone part-way (owner, 2026-10-05: nobody is parked, everyone
 * takes every test, he decides at the end). In manual mode the owner reviews
 * each step anyway, and one still makes Ava recommend stopping early.
 */
//
// 2026-10-06: the bare words "schedule", "shift(s)", "mismatch" and "certif…"
// are gone. They made the detector backwards for a team-lead role, where the
// judge describes the job itself with them: "has never planned shifts for a
// team", "describes no schedule or rota they ran" and "mismatch between
// leadership claimed and quiz answers" all read as deal-breakers, while the
// real gaps ("has led no one", "would rather only manage") did not. What is
// left is the candidate's OWN availability ("cannot / not available to work
// … nights"), an identity mismatch, a missing certification, and the rest
// unchanged (visa, permit, licence, wrong resume, fabrication). A form answer
// the owner marked as a deal-breaker is read from the form itself
// (formDealBreakersFrom), never inferred from how the judge worded a sentence.
//
// 2026-10-06 (second pass): what is left is only what a judge cannot word
// its way into. Gone: the bare "not available" / "unavailable" ("proof of the
// second year is not available in the application"), "eligib…" (refund and
// bonus eligibility is this job's money rule), "cheat…" (a cheat sheet for new
// agents), "authenticity" ("examples lack authenticity detail": the
// authenticity verdict is read from the report's own status line), a bare
// "certification" / "licence" (a COPC certification course is not a missing
// licence), the judge's own "deal-breaker" / "non-negotiable" (only the job's
// own word counts: isStatedDealBreakerConflict), and AVAILABILITY. Which
// shifts or hours someone can cover is not read from the judge's prose at
// all: "not available for overnight or weekend shifts" declined a strong lead
// on a job that asks "tell us which hours you can cover", while the same fact
// worded "selected only daytime and evening shifts" was a review. Prose about
// availability is now an ordinary conflict (shown, "review", never a decline);
// a schedule the owner will not bend on is a form flag he sets on the shift or
// hours question (flag_options, severity "decline").
const ELIGIBILITY_BLOCKER = new RegExp(
  [
    // The legal right to work at all.
    String.raw`\b(?:visa|work permit|work authori[sz]ation|right to work)\b`,
    String.raw`\b(?:not|isn't|aren't|un) ?(?:legally )?(?:authori[sz]ed|eligible|permitted|allowed) to work\b`,
    // A licence or certification the job itself requires.
    String.raw`\blicen[cs]e\w* (?:is |are )?required\b`,
    String.raw`\brequire[sd]? (?:a |an |the |any |valid |current |active )*(?:[\w-]+ ){0,3}(?:licen[cs]e|certificat(?:e|ion))s?\b`,
    // Who the person is, not what they claimed against a test.
    String.raw`\b(?:wrong resume|different person)\b`,
    String.raw`\b(?:name|identity|email|resume|document) mismatch\w*\b`,
    // Made up. "Fraud" only about the application itself: a lead job's
    // money rules talk about spotting bonus fraud.
    String.raw`\b(?:fabricat\w*|plagiar\w*|fraudulent(?:ly)?)\b`,
    String.raw`\b(?:committ(?:ed|ing)|likely|possible|suspected|apparent|signs of) fraud\b`,
  ].join("|"),
  "i",
);

export function isEligibilityBlocker(note: string) {
  return ELIGIBILITY_BLOCKER.test(normalizeQuotes(note));
}

/**
 * A requirement conflict that names a deal-breaker or non-negotiable the JOB
 * ITSELF states ("Non-negotiable: you must work every weekend"). The judge is
 * told never to call a requirement that unless the job does, and on
 * 2026-10-05 it did anyway ("below the non-negotiable 45 WPM requirement"),
 * so its own adjective counts for nothing; the owner's word does.
 */
export function isStatedDealBreakerConflict(note: string, jobText: string) {
  return STATED_DEAL_BREAKER_TERM.test(jobText || "") && affirmsTerm(normalizeQuotes(note), STATED_DEAL_BREAKER_TERM);
}

/**
 * The judge's PROSE used to be enough to stop someone: any analysis text that
 * contained "deal-breaker", "non-negotiable", "cannot work" or "required
 * schedule" became the hard reject reason. The pattern had no word boundaries
 * and no idea of negation, so "No deal-breakers identified." and "available
 * for the required schedule" fired it, and on 2026-10-05 the judge's own
 * adjective ("below the non-negotiable 45 WPM requirement" — the job never
 * says non-negotiable) parked the owner's test applicant twice.
 *
 * It is now an informational risk flag only, never a reason, and it fires
 * only on prose that AFFIRMS a conflict:
 *   - "non-negotiable" / "deal-breaker" count only when the job's own text
 *     uses that word (the judge may not invent a stated non-negotiable);
 *   - "cannot work" / "can't work" / "unable to work" count on their own;
 *   - a clause that negates the term ("no non-negotiables", "Nothing here is
 *     a dealbreaker", "Non-negotiables: none stated") never counts.
 * Ava's recommendation is built from the judge's structured
 * hardRequirementConflicts instead.
 */
const STATED_DEAL_BREAKER_TERM = /\b(?:deal[- ]?breakers?|non[- ]?negotiables?)\b/i;
const CANNOT_WORK_TERM = /\b(?:cannot|can't|can not|unable to) work\b/i;
const NEGATION_BEFORE =
  /\b(?:no|not|none|nothing|never|without|neither|nor|zero|isn't|aren't|wasn't|weren't|doesn't|don't|didn't)\b/i;
const NEGATION_AFTER = /^\W*(?:none|n\/a|not (?:stated|identified|found|applicable|present|mentioned|listed))\b/i;

function affirmsTerm(text: string, term: RegExp) {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const match = term.exec(sentence);
    if (!match) continue;
    const before = sentence.slice(0, match.index);
    // Only the term's own clause: "Did not list one, but cannot work nights"
    // must still count.
    const clauseStart = Math.max(
      before.lastIndexOf(","),
      before.lastIndexOf(";"),
      before.lastIndexOf(":"),
      before.lastIndexOf(" but "),
      before.lastIndexOf("\u2014"),
    );
    const clause = clauseStart >= 0 ? before.slice(clauseStart + 1) : before;
    const after = sentence.slice(match.index + match[0].length);
    if (NEGATION_BEFORE.test(clause) || NEGATION_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

export function proseAffirmsDealBreaker(analysisText: string, jobText: string) {
  const text = analysisText || "";
  if (affirmsTerm(text, CANNOT_WORK_TERM)) return true;
  return STATED_DEAL_BREAKER_TERM.test(jobText || "") && affirmsTerm(text, STATED_DEAL_BREAKER_TERM);
}

export const STATED_DEAL_BREAKER_FLAG = "A stated non-negotiable or deal-breaker appears to conflict with the application";

/*
 * There used to be a separate, wider end-of-tests word list
 * (END_OF_TESTS_REJECT_REASON) for turning a conflict into a decline once
 * every test was done. 2026-10-06: "required", "cannot", "can't", "schedule"
 * and "mismatch" left it first (the same 38 WPM lead was "review" or "Ava
 * recommends declining" depending on one word), then the rest ("not
 * available", "license", "certification", "authenticity": a COPC course or
 * "proof … is not available" declined a strong lead). It is gone: a conflict
 * is a decline reason only when it is an eligibility blocker or names a
 * deal-breaker the job itself states, at every stage. Everything else that can
 * decline is structure: the owner's form flags and the report's verdicts.
 */

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/**
 * The written interview's result lands in two shapes (see
 * ai-chat-interview/resultShape.ts): the "End Interview" button flattens the
 * evaluation onto the result ({ score, recommendation, messageCount }); the
 * auto-end path nests it ({ evaluation: { score, recommendation }, messages }).
 * trigger-ava-analysis read only the flat shape for the prompt and the
 * evidence fingerprint, so an auto-ended interview reached Ava as "N/A" while
 * the weighted score counted it. Every reader goes through this instead.
 */
export interface ChatInterviewReading {
  /** null when the interview was not graded (see `graded`) or has no score. */
  score: number | null;
  recommendation: string | null;
  messageCount: number | null;
  /**
   * false only when the grader itself said so (`graded: false`, flat or
   * nested): its model call failed and nobody marked the answers. Such a
   * result is NOT a score: it used to be stored as a silent 70 / "Maybe"
   * that the ranking treated as real.
   */
  graded: boolean;
  summary: string | null;
  concerns: string[];
  credibilityRating: string | null;
  /** Each inconsistency the interviewer found, as "claim → evidence". */
  inconsistencies: string[];
  /**
   * A team lead job's own marks (ai-chat-interview/interviewContext.ts), each
   * 0-100, null when not graded, not a lead job, or a topic never asked.
   * Flat on the End-button shape, nested under .evaluation on auto_end.
   */
  leadership: number | null;
  adaptability: number | null;
  workingLead: number | null;
  writtenEnglish: number | null;
  /** The candidate's own words behind each lead mark, by mark key. */
  leadEvidence: Record<string, string>;
  /** A lead interview that ended before its plan was covered: graded, but flagged. */
  incomplete: boolean;
  /** The MUST COVER topics the interview never reached. */
  mustCoverMissing: string[];
  /**
   * "browser": graded from the answers the page sent, because the record of
   * the attempt was not available (the record system not deployed). Such a
   * mark is not trusted: the scorecard flags it and keeps the card off
   * "advance". null when graded from the stored turns.
   */
  transcriptSource: "browser" | null;
}

/** The candidate's quoted words behind each mark, as { key: quote }. */
function quoteMap(value: unknown, limit = 8): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const quote = record[key];
    if (typeof quote === "string" && quote.trim()) out[key] = quote.trim();
    if (Object.keys(out).length >= limit) break;
  }
  return out;
}

function stringList(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function inconsistencyLines(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      lines.push(entry.trim());
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      const claim = firstNonEmptyString(record.claim);
      const evidence = firstNonEmptyString(record.evidence, record.assessment);
      if (claim && evidence) lines.push(`${claim.trim()} → ${evidence.trim()}`);
      else if (claim || evidence) lines.push(String(claim || evidence).trim());
    }
    if (lines.length >= limit) break;
  }
  return lines;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readChatInterviewResult(result: unknown): ChatInterviewReading | null {
  const flat = asRecord(result);
  if (!flat) return null;
  const nested = asRecord(flat.evaluation) ?? {};
  const graded = flat.graded !== false && nested.graded !== false;
  const concerns = stringList(flat.concerns).length > 0 ? stringList(flat.concerns) : stringList(nested.concerns);
  const inconsistencies = inconsistencyLines(flat.inconsistencies).length > 0
    ? inconsistencyLines(flat.inconsistencies)
    : inconsistencyLines(nested.inconsistencies);
  const leadEvidence = Object.keys(quoteMap(flat.leadEvidence)).length > 0 ? quoteMap(flat.leadEvidence) : quoteMap(nested.leadEvidence);
  const mustCoverMissing = stringList(flat.mustCoverMissing).length > 0 ? stringList(flat.mustCoverMissing) : stringList(nested.mustCoverMissing);
  return {
    score: graded ? firstFiniteNumber(flat.score, flat.overall_score, nested.score, nested.overall_score) : null,
    recommendation: graded ? firstNonEmptyString(flat.recommendation, nested.recommendation) : null,
    messageCount: firstFiniteNumber(flat.messageCount, Array.isArray(flat.messages) ? flat.messages.length : null),
    graded,
    summary: graded ? firstNonEmptyString(flat.summary, nested.summary) : null,
    concerns: graded ? concerns : [],
    credibilityRating: graded
      ? firstNonEmptyString(flat.credibilityRating, flat.credibility_rating, nested.credibilityRating, nested.credibility_rating)
      : null,
    inconsistencies: graded ? inconsistencies : [],
    leadership: graded ? firstFiniteNumber(flat.leadership, nested.leadership) : null,
    adaptability: graded ? firstFiniteNumber(flat.adaptability, nested.adaptability) : null,
    workingLead: graded ? firstFiniteNumber(flat.workingLead, nested.workingLead) : null,
    writtenEnglish: graded ? firstFiniteNumber(flat.writtenEnglish, nested.writtenEnglish) : null,
    leadEvidence: graded ? leadEvidence : {},
    incomplete: graded && (flat.incomplete === true || nested.incomplete === true),
    mustCoverMissing: graded ? mustCoverMissing : [],
    transcriptSource: flat.transcriptSource === "browser" || nested.transcriptSource === "browser" ? "browser" : null,
  };
}

/**
 * Typing, measured inside the chat practice while they wrote their real
 * replies (docs/TYPING-IN-CHAT.md): `notes.chatSimulationResult.typing`,
 * written by the server when the chat is graded. Speed and corrections come
 * from the page's keystroke timing, the reply time from the server's own
 * clock, typos from the grader.
 */
export interface ChatTypingReading {
  /**
   * Active-typing WPM over the replies that count, taken together. null when fewer
   * than CHAT_TYPING_MIN_TIMED_REPLIES were timed: "not enough typing to
   * time", shown, never a fail and never a 0.
   */
  wpm: number | null;
  /** Backspace + Delete over all keys of those replies, as a percent. */
  correctionsPct: number | null;
  /** Server-measured: the player's message stored → the applicant's reply stored. */
  medianReplySeconds: number | null;
  typosPer100Words: number | null;
  repliesTimed: number | null;
  /** Replies that did not arrive key by key (more than 15 characters came without a key each, or the server's checks of the summary failed). */
  pasteLike: number | null;
  /**
   * Why there is no speed (typing.ts TypingNotTimed): "too_short",
   * "arrived_without_typing" or "not_sent" (the page sent no timing: an
   * older page). null when timed, or a block from before this was stored.
   */
  notTimed: ChatTypingNotTimed | null;
  /** The chat step's bars (config.typing), defaulting to 40 WPM and 90 s. */
  minWpm: number;
  maxMedianReplySeconds: number;
  /** At least CHAT_TYPING_MIN_TIMED_REPLIES replies were timed. */
  enoughToTime: boolean;
  /** A measured speed under the bar. Never true when the speed is not measured. */
  speedBelow: boolean;
  /** A measured median reply time over the bar. */
  replyTimeBelow: boolean;
  /**
   * Replies arrived without being typed key by key often enough to look at
   * (chatTypingArrivedWithoutTyping: 2 or more, or as many as were timed).
   * Never a fail: a reason for a person to read the chat.
   */
  arrivedWithoutTyping: boolean;
}

export type ChatTypingNotTimed = "too_short" | "arrived_without_typing" | "not_sent";
const CHAT_TYPING_NOT_TIMED: ReadonlySet<string> = new Set<ChatTypingNotTimed>(["too_short", "arrived_without_typing", "not_sent"]);

/**
 * Replies that did not arrive key by key are worth a person's look when
 * there are 2 or more, or when they are at least half of the replies that
 * had a usable timing (as many as were timed). One in a long chat is not.
 * The same rule as the staff record's chatTypingOf.
 */
export function chatTypingArrivedWithoutTyping(pasteLike: number | null, repliesTimed: number | null): boolean {
  const jumps = typeof pasteLike === "number" && Number.isFinite(pasteLike) ? pasteLike : 0;
  const timed = typeof repliesTimed === "number" && Number.isFinite(repliesTimed) ? repliesTimed : 0;
  return jumps >= 2 || (jumps >= 1 && jumps >= timed);
}

export const CHAT_TYPING_DEFAULT_MIN_WPM = 40;
export const CHAT_TYPING_DEFAULT_MAX_MEDIAN_REPLY_SECONDS = 90;
/** Fewer timed replies than this is "not enough typing to time". */
export const CHAT_TYPING_MIN_TIMED_REPLIES = 3;

function positiveOr(value: number | null, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOrNull(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The typing block, read the one way every reader reads it. The figures are
 * the server's; the "below" calls are made here from the figures and the
 * bars (the stored `below` / `meetsBar` say the same thing; a figure is what
 * the owner is shown, so the figure decides). null when there is no block or
 * it holds no measure at all.
 */
export function readChatTyping(value: unknown): ChatTypingReading | null {
  const record = asRecord(value);
  if (!record) return null;
  const bar = asRecord(record.bar) ?? {};
  const repliesTimed = nonNegativeOrNull(firstFiniteNumber(record.repliesTimed));
  const rawWpm = nonNegativeOrNull(firstFiniteNumber(record.wpm));
  // Too few timed replies is not a speed, whatever number came with it.
  const enoughToTime = repliesTimed === null ? rawWpm !== null : repliesTimed >= CHAT_TYPING_MIN_TIMED_REPLIES;
  const wpm = enoughToTime ? rawWpm : null;
  const correctionsPct = nonNegativeOrNull(firstFiniteNumber(record.correctionsPct));
  const medianReplySeconds = nonNegativeOrNull(firstFiniteNumber(record.medianReplySeconds));
  const typosPer100Words = nonNegativeOrNull(firstFiniteNumber(record.typosPer100Words));
  const pasteLike = nonNegativeOrNull(firstFiniteNumber(record.pasteLike));
  if (wpm === null && correctionsPct === null && medianReplySeconds === null && typosPer100Words === null && repliesTimed === null) {
    return null;
  }
  const notTimed = wpm !== null
    ? null
    : typeof record.notTimed === "string" && CHAT_TYPING_NOT_TIMED.has(record.notTimed)
      ? (record.notTimed as ChatTypingNotTimed)
      : null;
  const minWpm = positiveOr(firstFiniteNumber(bar.minWpm, bar.min_wpm), CHAT_TYPING_DEFAULT_MIN_WPM);
  const maxMedianReplySeconds = positiveOr(
    firstFiniteNumber(bar.maxMedianReplySeconds, bar.max_median_reply_seconds),
    CHAT_TYPING_DEFAULT_MAX_MEDIAN_REPLY_SECONDS,
  );
  return {
    wpm,
    correctionsPct,
    medianReplySeconds,
    typosPer100Words,
    repliesTimed,
    pasteLike,
    notTimed,
    minWpm,
    maxMedianReplySeconds,
    enoughToTime,
    speedBelow: wpm !== null && wpm < minWpm,
    replyTimeBelow: medianReplySeconds !== null && medianReplySeconds > maxMedianReplySeconds,
    arrivedWithoutTyping: chatTypingArrivedWithoutTyping(pasteLike, repliesTimed),
  };
}

/** The chat typing score's parts (chatTypingScore): speed against the bar, and the reply time. */
export const CHAT_TYPING_SPEED_WEIGHT = 0.8;
export const CHAT_TYPING_REPLY_WEIGHT = 0.2;

/**
 * The chat's typing as a 0-100 score, for a team lead's tests blend
 * (the typing weight, 0.10) when the job has no typing step:
 *
 *   speed  = min(100, wpm ÷ the bar's WPM × 100)
 *   reply  = 100 at or under the reply-time bar, else bar ÷ median × 100
 *            (twice the bar is 50, three times is 33)
 *   score  = round(0.8 × speed + 0.2 × reply)
 *
 * With no reply time the score is the speed alone. With no speed (fewer than
 * three timed replies, or none) there is no score: null, never a 0, and the
 * blend leaves typing out (a missing measure is not a 0). Corrections and
 * typos are shown, never scored.
 */
export function chatTypingScore(typing: ChatTypingReading | null | undefined): number | null {
  if (!typing || typing.wpm === null) return null;
  const speed = Math.min(100, (typing.wpm / typing.minWpm) * 100);
  if (typing.medianReplySeconds === null) return clampPercent(speed);
  const reply = typing.medianReplySeconds <= typing.maxMedianReplySeconds
    ? 100
    : Math.max(0, Math.min(100, (typing.maxMedianReplySeconds / Math.max(typing.medianReplySeconds, 1)) * 100));
  return clampPercent(CHAT_TYPING_SPEED_WEIGHT * speed + CHAT_TYPING_REPLY_WEIGHT * reply);
}

function workflowHasType(workflowSteps: ReadonlyArray<{ type?: unknown }> | null | undefined, type: string) {
  return Array.isArray(workflowSteps) && workflowSteps.some((step) => String(step?.type || "").toLowerCase() === type);
}

/**
 * The chat's typing when it IS the job's typing measure: the job has no
 * typing step. A job that still has one keeps using it and reads none of
 * this (null), so nothing about it changes.
 */
export function chatTypingForJob(
  workflowSteps: ReadonlyArray<{ type?: unknown }> | null | undefined,
  typing: ChatTypingReading | null | undefined,
): ChatTypingReading | null {
  if (!typing) return null;
  return workflowHasType(workflowSteps, "typing_test") ? null : typing;
}

/**
 * The score a team lead's tests blend takes for typing from the chat
 * (chatTypingScore), or null: any other family, a job with a typing step, or
 * no speed measured. trigger-ava-analysis's phase blend and the scorecard's
 * tests share both ask this one function, so they always agree.
 */
export function chatTypingBlendScore(input: {
  family: string;
  workflowSteps: ReadonlyArray<{ type?: unknown }> | null | undefined;
  typing: ChatTypingReading | null | undefined;
}): number | null {
  if (input.family !== "team_lead") return null;
  return chatTypingScore(chatTypingForJob(input.workflowSteps, input.typing));
}

/** The staff line's start when no speed was timed, by the reason (the same words as the staff record's chatTypingLine). */
export function chatTypingUntimedText(notTimed: ChatTypingNotTimed | null): string {
  if (notTimed === "arrived_without_typing") return "Typing: replies arrived without typing";
  if (notTimed === "not_sent") return "Typing: not timed by the page";
  return "Typing: not enough typing to time";
}

/** "Typing 47 WPM · 6% corrections · replies in 38 s (median)", the staff line. */
export function chatTypingText(typing: ChatTypingReading): string {
  const parts = [
    typing.wpm !== null ? `Typing ${Math.round(typing.wpm)} WPM` : chatTypingUntimedText(typing.notTimed),
    ...(typing.correctionsPct !== null ? [`${Math.round(typing.correctionsPct)}% corrections`] : []),
    ...(typing.medianReplySeconds !== null ? [`replies in ${Math.round(typing.medianReplySeconds)} s (median)`] : []),
  ];
  return parts.join(" · ");
}

/**
 * The typing line in the judge's chat block (trigger-ava-analysis): the
 * figures, the job's bars and which side of each they fell on. Only on a job
 * with no typing step (chatTypingForJob): a job that has one is judged on
 * its typing test. A speed that was not timed is said to be not counted
 * either way, as a chat the grader could not mark is; why it was not timed
 * is for a person (the flags), not for the judge.
 */
export function chatTypingEvidenceLine(typing: ChatTypingReading): string {
  const speed = typing.wpm !== null
    ? `${Math.round(typing.wpm)} WPM while writing their replies (the job asks for ${Math.round(typing.minWpm)}: ${typing.speedBelow ? "below it" : "meets it"})`
    : "typing speed was not timed in this chat, so it is unknown: do not count typing speed either way";
  const parts = [
    speed,
    ...(typing.correctionsPct !== null ? [`${Math.round(typing.correctionsPct)}% of keys were corrections`] : []),
    ...(typing.medianReplySeconds !== null
      ? [`median reply ${Math.round(typing.medianReplySeconds)} s (the job asks for ${Math.round(typing.maxMedianReplySeconds)} s or less: ${typing.replyTimeBelow ? "slower" : "meets it"})`]
      : []),
    ...(typing.typosPer100Words !== null ? [`${formatOneDecimal(typing.typosPer100Words)} typos left per 100 words`] : []),
  ];
  return `Typing in the chat: ${parts.join("; ")}`;
}

function formatOneDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** The owner's flag for a speed under the bar ("Typed 32 WPM in the chat practice; the job asks for 40"). */
export function chatTypingSpeedFlag(typing: ChatTypingReading | null | undefined): string | null {
  if (!typing?.speedBelow || typing.wpm === null) return null;
  return `Typed ${Math.round(typing.wpm)} WPM in the chat practice; the job asks for ${Math.round(typing.minWpm)}`;
}

/** The owner's flag for a median reply time over the bar ("Slow replies: median 140 s; the job asks for 90 s"). */
export function chatReplyTimeFlag(typing: ChatTypingReading | null | undefined): string | null {
  if (!typing?.replyTimeBelow || typing.medianReplySeconds === null) return null;
  return `Slow replies: median ${Math.round(typing.medianReplySeconds)} s; the job asks for ${Math.round(typing.maxMedianReplySeconds)} s`;
}

/**
 * The owner's flag for chat replies that arrived without being typed key by
 * key (chatTypingArrivedWithoutTyping): "3 chat practice replies arrived
 * without being typed (as pasted or dictated text does); their speed was not
 * counted". A reason for review, never a decline.
 */
export function chatTypingArrivedFlag(typing: ChatTypingReading | null | undefined): string | null {
  if (!typing?.arrivedWithoutTyping) return null;
  const n = typing.pasteLike ?? 0;
  return `${n} chat practice ${n === 1 ? "reply" : "replies"} arrived without being typed (as pasted or dictated text does); ${n === 1 ? "its" : "their"} speed was not counted`;
}

/** Why a lead's escalated chat score was capped (ai-chat-simulation/grading.ts LeadCap). */
export type ChatSimulationCap = "new_promise" | "disrespect" | "tone";
const CHAT_SIMULATION_CAPS: ReadonlySet<string> = new Set<ChatSimulationCap>(["new_promise", "disrespect", "tone"]);

export interface ChatSimulationReading {
  /** null when not graded or no score: a real 0 stays 0. */
  score: number | null;
  graded: boolean;
  empathy: number | null;
  problemSolving: number | null;
  strengths: string[];
  improvements: string[];
  /**
   * "team_lead" when the case played was a takeover of a mishandled chat and
   * it was marked on the escalated rubric (ai-chat-simulation/grading.ts).
   * null for the support-agent rubric, an older result, or not graded.
   */
  rubric: "team_lead" | null;
  /** Escalated rubric only: owned the team's mistake / corrected the agent plainly, 0-100. */
  ownership: number | null;
  correctedAgent: number | null;
  /**
   * The lead made a NEW promise of their own (confirmed by the server in the
   * lead's own lines; the stored score is already capped at 40), with their
   * words. Only ever true on a graded result.
   */
  newPromiseMade: boolean;
  newPromiseQuote: string | null;
  /** A possible new promise the server could not confirm (kept for staff, never capped on). */
  newPromiseUnverified: string | null;
  /** Disrespect to the player, confirmed the same way, with the lead's words. */
  disrespectMade: boolean;
  disrespectQuote: string | null;
  /** What capped the stored score, if anything. */
  cappedBy: ChatSimulationCap[];
  /** A person should read this chat before its mark is trusted, and why. */
  needsReview: boolean;
  reviewReasons: string[];
  /**
   * "browser": graded from the transcript the page sent, because the record
   * of the attempt was not available (the record system not deployed). Such
   * a mark is not trusted: the scorecard flags it and keeps the card off
   * "advance". null when graded from the stored turns.
   */
  transcriptSource: "browser" | null;
  /**
   * Typing measured while they wrote their replies (readChatTyping), or null
   * (an older result, or nothing measured). Read whether or not the grader
   * marked the chat: speed and reply time never came from the grader.
   */
  typing: ChatTypingReading | null;
}

/**
 * notes.chatSimulationResult (or salesSimulationResult), read the one way
 * every scorer reads it. A score of 0 is a score (it used to read as "not
 * taken", because `x.score || null` is null for 0), and `graded: false` (the
 * grader's model call failed) is not a score at all.
 */
export function readChatSimulationResult(result: unknown): ChatSimulationReading | null {
  const record = asRecord(result);
  if (!record) return null;
  const graded = record.graded !== false;
  const newPromiseMade = graded && record.newPromiseMade === true;
  const disrespectMade = graded && record.disrespectMade === true;
  const reviewReasons = graded ? stringList(record.reviewReasons) : [];
  return {
    score: graded ? firstFiniteNumber(record.overallScore, record.score) : null,
    graded,
    empathy: graded ? firstFiniteNumber(record.empathy) : null,
    problemSolving: graded ? firstFiniteNumber(record.problemSolving) : null,
    strengths: graded ? stringList(record.strengths) : [],
    improvements: graded ? stringList(record.improvements) : [],
    rubric: graded && record.rubric === "team_lead" ? "team_lead" : null,
    ownership: graded ? firstFiniteNumber(record.ownership) : null,
    correctedAgent: graded ? firstFiniteNumber(record.correctedAgent) : null,
    newPromiseMade,
    newPromiseQuote: newPromiseMade ? firstNonEmptyString(record.newPromiseQuote) : null,
    newPromiseUnverified: graded ? firstNonEmptyString(record.newPromiseUnverified) : null,
    disrespectMade,
    disrespectQuote: disrespectMade ? firstNonEmptyString(record.disrespectQuote) : null,
    cappedBy: graded
      ? stringList(record.cappedBy).filter((cap): cap is ChatSimulationCap => CHAT_SIMULATION_CAPS.has(cap))
      : [],
    // needsReview is only ever written as true, with its reasons.
    needsReview: graded && record.needsReview === true,
    reviewReasons: graded && record.needsReview === true ? reviewReasons : [],
    transcriptSource: record.transcriptSource === "browser" ? "browser" : null,
    typing: readChatTyping(record.typing),
  };
}

export interface QuizReading {
  /** 0-100; a real 0 stays 0. */
  score: number | null;
  correct: number | null;
  total: number | null;
  passed: boolean | null;
  /** Per-question results as submit_quiz_attempt stored them ({questionId, isCorrect}). */
  answers: Array<{ questionId: string; isCorrect: boolean | null }>;
}

/**
 * The skills check, from notes. submit_quiz_attempt writes the totals to
 * notes.quizResult and the per-question results (no answer key, only the
 * candidate's own isCorrect) under the quiz step's own key, which is "quiz"
 * for a job whose quiz is not a workflow step.
 */
export function readQuizResult(notes: Record<string, unknown> | null | undefined): QuizReading | null {
  if (!notes) return null;
  const summary = asRecord(notes.quizResult) ?? asRecord(notes.quiz);
  let detail = asRecord(notes.quiz);
  if (!detail || !Array.isArray(detail.answers)) {
    detail = null;
    for (const value of Object.values(notes)) {
      const record = asRecord(value);
      if (record && record.type === "quiz" && Array.isArray(record.answers)) {
        detail = record;
        break;
      }
    }
  }
  if (!summary && !detail) return null;
  const source = summary ?? detail!;
  const answers = Array.isArray(detail?.answers)
    ? (detail!.answers as unknown[])
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry.questionId === "string")
        .map((entry) => ({
          questionId: entry.questionId as string,
          isCorrect: typeof entry.isCorrect === "boolean" ? entry.isCorrect : null,
        }))
    : [];
  return {
    score: firstFiniteNumber(source.score, source.percentage, detail?.score),
    correct: firstFiniteNumber(source.correct, detail?.correct),
    total: firstFiniteNumber(source.total, detail?.total),
    passed: typeof source.passed === "boolean" ? source.passed : null,
    answers,
  };
}

/**
 * Categories a wrong answer here should always be shown for, whatever the
 * total: the two things the owner keeps the skills check to weed out (a lead
 * who would hand out a bonus support cannot give, and one who confuses
 * entries with winnings). A question can also be marked `must_pass: true`.
 */
const MUST_PASS_QUIZ_CATEGORIES = new Set(["integrity", "money_rules"]);

export function quizAreaLabel(category: string) {
  return category.replace(/[_-]+/g, " ").trim();
}

export interface QuizAreaBreakdown {
  /** In the job's question order: each category with how many were right. */
  areas: Array<{ category: string; correct: number; total: number }>;
  /** Categories with at least one wrong answer. */
  missed: string[];
  /** Missed categories the owner treats as must-pass. */
  mustPassMissed: string[];
}

/**
 * Joins the candidate's per-question results to the job's own question
 * categories (jobs.quiz_questions keeps `category`; the answer key is not
 * there and is not needed). Answers with no matching question, or questions
 * with no category, are left out.
 *
 * Must-pass is decided per QUESTION (2026-10-06, second pass): a question is
 * must-pass when it says `must_pass: true`, or when its category is integrity
 * or money rules and it does not say `must_pass: false`. An area is a
 * must-pass miss only when one of ITS must-pass questions was answered
 * wrong: one must_pass question used to make its whole category must-pass,
 * so a wrong ordinary coaching question read "Missed the coaching question".
 * An answer whose isCorrect is unknown (null) is left out: a result nobody
 * could mark is not a miss.
 */
export function quizAreaBreakdown(answers: QuizReading["answers"] | null | undefined, questions: unknown): QuizAreaBreakdown {
  const empty: QuizAreaBreakdown = { areas: [], missed: [], mustPassMissed: [] };
  if (!Array.isArray(answers) || answers.length === 0 || !Array.isArray(questions)) return empty;
  const byId = new Map<string, boolean>();
  for (const answer of answers) {
    if (typeof answer?.isCorrect === "boolean") byId.set(answer.questionId, answer.isCorrect);
  }
  const areas: QuizAreaBreakdown["areas"] = [];
  const mustPassMissed = new Set<string>();
  for (const raw of questions) {
    const question = asRecord(raw);
    if (!question || typeof question.id !== "string") continue;
    const category = typeof question.category === "string" ? question.category.trim() : "";
    if (!category || !byId.has(question.id)) continue;
    const mustPass = question.must_pass === true || (question.must_pass !== false && MUST_PASS_QUIZ_CATEGORIES.has(category));
    let area = areas.find((entry) => entry.category === category);
    if (!area) {
      area = { category, correct: 0, total: 0 };
      areas.push(area);
    }
    area.total += 1;
    if (byId.get(question.id) === true) area.correct += 1;
    else if (mustPass) mustPassMissed.add(category);
  }
  const missed = areas.filter((area) => area.correct < area.total).map((area) => area.category);
  return { areas, missed, mustPassMissed: missed.filter((category) => mustPassMissed.has(category)) };
}

/** "By area: coaching ✓, staffing ✗, …" (n/m where an area has several questions). */
export function formatQuizAreas(areas: QuizAreaBreakdown["areas"]) {
  return areas
    .map((area) =>
      area.total === 1
        ? `${quizAreaLabel(area.category)} ${area.correct === 1 ? "✓" : "✗"}`
        : `${quizAreaLabel(area.category)} ${area.correct}/${area.total}`,
    )
    .join(", ");
}

export function mustPassQuizFlag(category: string) {
  return `Missed the ${quizAreaLabel(category)} question on the skills check`;
}

/**
 * The owner's own deal-breakers on the application form (2026-10-06): a
 * question in jobs.application_questions may carry `flag_options` (the
 * answers that rule someone out) and `flag_label` (what the owner should
 * read). An applicant whose stored answer is one of them carries that label
 * as a deal-breaker, read from the form itself. Before this nothing read the
 * working-lead question at all, and whether "I would rather only manage" was
 * caught depended on how the judge worded a sentence.
 */
export function formDealBreakersFrom(questions: unknown, answers: unknown): string[] {
  return formFlagsFrom(questions, answers).filter((flag) => flag.severity === "decline").map((flag) => flag.label);
}

/**
 * The form flags the owner marked `flag_severity: "review"` (2026-10-06,
 * second pass): an answer worth his attention that must never decline anyone
 * on its own, such as covering only some of the shifts on a job that asks
 * "tell us which hours you can cover", or "Never" to the years-leading
 * question. They are shown, keep "advance" off the card ("mixed"), and never
 * lower the number. A flag without a severity is a deal-breaker, as before.
 */
export function formReviewFlagsFrom(questions: unknown, answers: unknown): string[] {
  return formFlagsFrom(questions, answers).filter((flag) => flag.severity === "review").map((flag) => flag.label);
}

/** Question types whose stored answer holds several picks joined by "; ". */
const MULTI_PICK_TYPES = new Set(["multi_select", "multiselect", "checkbox", "checkboxes", "multiple_select"]);

export function formFlagsFrom(questions: unknown, answers: unknown): Array<{ label: string; severity: "decline" | "review" }> {
  if (!Array.isArray(questions) || !Array.isArray(answers)) return [];
  const normalize = (value: string) => normalizeQuotes(value).trim().replace(/\s+/g, " ").toLowerCase();
  const storedAnswers = answers.map(asRecord).filter((answer): answer is Record<string, unknown> => !!answer);
  const out: Array<{ label: string; severity: "decline" | "review" }> = [];
  for (const raw of questions) {
    const question = asRecord(raw);
    if (!question || typeof question.id !== "string") continue;
    const flagOptions = stringList(question.flag_options, 20).map(normalize);
    if (flagOptions.length === 0) continue;
    // By the question's id; an answer stored before ids were kept is matched
    // by the question's own text instead (it used to match nothing).
    const questionText = typeof question.question === "string" ? normalize(question.question) : "";
    const stored = storedAnswers.find((answer) => answer.questionId === question.id) ??
      (questionText
        ? storedAnswers.find((answer) => typeof answer.questionId !== "string" && typeof answer.question === "string" && normalize(answer.question) === questionText)
        : undefined);
    if (!stored) continue;
    // Several picks are split on "; " only for a pick-several question: a
    // single answer that happens to contain ";" ("A little; mostly managing
    // the team") is one answer, and a fragment of it is not a pick.
    const multi = MULTI_PICK_TYPES.has(String(question.type || stored.type || "").toLowerCase());
    const picked = Array.isArray(stored.selected)
      ? stringList(stored.selected, 50)
      : typeof stored.answer === "string"
        ? multi
          ? stored.answer.split(/;\s*/)
          : [stored.answer]
        : [];
    const hit = picked.map(normalize).find((choice) => flagOptions.includes(choice));
    if (!hit) continue;
    const label = firstNonEmptyString(question.flag_label);
    out.push({
      label: label
        ? label.trim()
        : `Answered "${picked.find((choice) => normalize(choice) === hit)}" to "${String(question.question || question.id).trim()}"`,
      severity: String(question.flag_severity || "").trim().toLowerCase() === "review" ? "review" : "decline",
    });
  }
  const seen = new Set<string>();
  return out.filter((flag) => (seen.has(flag.label) ? false : (seen.add(flag.label), true)));
}

/**
 * Flag options that match none of the question's own options: a flag the
 * owner set before renaming the option it was on, which then silently
 * catches nobody. trigger-ava-analysis logs them; the job editor should
 * refuse them on save (it does not yet: flag_options has no editor UI).
 */
export function orphanFlagOptions(questions: unknown): Array<{ questionId: string; option: string }> {
  if (!Array.isArray(questions)) return [];
  const normalize = (value: string) => normalizeQuotes(value).trim().replace(/\s+/g, " ").toLowerCase();
  const out: Array<{ questionId: string; option: string }> = [];
  for (const raw of questions) {
    const question = asRecord(raw);
    if (!question || typeof question.id !== "string") continue;
    const options = new Set(stringList(question.options, 100).map(normalize));
    for (const option of stringList(question.flag_options, 20)) {
      if (!options.has(normalize(option))) out.push({ questionId: question.id, option });
    }
  }
  return out;
}

/**
 * A note about a TAKEN test's own result, when the judge did not say where
 * the conflict came from (see ConflictNote): a measured figure (a percentage,
 * an "x/100", a WPM figure, "scored 18"), that the test itself was failed or
 * passed, wrong answers on it, or the interview's own credibility rating.
 * "Completed chat simulation result of 18/100" is one (production,
 * 2026-10-05: that test score was counted twice); "in the interview the
 * candidate said they have never led a team" is not: the interview is only
 * where a real requirement gap came up, and that gap still counts.
 *
 * 2026-10-06 (second pass): the bare words "results", "failed", "pass",
 * "rated" and "score" are gone. They threw out real gaps ("failed to name any
 * team they had led", "no results from leading a team", "said they pass
 * escalations to a manager", "rated working the queue as low priority").
 * This is the fallback only: a conflict the judge tagged with its source is
 * decided by the tag.
 */
const RESULT_OF_TEST = new RegExp(
  [
    String.raw`\b\d+(?:\.\d+)?\s*(?:%|percent\b|\/\s*\d+\b|out of \d+\b|wpm\b|words? (?:a|per) minute\b|points?\b)`,
    String.raw`\bscor(?:e|ed|es|ing)(?: of| was| is| at)? \d+`,
    String.raw`\b(?:fail(?:ed|s|ing)?|pass(?:ed|es|ing)?|did not pass|didn't pass) (?:the |their |his |her |this |that )?(?:[\w-]+ ){0,2}(?:quiz|skills? check|tests?|practice|simulation|interview|assessment|check)\b`,
    String.raw`\b(?:missed|got wrong|answered wrong|answered incorrectly)\b[^.;]{0,60}\b(?:questions?|areas?|items?)\b`,
    String.raw`\bcredibility(?: rating)?(?: is| was| of| rated| as)? ["']?(?:low|medium|high)\b`,
  ].join("|"),
  "i",
);

/** A note that quotes a typing speed ("typed 35 WPM", "38 words per minute"). */
const WPM_FIGURE = /\b\d+(?:\.\d+)?\s*(?:wpm\b|words? (?:a|per) minute\b)/i;

/**
 * Tests whose every note is about the measurement itself, so any note on
 * their topic is about the result once they are taken.
 */
const PURE_MEASUREMENT_PHASES = new Set(["typing test", "connection check"]);

/** The taken test a note is about the RESULT of, or null (the keyword fallback for an untagged note). */
function takenResultTopicOf(note: string, takenPhases: readonly string[]): string | null {
  const text = normalizeQuotes(note);
  for (const phase of takenPhases) {
    const topic = PHASE_TOPICS[phase];
    if (!topic || !topic.test(text)) continue;
    if (PURE_MEASUREMENT_PHASES.has(phase) || RESULT_OF_TEST.test(text)) return phase;
  }
  return null;
}

/**
 * One hard-requirement conflict from the judge. ai-analyze (2026-10-06,
 * second pass) returns where each one came from, so a finished test's own
 * result is told apart from a real requirement gap by STRUCTURE, not by
 * guessing from words: "application", "resume" or "interview" (something
 * the candidate wrote or said) is a gap; "test:<name>" (a test's own
 * measured result: its score, its wrong answers, how they did in the
 * practice) is that test's score already and never a conflict. A plain
 * string (an older judge, a stored scorecard) has no source and falls back
 * to the keyword reading above.
 */
export type ConflictNote = string | { text?: unknown; source?: unknown } | null | undefined;

interface SourcedConflict {
  text: string;
  /** "test" (a test's own result), "candidate" (what they wrote or said), or null (not tagged). */
  kind: "test" | "candidate" | null;
  /** For a test-sourced note, the pendingHighSignalPhases label of its test, when the tag names one. */
  testPhase: string | null;
}

const SOURCE_TEST_PHASES: Array<[RegExp, string]> = [
  [/typ/, "typing test"],
  [/quiz|skill/, "quiz"],
  [/sales/, "sales simulation"],
  [/chat[ _-]?(?:practice|simulation)|simulation|practice|role/, "chat simulation"],
  [/voice|ava/, "Ava interview"],
  [/interview/, "chat interview"],
  [/connection|equipment|internet/, "connection check"],
  [/portfolio/, "portfolio review"],
  [/video/, "video response"],
];

function sourcedConflicts(value: readonly ConflictNote[] | null | undefined, limit = 64): SourcedConflict[] {
  if (!Array.isArray(value)) return [];
  const out: SourcedConflict[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    const text = String((record ? record.text : entry) ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const source = record && typeof record.source === "string" ? record.source.trim().toLowerCase() : "";
    const kind: SourcedConflict["kind"] = !source ? null : /^test\b/.test(source) ? "test" : "candidate";
    const testName = kind === "test" ? source.replace(/^test\s*:?\s*/, "") : "";
    const testPhase = kind === "test" ? SOURCE_TEST_PHASES.find(([pattern]) => pattern.test(testName))?.[1] ?? null : null;
    out.push({ text, kind, testPhase });
    if (out.length >= limit) break;
  }
  return out;
}

/** The taken test a conflict is the result of (its tag first, the keyword fallback for an untagged note), or null. */
function testResultPhaseOf(conflict: SourcedConflict, takenPhases: readonly string[]): string | null {
  if (conflict.kind === "test") return conflict.testPhase ?? "test";
  if (conflict.kind === "candidate") return null;
  return takenResultTopicOf(conflict.text, takenPhases);
}

/** Evidence steps that are never a test still ahead (the connection check). */
const EVIDENCE_PHASES = new Set(["connection check"]);

/**
 * The judge's conflicts minus the ones still owed to a step ahead (see
 * realHardConflicts), each with what a taken test already says about it.
 */
function screenedConflicts(
  value: readonly ConflictNote[] | null | undefined,
  pendingPhases: readonly string[] | null | undefined,
): SourcedConflict[] {
  const pending = pendingPhases ?? null;
  const pendingTopics = (pending ?? []).map((phase) => PHASE_TOPICS[phase]).filter(Boolean);
  // "Not done yet" notes are set aside only while a TEST is really ahead (or
  // when the caller cannot say): once every test is taken, "has not yet led a
  // team at any stage" is a gap, whatever words it shares with a step.
  const testsAhead = pending === null || pending.some((phase) => !EVIDENCE_PHASES.has(phase));
  return sourcedConflicts(value)
    .filter((conflict) => !(testsAhead && isPendingPhaseNote(conflict.text)))
    .filter((conflict) => isEligibilityBlocker(conflict.text) || !pendingTopics.some((topic) => topic.test(normalizeQuotes(conflict.text))));
}

/**
 * The judge's hard conflicts, minus notes that only say a later step is still to
 * come and notes a measured step already answers:
 *   - `pendingPhases` (pendingHighSignalPhases labels, plus the connection
 *     check): any note on what they measure is set aside, that test's job and
 *     not a reason yet (the connection check: evidence, never a conflict).
 *     Leave it out (null) when the caller does not know which steps are
 *     ahead: then a "not done yet" note is set aside too;
 *   - `takenPhases` (2026-10-06): a note about a taken test's own RESULT is set
 *     aside, because that result already counts as the test's score and a
 *     conflict counted the same shortfall twice (6+ points on the judgment, and
 *     its wording could become the decline reason). A conflict the judge
 *     tagged with its source is decided by the tag.
 * A real eligibility blocker is never set aside.
 */
export function realHardConflicts(
  value: readonly ConflictNote[] | null | undefined,
  limit = 6,
  pendingPhases: readonly string[] | null = null,
  takenPhases: readonly string[] = [],
) {
  return screenedConflicts(value, pendingPhases)
    .filter((conflict) => isEligibilityBlocker(conflict.text) || !testResultPhaseOf(conflict, takenPhases))
    .map((conflict) => conflict.text)
    .slice(0, limit);
}

/**
 * The conflicts realHardConflicts sets aside as a TAKEN test's own result,
 * with the test each is about: shown to the owner as risk flags (never a
 * penalty, never a reason).
 */
function testResultConflicts(
  value: readonly ConflictNote[] | null | undefined,
  pendingPhases: readonly string[] | null,
  takenPhases: readonly string[],
): Array<{ text: string; phase: string }> {
  return screenedConflicts(value, pendingPhases)
    .filter((conflict) => !isEligibilityBlocker(conflict.text))
    .map((conflict) => ({ text: conflict.text, phase: testResultPhaseOf(conflict, takenPhases) }))
    .filter((entry): entry is { text: string; phase: string } => !!entry.phase);
}

function averageOf(values: Array<number | null | undefined>, fallback: number) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function weightedAverage(values: Array<{ value: number | null | undefined; weight: number }>, fallback: number) {
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const entry of values) {
    if (typeof entry.value === "number" && Number.isFinite(entry.value)) {
      weightedTotal += entry.value * entry.weight;
      weightTotal += entry.weight;
    }
  }

  if (weightTotal === 0) {
    return fallback;
  }

  return weightedTotal / weightTotal;
}

/**
 * A team lead (2026-10-06): a role whose TITLE names it ("Team Leader",
 * "Shift Lead", "Supervisor", "Working Lead"), or whose description describes
 * THIS role as one ("this is a working team lead role", "we're hiring an
 * experienced team leader", "you will lead a team of six"). The description
 * test is narrower than the title test on purpose: an agent's job text says
 * "escalate to your team lead" or "report to your supervisor", and that must
 * never turn an agent job into a lead job.
 */
const TEAM_LEAD_TITLE = /\b(?:team[- ]?lead(?:er)?s?|shift[- ]?lead(?:er)?s?|supervisors?|working[- ]?lead(?:er)?s?)\b/;
// 2026-10-06 (second pass): anchored to THIS role. "lead a team of" and
// "(team|shift) lead role" also matched sentences about somebody else ("Our
// supervisors lead a team of 10", "Your manager will lead a team of 8
// agents", "work with the team lead role holders"), and turned agent jobs
// into lead jobs.
const TEAM_LEAD_DESCRIPTION = new RegExp(
  [
    String.raw`\byou(?:'ll| will) (?:also )?lead (?:a|the|our) team\b`,
    String.raw`\bthis is an? (?:working (?:(?:team|shift) )?|(?:team|shift) )lead(?:er)? (?:role|position|job)\b`,
    String.raw`\bwe(?:'re| are) hiring (?:an? )?(?:[\w-]+ )?(?:team|shift) lead(?:er)?\b`,
  ].join("|"),
);
// The team-lead weights and the judge's team-lead rules were built for a lead
// of a chat or customer support team (the escalated chat practice, the skills
// check on money rules). A "Nursing Supervisor", a "Warehouse Shift Lead" or a
// retail "Team Leader" keeps the family it had before (healthcare, general,
// retail), so another employer's job does not move.
const SUPPORT_CONTEXT_TITLE = /\b(?:support|customer|chat|player|help ?desk|service desk|contact cent(?:er|re)|call cent(?:er|re)|client services?|cx)\b/;
const SUPPORT_CONTEXT_TEXT =
  /\b(?:customer (?:support|service|care|success|experience)|chat (?:support|agents?|team|queue)|live chat|player support|help ?desk|service desk|contact cent(?:er|re)|call cent(?:er|re)|support (?:team|agents?|desk|tickets?|queue))\b/;

export function inferJobFamily(title: string | null | undefined, description: string | null | undefined) {
  const titleText = (title || "").toLowerCase();
  const descriptionText = normalizeQuotes(description || "").toLowerCase();
  const haystack = `${title || ""} ${description || ""}`.toLowerCase();
  const leadRole = TEAM_LEAD_TITLE.test(titleText) || TEAM_LEAD_DESCRIPTION.test(descriptionText);
  if (leadRole && (SUPPORT_CONTEXT_TITLE.test(titleText) || SUPPORT_CONTEXT_TEXT.test(descriptionText))) {
    return "team_lead";
  }
  if (haystack.match(/support|customer service|customer success|help desk/)) return "support";
  if (haystack.match(/sales|account executive|business development|closer/)) return "sales";
  if (haystack.match(/designer|creative|illustrator|animator|photographer|videographer|brand/)) return "creative";
  if (haystack.match(/engineer|developer|software|data|technical|devops|product/)) return "technical";
  if (haystack.match(/admin|operations|coordinator|assistant|scheduler/)) return "operations_admin";
  if (haystack.match(/retail|hospitality|restaurant|server|barista|store/)) return "retail_hospitality";
  if (haystack.match(/nurse|healthcare|medical|clinic|therapist/)) return "healthcare";
  if (haystack.match(/field|installer|technician|maintenance|route/)) return "field_service";
  if (haystack.match(/chief|vp|vice president|director|head of|executive/)) return "executive";
  return "general";
}

function formatNaturalList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function isEntryLevelRole(experienceLevel: string | null | undefined, title: string | null | undefined) {
  const haystack = `${experienceLevel || ""} ${title || ""}`.toLowerCase();
  return /entry|junior|intern|trainee|associate/.test(haystack);
}

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForFingerprint(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForFingerprint(record[key]);
        return acc;
      }, {});
  }

  return value;
}

export function buildEvidenceFingerprint(snapshot: Record<string, unknown>) {
  return JSON.stringify(normalizeForFingerprint(snapshot));
}

function numOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface JudgmentSubScores {
  directMatchScore?: number | null;
  transferableFitScore?: number | null;
  learningSignalScore?: number | null;
  writingQualityScore?: number | null;
  attentionToDetailScore?: number | null;
  authenticityScore?: number | null;
  specificityScore?: number | null;
  /**
   * Team-lead roles only (ai-analyze returns them when the job is one): how
   * well the application shows the person has actually led a team (how many,
   * how long, one concrete problem fixed), and has handled a sudden change and
   * helped others switch. Ignored for every other family.
   */
  leadershipEvidenceScore?: number | null;
  adaptabilityEvidenceScore?: number | null;
  /** inferJobFamily's answer; "team_lead" switches to the team-lead weights. */
  jobFamily?: string | null;
  /** The judge's conflicts: plain strings, or { text, source } from a judge that says where each came from. */
  hardRequirementConflicts?: readonly ConflictNote[] | null;
  /**
   * Tests still to come (pendingHighSignalPhases labels, plus the connection
   * check): conflicts about what they measure don't count yet. Leave it out
   * when unknown.
   */
  pendingPhases?: readonly string[] | null;
  /**
   * Tests already taken: a conflict about one's own result does not count (it
   * already is that test's score). Pass highSignalProgress(...).pendingTopicPhases
   * and .completed, so the score trigger-ava-analysis computes and the one
   * buildAvaScorecard computes set aside exactly the same notes.
   */
  takenPhases?: readonly string[] | null;
}

/**
 * The judge's sub-score weights. Every family except team_lead keeps the
 * weights it has had since the aggregator was written (46% role fit, 54%
 * candidate-authored quality). A team lead is judged mostly on whether they
 * have led a team and handled change (35%), not on polish: with the general
 * weights a fluent writer who had never led anyone outranked an experienced
 * lead who writes plainly (audit, 2026-10-06).
 */
const JUDGMENT_WEIGHTS = {
  general: {
    direct: 0.22,
    transferable: 0.14,
    learning: 0.1,
    writing: 0.2,
    attention: 0.16,
    specificity: 0.18,
    leadership: 0,
    adaptability: 0,
  },
  team_lead: {
    direct: 0.15,
    leadership: 0.25,
    adaptability: 0.1,
    transferable: 0.08,
    learning: 0.05,
    writing: 0.15,
    attention: 0.1,
    specificity: 0.12,
  },
} as const;

/**
 * The single source of truth for how the LLM judge's per-dimension judgments turn
 * into a 0-100 substance score. This is deterministic arithmetic over the sub-scores
 * ONLY — it never looks at the LLM's own holistic `overallScore`, because that number
 * has been observed to be too soft (it barely separated a clean strong resume from
 * the same resume riddled with typos, and it wasn't even reproducible run to run).
 *
 * - writingQualityScore and attentionToDetailScore are weighted heavily (36% combined)
 *   so sloppy, error-riddled writing pulls the score down materially even when the
 *   underlying role fit is identical.
 * - authenticityScore acts as a hard ceiling: once it drops into suspicious territory,
 *   nothing else can lift the score back above that ceiling — a polished, specific,
 *   well-matched resume that looks fabricated must still fail.
 * - hardRequirementConflicts subtract a flat penalty on top of the ceiling, so a
 *   candidate who fails a stated non-negotiable can't average their way past it.
 *
 * Calling this twice with the same input always returns the same number.
 */
export function computeJudgmentScore(input: JudgmentSubScores): number {
  const direct = clampPercent(numOr(input.directMatchScore, 55));
  const transferable = clampPercent(numOr(input.transferableFitScore, 55));
  const learning = clampPercent(numOr(input.learningSignalScore, 50));
  const writing = clampPercent(numOr(input.writingQualityScore, 70));
  const attention = clampPercent(numOr(input.attentionToDetailScore, 70));
  const specificity = clampPercent(numOr(input.specificityScore, 50));
  const authenticity = clampPercent(numOr(input.authenticityScore, 80));
  const conflicts = realHardConflicts(input.hardRequirementConflicts, 8, input.pendingPhases ?? null, input.takenPhases ?? []);

  // Weighted substance average. General: role fit (direct/transferable/learning,
  // 46%) plus candidate-authored quality signals (writing/attention/specificity,
  // 54%). Team lead: see JUDGMENT_WEIGHTS.
  const weights = input.jobFamily === "team_lead" ? JUDGMENT_WEIGHTS.team_lead : JUDGMENT_WEIGHTS.general;
  const leadership = weights.leadership > 0 ? clampPercent(numOr(input.leadershipEvidenceScore, 50)) : 0;
  const adaptability = weights.adaptability > 0 ? clampPercent(numOr(input.adaptabilityEvidenceScore, 50)) : 0;
  const substance =
    direct * weights.direct +
    transferable * weights.transferable +
    learning * weights.learning +
    writing * weights.writing +
    attention * weights.attention +
    specificity * weights.specificity +
    leadership * weights.leadership +
    adaptability * weights.adaptability;

  // Authenticity is a ceiling, not just another average term: a credible-looking
  // score can't be bought back by strength elsewhere once fabrication is likely.
  let ceiling = 100;
  if (authenticity < 50) {
    ceiling = authenticity + 15;
  } else if (authenticity < 75) {
    ceiling = authenticity + 25;
  }

  let score = Math.min(substance, ceiling);

  if (conflicts.length > 0) {
    score -= Math.min(25, 6 + conflicts.length * 5);
  }

  return clampPercent(score);
}

export interface HighSignalInputs {
  quizScore: number | null;
  quizConfigured: boolean;
  workflowSteps: Array<{ type?: string }>;
  typingScore?: number | null;
  voiceScore: number | null;
  portfolioScore: number | null;
  chatSimulationScore: number | null;
  salesSimulationScore: number | null;
  chatInterviewScore: number | null;
  videoIntroScore: number | null;
  videoIntroSubmitted: boolean;
}

export interface HighSignalProgress {
  /** Configured tests with no score yet (an ungraded result has no score). */
  pending: string[];
  /** Configured tests with a score. */
  completed: string[];
  /** Evidence steps that are never a score (the connection check). */
  evidence: string[];
  /** Topics a judge conflict may not be about at all yet: tests still ahead, and evidence. */
  pendingTopicPhases: string[];
  /**
   * Topics already measured, for the conflict screen's `takenPhases`: the
   * completed tests, plus "typing test" once the chat practice is done on a
   * job with no typing step (typing is measured there, docs/TYPING-IN-CHAT.md).
   */
  takenTopicPhases: string[];
}

/**
 * Which tests are done and which are still ahead, labelled the way
 * pendingHighSignalPhases always has been. One function, so the judgment
 * score trigger-ava-analysis computes before the scorecard and the one the
 * scorecard computes set aside exactly the same conflicts (before 2026-10-06
 * the first call set aside none, so a connection note lowered the score the
 * scorecard said it never lowers).
 */
export function highSignalProgress(input: HighSignalInputs): HighSignalProgress {
  const workflowTypes = Array.isArray(input.workflowSteps)
    ? input.workflowSteps.map((step) => String(step?.type || "").toLowerCase()).filter(Boolean)
    : [];
  const pending: string[] = [];
  const completed: string[] = [];
  const register = (label: string, score: number | null | undefined, configured: boolean, treatAsSubmitted = false) => {
    if (!configured) return;
    if (typeof score === "number" || treatAsSubmitted) completed.push(label);
    else pending.push(label);
  };

  register("quiz", input.quizScore, input.quizConfigured);
  register("chat simulation", input.chatSimulationScore, workflowTypes.includes("chat_simulation"));
  register("sales simulation", input.salesSimulationScore, workflowTypes.includes("sales_simulation"));
  register("chat interview", input.chatInterviewScore, workflowTypes.includes("chat_interview"));
  register("Ava interview", input.voiceScore, workflowTypes.includes("voice_interview"));
  register("typing test", input.typingScore, workflowTypes.includes("typing_test"));
  register("portfolio review", input.portfolioScore, workflowTypes.includes("portfolio_upload"));
  register(
    "video response",
    input.videoIntroScore,
    workflowTypes.includes("video_intro") || workflowTypes.includes("video_message"),
    input.videoIntroSubmitted,
  );

  // Steps that are evidence, not a signal: a note about what they measure is
  // their job (realHardConflicts), they never hold the evidence floor or the
  // decision, and, unlike a high-signal test, that stays true AFTER they land:
  // a connection below the job's bar is a risk flag for the owner, never a
  // hard conflict that lowers the score or becomes hardRejectReason
  // (docs/EQUIPMENT-CHECK.md rule 3, "nothing here declines anyone").
  const evidence: string[] = [];
  if (workflowTypes.includes("equipment_check")) evidence.push("connection check");

  // On a job with no typing step, typing is measured inside the chat
  // practice (docs/TYPING-IN-CHAT.md). It is not a test of its own (never
  // pending, completed or counted), but its TOPIC belongs to the chat: a
  // judge note about typing speed is still owed while the chat is ahead, and
  // is the chat's own result once it is done, timed or not (an untimed speed
  // is unknown, never a conflict that costs the judgment points).
  const typingInChat = !workflowTypes.includes("typing_test") && workflowTypes.includes("chat_simulation");
  const chatDone = completed.includes("chat simulation");

  return {
    pending,
    completed,
    evidence,
    pendingTopicPhases: [...pending, ...(typingInChat && !chatDone ? ["typing test"] : []), ...evidence],
    takenTopicPhases: [...completed, ...(typingInChat && chatDone ? ["typing test"] : [])],
  };
}

export interface PhaseBlendInputs {
  /** inferJobFamily's answer. */
  family: string;
  /** computeJudgmentScore's number (the judge's read of the application). */
  judgmentScore: number;
  quizScore: number | null;
  typingTest?: { score?: number | null; wpm?: number | null; accuracy?: number | null } | null;
  chatSimulationScore: number | null;
  salesSimulationScore: number | null;
  chatInterviewScore: number | null;
  voiceScore: number | null;
  portfolioScore: number | null;
  /**
   * team_lead only: the chat practice's typing score (chatTypingBlendScore,
   * which is null for any other family and for a job with a typing step).
   * When it is a number it is the blend's typing; otherwise the typing
   * test's score is, as before. Every other family ignores it.
   */
  chatTypingScore?: number | null;
}

/**
 * What each family's phase blend is made of. Every family but team_lead is
 * unchanged from trigger-ava-analysis (moved here verbatim on 2026-10-06 so a
 * test can run the real numbers): it includes the judge's own score as the
 * "resume" entry, and buildAvaScorecard then blends the judge in again at
 * 0.7, which is why the judge decided about 79% of a support role's number.
 *
 * team_lead is TESTS ONLY (the judge is the other half, counted once, in
 * buildAvaScorecard): the escalated chat practice 0.35, the skills check 0.30,
 * the written interview 0.25, typing 0.10. The connection check is a flag,
 * never a weight. A voice interview, sales practice or portfolio on a lead
 * job counts at the listed weight only when the job has that step, so the
 * four above keep exactly their proportions on a job without them.
 *
 * A lead job with no typing step (docs/TYPING-IN-CHAT.md) takes typing's
 * 0.10 from the chat practice, where the typing is measured now
 * (`chatTypingScore`); a job that still has a typing step uses the typing
 * test as before. No speed measured: typing is left out, never a 0.
 */
export function familyPhaseWeights(input: PhaseBlendInputs): Array<{ label: string; value: number | null | undefined; weight: number }> {
  const { judgmentScore, quizScore, typingTest, chatSimulationScore, salesSimulationScore, chatInterviewScore, voiceScore, portfolioScore } = input;
  const leadTyping = typeof input.chatTypingScore === "number" && Number.isFinite(input.chatTypingScore)
    ? input.chatTypingScore
    : typingTest?.score;
  const familyAwareWeights: Record<string, Array<{ label: string; value: number | null | undefined; weight: number }>> = {
    team_lead: [
      { label: "chat_simulation", value: chatSimulationScore, weight: 0.35 },
      { label: "quiz", value: quizScore, weight: 0.30 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.25 },
      { label: "typing", value: leadTyping, weight: 0.10 },
      { label: "voice", value: voiceScore, weight: 0.25 },
      { label: "sales_simulation", value: salesSimulationScore, weight: 0.35 },
      { label: "portfolio", value: portfolioScore, weight: 0.10 },
    ],
    support: [
      { label: "resume", value: judgmentScore, weight: 0.28 },
      { label: "quiz", value: quizScore, weight: 0.16 },
      { label: "typing", value: typingTest?.score, weight: 0.12 },
      { label: "chat_simulation", value: chatSimulationScore, weight: 0.22 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.12 },
      { label: "voice", value: voiceScore, weight: 0.10 },
    ],
    sales: [
      { label: "resume", value: judgmentScore, weight: 0.28 },
      { label: "quiz", value: quizScore, weight: 0.10 },
      { label: "sales_simulation", value: salesSimulationScore, weight: 0.24 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.14 },
      { label: "voice", value: voiceScore, weight: 0.14 },
      { label: "portfolio", value: portfolioScore, weight: 0.10 },
    ],
    operations_admin: [
      { label: "resume", value: judgmentScore, weight: 0.30 },
      { label: "quiz", value: quizScore, weight: 0.14 },
      { label: "typing", value: typingTest?.score, weight: 0.24 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.12 },
      { label: "voice", value: voiceScore, weight: 0.10 },
      { label: "chat_simulation", value: chatSimulationScore, weight: 0.10 },
    ],
    technical: [
      { label: "resume", value: judgmentScore, weight: 0.34 },
      { label: "quiz", value: quizScore, weight: 0.26 },
      { label: "portfolio", value: portfolioScore, weight: 0.14 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.14 },
      { label: "voice", value: voiceScore, weight: 0.12 },
    ],
    creative: [
      { label: "resume", value: judgmentScore, weight: 0.26 },
      { label: "portfolio", value: portfolioScore, weight: 0.24 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.18 },
      { label: "voice", value: voiceScore, weight: 0.16 },
      { label: "quiz", value: quizScore, weight: 0.16 },
    ],
    general: [
      { label: "resume", value: judgmentScore, weight: 0.32 },
      { label: "quiz", value: quizScore, weight: 0.18 },
      { label: "typing", value: typingTest?.score, weight: 0.10 },
      { label: "chat_interview", value: chatInterviewScore, weight: 0.15 },
      { label: "chat_simulation", value: chatSimulationScore, weight: 0.10 },
      { label: "sales_simulation", value: salesSimulationScore, weight: 0.10 },
      { label: "voice", value: voiceScore, weight: 0.15 },
    ],
  };
  return familyAwareWeights[input.family] || familyAwareWeights.general;
}

/**
 * The phase blend (trigger-ava-analysis's `finalScore`), floors included.
 * With no test taken yet it is the judgment score itself, for every family.
 *
 * The quiz and typing floors stay for every family but team_lead: they were
 * written so an aced quiz could not leave a weak RESUME failing overall. A
 * lead's blend has no resume in it, so a floor there would only paper over
 * failed tests (a perfect quiz lifting a 20 chat practice to 60).
 */
export function phaseBlendScore(input: PhaseBlendInputs): number {
  const components = familyPhaseWeights(input);
  let finalScore = Math.round(weightedAverage(components, input.judgmentScore) * 100) / 100;
  if (input.family === "team_lead") return finalScore;

  const { quizScore, typingTest } = input;
  // MINIMUM SCORE FLOORS based on quiz performance
  // A candidate who aced the quiz should NOT get a failing overall score
  if (quizScore !== null && typeof quizScore === "number") {
    if (quizScore === 100 && finalScore < 60) {
      finalScore = 60;
    } else if (quizScore >= 80 && finalScore < 50) {
      finalScore = 50;
    }
  }

  // Typing test bonus (if excellent performance)
  if (typingTest && (typingTest.wpm ?? 0) >= 60 && (typingTest.accuracy ?? 0) >= 95) {
    if (finalScore < 55) {
      finalScore = 55;
    }
  }
  return finalScore;
}

export function buildAvaScorecard(params: {
  finalScore: number | null;
  passingScore: number;
  quizScore: number | null;
  quizConfigured: boolean;
  typingTest?: { wpm?: number; score?: number; accuracy?: number; requiredWpm?: number | null } | null;
  /**
   * The job's typing bar (the typing result's own requiredWpm, else
   * jobs.required_wpm). When the measured speed is below it the scorecard
   * says so in plain numbers ("Typed 38 WPM; the job asks for 45"): a flag
   * and a reason the hard requirements are not all met, never a penalty on
   * top of the typing score and never a reason to decline.
   */
  requiredWpm?: number | null;
  /**
   * The computer and connection check's recorded result (notes.equipmentCheckResult,
   * docs/EQUIPMENT-CHECK.md §5). Evidence and flags only: it is never a score, it
   * never holds the evidence floor, and it is never a reason to park anyone.
   * Optional so every existing caller and fixture is unchanged.
   */
  equipmentCheck?: {
    downloadMbps: number;
    uploadMbps: number;
    latencyMs: number;
    meetsBars: boolean;
    below: string[];
    usingThisComputer: string;
    deviceKind: string;
  } | null;
  voiceScore: number | null;
  portfolioScore: number | null;
  chatSimulationScore: number | null;
  salesSimulationScore: number | null;
  chatInterviewScore: number | null;
  videoIntroScore: number | null;
  videoIntroSubmitted: boolean;
  analysisText: string;
  resumeUnavailable: boolean;
  resumeTextUsed: boolean;
  resumeImageCount: number;
  applicationAnswerCount: number;
  coverLetterProvided: boolean;
  workflowSteps: Array<{ type?: string }>;
  jobTitle?: string | null;
  jobDescription?: string | null;
  /** The job's own requirements text — the only place a "non-negotiable" may be stated. */
  jobRequirements?: string | null;
  jobSkillsRequired?: string[] | null;
  experienceLevel?: string | null;
  /**
   * jobs.processing_mode, read from the database by the caller. "auto" means
   * nobody is stopped part-way: deal-breakers are flagged, and Ava's
   * recommendation is only made once every test is done. Anything else is
   * manual, where she may still recommend stopping early.
   */
  processingMode?: string | null;
  directMatchScore?: number | null;
  transferableFitScore?: number | null;
  learningSignalScore?: number | null;
  writingQualityScore?: number | null;
  attentionToDetailScore?: number | null;
  authenticityScore?: number | null;
  specificityScore?: number | null;
  /** Team-lead roles: see JudgmentSubScores. */
  leadershipEvidenceScore?: number | null;
  adaptabilityEvidenceScore?: number | null;
  /** The judge's conflicts: plain strings, or { text, source } (see ConflictNote). */
  hardRequirementConflicts?: readonly ConflictNote[] | null;
  transferableEvidence?: string[] | null;
  /**
   * The owner's own deal-breakers, read from the application form
   * (formDealBreakersFrom). Always highlighted (dealBreakerFlags); once every
   * test is done, Ava's reason to recommend declining.
   */
  formDealBreakers?: string[] | null;
  /** The skills check's count (notes.quizResult.correct / total), for the owner's lines. */
  quizCorrect?: number | null;
  quizTotal?: number | null;
  /** Skills-check categories with a wrong answer (quizAreaBreakdown). */
  quizMissedAreas?: string[] | null;
  /** Missed categories that are must-pass (integrity, money rules, or marked must_pass). */
  quizMustPassMissed?: string[] | null;
  /** The written interview's own credibility rating ("High" / "Medium" / "Low"). */
  interviewCredibility?: string | null;
  /**
   * Tests whose result was stored as `graded: false` (the grader's model call
   * failed). They have no score, so they stay pending, and the owner is told
   * the grader failed and to open the transcript (nothing re-grades a
   * finished step yet). Labels as pendingHighSignalPhases uses them.
   */
  ungradedPhases?: string[] | null;
  /**
   * The owner's review-level form flags (formReviewFlagsFrom): shown, keep the
   * card off "advance" ("mixed"), and never lower the number or decline.
   */
  formReviewFlags?: string[] | null;
  /**
   * The judge's read of the application as one number, for when it returned
   * no sub-scores (the narrative fallback: its own "FINAL CALCULATED SCORE").
   * Used instead of rebuilding a judgment from all-default sub-scores, which
   * is the same constant for everyone (2026-10-06: a narrative 90 and a
   * narrative 30 both scored 71).
   */
  judgmentScoreOverride?: number | null;
  /** The judge returned nothing usable at all: the judgment is a neutral placeholder. */
  judgeFailed?: boolean | null;
  /**
   * Whether a resume was part of this application at all (the job asks for
   * one, or one was uploaded). When it was not, "Resume could not be
   * analyzed" is not a finding and costs no confidence. Unset reads as true,
   * the behaviour before this flag.
   */
  resumeRequested?: boolean | null;
  /**
   * The escalated chat practice's own findings (readChatSimulationResult):
   * the lead's own words for a NEW promise (the chat's stored score is
   * already capped at 40 for it) and for disrespect to the player, and
   * whether the grader asked for a person to read the chat. Each is a risk
   * flag and keeps the card on "review": never a decline, never a second
   * penalty on the number. Optional so every existing caller is unchanged.
   */
  chatNewPromiseQuote?: string | null;
  chatDisrespectQuote?: string | null;
  chatNeedsReview?: boolean | null;
  chatReviewReasons?: string[] | null;
  /**
   * A lead's written interview that ended before its plan was covered
   * (readChatInterviewResult: graded, but `incomplete`), and the topics it
   * never asked. A flag and a reason for "review", never a decline.
   */
  interviewIncomplete?: boolean | null;
  interviewMustCoverMissing?: string[] | null;
  /**
   * A lead's written interview: its own marks on the lead plan
   * (readChatInterviewResult leadership / adaptability / workingLead), 0-100,
   * null for a topic never asked. Already in the interview's score, so they
   * never move the number here: a mark under 50 is a flag, a "why down" line
   * and a reason for "review", and it stops the judge's "Clear evidence of
   * leading a team" line from standing beside it. Optional so every existing
   * caller is unchanged.
   */
  interviewLeadership?: number | null;
  interviewAdaptability?: number | null;
  interviewWorkingLead?: number | null;
  /**
   * Tests graded from the transcript the PAGE sent (transcriptSource
   * "browser": the record of the attempt was not available). Their mark is
   * not trusted: flagged, and the card stays on "review". They still count
   * as taken, so a job whose record system is not deployed is never parked
   * waiting for a test that is already done. Labels as
   * pendingHighSignalPhases uses them.
   */
  browserTranscriptPhases?: string[] | null;
  /**
   * Typing measured inside the chat practice (readChatSimulationResult(...)
   * .typing; docs/TYPING-IN-CHAT.md). Read only when the job has no typing
   * step (chatTypingForJob): a job that still has one is unchanged. Then a
   * speed under the bar and a median reply time over it are each a flag, a
   * "why down" line and a reason for "review" (never a decline, never a
   * penalty on the number); for a team lead the score is typing's 0.10 of
   * the tests (chatTypingBlendScore). Optional so every existing caller is
   * unchanged.
   */
  chatTyping?: ChatTypingReading | null;
  evidenceFingerprint: string;
}) {
  const {
    finalScore,
    passingScore,
    quizScore,
    quizConfigured,
    typingTest,
    requiredWpm,
    equipmentCheck,
    voiceScore,
    portfolioScore,
    chatSimulationScore,
    salesSimulationScore,
    chatInterviewScore,
    videoIntroScore,
    videoIntroSubmitted,
    analysisText,
    resumeUnavailable,
    resumeTextUsed,
    resumeImageCount,
    applicationAnswerCount,
    coverLetterProvided,
    workflowSteps,
    jobTitle,
    jobDescription,
    jobRequirements,
    jobSkillsRequired,
    experienceLevel,
    processingMode,
    directMatchScore,
    transferableFitScore,
    learningSignalScore,
    writingQualityScore,
    attentionToDetailScore,
    authenticityScore,
    specificityScore,
    leadershipEvidenceScore,
    adaptabilityEvidenceScore,
    hardRequirementConflicts,
    transferableEvidence,
    formDealBreakers,
    quizCorrect,
    quizTotal,
    quizMissedAreas,
    quizMustPassMissed,
    interviewCredibility,
    ungradedPhases,
    formReviewFlags,
    judgmentScoreOverride,
    judgeFailed,
    resumeRequested,
    chatNewPromiseQuote,
    chatDisrespectQuote,
    chatNeedsReview,
    chatReviewReasons,
    interviewIncomplete,
    interviewMustCoverMissing,
    interviewLeadership,
    interviewAdaptability,
    interviewWorkingLead,
    browserTranscriptPhases,
    chatTyping,
    evidenceFingerprint,
  } = params;
  // A resume nobody asked for and nobody sent is not a missing resume.
  const resumeMissing = resumeUnavailable && resumeRequested !== false;

  // The chat practice's typing, when it is this job's typing measure (no
  // typing step). null for a job that still has a typing step: unchanged.
  const chatTypingInUse = chatTypingForJob(workflowSteps, chatTyping ?? null);
  const chatTypingSpeedKnown = typeof chatTypingInUse?.wpm === "number";

  // Which tests are done and which are still ahead decide what counts as a
  // conflict yet (realHardConflicts), so they come first.
  const progress = highSignalProgress({
    quizScore,
    quizConfigured,
    workflowSteps,
    typingScore: typingTest?.score,
    voiceScore,
    portfolioScore,
    chatSimulationScore,
    salesSimulationScore,
    chatInterviewScore,
    videoIntroScore,
    videoIntroSubmitted,
  });
  const pendingHighSignalPhases = progress.pending;
  const completedHighSignalPhases = progress.completed;
  const pendingTopicPhases = progress.pendingTopicPhases;
  // What is already measured, for the conflict screen: the completed tests,
  // and typing once the chat practice is done on a job with no typing step.
  const takenTopicPhases = progress.takenTopicPhases;
  const family = inferJobFamily(jobTitle, jobDescription);
  const teamLead = family === "team_lead";
  // Team leads read like the support role they lead in every derived
  // dimension below (the chat practice is their primary signal too).
  const supportLike = family === "support" || teamLead;

  // The deterministic aggregate of the judge's sub-scores — NOT the LLM's own
  // holistic overallScore, which never reaches this function and has zero
  // effect on the persisted score. A conflict about anything a test measures
  // (still ahead, or already taken: its result is its own score) or about the
  // connection check does not count against it.
  // When the judge returned no sub-scores but its narrative carried a number
  // (judgmentScoreOverride), that number is the judgment: rebuilding one from
  // all-default sub-scores gives every applicant the same constant.
  const judgmentScore = typeof judgmentScoreOverride === "number" && Number.isFinite(judgmentScoreOverride)
    ? clampPercent(judgmentScoreOverride)
    : computeJudgmentScore({
        directMatchScore,
        transferableFitScore,
        learningSignalScore,
        writingQualityScore,
        attentionToDetailScore,
        authenticityScore,
        specificityScore,
        leadershipEvidenceScore,
        adaptabilityEvidenceScore,
        jobFamily: family,
        hardRequirementConflicts,
        pendingPhases: pendingTopicPhases,
        takenPhases: takenTopicPhases,
      });

  // The final number. For every family but team_lead this is unchanged: the
  // judgment at 0.7 with the caller's phase blend (`finalScore`, which itself
  // contains the judgment for those families) at 0.3. For a team lead, once
  // every test is done, the tests decide 0.65 and the judgment 0.35, and the
  // judgment is counted once (the team-lead phase blend has no resume entry).
  // While a lead's tests are still ahead the old split stays, so a lone early
  // test cannot swing the interim number.
  //
  // 2026-10-06 (second pass): the tests' 0.65 is for the four tests the lead
  // weights were built on (escalated chat 0.35, skills check 0.30, written
  // interview 0.25, typing 0.10). A lead job with fewer of them gets that
  // share in proportion (leadTestsCoverage): a typing-only "Shift Lead" job
  // used to let one typing test decide 65% of the number, so nearly everyone
  // who reached the bar scored in the 90s on the tests half.
  //
  // A lead job with no typing step takes typing's 0.10 from the chat practice
  // (chatTypingBlendScore, the same number the caller's phase blend used), so
  // a job with the three other tests is back to full coverage once the chat
  // timed the typing, and stays at 0.90 when it did not.
  const testsDone = pendingHighSignalPhases.length === 0 && completedHighSignalPhases.length > 0;
  const leadTestsWeighting = teamLead && testsDone;
  const chatTypingForBlend = chatTypingBlendScore({ family, workflowSteps, typing: chatTyping ?? null });
  const leadTestsShare = leadTestsWeighting
    ? 0.65 * leadTestsCoverage({ quizScore, typingScore: typingTest?.score, chatTypingScore: chatTypingForBlend, chatSimulationScore, chatInterviewScore, voiceScore, salesSimulationScore, portfolioScore })
    : 0.3;
  const safeScore = clampPercent(
    weightedAverage(
      [
        { value: judgmentScore, weight: 1 - leadTestsShare },
        { value: finalScore, weight: leadTestsShare },
      ],
      judgmentScore,
    ),
  );
  const entryLevel = isEntryLevelRole(experienceLevel, jobTitle);
  const riskFlags: string[] = [];
  const evidenceRefs: string[] = [];
  const normalizedTransferableEvidence = sanitizeList(transferableEvidence, 4);
  const normalizedHardRequirementConflicts = realHardConflicts(hardRequirementConflicts, 4, pendingTopicPhases, takenTopicPhases);

  // The typing bar, measured by our own server: the result's requiredWpm
  // first (it is what the candidate was tested against), else the job's.
  const typingBar = firstFiniteNumber(typingTest?.requiredWpm, requiredWpm);
  const typedWpm = firstFiniteNumber(typingTest?.wpm);
  const typingBelowBar = typeof typingBar === "number" && typingBar > 0 && typeof typedWpm === "number" && typedWpm < typingBar;
  const typingFlag = typingBelowBar ? `Typed ${Math.round(typedWpm!)} WPM; the job asks for ${Math.round(typingBar!)}` : null;
  // The same, measured in the chat practice on a job with no typing step:
  // the speed against the chat step's bar, and the median reply time.
  const chatSpeedFlag = chatTypingSpeedFlag(chatTypingInUse);
  const chatReplyFlag = chatReplyTimeFlag(chatTypingInUse);
  // Replies that did not arrive key by key: their speed was left out, which
  // must not be a way around the bar (a reason for review, never a decline).
  const chatArrivedFlag = chatTypingArrivedFlag(chatTypingInUse);

  // The judge's notes about a test that is ALREADY taken are not conflicts
  // (that would count the same shortfall twice: once as the test's score and
  // again as a 6+ point penalty on the judgment, and its wording could even
  // become the decline reason). They are shown to the owner as risk flags,
  // never a penalty and never a reason. A note on the typing topic is
  // dropped when the code knows the bar: typingFlag above states the fact in
  // numbers, and so does the chat practice's typing block when it is the
  // job's typing measure (its figures and flags, or "not enough typing to
  // time" on the record); when the chat timed a speed, a chat-practice note
  // that quotes a WPM goes too.
  // Notes about a test still ahead are dropped (that test's job) and
  // connection notes are dropped (the check's own flags say it).
  const measuredNotes = testResultConflicts(hardRequirementConflicts, pendingTopicPhases, takenTopicPhases)
    .filter(({ phase }) => !(phase === "typing test" && ((typeof typingBar === "number" && typingBar > 0) || chatTypingInUse !== null)))
    .filter(({ phase, text }) => !(phase === "chat simulation" && chatTypingSpeedKnown && WPM_FIGURE.test(normalizeQuotes(text))))
    .map(({ text }) => text);

  if (!resumeUnavailable) {
    evidenceRefs.push("resume");
    if (resumeTextUsed) evidenceRefs.push("resume_text");
    if (resumeImageCount > 0) evidenceRefs.push(`resume_images:${resumeImageCount}`);
  }
  if (applicationAnswerCount > 0) evidenceRefs.push(`application_answers:${applicationAnswerCount}`);
  if (coverLetterProvided) evidenceRefs.push("cover_letter");
  if (typeof quizScore === "number") evidenceRefs.push(`quiz:${quizScore}`);
  if (typingTest?.wpm) evidenceRefs.push(`typing:${typingTest.wpm}wpm`);
  if (chatTypingInUse && (chatTypingInUse.wpm !== null || chatTypingInUse.medianReplySeconds !== null)) {
    const parts = [
      ...(chatTypingInUse.wpm !== null ? [`${Math.round(chatTypingInUse.wpm)}wpm`] : []),
      ...(chatTypingInUse.medianReplySeconds !== null ? [`${Math.round(chatTypingInUse.medianReplySeconds)}s`] : []),
    ];
    evidenceRefs.push(`chat_typing:${parts.join("/")}`);
  }
  if (typeof voiceScore === "number") evidenceRefs.push(`voice:${voiceScore}`);
  if (typeof portfolioScore === "number") evidenceRefs.push(`portfolio:${portfolioScore}`);
  if (typeof chatSimulationScore === "number") evidenceRefs.push(`chat_simulation:${chatSimulationScore}`);
  if (typeof salesSimulationScore === "number") evidenceRefs.push(`sales_simulation:${salesSimulationScore}`);
  if (typeof chatInterviewScore === "number") evidenceRefs.push(`chat_interview:${chatInterviewScore}`);
  if (typeof videoIntroScore === "number") evidenceRefs.push(`video_intro:${videoIntroScore}`);
  else if (videoIntroSubmitted) evidenceRefs.push("video_intro_submitted");
  if (equipmentCheck) evidenceRefs.push(`connection:${equipmentCheck.downloadMbps}down/${equipmentCheck.uploadMbps}up/${equipmentCheck.latencyMs}ms`);
  if (Array.isArray(workflowSteps) && workflowSteps.length > 0) evidenceRefs.push(`workflow_steps:${workflowSteps.length}`);
  if (normalizedTransferableEvidence.length > 0) {
    evidenceRefs.push(`transferable_fit:${normalizedTransferableEvidence.length}`);
  }

  const normalizedFormDealBreakers = sanitizeList(formDealBreakers, 4);
  const normalizedFormReviewFlags = sanitizeList(formReviewFlags, 4).filter((flag) => !normalizedFormDealBreakers.includes(flag));
  const ungraded = sanitizeList(ungradedPhases, 8);
  // Nothing re-grades a finished step yet (migration 20261005230146: "nothing
  // re-grades a finished step"), so the flag says what is true and what the
  // owner can do now, not "re-grade it".
  const ungradedFlags = ungraded.map((phase) => ungradedFlag(phase, teamLead));
  const normalizedMustPassMissed = sanitizeList(quizMustPassMissed, 4);
  const mustPassFlags = normalizedMustPassMissed.map(mustPassQuizFlag);
  const credibilityLow = typeof interviewCredibility === "string" && /^\s*low\b/i.test(interviewCredibility);
  // The tests' own findings, each in the candidate's own words where there are
  // some: shown, and a reason for "review" (reviewShortfalls), never a decline.
  const newPromiseQuote = typeof chatNewPromiseQuote === "string" && chatNewPromiseQuote.trim() ? chatNewPromiseQuote.trim() : null;
  const disrespectQuote = typeof chatDisrespectQuote === "string" && chatDisrespectQuote.trim() ? chatDisrespectQuote.trim() : null;
  // A chat the grader wants a person to read holds the card on "review" when
  // the reason is a finding: a flag the reviewer raised that the server could
  // not confirm (a confirmed promise or disrespect has its own flag above).
  // Promise WORDS the server spotted in the lead's lines are only a pointer
  // (ai-chat-simulation/grading.ts promiseWordsInLeadLines): shown, never a
  // hold. 2026-10-06: a strong lead scored 91 "advance" when a line said
  // "this morning" and 91 "review" when it said "today", from the case's own
  // fact. A chat marked for review with no reason given still holds.
  const chatReasons = sanitizeList(chatReviewReasons, 8);
  const chatWordReasons = chatReasons.filter(isPromiseWordsOnlyReason);
  const chatReviewReason = chatReasons.find((reason) => !isPromiseWordsOnlyReason(reason)) ?? null;
  const chatReview = !!chatReviewReason || (chatNeedsReview === true && chatReasons.length === 0);
  const chatWordsFlag = chatWordReasons.length > 0 ? `Chat practice may be worth a read: ${chatWordReasons[0]}` : null;
  // The interview's own lead marks under 50, in the owner's words. Review
  // signals only: the marks are already inside the interview's score.
  const lowLeadMark = (mark: number | null | undefined): mark is number =>
    teamLead && typeof mark === "number" && Number.isFinite(mark) && mark < 50;
  const interviewLeadLows = ([
    ["leading a team", interviewLeadership],
    ["handling a sudden change", interviewAdaptability],
    ["splitting a shift between players and leading", interviewWorkingLead],
  ] as const)
    .filter(([, mark]) => lowLeadMark(mark))
    .map(([what, mark]) => `Interview: little evidence of ${what} (${Math.round(mark as number)}/100)`);
  const interviewLeadershipLow = lowLeadMark(interviewLeadership);
  const interviewAdaptabilityLow = lowLeadMark(interviewAdaptability);
  const interviewMissing = sanitizeList(interviewMustCoverMissing, 6);
  const interviewCutShort = interviewIncomplete === true;
  const browserTranscripts = sanitizeList(browserTranscriptPhases, 8);
  const testFindingFlags = [
    ...(newPromiseQuote ? [`Made a new promise in the escalated chat: "${newPromiseQuote}"`] : []),
    ...(disrespectQuote ? [`Was disrespectful to the player in the escalated chat: "${disrespectQuote}"`] : []),
    ...(chatReview ? [chatReviewReason ? `Chat practice needs a person to read it: ${chatReviewReason}` : "Chat practice needs a person to read it"] : []),
    ...(interviewCutShort
      ? [`Interview ended before the lead plan was covered${interviewMissing.length > 0 ? ` (not asked: ${interviewMissing.join(", ")})` : ""}`]
      : []),
    ...browserTranscripts.map(
      (phase) => `${testName(phase, teamLead)} was graded from the transcript the page sent, not our own record; read it before trusting the mark`,
    ),
  ];

  if (resumeMissing) riskFlags.push("Resume could not be analyzed");
  if (judgeFailed) riskFlags.push(JUDGE_FAILED_FLAG);
  if (safeScore < passingScore) riskFlags.push("Overall score is below the passing threshold");
  riskFlags.push(...normalizedFormDealBreakers);
  riskFlags.push(...normalizedFormReviewFlags);
  riskFlags.push(...ungradedFlags);
  if (typingFlag) riskFlags.push(typingFlag);
  if (chatSpeedFlag) riskFlags.push(chatSpeedFlag);
  if (chatReplyFlag) riskFlags.push(chatReplyFlag);
  if (chatArrivedFlag) riskFlags.push(chatArrivedFlag);
  riskFlags.push(...mustPassFlags);
  riskFlags.push(...testFindingFlags);
  riskFlags.push(...interviewLeadLows);
  if (chatWordsFlag) riskFlags.push(chatWordsFlag);
  // The connection check's flags (docs/EQUIPMENT-CHECK.md §6), for the owner's
  // review only: they never reach hardRejectReason or dealBreakerFlags.
  if (equipmentCheck) {
    if (!equipmentCheck.meetsBars) {
      riskFlags.push(`Connection below the job's bar (${equipmentCheck.below.join(", ") || "measured"})`);
    }
    if (equipmentCheck.usingThisComputer === "ran_here_anyway") riskFlags.push("Ran the connection check on a computer they will not work from");
    if (equipmentCheck.deviceKind === "phone" || equipmentCheck.deviceKind === "tablet") {
      riskFlags.push(`Ran the connection check on a ${equipmentCheck.deviceKind}`);
    }
  }
  if (/WRONG_RESUME/i.test(analysisText)) riskFlags.push("Resume may not belong to this candidate or role");
  if (/INVALID_DOCUMENT/i.test(analysisText)) riskFlags.push("Uploaded file did not behave like a valid resume");
  if (/SUSPICIOUS/i.test(analysisText)) riskFlags.push("Resume details need manual verification");
  if (/Name Match:\s*MISMATCH/i.test(analysisText)) {
    riskFlags.push("Resume may not belong to this candidate or role");
  }
  if (/AUTHENTICITY ASSESSMENT[\s\S]{0,160}Status:\s*LIKELY_FABRICATED/i.test(analysisText)) {
    riskFlags.push("Profile authenticity needs review");
  } else if (/AUTHENTICITY ASSESSMENT[\s\S]{0,160}Status:\s*QUESTIONABLE/i.test(analysisText)) {
    riskFlags.push("Profile details need closer verification");
  }
  // The written interview's own credibility rating. Shown, and a reason the
  // card is "review" rather than "advance", never a decline and never a cap
  // (2026-10-06, second pass). The interviewer is told to rate it partly on
  // the TESTS ("claims X years but typed under 40 WPM", "quiz under 60%"),
  // so as a verdict it brought a measured shortfall back in as a decline
  // reason: a strong lead rated "Low" went from 88 "advance" to 59 "reject"
  // on one model field.
  if (credibilityLow) riskFlags.push(INTERVIEW_CREDIBILITY_FLAG);
  // NOTE: "Missing Critical Skills" is NOT matched here — it's a mandatory section
  // header the report template always emits ("Missing Critical Skills: [only list
  // truly critical gaps...]"), so it's present verbatim in every completed analysis
  // regardless of whether any gap was actually found. Matching the header string
  // trips this flag on every candidate. "Poor Match" and "Not Recommended" are safe:
  // they're specific enum values the model only writes when it actually means them
  // (Role Fit: [Strong Match/Good Match/Partial Match/Poor Match], Recommendation:
  // [Highly Recommended/Recommended/Consider/Not Recommended]).
  if (/Poor Match|Not Recommended/i.test(analysisText)) riskFlags.push("Critical role-fit concerns were flagged");
  if (/LIKELY_AI_GENERATED/i.test(analysisText)) riskFlags.push("Application content may be overly templated");
  // Structured data, not the header string: a genuine missing-skill concern is one
  // the judge actually returned as a hard requirement conflict, never inferred from
  // whether the report's "Missing Critical Skills:" section header is present.
  if (Array.isArray(jobSkillsRequired) && jobSkillsRequired.length > 0 && normalizedHardRequirementConflicts.length > 0) {
    riskFlags.push("Required skill alignment needs a closer look");
  }
  // Information for the owner only — see proseAffirmsDealBreaker. It is never
  // promoted to hardRejectReason.
  if (proseAffirmsDealBreaker(analysisText, `${jobDescription || ""}\n${jobRequirements || ""}`)) {
    riskFlags.push(STATED_DEAL_BREAKER_FLAG);
  }
  if (normalizedHardRequirementConflicts.length > 0) {
    riskFlags.push(...normalizedHardRequirementConflicts);
  }
  riskFlags.push(...measuredNotes);

  const familyPrimarySignals: Record<string, Array<number | null | undefined>> = {
    support: [chatSimulationScore, voiceScore, chatInterviewScore, quizScore],
    team_lead: [chatSimulationScore, voiceScore, chatInterviewScore, quizScore],
    sales: [salesSimulationScore, voiceScore, chatInterviewScore, quizScore],
    creative: [portfolioScore, videoIntroScore, chatInterviewScore, safeScore],
    technical: [quizScore, chatInterviewScore, safeScore],
    operations_admin: [typingTest?.score as number | undefined, typingTest?.accuracy ? Math.round(typingTest.accuracy) : undefined, quizScore, safeScore],
    field_service: [quizScore, voiceScore, safeScore],
    retail_hospitality: [videoIntroScore, voiceScore, chatInterviewScore, safeScore],
    healthcare: [voiceScore, quizScore, safeScore],
    executive: [videoIntroScore, chatInterviewScore, voiceScore, safeScore],
    general: [quizScore, voiceScore, chatInterviewScore, safeScore],
  };

  const primarySignalAverage = averageOf(familyPrimarySignals[family] || familyPrimarySignals.general, safeScore);
  const directRoleMatch = clampPercent(
    typeof directMatchScore === "number" && Number.isFinite(directMatchScore)
      ? directMatchScore
      : Math.max(safeScore - (entryLevel ? 3 : 8), 0),
  );
  const transferableFit = clampPercent(
    typeof transferableFitScore === "number" && Number.isFinite(transferableFitScore)
      ? transferableFitScore
      : averageOf([safeScore - 4, primarySignalAverage], safeScore),
  );
  const learningSignal = clampPercent(
    typeof learningSignalScore === "number" && Number.isFinite(learningSignalScore)
      ? learningSignalScore
      : entryLevel
        ? 65
        : 48,
  );
  const hardRequirements = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.28 },
        { value: directRoleMatch, weight: 0.32 },
        { value: transferableFit, weight: 0.14 },
        { value: learningSignal, weight: entryLevel ? 0.12 : 0.06 },
        { value: quizScore, weight: 0.08 },
        { value: primarySignalAverage, weight: 0.06 },
        { value: portfolioScore, weight: family === "creative" ? 0.08 : 0.04 },
      ],
      safeScore,
    ) -
      (riskFlags.some((flag) => flag.includes("Critical role-fit")) ? 10 : 0) -
      normalizedHardRequirementConflicts.length * 4,
  );
  const roleCompetency = clampPercent(
    weightedAverage(
      [
        { value: primarySignalAverage, weight: 0.28 },
        { value: safeScore, weight: 0.2 },
        { value: directRoleMatch, weight: entryLevel ? 0.16 : 0.22 },
        { value: transferableFit, weight: 0.18 },
        { value: learningSignal, weight: entryLevel ? 0.12 : 0.05 },
        { value: quizScore, weight: family === "technical" ? 0.1 : 0.05 },
        { value: salesSimulationScore, weight: family === "sales" ? 0.1 : 0.03 },
        { value: chatSimulationScore, weight: supportLike ? 0.1 : 0.03 },
        { value: portfolioScore, weight: family === "creative" ? 0.1 : 0.04 },
      ],
      safeScore,
    ),
  );
  const communication = clampPercent(
    weightedAverage(
      [
        { value: voiceScore, weight: 0.35 },
        { value: videoIntroScore, weight: 0.2 },
        { value: chatSimulationScore, weight: supportLike ? 0.2 : 0.1 },
        { value: salesSimulationScore, weight: family === "sales" ? 0.2 : 0.1 },
        { value: chatInterviewScore, weight: 0.2 },
        { value: safeScore - 4, weight: 0.05 },
      ],
      safeScore - 4,
    ),
  );
  const executionReliability = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.3 },
        { value: quizScore, weight: 0.25 },
        { value: typingTest?.score as number | undefined, weight: family === "operations_admin" ? 0.25 : 0.1 },
        { value: typingTest?.accuracy ? Math.round(typingTest.accuracy) : undefined, weight: 0.15 },
        { value: chatInterviewScore, weight: 0.1 },
      ],
      safeScore,
    ),
  );
  const workStyleFit = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.35 },
        { value: chatSimulationScore, weight: 0.15 },
        { value: voiceScore, weight: 0.15 },
        { value: chatInterviewScore, weight: 0.2 },
        { value: videoIntroScore, weight: 0.15 },
      ],
      safeScore,
    ),
  );

  const completedSignalCount = completedHighSignalPhases.length;
  const evidenceQuality = clampPercent(
    30 +
      evidenceRefs.length * 6 +
      completedSignalCount * 10 +
      (applicationAnswerCount >= 4 ? 6 : applicationAnswerCount > 0 ? 3 : 0) +
      (resumeTextUsed ? 8 : 0) +
      (resumeImageCount > 0 ? 5 : 0) -
      (normalizedHardRequirementConflicts.length > 0 ? 6 : 0) +
      (resumeUnavailable ? 10 : 0),
  );

  // Confidence grows with the tests taken. 15 a test assumed a job with four
  // of them: a team-lead job with two could never reach the 62 that
  // "advance" needs, however strong the applicant (2026-10-06, second pass).
  // For a team lead, the job's own full set of tests now counts at least as
  // much as four did (a job with more keeps 15 each). Every other family is
  // unchanged: their "advance" label on a one- or two-test job is a separate
  // call, not made here.
  const configuredSignalCount = completedSignalCount + pendingHighSignalPhases.length;
  const testsConfidence = teamLead
    ? Math.max(
        completedSignalCount * 15,
        configuredSignalCount > 0 ? Math.round((60 * completedSignalCount) / configuredSignalCount) : 0,
      )
    : completedSignalCount * 15;
  const confidence = clampPercent(
    22 +
      testsConfidence +
      (applicationAnswerCount >= 4 ? 6 : applicationAnswerCount > 0 ? 3 : 0) +
      (resumeTextUsed ? 8 : 0) +
      (resumeImageCount > 0 ? 4 : 0) +
      (coverLetterProvided ? 2 : 0) -
      (normalizedHardRequirementConflicts.length > 0 ? 8 : 0) -
      (riskFlags.some((flag) => flag.toLowerCase().includes("authenticity")) ? 12 : 0) -
      (resumeMissing ? 10 : 0),
  );

  // Owner, 2026-10-05: in auto mode nobody is parked part-way. Every applicant
  // takes every test, Ava only scores and flags, and he decides at the end. So
  // while tests are still ahead nothing is a reason to stop: deal-breakers no
  // test can change are highlighted (dealBreakerFlags) and a shortfall a test
  // measured, like a slow typing result, waits for the end. Manual jobs keep
  // the early recommendation for a real deal-breaker; the owner reviews every
  // step there anyway. The judge's prose (proseAffirmsDealBreaker) is never a
  // reason in either mode.
  const autoMode = processingMode === "auto";
  const testsStillAhead = pendingHighSignalPhases.length > 0;
  // Verdicts from the report itself: the resume is someone else's, or the
  // profile is likely fabricated. (The interview's credibility rating is a
  // review flag, not a verdict: see credibilityLow.)
  const verdictFlags = riskFlags.filter(
    (flag) => flag.includes("Resume may not belong") || flag.includes("Profile authenticity"),
  );
  // A conflict is decline-grade only when it is an eligibility blocker or
  // names a deal-breaker the job's own text states, at every stage of the
  // tests: one word the judge chose no longer turns a review into a decline
  // once the last test is done.
  const jobText = `${jobDescription || ""}\n${jobRequirements || ""}`;
  const declineGradeConflicts = normalizedHardRequirementConflicts.filter(
    (conflict) => isEligibilityBlocker(conflict) || isStatedDealBreakerConflict(conflict, jobText),
  );
  const dealBreakerFlags = sanitizeList(
    [
      ...normalizedFormDealBreakers,
      ...declineGradeConflicts,
      ...verdictFlags,
    ],
    6,
  );
  const mayRecommendStopping = !testsStillAhead || !autoMode;
  const structuredHardRejectReason = mayRecommendStopping ? declineGradeConflicts[0] || null : null;
  // The owner's own form deal-breaker is a reason once every test is done,
  // in both modes (the tests were the point of asking everyone to take them).
  const formHardRejectReason = !testsStillAhead ? normalizedFormDealBreakers[0] || null : null;
  const hardRejectReason = mayRecommendStopping
    ? structuredHardRejectReason || formHardRejectReason || verdictFlags[0] || null
    : null;

  // The evidence is complete only when nothing is left to take. Before
  // 2026-10-05 one finished test was enough, so anyone under the passing score
  // after the skills check was parked before the tests the owner wanted to see.
  // Only a manual job's real deal-breaker still completes it early.
  const evidenceFloorMet =
    pendingHighSignalPhases.length === 0 ||
    (!autoMode && !!hardRejectReason);

  // "met" means every hard requirement is met (2026-10-06). Before, any score
  // at or above the passing mark read "met" whatever the judge had listed, so
  // an applicant who had never led a team carried the same "advance" as the
  // clear hire. A requirement conflict the judge listed, or a bar a test
  // measured and the applicant missed (the typing speed), makes it "mixed":
  // flagged for review, never a decline on its own.
  //
  // 2026-10-06 (second pass): the typing bar was the only measured shortfall,
  // so a gamed profile still read "advance" and "met": a lead who missed both
  // the integrity and the money-rules questions (86), one who escalated the
  // chat practice to 20 behind a perfect skills check (73), one with a 0
  // interview (74), and one the judge read as never having led anyone (82).
  // Each of these now keeps the card on "review" (never a decline, never a
  // penalty on the number): a must-pass skills-check question missed; for a
  // team lead, an escalated chat practice under 50 or a leadership read under
  // 50 (the judge's anchors: never led a team is under 30, a vague claim with
  // no team size, time or example is under 50; the card already says "Little
  // evidence of leading a team" there, and "met" beside it contradicted
  // itself); any test under 30; the interview's credibility rated Low; or a
  // review-level form flag the owner set.
  const scoredTests = [quizScore, typingTest?.score, chatSimulationScore, salesSimulationScore, chatInterviewScore, voiceScore, portfolioScore, videoIntroScore];
  const reviewShortfalls = {
    typing: typingBelowBar,
    // The chat practice's typing on a job with no typing step: the speed
    // under the chat step's bar, the median reply time over it, or replies
    // that arrived without being typed (their speed could not be counted).
    chatTyping: !!chatSpeedFlag || !!chatReplyFlag || !!chatArrivedFlag,
    mustPass: normalizedMustPassMissed.length > 0,
    leadChat: teamLead && typeof chatSimulationScore === "number" && chatSimulationScore < 50,
    veryLowTest: scoredTests.some((score) => typeof score === "number" && Number.isFinite(score) && score < 30),
    littleLeadEvidence: teamLead && typeof leadershipEvidenceScore === "number" && leadershipEvidenceScore < 50,
    // The interview's own lead marks: a 35 on leading a team beside the
    // judge's 88 for the application is for a person to weigh.
    interviewLeadMarks: interviewLeadLows.length > 0,
    credibility: credibilityLow,
    formReview: normalizedFormReviewFlags.length > 0,
    // Nobody read the application, so nobody checked its requirements.
    judgeFailed: !!judgeFailed,
    // The tests' own findings (testFindingFlags): a new promise or disrespect
    // in the escalated chat, a chat the grader wants a person to read for a
    // reason other than promise words alone, a lead interview cut short, and
    // a mark graded from the page's own transcript.
    testFindings: testFindingFlags.length > 0,
  };
  const measuredShortfall = Object.values(reviewShortfalls).some(Boolean);
  const hardRequirementStatus: AvaScorecard["hardRequirementStatus"] = hardRejectReason || dealBreakerFlags.length > 0
    ? "at_risk"
    : normalizedHardRequirementConflicts.length > 0 || measuredShortfall || safeScore < passingScore
      ? "mixed"
      : "met";

  let recommendedAction: RecommendedAction = "reject";
  const advanceBuffer = entryLevel ? 6 : 10;
  const reviewFloor = entryLevel ? Math.max(42, passingScore - 12) : Math.max(45, passingScore - 8);

  if (hardRejectReason) {
    recommendedAction = "reject";
  } else if (!evidenceFloorMet) {
    recommendedAction = "review";
  } else if (safeScore >= passingScore + advanceBuffer && confidence >= 62 && hardRequirementStatus === "met") {
    recommendedAction = "advance";
  } else if (safeScore >= reviewFloor || primarySignalAverage >= passingScore) {
    recommendedAction = "review";
  }

  let autopilotAction: AutopilotAction = "reject";
  if (hardRejectReason) {
    autopilotAction = "reject";
  } else if (!evidenceFloorMet) {
    autopilotAction = "defer";
  } else {
    autopilotAction = safeScore >= passingScore ? "advance" : "reject";
  }

  // A recommended decline sorts below the pass mark (2026-10-06): the
  // applicant list sorts by this number, and a declined applicant used to sit
  // above people Ava recommended reviewing. 2026-10-06 (second pass): so does
  // anyone carrying a decline-grade flag (the owner's form deal-breaker, an
  // eligibility blocker, a verdict) BEFORE the last test: the reason itself
  // waits for the end in auto mode, but the number did not, so a manage-only
  // applicant who stopped after the skills check sat at 84 above honest
  // finishers, and scored higher by not finishing. Nobody is parked by this:
  // the action stays "defer" until every test is done.
  const overallScore = hardRejectReason || dealBreakerFlags.length > 0
    ? clampPercent(Math.min(safeScore, passingScore - 1))
    : safeScore;

  const { whyUp, whyDown } = buildWhyLines({
    teamLead,
    leadershipEvidenceScore,
    adaptabilityEvidenceScore,
    interviewLeadLows,
    interviewLeadershipLow,
    interviewAdaptabilityLow,
    quizScore,
    quizCorrect,
    quizTotal,
    quizMissedAreas: sanitizeList(quizMissedAreas, 10),
    quizMustPassMissed: sanitizeList(quizMustPassMissed, 4),
    chatSimulationScore,
    chatInterviewScore,
    salesSimulationScore,
    voiceScore,
    typedWpm,
    typingBar,
    chatTyping: chatTypingInUse,
    formDealBreakers: normalizedFormDealBreakers,
    formReviewFlags: normalizedFormReviewFlags,
    verdictFlags,
    credibilityLow,
    hardRequirementConflicts: normalizedHardRequirementConflicts,
    ungraded,
    equipmentCheck,
  });

  const decisionState: AvaDecisionState = evidenceFloorMet ? "ready_for_decision" : "needs_more_evidence";
  const pendingPhaseLabel = pendingHighSignalPhases.length > 0
    ? formatNaturalList(Array.from(new Set(pendingHighSignalPhases)))
    : null;
  const transferableLine = normalizedTransferableEvidence.length > 0
    ? ` Transferable fit recognized from ${formatNaturalList(normalizedTransferableEvidence)}.`
    : "";
  const flaggedLine = dealBreakerFlags.length > 0 && !hardRejectReason
    ? ` Flagged for your review: ${formatNaturalList(dealBreakerFlags.map((flag) => flag.replace(/\.$/, "")))}.`
    : "";
  const roleLabel = family.replace(/_/g, " ");
  const verdict =
    hardRejectReason
      ? autoMode
        ? `${hardRejectReason.replace(/\.$/, "")}. Ava recommends declining; nobody was stopped, and the decision is yours.`
        : `${hardRejectReason}. Ava recommends stopping here based on the evidence already collected.`
      : !evidenceFloorMet
        ? pendingPhaseLabel
          ? `Ava needs more evidence before a final reject or advance recommendation. Pending signals: ${pendingPhaseLabel}.${flaggedLine}${transferableLine}`
          : `Ava needs more evidence before making a final reject or advance recommendation.${flaggedLine}${transferableLine}`
        : recommendedAction === "advance"
          ? `Strong ${roleLabel} evidence and confidence support moving this candidate forward.${transferableLine}`
          : recommendedAction === "review"
            ? `Signals are mixed for this ${roleLabel} role, so a human should review the evidence collected so far.${flaggedLine}${transferableLine}`
            : `Available evidence is below the role threshold, so Ava recommends rejection.${transferableLine}`;
  const rationale = [
    verdict,
    whyUp.length > 0 ? `Why up: ${whyUp.join("; ")}.` : "",
    whyDown.length > 0 ? `Why down: ${whyDown.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    overallScore,
    confidence,
    recommendedAction,
    directMatchScore: directRoleMatch,
    transferableFitScore: transferableFit,
    learningSignalScore: learningSignal,
    transferableEvidence: normalizedTransferableEvidence,
    hardRequirementStatus,
    dimensionScores: {
      hard_requirements: hardRequirements,
      role_competency: roleCompetency,
      communication,
      execution_reliability: executionReliability,
      work_style_fit: workStyleFit,
      evidence_quality: evidenceQuality,
    },
    riskFlags: Array.from(new Set(riskFlags)),
    rationale,
    evidenceRefs,
    evidenceFingerprint,
    evidenceFloorMet,
    pendingHighSignalPhases: Array.from(new Set(pendingHighSignalPhases)),
    completedHighSignalPhases: Array.from(new Set(completedHighSignalPhases)),
    autopilotAction,
    decisionState,
    hardRejectReason,
    dealBreakerFlags,
    whyUp,
    whyDown,
    jobFamily: family,
  };
}

export const INTERVIEW_CREDIBILITY_FLAG = "Interview credibility is low";

/**
 * A chat review reason that is only promise WORDS the server spotted in the
 * lead's lines (ai-chat-simulation/grading.ts PROMISE_WORDS_REASON_PREFIX;
 * kept import-free here, and scripts/lead_scoring_scenarios.test.mjs checks
 * the two agree). The scorecard shows it and does not hold the card for it.
 */
export function isPromiseWordsOnlyReason(reason: string): boolean {
  return /^Promise words in the lead's own lines that the review did not flag\b/.test(String(reason ?? "").trim());
}

/** The judge returned nothing usable: the application's read in the number is a neutral placeholder. */
export const JUDGE_FAILED_FLAG = "Ava could not read the application; the score is the tests with a neutral read of it";

/**
 * The owner's line for a test the grader could not mark (`graded: false`).
 * It says what is true and what he can do today: there is no re-grade
 * button, and the conversation is on the attempt for him to read.
 */
export function ungradedFlag(phase: string, teamLead = false) {
  return `${testName(phase, teamLead)} was not graded (the grader failed); open the transcript`;
}

/**
 * How much of the four tests a team lead's 0.65 tests weight was built on
 * this job actually has scored: escalated chat 0.35, skills check 0.30,
 * written interview 0.25, typing 0.10 (1.0 with all four). A voice
 * interview, sales practice or portfolio on a lead job counts at its own
 * team-lead blend weight (familyPhaseWeights), and the total never passes 1.
 * buildAvaScorecard gives the tests 0.65 × this, and the judgment the rest.
 */
export function leadTestsCoverage(scores: {
  quizScore?: number | null;
  typingScore?: number | null;
  /** The chat practice's typing score (chatTypingBlendScore): counts as typing's 0.10. */
  chatTypingScore?: number | null;
  chatSimulationScore?: number | null;
  chatInterviewScore?: number | null;
  voiceScore?: number | null;
  salesSimulationScore?: number | null;
  portfolioScore?: number | null;
}) {
  const components = familyPhaseWeights({
    family: "team_lead",
    judgmentScore: 0,
    quizScore: scores.quizScore ?? null,
    chatTypingScore: scores.chatTypingScore ?? null,
    typingTest: { score: scores.typingScore ?? null },
    chatSimulationScore: scores.chatSimulationScore ?? null,
    salesSimulationScore: scores.salesSimulationScore ?? null,
    chatInterviewScore: scores.chatInterviewScore ?? null,
    voiceScore: scores.voiceScore ?? null,
    portfolioScore: scores.portfolioScore ?? null,
  });
  const present = components
    .filter((component) => typeof component.value === "number" && Number.isFinite(component.value))
    .reduce((sum, component) => sum + component.weight, 0);
  return Math.min(1, Math.round(present * 1000) / 1000);
}

/** How a test is named to the owner. */
function testName(phase: string, teamLead: boolean) {
  switch (phase) {
    case "chat simulation":
      return teamLead ? "Escalated chat practice" : "Chat practice";
    case "chat interview":
      return "Written interview";
    case "sales simulation":
      return "Sales practice";
    case "quiz":
      return "Skills check";
    case "typing test":
      return "Typing test";
    case "Ava interview":
      return "Voice interview";
    case "portfolio review":
      return "Portfolio review";
    case "video response":
      return "Video response";
    default:
      return phase.charAt(0).toUpperCase() + phase.slice(1);
  }
}

/**
 * The two short lines that end the rationale: what pushed this applicant up
 * and what pulled them down, each built from a fact the scorecard holds (a
 * test result against its bar, a form answer, the judge's leadership read, a
 * missed skills-check area), never from the job family. Before 2026-10-06
 * every card read "Strong support evidence…" or "Signals are mixed…", so the
 * owner had to open each record to learn why someone ranked where they did.
 */
function buildWhyLines(input: {
  teamLead: boolean;
  leadershipEvidenceScore?: number | null;
  adaptabilityEvidenceScore?: number | null;
  /** The interview's own lead marks under 50, as their "why down" lines. */
  interviewLeadLows?: readonly string[];
  /** The interview contradicts the judge's read: no "Clear evidence" line for it. */
  interviewLeadershipLow?: boolean;
  interviewAdaptabilityLow?: boolean;
  quizScore: number | null;
  quizCorrect?: number | null;
  quizTotal?: number | null;
  quizMissedAreas: string[];
  quizMustPassMissed: string[];
  chatSimulationScore: number | null;
  chatInterviewScore: number | null;
  salesSimulationScore: number | null;
  voiceScore: number | null;
  typedWpm: number | null;
  typingBar: number | null;
  /** The chat practice's typing, only when the job has no typing step (chatTypingForJob). */
  chatTyping?: ChatTypingReading | null;
  formDealBreakers: string[];
  formReviewFlags?: string[];
  verdictFlags: string[];
  credibilityLow?: boolean;
  hardRequirementConflicts: string[];
  ungraded: string[];
  equipmentCheck?: { meetsBars: boolean; below: string[]; deviceKind: string; usingThisComputer: string } | null;
}) {
  const up: string[] = [];
  const down: string[] = [];
  const strong = 75;
  const weak = 60;
  const quizText = (() => {
    if (typeof input.quizScore !== "number") return null;
    if (typeof input.quizCorrect === "number" && typeof input.quizTotal === "number" && input.quizTotal > 0) {
      return `Skills check ${formatCount(input.quizCorrect)}/${formatCount(input.quizTotal)}`;
    }
    return `Skills check ${Math.round(input.quizScore)}%`;
  })();

  // Up.
  if (input.teamLead && !input.interviewLeadershipLow && typeof input.leadershipEvidenceScore === "number" && input.leadershipEvidenceScore >= 70) {
    up.push(`Clear evidence of leading a team (${Math.round(input.leadershipEvidenceScore)}/100)`);
  }
  if (input.teamLead && !input.interviewAdaptabilityLow && typeof input.adaptabilityEvidenceScore === "number" && input.adaptabilityEvidenceScore >= 70) {
    up.push(`Clear example of handling a sudden change (${Math.round(input.adaptabilityEvidenceScore)}/100)`);
  }
  if (quizText && typeof input.quizScore === "number" && input.quizScore >= 80) up.push(quizText);
  const scored: Array<[string, number | null]> = [
    [testName("chat simulation", input.teamLead), input.chatSimulationScore],
    ["Written interview", input.chatInterviewScore],
    ["Sales practice", input.salesSimulationScore],
    ["Voice interview", input.voiceScore],
  ];
  for (const [label, score] of scored) {
    if (typeof score === "number" && score >= strong) up.push(`${label} ${Math.round(score)}/100`);
  }
  const typingKnown = typeof input.typedWpm === "number" && typeof input.typingBar === "number" && input.typingBar > 0;
  if (typingKnown && input.typedWpm! >= input.typingBar!) {
    up.push(`Typed ${Math.round(input.typedWpm!)} WPM (bar ${Math.round(input.typingBar!)})`);
  }
  const chatTyping = input.chatTyping ?? null;
  if (chatTyping && chatTyping.wpm !== null && !chatTyping.speedBelow) {
    up.push(`Typed ${Math.round(chatTyping.wpm)} WPM in the chat practice (bar ${Math.round(chatTyping.minWpm)})`);
  }

  // Down: the owner's own deal-breakers and verdicts first.
  down.push(...input.formDealBreakers);
  down.push(...input.verdictFlags);
  down.push(...(input.formReviewFlags ?? []));
  if (input.credibilityLow) down.push(INTERVIEW_CREDIBILITY_FLAG);
  down.push(...input.hardRequirementConflicts.slice(0, 2));
  if (input.teamLead && typeof input.leadershipEvidenceScore === "number" && input.leadershipEvidenceScore < 50) {
    down.push(`Little evidence of leading a team (${Math.round(input.leadershipEvidenceScore)}/100)`);
  }
  if (input.teamLead && typeof input.adaptabilityEvidenceScore === "number" && input.adaptabilityEvidenceScore < 50) {
    down.push(`Little evidence of handling a sudden change (${Math.round(input.adaptabilityEvidenceScore)}/100)`);
  }
  if (input.teamLead) down.push(...(input.interviewLeadLows ?? []));
  down.push(...input.quizMustPassMissed.map(mustPassQuizFlag));
  const otherMissed = input.quizMissedAreas.filter((area) => !input.quizMustPassMissed.includes(area));
  if (otherMissed.length > 0) down.push(`Missed on the skills check: ${otherMissed.map(quizAreaLabel).join(", ")}`);
  if (quizText && typeof input.quizScore === "number" && input.quizScore < weak) down.push(quizText);
  for (const [label, score] of scored) {
    if (typeof score === "number" && score < weak) down.push(`${label} ${Math.round(score)}/100`);
  }
  if (typingKnown && input.typedWpm! < input.typingBar!) {
    down.push(`Typed ${Math.round(input.typedWpm!)} WPM; the job asks for ${Math.round(input.typingBar!)}`);
  }
  const chatSpeedDown = chatTypingSpeedFlag(chatTyping);
  const chatReplyDown = chatReplyTimeFlag(chatTyping);
  if (chatSpeedDown) down.push(chatSpeedDown);
  if (chatReplyDown) down.push(chatReplyDown);
  for (const phase of input.ungraded) down.push(`${testName(phase, input.teamLead)} was not graded (the grader failed)`);
  if (input.equipmentCheck && !input.equipmentCheck.meetsBars) {
    down.push(`Connection below the job's bar (${input.equipmentCheck.below.join(", ") || "measured"})`);
  }
  if (input.equipmentCheck && (input.equipmentCheck.deviceKind === "phone" || input.equipmentCheck.deviceKind === "tablet")) {
    down.push(`Connection check run on a ${input.equipmentCheck.deviceKind}`);
  }

  // Short enough to read on a phone: a judge's long quote is cut, never a fact.
  const short = (item: string) => (item.length > 140 ? `${item.slice(0, 137).trimEnd()}…` : item);
  const tidy = (items: string[]) =>
    Array.from(new Set(items.map((item) => short(item.trim().replace(/\.$/, ""))).filter(Boolean))).slice(0, 6);
  return { whyUp: tidy(up), whyDown: tidy(down) };
}

function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function resolveAutopilotAction(
  score: number | null,
  passingScore: number,
  scorecard?: Pick<AvaScorecard, "autopilotAction" | "decisionState" | "recommendedAction"> | null,
): AutopilotAction {
  if (scorecard?.decisionState === "needs_more_evidence") {
    return "defer";
  }

  if (scorecard?.autopilotAction) {
    return scorecard.autopilotAction;
  }

  if (score !== null) {
    return score >= passingScore ? "advance" : "reject";
  }

  if (scorecard?.recommendedAction === "advance") {
    return "advance";
  }

  return "reject";
}
