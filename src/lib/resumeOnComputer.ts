/**
 * resumeOnComputer.ts — the promise "Continue on your computer" makes
 * (docs/COMPUTER-ONLY-TESTS.md): on the computer, go to
 * <site>/applications, sign in with the same email, and you are taken
 * straight to the step that was waiting for a computer.
 *
 * The applications page keeps it (src/pages/Applications.tsx): when it is
 * opened fresh by its address, or arrived at straight from signing in, on a
 * computer, and exactly ONE application has a step waiting for a computer,
 * it opens that step. Opened from inside the app (the menu, "Back to your
 * applications"), it is the list as always, so nobody is bounced away from
 * a page they asked for. With two or more waiting it is the list too, each
 * card's button opening its own step.
 *
 * Relative imports with extensions, so plain Node loads this file for
 * scripts/computer_only_client.test.mjs.
 */
import { buildCandidateJourney, type CandidateJourneyStep, type WorkflowStepLike } from "./candidateJourney.ts";
import { stepNeedsComputer } from "./deviceGate.ts";
import { stepRoute, whereCandidateStands } from "./journeyProgress.ts";
import { parseApplicationNotes } from "../utils/applicationNotes.ts";

/** The parts of an application row (`select("*, jobs(*)")`) the decision reads. */
export interface ResumeApplicationLike {
  id?: string | null;
  phase?: string | null;
  status?: string | null;
  notes?: unknown;
  voice_interview_result?: unknown;
  jobs?: { workflow_steps?: unknown; quiz_questions?: unknown } | null;
}

export interface StepWaitingOnComputer {
  applicationId: string;
  step: CandidateJourneyStep;
  /** The step's own address (stepRoute). */
  route: string;
}

/**
 * Pure: the one step, across all of a candidate's applications, that is
 * theirs to take now (whereCandidateStands: "take") AND that the
 * computer-only rule puts on a computer (stepNeedsComputer). Null when there
 * is none, or more than one (the list decides then). A closed application
 * (rejected, hired) never counts.
 */
export function stepWaitingOnComputer(
  applications: readonly (ResumeApplicationLike | null | undefined)[] | null | undefined,
): StepWaitingOnComputer | null {
  const waiting: StepWaitingOnComputer[] = [];
  for (const app of Array.isArray(applications) ? applications : []) {
    if (!app || typeof app.id !== "string" || !app.id) continue;
    if (app.status === "rejected" || app.status === "hired") continue;
    const workflowSteps = Array.isArray(app.jobs?.workflow_steps) ? (app.jobs!.workflow_steps as WorkflowStepLike[]) : [];
    const quiz = app.jobs?.quiz_questions;
    const steps = buildCandidateJourney(workflowSteps, { hasQuiz: Array.isArray(quiz) && quiz.length > 0 });
    const standing = whereCandidateStands(steps, {
      phase: app.phase ?? null,
      status: app.status ?? null,
      notes: parseApplicationNotes(app.notes) as Record<string, unknown>,
      voiceInterviewResult: app.voice_interview_result,
    });
    if (standing.kind !== "take" || !stepNeedsComputer(steps, standing.step.id)) continue;
    const route = stepRoute(app.id, standing.step);
    if (route) waiting.push({ applicationId: app.id, step: standing.step, route });
  }
  return waiting.length === 1 ? waiting[0] : null;
}

/** The navigation state the sign-in screens send a person on with (CandidateAuth, AuthCallback). */
export const AFTER_SIGN_IN_STATE: Readonly<{ afterSignIn: true }> = Object.freeze({ afterSignIn: true });

/** Pure: did this page arrive straight from signing in? */
export function arrivedFromSignIn(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { afterSignIn?: unknown }).afterSignIn === true;
}

/**
 * Pure: is this a fresh arrival at the applications page, the only kind that
 * may be forwarded? React Router gives the first page of a load the key
 * "default" (typed, bookmarked, a link from an email); a page reached inside
 * the app, or reloaded after one, carries its own key.
 */
export function isFreshArrival(location: { key?: string | null; state?: unknown }): boolean {
  return location.key === "default" || arrivedFromSignIn(location.state);
}
