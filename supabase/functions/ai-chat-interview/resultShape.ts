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
 *     directly instead of nested.
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
  score?: number;
  strengths?: string[];
  concerns?: string[];
  recommendation?: string;
  summary?: string;
  [key: string]: unknown;
}

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
  if (input.path === "auto_end") {
    return {
      messages: input.messages,
      duration: input.duration,
      questionCount: input.questionCount,
      violations: input.violations.length > 0 ? input.violations : undefined,
      evaluation: input.evaluation,
    };
  }

  return {
    messageCount: input.messages.length,
    duration: input.duration,
    score: input.evaluation?.score,
    strengths: input.evaluation?.strengths,
    concerns: input.evaluation?.concerns,
    recommendation: input.evaluation?.recommendation,
    completed: true,
    antiCheatSummary: buildAntiCheatSummary(input.violations),
  };
}

/**
 * `applications.phase_ai_analysis` text — matches each entry point's own
 * client-side computation exactly (auto-end: :271 in the old code;
 * handleSubmit: :647-648).
 */
export function buildPhaseAiAnalysis(path: ChatInterviewSubmitPath, evaluation: EvaluationResult): string | null {
  if (path === "auto_end") {
    return evaluation?.summary || null;
  }
  return `Interview: ${evaluation?.recommendation} (${evaluation?.score}%). ${evaluation?.summary}`;
}
