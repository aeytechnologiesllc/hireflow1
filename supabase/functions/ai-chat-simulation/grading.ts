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

/**
 * The same text, rebuilt from the result already on file
 * (notes.chatSimulationResult, which carries score, empathy and
 * problemSolving), for the answer to a send that was already recorded. That
 * answer used to echo the applications.phase_ai_analysis column as it stood,
 * and by then trigger-ava-analysis has usually replaced it with the hiring
 * team's own summary (a decline note included). Null when the stored result
 * does not carry the three scores.
 */
export function phaseAiAnalysisFromStoredResult(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;
  const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!isScore(r.score) || !isScore(r.empathy) || !isScore(r.problemSolving)) return null;
  return buildPhaseAiAnalysis({ score: r.score, empathy: r.empathy, problemSolving: r.problemSolving, strengths: [], improvements: [] });
}

/** The transcript shape the page sends and the record stores: "user" is the
 *  applicant (the support agent), "assistant" the simulated customer. */
export interface SimulationChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** The message list ai-chat-simulation sends the model, built the one way
 *  it always has been, whether the transcript came from the request (a page
 *  on the previous build) or from the stored turns: the system prompt, every
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
