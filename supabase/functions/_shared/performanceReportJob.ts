/**
 * performanceReportJob.ts — what of the job the Improvement Report names and
 * is written from (ai-generate-performance-report).
 *
 * The report is for someone the business turned down ("Get Improvement
 * Report" is only on a turned-down card), and the first one is kept for good
 * in their notes. It named the job by its title today, in its heading and on
 * the PDF's letterhead, and its prompt carried the job's description and
 * requirements today (600 characters each). A business can change all of
 * that on a closed job to anything, nobody else sees a closed job, and a
 * decline is no contact: the eighteenth security review (finding 1) found the
 * one action a turned-down card offers reading the business's current words.
 * So:
 *   - the report names the job as they applied to it (the application's own
 *     applied_job_title, cut to one line of 200), always;
 *   - the job's own words (its description, requirements and skills) go into
 *     the prompt only while the job is on its public page, where anyone can
 *     read them (published_jobs_public's rule); once it is not, they are left
 *     out, and of its steps only the kinds HireFlow knows are named (a step's
 *     type is the business's to write too).
 * Nothing else of the prompt changes.
 *
 * Pure, no imports: scripts/applicant_job_words.test.mjs loads it in Node.
 */

export interface ReportJobSource {
  description?: unknown;
  requirements?: unknown;
  skills_required?: unknown;
  workflow_steps?: unknown;
  status?: unknown;
  exclude_from_feed?: unknown;
  application_deadline?: unknown;
}

/** The step kinds HireFlow builds (src/lib/candidateJourney.ts names each). */
const KNOWN_STEP_KINDS = new Set([
  "equipment_check",
  "typing_test",
  "video_intro",
  "video_message",
  "chat_simulation",
  "chat_interview",
  "sales_simulation",
  "voice_interview",
  "portfolio_upload",
  "quiz",
  "application",
]);

/** On its public page now: published, not kept off the list, its deadline not passed. */
export function jobOnItsPublicPage(job: ReportJobSource | null | undefined, now: Date = new Date()): boolean {
  if (!job || job.status !== "published" || job.exclude_from_feed === true) return false;
  if (typeof job.application_deadline === "string" && job.application_deadline) {
    const deadline = new Date(job.application_deadline).getTime();
    if (Number.isFinite(deadline) && deadline <= now.getTime()) return false;
  }
  return true;
}

/** The job's name in the report: as they applied to it, one plain line, or the fallback when it has none. */
export function reportJobTitle(appliedJobTitle: unknown, fallback = "Position"): string {
  if (typeof appliedJobTitle !== "string") return fallback;
  const line = appliedJobTitle.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim().slice(0, 200).trim();
  return line || fallback;
}

/** The prompt's "This Job's Real Requirements" block, or null when there is nothing to put in it. */
export function reportJobSection(job: ReportJobSource | null | undefined, now: Date = new Date()): string | null {
  if (!job) return null;
  const shown = jobOnItsPublicPage(job, now);
  const jobLines = [`\n## This Job's Real Requirements`];
  if (shown && job.description) jobLines.push(`Description: ${String(job.description).slice(0, 600)}`);
  if (shown && job.requirements) jobLines.push(`Requirements: ${String(job.requirements).slice(0, 600)}`);
  if (shown && Array.isArray(job.skills_required) && job.skills_required.length) jobLines.push(`Skills required: ${job.skills_required.join(', ')}`);
  if (Array.isArray(job.workflow_steps) && job.workflow_steps.length) {
    const stepNames = job.workflow_steps
      .map((s: any) => (typeof s === 'string' ? s : s?.type || s?.name))
      .filter(Boolean)
      .filter((name: unknown) => shown || (typeof name === "string" && KNOWN_STEP_KINDS.has(name)));
    if (stepNames.length) jobLines.push(`Actual screening steps used for this job: ${stepNames.join(', ')}`);
  }
  return jobLines.length > 1 ? jobLines.join('\n') : null;
}
