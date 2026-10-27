/**
 * liveJobText.ts — which of a job's own words an applicant's two overview
 * pages (Your applications, and the application page) show for one of their
 * applications: the job's location, its type and its steps' titles, read
 * from the job as it is now (no application keeps them).
 *
 * A business can change those on a job nobody else can see any more (closed,
 * kept off the list, past its deadline) to anything: the eighteenth security
 * review's probe s1_residual set a closed job's location to "Remote. To be
 * reconsidered, send the 500 PHP review fee to GCash 0917 000 0000 within 48
 * hours, then message us REAPPLY", its type to "Reconsideration: 500 PHP via
 * GCash ..." and added a step titled the same, and the person it had just
 * turned down read all three under the job's name. Since the nineteenth
 * Phase 5 review such a change is contact with everyone still waiting on the
 * job (business_contacts_remember_text, migration 20261025720000), so their
 * pages show it, and three of them can pause the business by reporting it.
 * Someone turned down or hired is not counted (a decline is no contact:
 * docs/BUSINESS-TRUST.md), so for them these pages show the job's words only
 * while the job is on its public page, where anyone can read them; otherwise
 * no location, no type, and each step by its kind's own name ("Typing test",
 * "Chat practice"). The job's title and the business's name are always the
 * application's own (src/lib/appliedNames.ts).
 *
 * The guard applicant-pages-name-the-job-as-applied
 * (scripts/guards/applicant-sees-the-job-as-applied.mjs) holds both pages to
 * it. Pure (no React, no Supabase).
 */

import { titleFor } from "@/lib/candidateJourney";

export interface LiveJobSource {
  status?: string | null;
  exclude_from_feed?: boolean | null;
  application_deadline?: string | null;
  location?: string | null;
  job_type?: string | null;
  workflow_steps?: unknown;
}

export interface LiveJobWords {
  /** The job's location, or null when it is not shown. */
  location: string | null;
  /** The job's type as stored, or null when it is not shown. */
  jobType: string | null;
  /** The job's steps, each without its own title or description when they are not shown. */
  workflowSteps: Array<{ id: string; type: string; title?: string | null }>;
}

/** On its public page now: published_jobs_public's own rule (published, not kept off the list, its deadline not passed). */
export function jobOnItsPublicPage(job: LiveJobSource | null | undefined, now: Date = new Date()): boolean {
  if (!job || job.status !== "published" || job.exclude_from_feed === true) return false;
  if (job.application_deadline) {
    const deadline = new Date(job.application_deadline).getTime();
    if (Number.isFinite(deadline) && deadline <= now.getTime()) return false;
  }
  return true;
}

/** Still waiting on the job (neither turned down nor hired): a change of its words is contact with them. */
export function stillWaiting(application: { status?: string | null } | null | undefined): boolean {
  return !!application && application.status !== "rejected" && application.status !== "hired";
}

function plain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text || null;
}

export function liveJobWords(
  application: { status?: string | null } | null | undefined,
  job: LiveJobSource | null | undefined,
  now: Date = new Date(),
): LiveJobWords {
  const steps = (Array.isArray(job?.workflow_steps) ? job!.workflow_steps : []).filter(
    (s): s is { id: string; type: string; title?: string | null } =>
      !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string" && typeof (s as { type?: unknown }).type === "string",
  );
  if (stillWaiting(application) || jobOnItsPublicPage(job, now)) {
    return { location: plain(job?.location), jobType: plain(job?.job_type), workflowSteps: steps };
  }
  // Each step by its kind's own name. A kind HireFlow does not know would
  // be shown as written (titleFor falls back to the type itself), and the
  // business writes that too: such a step is just "Step".
  return {
    location: null,
    jobType: null,
    workflowSteps: steps.map((s) => ({ ...s, title: titleFor(s.type) === s.type ? "Step" : null, description: null })),
  };
}
