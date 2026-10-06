// A relative path with its extension (tsconfig allows it) rather than the
// "@/" alias: plain-Node tests import this file directly
// (scripts/candidate_journey_next_step.test.mjs), and Node resolves no alias.
import {
  DECISION_STAGE_ID,
  positionFor,
  type CandidateJourneyStep,
} from "./candidateJourney.ts";

/**
 * journeyProgress.ts — has the candidate DONE the step they are standing on,
 * and what may they do next?
 *
 * The employer's "Let them take the next test" control (2026-10-04) must only
 * appear when a candidate is parked: their current step's result is on file
 * and Ava, recommending against them, has not opened the next one. While a
 * step is still theirs to take, the control stays hidden — otherwise it would
 * be a way to skip a test nobody took.
 *
 * The candidate's own screens read the same rule (2026-10-05): the overview's
 * "YOUR STEPS" list, the card a finished step's URL shows, and the screen that
 * appears the moment a step is sent. They used to carry two inline copies of
 * it in CandidateApplicationDetail.tsx and judged a step by its position alone,
 * so a written interview with its result on file still read "Up next" with a
 * "Begin Interview" button. docs/TRUSTED-RESULTS.md lists where each result
 * lands.
 *
 * Client-only on purpose: src/lib/candidateJourney.ts is mirrored into the edge
 * functions and guarded for parity, and nothing below is a server decision.
 */
export function stepHasResult(
  notes: Record<string, unknown>,
  voiceInterviewResult: unknown,
  step: Pick<CandidateJourneyStep, "id" | "type">,
): boolean {
  const record = notes[step.id] as { completedAt?: unknown; completed?: unknown; videoUrl?: unknown } | undefined;
  switch (step.type) {
    case "application": {
      const answers = notes.applicationAnswers;
      return Array.isArray(answers) && answers.length > 0;
    }
    case "typing_test":
      return !!notes.typingTestResult;
    // Written by connection-test's `record` op alone (docs/EQUIPMENT-CHECK.md
    // §5). Explicit, not the default branch: the default reads notes[step.id],
    // which only exists when the server also writes the legacy entry.
    case "equipment_check":
      return !!notes.equipmentCheckResult;
    case "chat_simulation":
      return !!notes.chatSimulationResult;
    case "chat_interview":
      return !!notes.chatInterviewResult;
    case "sales_simulation":
      return !!notes.salesSimulationResult;
    case "quiz":
      return !!(record?.completedAt || notes.quizResult);
    case "video_intro":
    case "video_message":
      return !!notes.videoIntroUrl || !!(record?.videoUrl || record?.completed);
    case "portfolio_upload":
      return !!notes.portfolioResult;
    case "voice_interview":
      return !!voiceInterviewResult;
    case "decision":
      return true;
    default:
      return !!notes[step.id];
  }
}

/* ------------------------------------------------------------- step routes */

/**
 * The one step-type → route-segment map. It used to be copied three times
 * (CandidateApplicationDetail's handleStartPhase, and the "Start next step"
 * handlers in QuizPhase and TypingTestPhase, plus VideoIntroPhase), and the
 * copies disagreed about the synthetic "application" step. App.tsx registers
 * one `/applications/:id/<segment>/:stepId` route per entry;
 * scripts/candidate_next_step.test.mjs fails if a segment here has no route.
 */
export const STEP_ROUTE_SEGMENTS: Readonly<Record<string, string>> = {
  application: "application",
  quiz: "quiz",
  equipment_check: "connection",
  typing_test: "typing-test",
  video_intro: "video-intro",
  video_message: "video-intro",
  chat_simulation: "chat-simulation",
  chat_interview: "chat-interview",
  sales_simulation: "sales-simulation",
  voice_interview: "voice-interview",
  portfolio_upload: "portfolio",
};

/** Where a step lives, or null for anything a candidate cannot open (the
 *  closing Decision stage, or a step type this build has no screen for). */
export function stepRoute(
  applicationId: string,
  step: Pick<CandidateJourneyStep, "id" | "type">,
): string | null {
  const segment = STEP_ROUTE_SEGMENTS[step.type];
  if (!segment || !applicationId || !step.id) return null;
  return `/applications/${applicationId}/${segment}/${step.id}`;
}

/**
 * True when two steps open the same page (two quizzes, two typing tests, a
 * video intro and a video message). React Router keeps that page, and the
 * CandidateStepGate around it, mounted across a navigation between them, so
 * the second step would inherit the first one's finished screen. "Start
 * <next step>" loads such a step fresh instead of navigating inside the app.
 */
export function opensSameScreen(
  a: Pick<CandidateJourneyStep, "type">,
  b: Pick<CandidateJourneyStep, "type">,
): boolean {
  const left = STEP_ROUTE_SEGMENTS[a.type];
  return !!left && left === STEP_ROUTE_SEGMENTS[b.type];
}

/* ------------------------------------------------- where the candidate is */

export interface JourneyApplicationLike {
  phase: string | null | undefined;
  status: string | null | undefined;
  /** Parsed applications.notes. */
  notes: Record<string, unknown>;
  voiceInterviewResult?: unknown;
}

/**
 * A step the hiring team has handed back to the candidate: the step pages
 * treat `status = "pending"` with `phase` on that step as a retake (their
 * "reconsidered" branch), even though the old result is still in notes.
 * Not for the application form: submitting it is what sets "pending", while
 * phase still says "application" until the next step is opened.
 */
export function isRetakeOpen(
  app: Pick<JourneyApplicationLike, "phase" | "status">,
  step: Pick<CandidateJourneyStep, "id" | "type">,
): boolean {
  return step.type !== "application" && app.status === "pending" && app.phase === step.id;
}

/** Done = its result is on file and nobody has handed it back for a retake. */
export function stepIsDone(app: JourneyApplicationLike, step: Pick<CandidateJourneyStep, "id" | "type">): boolean {
  if (isRetakeOpen(app, step)) return false;
  return stepHasResult(app.notes, app.voiceInterviewResult, step);
}

export type CandidateStanding =
  /** The step at `phase` is open (the step gate lets them in) and has no result yet. */
  | { kind: "take"; index: number; step: CandidateJourneyStep }
  /** The step at `phase` is done and a later step exists that has not been opened yet. */
  | { kind: "waiting"; index: number; step: CandidateJourneyStep }
  /** Nothing is left for the candidate to do — every step is behind them. */
  | { kind: "finished"; index: number }
  /** A decision has been made (rejected or hired). */
  | { kind: "closed"; index: number; outcome: "rejected" | "hired" };

/**
 * The one answer to "what does this candidate see next?", read from the
 * application's DATA, not from position alone.
 *
 * Only ever offers the step at `phase` — the one CandidateStepGate and the
 * server's step_not_reached check both allow — never phase + 1. A step whose
 * result is on file is done even when `phase` has not moved past it; when it
 * was the last real step, the candidate has finished every step.
 */
export function whereCandidateStands(
  steps: readonly CandidateJourneyStep[],
  app: JourneyApplicationLike,
): CandidateStanding {
  const position = positionFor(steps, { phase: app.phase, status: app.status });
  const foundDecision = steps.findIndex((s) => s.id === DECISION_STAGE_ID);
  const decisionIndex = foundDecision === -1 ? Math.max(steps.length - 1, 0) : foundDecision;

  if (app.status === "rejected") return { kind: "closed", index: position.index, outcome: "rejected" };
  if (app.status === "hired") return { kind: "closed", index: decisionIndex, outcome: "hired" };

  const current = position.current;
  if (!current || current.id === DECISION_STAGE_ID) return { kind: "finished", index: decisionIndex };

  if (!stepIsDone(app, current)) return { kind: "take", index: position.index, step: current };

  const laterRealStep = steps
    .slice(position.index + 1)
    .some((s) => s.id !== DECISION_STAGE_ID);
  if (!laterRealStep) return { kind: "finished", index: decisionIndex };

  return { kind: "waiting", index: position.index, step: current };
}

/* -------------------------------------------- after a step has been sent */

export type StepAdvanceOutcome =
  /** `phase` has not moved past the step just sent. */
  | { kind: "pending" }
  /** `phase` now sits on a later real step — the gate has opened it. */
  | { kind: "next"; step: CandidateJourneyStep }
  /** `phase` is past every real step (the closing Decision stage). */
  | { kind: "finished" }
  /** The application was rejected. */
  | { kind: "closed" };

/**
 * Has the step the candidate just sent been left behind, and where to?
 *
 * Read off the application row (phase/status), never off the trigger's
 * response alone — the server moves `phase` when it opens the next step, and
 * a candidate may only be offered the step the row now points at.
 * Older rows close a journey with phase "review"; positionFor resolves that,
 * like "decision", to the closing stage.
 */
export function advanceAfterStep(
  steps: readonly CandidateJourneyStep[],
  completedStepId: string,
  row: { phase?: string | null; status?: string | null },
): StepAdvanceOutcome {
  if (row.status === "rejected") return { kind: "closed" };
  const doneIndex = steps.findIndex((s) => s.id === completedStepId);
  if (doneIndex === -1) return { kind: "pending" };
  const now = positionFor(steps, { phase: row.phase ?? null, status: row.status ?? null });
  if (now.index <= doneIndex) return { kind: "pending" };
  if (now.current.id === DECISION_STAGE_ID) return { kind: "finished" };
  return { kind: "next", step: now.current };
}

/** Phase values that mean "past every real step", from the newer server
 *  ("decision") and the older one ("review"). */
const CLOSING_PHASES = new Set([DECISION_STAGE_ID, "review"]);

/** trigger-ava-analysis decisions that mean it has finished with this send
 *  and deliberately opened nothing new: the next step waits for a person, or
 *  the row had already moved on. */
export const SERVER_HELD_DECISIONS: ReadonlySet<string> = new Set([
  "recommend_decline",
  "needs_employer_approval",
  "stale",
]);

/**
 * Did trigger-ava-analysis give a final answer for this send? Only then is
 * asking it again pointless. An error, no reply, "not_ready" (the step's
 * result was not visible to it yet) or a decision this build does not know
 * is not final: nothing moves the candidate on unless the server is asked
 * again, so the page asks once more. A repeat is harmless — the server moves
 * a candidate only off the step they are on, and answers "advanced" with the
 * same next step if the first request already did.
 */
export function serverReplyIsFinal(reply: { data?: unknown; error?: unknown } | null | undefined): boolean {
  const decision = (reply?.data as { decision?: unknown } | null | undefined)?.decision;
  if (typeof decision !== "string") return false;
  return decision === "advanced" || decision === "rejected" || SERVER_HELD_DECISIONS.has(decision);
}

/**
 * Reads trigger-ava-analysis's reply for the move it reports. Only a reply
 * that says "advanced" AND names a step this journey knows (or the closing
 * stage) counts; anything else returns "pending" so the caller keeps watching
 * the row instead of trusting a guess. Scores in the reply are ignored —
 * a candidate is never shown one.
 */
export function advanceFromServerReply(
  steps: readonly CandidateJourneyStep[],
  completedStepId: string,
  reply: unknown,
): StepAdvanceOutcome {
  if (!reply || typeof reply !== "object") return { kind: "pending" };
  const { decision, nextPhaseId } = reply as { decision?: unknown; nextPhaseId?: unknown };
  if (decision !== "advanced" || typeof nextPhaseId !== "string" || !nextPhaseId) return { kind: "pending" };
  const known = steps.some((s) => s.id === nextPhaseId) || CLOSING_PHASES.has(nextPhaseId);
  if (!known) return { kind: "pending" };
  return advanceAfterStep(steps, completedStepId, { phase: nextPhaseId, status: "reviewing" });
}
