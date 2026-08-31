/**
 * candidateJourney.ts — single source of truth for "where is this candidate
 * in their application, honestly."
 *
 * The candidate's journey is exactly the job's own configured steps — their
 * application, a quiz stage if this job has one, and whatever active steps
 * (typing test, video intro, chat/sales simulation, voice interview,
 * portfolio) the employer configured, in the order they configured them —
 * plus one honest closing stage: the hiring team deciding. Nothing else is
 * invented. No screen pads the count with steps the candidate never
 * performs — a standalone "Review" leg, an "Interview" leg, a "Hired" leg —
 * those aren't things the candidate does, they're what happens after their
 * part is done, and that's exactly what the trailing "Decision" stage
 * honestly represents.
 *
 * Every candidate screen that shows "Step X of N" (or needs to know what
 * comes next) should build its steps here and resolve its position here, so
 * two screens looking at the same application always agree — N is derived
 * from the job's real configuration, never padded.
 */

/** A workflow step as read off `jobs.workflow_steps` (or synthesized for
 *  application/quiz, which live on their own columns — `application_questions`
 *  and `quiz_questions` — not in that array; see jobFromFlow.ts). */
export interface WorkflowStepLike {
  id: string;
  type: string;
  title?: string | null;
}

/** One stage in the candidate-facing journey — always has a real, non-empty title. */
export interface CandidateJourneyStep {
  id: string;
  type: string;
  title: string;
}

export interface BuildCandidateJourneyOptions {
  /** Does this job have a quiz stage? Quiz config lives on `jobs.quiz_questions`,
   *  not in `workflow_steps`, so callers pass this in (`quiz_questions?.length > 0`)
   *  rather than it being inferable from `workflowSteps` alone. Defaults to false. */
  hasQuiz?: boolean;
}

/** The id (and type) of the trailing synthetic stage every journey ends on. */
export const DECISION_STAGE_ID = "decision";

/** Warm, human titles per step type — used only when a step carries no title
 *  of its own (or for the stages that never have a DB title of their own:
 *  application, quiz, decision). */
const FALLBACK_TITLES: Record<string, string> = {
  application: "Application",
  quiz: "Skills check",
  typing_test: "Typing test",
  video_intro: "Video intro",
  video_message: "Video intro",
  chat_simulation: "Chat simulation",
  chat_interview: "Chat interview",
  sales_simulation: "Sales simulation",
  voice_interview: "Voice interview",
  portfolio_upload: "Portfolio",
  [DECISION_STAGE_ID]: "Decision",
};

/** Candidates must never see that a machine is involved — no "Ava", no "AI".
 *  Employers name their own steps, and the step picker itself used to offer
 *  "Ava Interview" as a default, so that string is sitting in real jobs today
 *  and lands straight in the candidate's own journey header ("Step 4 of 5 —
 *  Ava Interview"). Sanitising here repairs those existing jobs at render
 *  time, with no migration, and catches anything an employer types later. */
const MACHINE_WORDS = /\b(ava|a\.?i\.?|artificial intelligence|bot|automated|algorithm)\b/i;

function titleFor(type: string, given?: string | null): string {
  const trimmed = given?.trim();
  if (trimmed && !MACHINE_WORDS.test(trimmed)) return trimmed;
  return FALLBACK_TITLES[type] || type;
}

/**
 * Builds the candidate's real journey: their application, a quiz stage if
 * this job has one, then every active workflow step the employer configured
 * — in the order they configured it, never reordered or moved around a
 * synthetic "review" gap — and finally one honest closing stage, "Decision".
 * That's it. N is however many of those exist; nothing pads it.
 */
export function buildCandidateJourney(
  workflowSteps: readonly WorkflowStepLike[] | null | undefined,
  opts: BuildCandidateJourneyOptions = {},
): CandidateJourneyStep[] {
  const steps: CandidateJourneyStep[] = [
    { id: "application", type: "application", title: titleFor("application") },
  ];

  if (opts.hasQuiz) {
    steps.push({ id: "quiz", type: "quiz", title: titleFor("quiz") });
  }

  for (const step of workflowSteps ?? []) {
    if (!step?.id || !step.type) continue;
    // application/quiz are synthesized above from their own columns — a step
    // of that type inside workflow_steps (shouldn't happen, but be safe)
    // would otherwise duplicate the stage.
    if (step.type === "application" || step.type === "quiz") continue;
    steps.push({ id: step.id, type: step.type, title: titleFor(step.type, step.title) });
  }

  steps.push({ id: DECISION_STAGE_ID, type: DECISION_STAGE_ID, title: titleFor(DECISION_STAGE_ID) });

  return steps;
}

export interface PositionQuery {
  /** The real step id the current screen is showing (usually the `:stepId`
   *  route param). Checked first — it's the most specific signal available. */
  stepId?: string | null;
  /** `application.phase` — a real step id once the candidate is mid-workflow,
   *  or a legacy literal ("application", "quiz", and pre-this-model values
   *  like "review" / "interview" / "hired") from before this stage list
   *  existed. Checked second. */
  phase?: string | null;
  /** `application.status` — the last-resort signal, used once neither
   *  `stepId` nor `phase` resolves to a real stage in `steps`. Any status
   *  that means "past every real step" — submitted/reviewing as much as
   *  hired/rejected — honestly lands on the closing "Decision" stage. */
  status?: string | null;
}

export interface CandidateJourneyPosition {
  /** 0-based index of the current stage within `steps`. */
  index: number;
  /** Total number of stages — always `steps.length`. */
  total: number;
  /** The stage at `index`. */
  current: CandidateJourneyStep;
}

/** Statuses that mean "every real step is done — it's the hiring team's turn
 *  now," however `application.phase` was left. Covers "just submitted,
 *  waiting on a first look" (pending/reviewing) exactly the same as "the
 *  decision has already been made" (hired/rejected) — both are honestly the
 *  closing "Decision" stage. */
const POST_WORKFLOW_STATUSES = new Set([
  "pending", // shown to candidates as "Submitted"
  "reviewing",
  "interview",
  "offered",
  "hired",
  "rejected",
]);

/**
 * Resolves where a candidate is in `steps`, trying the most specific signal
 * first: the real step id the screen is showing, then `application.phase`
 * (which may itself be a real step id, or one of the pre-journey literals),
 * then `application.status` as the final fallback. Falls back to the first
 * stage only when none of the three signals resolve to anything.
 */
export function positionFor(
  steps: readonly CandidateJourneyStep[],
  query: PositionQuery,
): CandidateJourneyPosition {
  const total = steps.length;
  const foundDecisionIndex = steps.findIndex((s) => s.id === DECISION_STAGE_ID);
  const decisionIndex = foundDecisionIndex !== -1 ? foundDecisionIndex : Math.max(total - 1, 0);

  let index = -1;

  if (query.stepId) {
    index = steps.findIndex((s) => s.id === query.stepId);
  }
  if (index === -1 && query.phase) {
    index = steps.findIndex((s) => s.id === query.phase || s.type === query.phase);
  }
  if (index === -1 && query.status && POST_WORKFLOW_STATUSES.has(query.status)) {
    index = decisionIndex;
  }
  if (index === -1) index = 0;

  const fallbackStep: CandidateJourneyStep = { id: DECISION_STAGE_ID, type: DECISION_STAGE_ID, title: titleFor(DECISION_STAGE_ID) };
  return { index, total, current: steps[index] ?? steps[0] ?? fallbackStep };
}
