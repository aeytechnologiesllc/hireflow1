import { useMemo } from "react";
import { buildCandidateJourney, positionFor } from "@/lib/candidateJourney";

interface JobLike {
  workflow_steps?: unknown;
  /** Its own column, not part of workflow_steps. A caller that forgets to
   *  SELECT it quotes a smaller "of N" than the rest of the app. */
  quiz_questions?: unknown;
}

export interface JourneyPosition {
  index: number;
  total: number;
  title: string;
  /** For the progress bar, so no screen re-derives it slightly differently. */
  progressPct: number;
}

/**
 * Where the candidate is: "Step X of N".
 *
 * Nine phase screens each carried their own copy of this memo — identical but
 * for the `phase` argument — and the two that never got one (portfolio and
 * sales simulation) simply showed the candidate nothing, so mid-journey they
 * could not tell how much was left. Nine copies is nine chances to drift, and
 * a position that disagrees between screens is worse than none: it makes the
 * whole journey look untrustworthy.
 *
 * `buildCandidateJourney` and `positionFor` remain the source of truth for what
 * the steps ARE; this is the one place that asks them on a screen's behalf.
 */
export function useJourneyPosition(
  job: JobLike | null | undefined,
  query: { stepId?: string; phase?: string | null; status?: string | null },
): JourneyPosition {
  const workflowSteps = job?.workflow_steps;
  const quizQuestions = job?.quiz_questions;
  const { stepId, phase, status } = query;

  return useMemo(() => {
    const steps = buildCandidateJourney(
      (workflowSteps || []) as Array<{ id: string; type: string; title?: string }>,
      { hasQuiz: Array.isArray(quizQuestions) && quizQuestions.length > 0 },
    );
    const { index, total, current } = positionFor(steps, {
      stepId,
      phase: phase ?? undefined,
      status: status ?? undefined,
    });
    return {
      index,
      total,
      title: current.title,
      progressPct: Math.round(((index + 1) / Math.max(total, 1)) * 100),
    };
    // Destructured above so a fresh `query` object each render does not
    // recompute this on every keystroke.
  }, [workflowSteps, quizQuestions, stepId, phase, status]);
}
