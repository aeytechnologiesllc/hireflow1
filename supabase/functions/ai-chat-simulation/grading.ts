/**
 * Pure, deterministic pieces of the chat-simulation "evaluate" write — split
 * out of index.ts so they're testable under plain Node (scripts/
 * chat_simulation_grading.test.mjs) as well as Deno. Zero imports, on
 * purpose, same reasoning as _shared/trustedResults.ts's own module doc
 * comment: no `https://` URL specifiers, nothing Deno-only, so this file's
 * exports run unmodified under either runtime.
 *
 * Everything here is the SAME shape ChatSimulationPhase.tsx's own client
 * code used to build locally (before this phase moved server-side) — see
 * the per-field comments below and docs/TRUSTED-RESULTS.md's result_key
 * table. The one and only thing this module does NOT decide is the score
 * itself: `evaluation` always comes in as a parameter, computed by the
 * caller (index.ts, via callOpenAIJson) from the transcript, server-side —
 * never trusted from a request body.
 */

export interface AntiCheatViolation {
  type: "tab_switch" | "copy_attempt" | "paste_attempt" | "screenshot_attempt" | "right_click";
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
  score: number;
  empathy: number;
  problemSolving: number;
  strengths: string[];
  improvements: string[];
  [key: string]: unknown;
}

export interface ChatSimulationResult {
  scenario: string;
  messageCount: number;
  score: number;
  empathy: number;
  problemSolving: number;
  strengths: string[];
  improvements: string[];
  completed: true;
  antiCheatSummary: {
    hasViolations: boolean;
    violationCount: number;
    tabSwitches: number;
    copyPasteAttempts: number;
  };
}

/** The exact `notes.chatSimulationResult` shape ChatSimulationPhase.tsx has
 *  always written (see docs/TRUSTED-RESULTS.md's result_key table) — every
 *  existing reader (trigger-ava-analysis, the cockpit, CondensedAIAnalysis,
 *  ai-shortlist, ai-chat-interview, generate-applicant-dossier,
 *  ava-voice-session/ava-voice-tools, ai-generate-performance-report) keeps
 *  reading this shape unchanged. */
export function buildChatSimulationResult(input: {
  scenario: string;
  messageCount: number;
  evaluation: ChatSimulationEvaluation;
  violations: AntiCheatViolation[];
}): ChatSimulationResult {
  const antiCheatLog = buildAntiCheatLog(input.violations);
  return {
    scenario: input.scenario,
    messageCount: input.messageCount,
    score: input.evaluation.score,
    empathy: input.evaluation.empathy,
    problemSolving: input.evaluation.problemSolving,
    strengths: input.evaluation.strengths,
    improvements: input.evaluation.improvements,
    completed: true,
    antiCheatSummary: {
      hasViolations: input.violations.length > 0,
      violationCount: input.violations.length,
      tabSwitches: antiCheatLog.tabSwitches,
      copyPasteAttempts: antiCheatLog.copyAttempts + antiCheatLog.pasteAttempts,
    },
  };
}

/** The exact `phase_ai_analysis` text ChatSimulationPhase.tsx has always
 *  written alongside notes — a display-only summary column recordStepResult
 *  itself doesn't own. */
export function buildPhaseAiAnalysis(evaluation: ChatSimulationEvaluation): string {
  return `Chat simulation: ${evaluation.score}%. Empathy: ${evaluation.empathy}%, Problem-solving: ${evaluation.problemSolving}%.`;
}
