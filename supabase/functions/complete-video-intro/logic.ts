/**
 * complete-video-intro's pure, DB-free logic — the exact result/legacy-entry
 * shapes VideoIntroPhase.tsx used to build in the browser
 * (src/pages/VideoIntroPhase.tsx, the `updatedNotes` object around
 * :370-391 before this conversion), plus the candidate-supplied storage
 * path check. Zero imports, zero Deno/Node-specific APIs, so this file runs
 * under plain Node (see ../../../scripts/complete_video_intro_logic.test.mjs)
 * exactly as it does inside the Deno edge function (index.ts) — same
 * pattern as _shared/trustedResults.ts's own pure functions.
 *
 * Video intro is completion-based, not scored: today's page always writes
 * `passed: true, score: null` once a real recording was uploaded, and that
 * does not change here — this module doesn't invent a new "grading" step,
 * it only reproduces the existing shape server-side.
 */

export interface WorkflowStepLite {
  id: string;
  type: string;
}

/** The step type VideoIntroPhase.tsx falls back to when the workflow step
 *  can't be found by id — matches its own `currentStep?.type || "video_intro"`
 *  (VideoIntroPhase.tsx:368). */
export const DEFAULT_VIDEO_STEP_TYPE = "video_intro";

/**
 * Resolves the real step `type` ("video_intro" or the legacy "video_message"
 * alias) for `stepId` from the job's own `workflow_steps`, exactly the way
 * VideoIntroPhase.tsx:367-368 does:
 *   `const currentStep = workflowSteps?.find((s) => s.id === stepId);`
 *   `const stepType = currentStep?.type || "video_intro";`
 */
export function resolveVideoStepType(
  workflowSteps: readonly WorkflowStepLite[] | null | undefined,
  stepId: string,
): string {
  const step = (workflowSteps ?? []).find((s) => s && s.id === stepId);
  return step?.type || DEFAULT_VIDEO_STEP_TYPE;
}

export interface VideoIntroResultInput {
  duration: number;
  videoUrl: string;
}

/**
 * Matches VideoIntroPhase.tsx:382-389's own `notes.videoIntroResult` shape
 * byte-for-byte — the value `trigger-ava-analysis`, `ai-shortlist`, and
 * every other reader of `notes.videoIntroResult` already expect.
 */
export function buildVideoIntroResult(input: VideoIntroResultInput): Record<string, unknown> {
  return {
    duration: input.duration,
    completed: true,
    passed: true,
    score: null,
    videoUrl: input.videoUrl,
    uploadMethod: "recorded",
  };
}

export interface LegacyStepEntryInput extends VideoIntroResultInput {
  stepType: string;
  recordedAt: string;
}

/**
 * Matches VideoIntroPhase.tsx:372-381's own `notes[stepId]` shape
 * byte-for-byte — the `legacyStepEntry` recordStepResult writes for by-id
 * readers.
 */
export function buildVideoIntroLegacyStepEntry(input: LegacyStepEntryInput): Record<string, unknown> {
  return {
    type: input.stepType,
    duration: input.duration,
    recordedAt: input.recordedAt,
    completed: true,
    passed: true,
    score: null,
    videoUrl: input.videoUrl,
    uploadMethod: "recorded",
  };
}

/** `Video intro: 1:05 duration. COMPLETED. Stored at: <path>` — matches
 *  VideoIntroPhase.tsx:399's own `phase_ai_analysis` text exactly, so the
 *  cockpit's mapper (src/cockpit/lib/mappers.ts:295-296, which falls back to
 *  `phase_ai_analysis` while `ai_analysis` is still null) keeps showing the
 *  same line it always did for the brief window before trigger-ava-analysis
 *  lands its own scored write. */
export function formatVideoIntroPhaseAnalysis(duration: number, videoUrl: string): string {
  const totalSeconds = Math.max(0, Math.floor(duration));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const durationLabel = `${mins}:${secs.toString().padStart(2, "0")}`;
  return `Video intro: ${durationLabel} duration. COMPLETED. Stored at: ${videoUrl}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A candidate-supplied storage path is only ever trustworthy as "this
 * candidate's own recording for this application/step" if it matches the
 * literal filename VideoIntroPhase.tsx:306 has always built:
 *   `${user.id}/${id}-${stepId}-${Date.now()}.${extension}`
 * A path failing this can never be treated as evidence, regardless of
 * whether an object happens to exist there — this is the first of two
 * checks; the second (the object actually exists in the `videos` bucket)
 * needs the admin storage client and lives in index.ts.
 */
export function isPlausibleVideoObjectPath(
  path: unknown,
  input: { callerUserId: string; applicationId: string; stepId: string },
): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  const pattern = new RegExp(
    `^${escapeRegExp(input.callerUserId)}/${escapeRegExp(input.applicationId)}-${escapeRegExp(input.stepId)}-\\d+\\.(webm|mp4)$`,
  );
  return pattern.test(path);
}

/** Matches MIN_RECORDING_SECONDS's own contract (a non-negative, finite
 *  number of seconds) without re-imposing the page's own >= 3s UX minimum —
 *  that check is a candidate-facing "don't waste your one attempt" nudge,
 *  not a pass/fail rule server-side grading needs to repeat (video intro has
 *  no failing duration; see this file's own header comment). */
export function isValidDuration(duration: unknown): duration is number {
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0;
}
