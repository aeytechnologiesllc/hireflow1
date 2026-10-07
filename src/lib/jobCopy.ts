/**
 * jobCopy.ts — "Copy to drafts": a job you like, kept to post again.
 *
 * The owner, 2026-10-07, looking at his one live job: "I like this job,
 * right? So I want to be able to add that to the draft and then that way I
 * can pull it, use the same job later."
 *
 * A copy is a NEW draft job with everything that makes the job what it is:
 * the post, the pay and place, the application form, the tests with their
 * answers, the steps and their pass marks. It carries nothing that belongs to
 * the original's life: not its applicants, not its link, not its code, not
 * its dates. The original is not touched.
 *
 * Every column of public.jobs is named in exactly one of the two lists below,
 * and scripts/job_copy.test.mjs holds them against the database types: a
 * column added later fails that test until someone decides which list it
 * belongs in, so a copy can never silently drop part of a job or silently
 * carry something it should not.
 *
 * Pure (no React, no Supabase), so the test runs it under plain Node. The
 * read and the write are in src/hooks/useJobCopy.ts.
 */

/** What the job IS: carried over to the copy as it stands. */
export const JOB_COPY_COLUMNS = [
  "title",
  "description",
  "requirements",
  "responsibilities",
  "department",
  "experience_level",
  "skills_required",
  "benefits",
  "job_type",
  // Pay.
  "salary_min",
  "salary_max",
  "salary_currency",
  "salary_period",
  // Place.
  "location",
  "location_city",
  "location_region",
  "location_country",
  "location_country_code",
  "latitude",
  "longitude",
  "locations",
  "is_remote",
  // The form, the tests and the steps, with their settings.
  "application_questions",
  "quiz_questions",
  "workflow_steps",
  "workflow_difficulty",
  "processing_mode",
  "passing_score",
  "required_wpm",
  "require_resume",
  // Whether it goes to the job boards once it is live.
  "exclude_from_feed",
] as const;

/**
 * What belongs to the original alone, and why each is left behind:
 *  - id, employer_id, created_at, updated_at: the new row gets its own (the
 *    employer is set by the create path, never copied from a row);
 *  - status: a copy is always a draft;
 *  - job_code: the database gives every job its own on insert;
 *  - slug: the short link is one job's; two jobs cannot share it, and the
 *    editor suggests a new one when the draft is published;
 *  - application_deadline: a date chosen for the original's run;
 *  - ai_bias_score, ai_bias_feedback: a reading of the original, written by
 *    the checker; the editor reads the copy afresh.
 */
export const JOB_COPY_LEFT_OUT = [
  "id",
  "employer_id",
  "created_at",
  "updated_at",
  "status",
  "job_code",
  "slug",
  "application_deadline",
  "ai_bias_score",
  "ai_bias_feedback",
] as const;

export type JobCopyColumn = (typeof JOB_COPY_COLUMNS)[number];

/** A job row, as far as a copy reads it. */
export type JobCopySource = { title?: unknown; description?: unknown } & Record<string, unknown>;

/** The row to insert: the carried columns, and `status: "draft"`. */
export type JobCopyPayload = Partial<Record<JobCopyColumn, unknown>> & { title: string; description: string; status: "draft" };

/**
 * The draft to insert for a copy of `job`. `job` must already carry its quiz
 * answers (mergeQuizAnswerKeys over get_job_quiz_keys): the database strips
 * them from the new row into job_quiz_keys the same way it did for the
 * original, so a quiz copied without them could never be marked.
 * Returns null for a row with no title or no description (nothing to copy).
 */
export function jobCopyPayload(job: JobCopySource | null | undefined): JobCopyPayload | null {
  if (!job) return null;
  const title = typeof job.title === "string" ? job.title.trim() : "";
  const description = typeof job.description === "string" ? job.description : "";
  if (!title || !description.trim()) return null;
  const out: Record<string, unknown> = {};
  for (const column of JOB_COPY_COLUMNS) {
    // A column the row does not have (an older row, a narrower select) is
    // left to the database's default rather than written as null.
    if (job[column] !== undefined) out[column] = job[column];
  }
  return { ...out, title, description, status: "draft" } as JobCopyPayload;
}

/* ── Where a new job can start from ─────────────────────────────────────── */

/** A job on the "New job" chooser, as the Jobs page already has it. */
export interface JobStartOption {
  id: string;
  title: string;
  /** The Jobs page's own three states. */
  status: "live" | "draft" | "closed";
  /** "Posted 3 days ago", "Saved today": the row's own line. */
  when: string;
  /** For the order: newest first within each group. */
  at: number;
}

const START_ORDER: Record<JobStartOption["status"], number> = { draft: 0, live: 1, closed: 2 };

/**
 * The chooser's order: drafts first (they are the ones waiting to be
 * posted), then live jobs, then closed ones; newest first within each.
 */
export function sortJobStartOptions(options: readonly JobStartOption[]): JobStartOption[] {
  return [...options].sort((a, b) => START_ORDER[a.status] - START_ORDER[b.status] || b.at - a.at || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/** What picking each one does, in the button's words. */
export function jobStartActionLabel(status: JobStartOption["status"]): string {
  return status === "draft" ? "Finish & publish" : "Use this one";
}

/* ── Words ──────────────────────────────────────────────────────────────── */

/** The row's button on the Jobs page. */
export const COPY_TO_DRAFTS_LABEL = "Copy to drafts";
/** Its tooltip: what a copy is, and what it leaves alone. */
export const COPY_TO_DRAFTS_HINT = "Save a copy of this job to your drafts, to post again later. This one and its applicants aren't touched.";

/** The toast once a copy is saved from the row. */
export function copiedToDraftsWords(title: string): { title: string; body: string } {
  return {
    title: `A copy of ${title || "this job"} is in your drafts`,
    body: "Post it whenever you like: New job, or Finish & publish on the draft.",
  };
}

/** Said under the chooser's list. */
export const START_FROM_JOB_LINE = "Using a job makes a copy in your drafts. The original and its applicants aren't touched.";
