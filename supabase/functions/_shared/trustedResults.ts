/**
 * trustedResults.ts — the one place a candidate's own screening-step result
 * gets written into `applications`, server-side, with the server (not the
 * candidate's browser) deciding whether they'd actually earned the write and
 * where their journey goes next.
 *
 * WHY THIS EXISTS
 * ----------------
 * Today, every phase page (TypingTestPhase, ChatSimulationPhase,
 * ChatInterviewPhase, SalesSimulationPhase, PortfolioUploadPhase,
 * VideoIntroPhase) computes its own result in the browser and writes it
 * straight into `applications.notes` with a plain
 * `supabase.from("applications").update(...)` call from the candidate's own
 * session — then, in auto mode, several of them also write
 * `applications.phase` directly. `trigger-ava-analysis` and
 * `_shared/autopilot.ts` then read those same notes fields
 * (`typingTestResult`, `chatSimulationResult`, ...) as evidence for the
 * weighted score. A candidate who edits those fields in devtools before
 * calling trigger-ava-analysis is trusted completely.
 *
 * This module is the fix's foundation: a part-B phase conversion calls
 * `recordStepResult` (running with the service-role admin client, inside an
 * edge function, after doing whatever *legitimate* grading that phase does
 * server-side — chat/sales simulation transcript scoring, portfolio
 * analysis, etc.) instead of letting the browser write `notes`/`phase`
 * itself. `recordStepResult`:
 *
 *   1. verifies the caller really is this application's own candidate;
 *   2. verifies they've actually reached this step (the exact rule
 *      CandidateStepGate.tsx already gates routes with) and that the
 *      application hasn't been rejected;
 *   3. merges the result into `notes` in exactly the shapes today's readers
 *      (trigger-ava-analysis, the cockpit, CondensedAIAnalysis) expect, plus
 *      a `_trusted` marker no client write can ever produce;
 *   4. advances `phase` (and `status`) using exactly today's client rules —
 *      never anything new — and tells the caller what the candidate should
 *      see next.
 *
 * `recordStepResult` runs with the SERVICE-ROLE client, so it is not
 * restricted by `protect_application_columns` (that trigger exempts
 * `auth.role() = 'service_role'` outright — see the migration this file
 * pairs with, supabase/migrations/20260915140000_trusted_step_results.sql).
 * All of the authorization above is this file's own job, not the trigger's.
 *
 * DOES NOT decide when to flip a phase's guard on — that is
 * `trusted_result_enforcement` (see the migration) and is each part-B
 * worker's own call once its phase's writer no longer touches `notes`/
 * `phase` from the browser. See docs/TRUSTED-RESULTS.md.
 *
 * Deliberately has ZERO imports beyond `./candidateJourney.ts` (itself
 * import-free) — no `supabase-js`, no Deno std, nothing URL-imported. That
 * keeps every pure function below runnable from plain Node (see
 * scripts/trusted_results_logic.test.mjs) as well as from Deno inside an
 * edge function; only `recordStepResult` touches a database, and it takes
 * that client as a parameter rather than constructing one.
 */

import {
  buildCandidateJourney,
  positionFor,
  resolveGatedStep,
  DECISION_STAGE_ID,
  type WorkflowStepLike,
  type CandidateJourneyStep,
} from "./candidateJourney.ts";

/** The step types a part-B phase conversion may record a trusted result
 *  for. Matches the notes `type` values every phase page already writes
 *  (`[stepId!]: { type: "...", ... }`) — see the per-writer citations on
 *  `LEGACY_STEP_TYPES` in the migration this file pairs with. */
export type StepType =
  | "typing_test"
  | "chat_simulation"
  | "chat_interview"
  | "sales_simulation"
  | "portfolio_upload"
  | "video_intro"
  | "video_message" // legacy alias for video_intro — candidateJourney.ts treats them as the same step type
  | "voice_interview";

/** The job fields a step-result decision needs. Matches the shape every
 *  phase page already selects `jobs:job_id ( workflow_steps, quiz_questions,
 *  processing_mode )` for (e.g. TypingTestPhase.tsx's own `freshJob` fetch). */
export interface JobLike {
  workflow_steps?: unknown;
  quiz_questions?: unknown;
  /** "auto" | "manual" | null|undefined. Anything other than the literal
   *  "auto" is treated as manual — matches every phase page's own
   *  `processing_mode === "auto"` check (e.g. TypingTestPhase.tsx:337). */
  processing_mode?: string | null;
}

/** The application fields a step-result decision needs. */
export interface ApplicationLike {
  id: string;
  candidate_id: string;
  phase: string | null;
  status: string | null;
  notes: string | null;
  jobs?: JobLike | null;
}

export interface RecordStepResultInput {
  applicationId: string;
  /** auth.uid() of the caller, as the edge function itself resolved it from
   *  the request's JWT — never trust a body-supplied candidate id. */
  callerUserId: string;
  /** The real step id in this job's journey (the route's `:stepId`, matching
   *  a `jobs.workflow_steps[].id`, or the literal "quiz"/"application"). */
  stepId: string;
  stepType: StepType;
  /** The camelCase notes key readers check today, e.g. "typingTestResult",
   *  "chatSimulationResult" — see docs/TRUSTED-RESULTS.md for the full map.
   *  Any casing is accepted by the migration's guard; callers should still
   *  use the exact casing existing readers expect. */
  resultKey: string;
  /** The value written at `notes[resultKey]` — whatever shape that phase's
   *  existing readers (trigger-ava-analysis, the cockpit) already expect. */
  result: Record<string, unknown>;
  /** Optional value written at `notes[stepId]` too, for readers that key off
   *  the literal step id rather than the fixed result key — e.g.
   *  PortfolioUploadPhase.tsx:571 checks `notes[stepId] || notes.portfolioResult`.
   *  Omit when the phase being converted has no such by-id reader left. */
  legacyStepEntry?: Record<string, unknown>;
  /** Optional flat, TOP-LEVEL `notes` keys to write alongside `result` — for
   *  readers that check a different, unrelated flat key entirely rather than
   *  `notes[resultKey]` or `notes[stepId]`. This exists because of exactly
   *  one known case today: VideoIntroPhase.tsx:390 writes a fourth key,
   *  `notes.videoIntroUrl`, that neither `resultKey` (`videoIntroResult`)
   *  nor `legacyStepEntry` (`notes[stepId]`) covers — and two live readers
   *  check that flat key EXCLUSIVELY: autopilot-batch/index.ts:129
   *  (`case "video_intro": case "video_message": return !!parsedNotes.videoIntroUrl`)
   *  and usePendingActionsCount.ts:77 (the employer sidebar's pending-actions
   *  badge). A video_intro/video_message conversion MUST pass
   *  `{ videoIntroUrl: result.videoUrl }` here or both of those readers go
   *  stale the moment the browser stops writing that key itself — see
   *  docs/TRUSTED-RESULTS.md's result_key table. Before adding a NEW
   *  `resultKey`/`stepType`, grep every reader of that phase's notes shape
   *  (trigger-ava-analysis, autopilot-batch, CondensedAIAnalysis,
   *  getApplicationDisplayState, usePendingActionsCount, the cockpit) for a
   *  similar stray flat key and add it here too, rather than discovering the
   *  gap in production. Applied BEFORE `resultKey`/`stepId`/`_trusted` are
   *  written below, so none of those three can ever be overridden by an
   *  entry here even if a caller mistakenly reuses one of those names. */
  extraNotesEntries?: Record<string, unknown>;
}

export type StepNotReachedReason =
  /** `stepId` doesn't name a real step in this job's journey, or names one
   *  whose `type` doesn't match `stepType` — see resolveGatedStep's own two
   *  cases in candidateJourney.ts. */
  | "unrecognized_or_wrong_type_step"
  /** `stepId` is real and the right type, but the candidate's own recorded
   *  position (phase/status) hasn't reached it yet. */
  | "not_yet_reached";

export interface ReachedStepCheck {
  reached: boolean;
  /** Present only when `reached` is false, to tell the two failure modes
   *  above apart (an edge function can 404 the first and 409 the second). */
  reason?: StepNotReachedReason;
}

/**
 * Exactly the check CandidateStepGate.tsx makes to decide route access
 * (src/components/candidate/CandidateStepGate.tsx:130-138):
 *
 *   const resolution = resolveGatedStep(steps, { stepId, expectedType: phase });
 *   const actualPosition = useJourneyPosition(job, { phase: appPhase, status: appStatus });
 *   const hasReachedThisStep = resolution.matched && actualPosition.index >= resolution.index;
 *
 * `useJourneyPosition` (src/hooks/useJourneyPosition.ts) is itself a thin
 * wrapper over `positionFor` with no `stepId` in its query — this reproduces
 * that call shape directly rather than importing the React hook.
 */
export function hasReachedStep(
  steps: readonly CandidateJourneyStep[],
  query: { stepId: string; expectedType: string; phase: string | null; status: string | null },
): ReachedStepCheck {
  const resolution = resolveGatedStep(steps, { stepId: query.stepId, expectedType: query.expectedType });
  if (!resolution.matched) {
    return { reached: false, reason: "unrecognized_or_wrong_type_step" };
  }
  const actualPosition = positionFor(steps, { phase: query.phase, status: query.status });
  if (actualPosition.index < resolution.index) {
    return { reached: false, reason: "not_yet_reached" };
  }
  return { reached: true };
}

export type NextStepDecision =
  /** Auto mode, a real next step exists, and it isn't voice_interview — the
   *  client always advances `phase` in this case (VideoIntroPhase.tsx:343-360,
   *  PortfolioUploadPhase.tsx:416-433: `newPhase = nextPhase.id`, written at
   *  VideoIntroPhase.tsx:398 / PortfolioUploadPhase.tsx:447). Neither of
   *  those two writes itself also sets `status` — that page-local advance is
   *  only ever an optimistic UI head start, and the real authoritative write
   *  (both `phase` and `status: "reviewing"` together) lands moments later
   *  from trigger-ava-analysis's own scored advance
   *  (index.ts:363-368: `phase: nextPhase.nextPhaseId, status: "reviewing"`)
   *  once it re-derives the next phase itself and applies its own
   *  pass/fail/defer decision — ChatInterviewPhase.tsx's auto-end path
   *  writes the same pairing directly, just split across two calls
   *  (status: "reviewing" at :271, phase: nextStep.id at :283). Since
   *  recordStepResult performs the step's ENTIRE write (notes, phase, and
   *  status) atomically in one go rather than racing a client head-start
   *  against a follow-up backend call, it adopts that same "advance ⇒
   *  status: reviewing" pairing as its one write, carried here as
   *  `nextStatus`. What it deliberately does NOT replicate is
   *  trigger-ava-analysis's own score-vs-passing-threshold pass/fail/defer
   *  decision (resolveAutopilotAction, index.ts:205-213) — recordStepResult
   *  only ever decides whether to move to the NEXT CONFIGURED STEP, exactly
   *  like the client's own local nextPhase lookup does; any real scoring a
   *  part-B phase conversion still needs stays that phase's own job, done
   *  before it calls recordStepResult (or via its own separate
   *  trigger-ava-analysis call), never something this function computes. */
  | { advance: true; nextStep: CandidateJourneyStep; nextStatus: "reviewing" }
  /** Manual mode never auto-advances — every phase page's own comment says
   *  so verbatim (TypingTestPhase.tsx:413 "Manual mode - NEVER auto-advance
   *  or reject. Employer controls."; the actual write at :421-430 resends
   *  `phase: application.phase` / `status: application.status` unchanged).
   *  An employer/team member moves `phase` themselves from the cockpit,
   *  which `protect_application_columns` already exempts unconditionally. */
  | { advance: false; nextStep: CandidateJourneyStep | null; reason: "manual" }
  /** Auto mode, but the next step is voice_interview — every phase page
   *  that can reach it stops one step early on purpose (VideoIntroPhase.tsx
   *  :345-349, PortfolioUploadPhase.tsx:419-422: "STOP before
   *  voice_interview - requires employer to configure... Employer must
   *  manually configure and approve for Ava interview"). Mirrors
   *  trigger-ava-analysis's own `!nextPhase` branch (getAutopilotNextPhase
   *  returns null for a remaining voice_interview step, index.ts:104-109),
   *  which notifies the employer instead of writing anything. */
  | { advance: false; nextStep: CandidateJourneyStep; reason: "needs_employer_approval" }
  /** Auto mode, but there is no next step at all — the current step is
   *  already the journey's last entry. Only possible if `stepId` somehow
   *  resolved to the trailing "decision" stage itself, which no phase page
   *  ever asks to record a result for; kept as an explicit, safe branch
   *  rather than falling through. */
  | { advance: false; nextStep: null; reason: "no_next_step" };

/**
 * Computes the next journey step exactly the way TypingTestPhase.tsx:379-397,
 * VideoIntroPhase.tsx:320-360, PortfolioUploadPhase.tsx:394-436, and
 * ApplicationFormPhase.tsx:1004-1024 all independently do it: build the real
 * journey, find the CURRENT step by `stepId` (falling back to `phase` if
 * `stepId` doesn't resolve — the same fallback `positionFor` itself uses),
 * and look at `steps[currentIndex + 1]`.
 */
export function computeNextStepDecision(
  steps: readonly CandidateJourneyStep[],
  currentStepId: string,
  currentPhase: string | null,
  processingMode: string | null | undefined,
): NextStepDecision {
  let currentIndex = steps.findIndex((s) => s.id === currentStepId);
  if (currentIndex === -1 && currentPhase) {
    currentIndex = steps.findIndex((s) => s.id === currentPhase || s.type === currentPhase);
  }
  if (currentIndex === -1) currentIndex = 0;

  const nextStep = currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  if (processingMode !== "auto") {
    return { advance: false, nextStep, reason: "manual" };
  }
  if (!nextStep) {
    return { advance: false, nextStep: null, reason: "no_next_step" };
  }
  if (nextStep.type === "voice_interview") {
    return { advance: false, nextStep, reason: "needs_employer_approval" };
  }
  return { advance: true, nextStep, nextStatus: "reviewing" };
}

/**
 * What the calling phase page should show next — a real step it can
 * navigate the candidate into, or "waiting" when there's nothing to click
 * (manual mode, employer-approval-needed, the closing decision stage, or no
 * next step at all). Mirrors every phase page's own
 * `nextPhase.id !== DECISION_STAGE_ID` check before offering a "Start Next
 * Phase" button (e.g. VideoIntroPhase.tsx:353-359).
 */
export function nextStepForCandidate(
  decision: NextStepDecision,
): { id: string; type: string; title: string } | "waiting" {
  if (decision.advance && decision.nextStep.id !== DECISION_STAGE_ID) {
    return { id: decision.nextStep.id, type: decision.nextStep.type, title: decision.nextStep.title };
  }
  return "waiting";
}

/**
 * Merges one step's trusted result into `notes` — pure string-in,
 * string-out, so it's testable with plain fixtures. Always writes:
 *
 *   - `notes[key] = value` for every entry in `extraNotesEntries`, if given
 *     (e.g. `notes.videoIntroUrl = "..."` — see that field's own doc comment
 *     on `RecordStepResultInput` for why this exists)
 *   - `notes[resultKey] = result` (e.g. `notes.typingTestResult = {...}`)
 *   - `notes[stepId] = legacyStepEntry`, only if `legacyStepEntry` was given
 *   - `notes._trusted[stepId] = { stepType, completedAt }` — the
 *     server-only marker no client write can ever produce (the migration's
 *     notes guard, once enforced for a key, refuses any candidate edit to
 *     `_trusted` unconditionally)
 *
 * The four are applied in that order, so `resultKey`/`stepId`/`_trusted`
 * always win over anything in `extraNotesEntries` even if a caller
 * accidentally reuses one of those key names there.
 *
 * Every other existing key in `notes` (applicationAnswers, resumeImageUrls,
 * other steps' own results, ...) passes through untouched — this never
 * replaces the whole object, only merges.
 */
export function mergeTrustedNotes(
  existingNotesJson: string | null | undefined,
  input: Pick<
    RecordStepResultInput,
    "stepId" | "stepType" | "resultKey" | "result" | "legacyStepEntry" | "extraNotesEntries"
  >,
  completedAt: string,
): string {
  let existing: Record<string, unknown> = {};
  if (existingNotesJson) {
    try {
      const parsed = JSON.parse(existingNotesJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
  }

  const existingTrusted =
    existing._trusted && typeof existing._trusted === "object" && !Array.isArray(existing._trusted)
      ? (existing._trusted as Record<string, unknown>)
      : {};

  const updated: Record<string, unknown> = {
    ...existing,
    ...(input.extraNotesEntries ?? {}),
    [input.resultKey]: input.result,
    _trusted: {
      ...existingTrusted,
      [input.stepId]: { stepType: input.stepType, completedAt },
    },
  };

  if (input.legacyStepEntry) {
    updated[input.stepId] = input.legacyStepEntry;
  }

  return JSON.stringify(updated);
}

export type RecordStepResultOutcome =
  | { ok: true; next: { id: string; type: string; title: string } | "waiting" }
  | {
      ok: false;
      code: "application_not_found" | "not_candidate" | "application_rejected" | "step_not_reached" | "write_failed";
      error: string;
    };

/** Minimal shape of the Supabase JS client this file needs — deliberately
 *  not importing `@supabase/supabase-js`'s own types (that package is a
 *  Deno URL import in every edge function; this file stays import-free so
 *  its pure functions run under plain Node too). Structurally compatible
 *  with the real client's `.from(...).select(...).eq(...).maybeSingle()` /
 *  `.update(...).eq(...)` chains. */
export interface MinimalSupabaseAdmin {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: unknown; error: unknown }> } };
    update(values: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: unknown }> };
  };
}

/**
 * Records one candidate step's trusted result and advances their phase —
 * see the module doc comment above for the full contract. Runs with the
 * service-role client (`admin`), so `protect_application_columns` never
 * sees this as a candidate write at all; every authorization decision below
 * is this function's own responsibility.
 */
export async function recordStepResult(
  admin: MinimalSupabaseAdmin,
  input: RecordStepResultInput,
): Promise<RecordStepResultOutcome> {
  const { data, error } = await admin
    .from("applications")
    .select("id, candidate_id, phase, status, notes, jobs:job_id ( workflow_steps, quiz_questions, processing_mode )")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: "application_not_found", error: "Application not found" };
  }

  const application = data as ApplicationLike;

  if (application.candidate_id !== input.callerUserId) {
    return { ok: false, code: "not_candidate", error: "Caller is not this application's candidate" };
  }

  // A rejected application is done — CandidateStepGate's own hasReachedThisStep
  // check would still say "reached" for a rejected candidate (POST_WORKFLOW_STATUSES
  // resolves "rejected" to the trailing decision stage, which is >= every real
  // step's index), so this is an explicit extra check recordStepResult makes
  // that the client-side gate does not.
  if (application.status === "rejected") {
    return { ok: false, code: "application_rejected", error: "Application has been rejected" };
  }

  const job = application.jobs ?? {};
  const workflowSteps = (job.workflow_steps ?? []) as WorkflowStepLike[];
  const quizQuestions = job.quiz_questions as unknown[] | undefined;
  const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
  const steps = buildCandidateJourney(workflowSteps, { hasQuiz });

  const reached = hasReachedStep(steps, {
    stepId: input.stepId,
    expectedType: input.stepType,
    phase: application.phase,
    status: application.status,
  });
  if (!reached.reached) {
    return { ok: false, code: "step_not_reached", error: `Candidate has not reached step "${input.stepId}"` };
  }

  const completedAt = new Date().toISOString();
  const newNotes = mergeTrustedNotes(application.notes, input, completedAt);

  const decision = computeNextStepDecision(steps, input.stepId, application.phase, job.processing_mode);

  const updatePayload: Record<string, unknown> = { notes: newNotes };
  if (decision.advance) {
    updatePayload.phase = decision.nextStep.id;
    updatePayload.status = decision.nextStatus;
  }

  const { error: updateError } = await admin.from("applications").update(updatePayload).eq("id", input.applicationId);
  if (updateError) {
    const message = typeof updateError === "object" && updateError && "message" in updateError
      ? String((updateError as { message?: unknown }).message)
      : String(updateError);
    return { ok: false, code: "write_failed", error: `Failed to save step result: ${message}` };
  }

  return { ok: true, next: nextStepForCandidate(decision) };
}
