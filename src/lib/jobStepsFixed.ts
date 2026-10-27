/**
 * jobStepsFixed.ts — once anyone has applied to a job (a draft included), its
 * application questions, quiz and steps stay as they were: what the applicant
 * answers and reads there does not change under them (the twentieth Phase 5
 * review, 2026-10-27).
 *
 * A business could rewrite a live job's form question, a step's title and
 * description and the quiz into a GCash fee ask ("Paste your GCash reference
 * number for the 500 PHP processing fee ..."), and a draft sent its form with
 * "GCash ref 1234567890" (the review's probe q2_live_unshown). Counting such
 * an edit as contact with everyone waiting let three throwaway accounts that
 * only started an application pause a real business that added a "Weekend"
 * choice to a shift question (probe q3_blanket). So the database refuses a
 * browser's change of a word of them once the job has an application
 * (jobs_applicant_words_fixed, supabase/migrations/20261025730000, HINT
 * job_steps_fixed), and the editor shows them read-only then, with the way
 * round: Copy to drafts makes a new job, with nobody on it yet. A number or a
 * switch (a time limit, "required", the connection check's bars) is not
 * words, and stays the business's.
 *
 * No imports: scripts/job_steps_fixed.test.mjs loads it in Node.
 */

/** The one line the editor shows above the questions once someone has applied. */
export const JOB_STEPS_FIXED_NOTE =
  "People have applied, so these questions stay as they are. To ask different ones, use Copy to drafts on the Jobs page and edit the copy.";

/** The editor's word when a save is refused (the database's own message, as it says it). */
export const JOB_STEPS_FIXED_MESSAGE =
  "People have applied to this job, so its application questions, quiz and steps stay as they were. To ask something different, use Copy to drafts on the Jobs page and post the copy.";

/** The database's refusal of a change to a job's questions, quiz or steps once someone has applied. */
export function isJobStepsFixedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { hint?: unknown; message?: unknown };
  return e.hint === "job_steps_fixed" || (typeof e.message === "string" && /so its application questions, quiz and steps stay as they were/i.test(e.message));
}
