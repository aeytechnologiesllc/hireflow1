/**
 * appliedNames.ts — the job and the business an applicant's own pages name
 * for one of their applications: as they were when they applied.
 *
 * Every application keeps the job's title and the business's name from the
 * moment it was made (applications.applied_job_title, applied_company_name,
 * set by the database and never changed by a browser: migration
 * 20261025700000). The decline email and the server's cards already name
 * those. The applicant's own pages (Your applications, and the application
 * page that the decline's link opens) named the job's title and the
 * business's name as they are today, and a business can close its job and
 * rename it, or rename itself, to anything after it has turned people down:
 * "Chat support agent (reconsideration: send 500 PHP to GCash 0917 000 0000,
 * then message us REAPPLY)", "Fee Clinic: pay 500 PHP to GCash ... to stay in
 * the pool". Nobody else sees a closed job, and nothing recorded it as
 * contact, so three of the people it reached that way could not pause it by
 * their reports (the seventeenth security review, finding 1, probe s5).
 *
 * So both pages name these, always, and never the job's or the business's
 * live words, even while the job is still live: one rule for the emails, the
 * cards and the pages. An application with none on file names no job and no
 * business (the page says "Your application" or leaves the line out).
 * The guard applicant-pages-name-the-job-as-applied
 * (scripts/guards/applicant-sees-the-job-as-applied.mjs) holds both pages to
 * it.
 *
 * Pure (no React, no Supabase).
 */

export interface AppliedNamesSource {
  applied_job_title?: string | null;
  applied_company_name?: string | null;
}

export interface AppliedNames {
  /** The job's title when they applied, or null when the application has none. */
  jobTitle: string | null;
  /** The business's name when they applied, or null when it had none. */
  companyName: string | null;
}

function plain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text || null;
}

export function appliedNames(application: AppliedNamesSource | null | undefined): AppliedNames {
  return {
    jobTitle: plain(application?.applied_job_title),
    companyName: plain(application?.applied_company_name),
  };
}
