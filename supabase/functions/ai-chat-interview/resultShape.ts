/**
 * Pure, import-free result-shape builders for the chat interview's trusted
 * server-side submit (see docs/TRUSTED-RESULTS.md).
 *
 * Before this conversion, src/pages/ChatInterviewPhase.tsx built
 * `notes.chatInterviewResult` itself, in the browser, in two different
 * places that produced two different shapes for the SAME notes key:
 *
 *   - the AI-detected-"closing message" auto-end path (the effect gated on
 *     `autoEndTriggered`) wrote
 *     `{ messages, duration, questionCount, violations, evaluation }` —
 *     `duration` a "M:SS" string, `evaluation` the raw API response nested
 *     as-is.
 *   - the explicit "End Interview" button path (`handleSubmit`) wrote
 *     `{ messageCount, duration, score, strengths, concerns,
 *     recommendation, completed, antiCheatSummary }` — `duration` a number
 *     of seconds, the evaluation's fields flattened onto the result
 *     directly instead of nested. Since 2026-10-06 it also carries the
 *     grader's `summary`, `credibilityRating` and `inconsistencies` flat
 *     (REVIEW_RESULT_KEYS), which the auto-end shape always had nested.
 *
 * Both shapes are real, currently-read shapes (trigger-ava-analysis and
 * CondensedAIAnalysis.tsx both fall back across `.score`, `.evaluation?.score`,
 * etc. specifically because of this split) — converting this phase must
 * keep producing BOTH, selected by which entry point is submitting, not
 * invent a single new merged shape. `buildChatInterviewResult` below
 * reproduces each byte-for-byte from the same inputs the client used to
 * compute locally; only `evaluation` itself now always comes from a
 * server-side OpenAI call the caller cannot see or edit, never a
 * client-relayed value.
 *
 * Kept free of every import (no Deno std, no supabase-js) so it runs under
 * plain Node too — see scripts/chat_interview_result_shape.test.mjs.
 */

export type ChatInterviewSubmitPath = "auto_end" | "manual";

export interface EvaluationResult {
  /** null only when the interview was not graded (`graded: false`). */
  score?: number | null;
  strengths?: string[];
  concerns?: string[];
  recommendation?: string | null;
  summary?: string | null;
  /** false when the grader's model call failed or its answer could not be
   *  read: nobody marked these answers. Absent means graded. */
  graded?: boolean;
  /** A team lead job only: each 0-100 from the lead plan
   *  (interviewContext.ts), null for a MUST COVER topic never asked. */
  leadership?: number | null;
  adaptability?: number | null;
  workingLead?: number | null;
  writtenEnglish?: number;
  /** The candidate's own words behind each lead mark (checked against their answers). */
  leadEvidence?: Record<string, string>;
  /** MUST COVER topics the interview never reached. */
  mustCoverMissing?: string[];
  /** A lead interview that ended before its plan was covered: graded, but flagged. */
  incomplete?: true;
  [key: string]: unknown;
}

/**
 * Nobody marked this interview (the model call failed, or its answer could
 * not be read). It is NOT a 70 / "Maybe": no score, no recommendation, and
 * the answers are kept on the result for re-grading.
 */
export function ungradedInterviewEvaluation(reason: string): EvaluationResult {
  return {
    graded: false,
    score: null,
    strengths: [],
    concerns: [],
    recommendation: null,
    summary: null,
    gradingError: reason,
  };
}

const LEAD_RESULT_KEYS = ["leadership", "adaptability", "workingLead", "writtenEnglish", "leadEvidence", "mustCoverMissing", "incomplete"] as const;

/**
 * The grader's review of the interview, copied flat onto the End-button
 * shape too (2026-10-06). The auto-end shape always carried them, nested
 * under .evaluation; the End-button shape dropped them, so the same "Low"
 * credibility interview read "review" with the flag one way and "advance"
 * with no flag the other, and the judge never saw its summary or
 * inconsistencies. A lead who stops early does it with End (the auto-end is
 * refused under five answers). Every reader already accepts them flat
 * (_shared/autopilot.ts readChatInterviewResult).
 */
const REVIEW_RESULT_KEYS = ["summary", "credibilityRating", "inconsistencies"] as const;

export interface TranscriptMessageForNotes {
  role: string;
  content: string;
  timestamp?: string;
}

export interface AntiCheatViolationForNotes {
  type: string;
  timestamp: string;
  details: string;
}

export interface BuildChatInterviewResultInput {
  path: ChatInterviewSubmitPath;
  messages: TranscriptMessageForNotes[];
  duration: string | number;
  questionCount: number;
  violations: AntiCheatViolationForNotes[];
  evaluation: EvaluationResult;
}

function buildAntiCheatSummary(violations: AntiCheatViolationForNotes[]) {
  const tabSwitches = violations.filter((v) => v.type === "tab_switch").length;
  const copyAttempts = violations.filter((v) => v.type === "copy_attempt").length;
  const pasteAttempts = violations.filter((v) => v.type === "paste_attempt").length;
  return {
    hasViolations: violations.length > 0,
    violationCount: violations.length,
    tabSwitches,
    copyPasteAttempts: copyAttempts + pasteAttempts,
  };
}

/**
 * Builds the exact `notes.chatInterviewResult` value for one submission,
 * matching whichever of the two client shapes described above corresponds
 * to `input.path`.
 */
export function buildChatInterviewResult(input: BuildChatInterviewResultInput): Record<string, unknown> {
  const ungraded = input.evaluation?.graded === false;
  if (input.path === "auto_end") {
    return {
      messages: input.messages,
      duration: input.duration,
      questionCount: input.questionCount,
      violations: input.violations.length > 0 ? input.violations : undefined,
      evaluation: input.evaluation,
      // Said on the result itself too (readers check flat or nested).
      ...(ungraded ? { graded: false } : {}),
      ...(!ungraded && input.evaluation?.incomplete === true ? { incomplete: true } : {}),
    };
  }

  if (ungraded) {
    // No score and no recommendation: nobody marked it. The answers are
    // kept here (this shape has no transcript otherwise) for re-grading.
    return {
      messageCount: input.messages.length,
      duration: input.duration,
      score: null,
      strengths: [],
      concerns: [],
      recommendation: null,
      completed: true,
      antiCheatSummary: buildAntiCheatSummary(input.violations),
      graded: false,
      messages: input.messages,
    };
  }

  const result: Record<string, unknown> = {
    messageCount: input.messages.length,
    duration: input.duration,
    score: input.evaluation?.score,
    strengths: input.evaluation?.strengths,
    concerns: input.evaluation?.concerns,
    recommendation: input.evaluation?.recommendation,
    completed: true,
    antiCheatSummary: buildAntiCheatSummary(input.violations),
  };
  // The grader's review, and a team lead job's own marks, ride along only
  // when the grader gave them.
  for (const key of [...REVIEW_RESULT_KEYS, ...LEAD_RESULT_KEYS]) {
    if (input.evaluation?.[key] !== undefined) result[key] = input.evaluation[key];
  }
  return result;
}

/**
 * `applications.phase_ai_analysis` text — matches each entry point's own
 * client-side computation exactly (auto-end: :271 in the old code;
 * handleSubmit: :647-648).
 */
export function buildPhaseAiAnalysis(path: ChatInterviewSubmitPath, evaluation: EvaluationResult): string | null {
  if (evaluation?.graded === false) {
    return "Interview: sent, not graded yet (the check failed). The answers are kept for re-grading.";
  }
  // A lead interview that ended before its plan was covered says so.
  const missing = Array.isArray(evaluation?.mustCoverMissing) ? evaluation.mustCoverMissing : [];
  const incomplete = evaluation?.incomplete === true
    ? `Ended before the plan was covered${missing.length > 0 ? ` (not asked: ${missing.join(", ")})` : ""}.`
    : null;
  if (path === "auto_end") {
    const summary = evaluation?.summary || null;
    return incomplete ? [summary, incomplete].filter(Boolean).join(" ") : summary;
  }
  const text = `Interview: ${evaluation?.recommendation} (${evaluation?.score}%). ${evaluation?.summary}`;
  return incomplete ? `${text} ${incomplete}` : text;
}

/**
 * How many times the candidate answered: their own non-empty messages. The
 * interview can be ended at any time once this is at least 1 (there is
 * nothing to grade before that).
 */
export function candidateAnswerCount(messages: ReadonlyArray<{ role: string; content: string }>): number {
  return messages.filter((m) => m.role === "user" && typeof m.content === "string" && m.content.trim().length > 0).length;
}
