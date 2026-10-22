import { useParams } from "react-router-dom";

/**
 * Inside one job (2026-10-21).
 *
 * A job opened from Jobs is /jobs/:jobId (pages/JobDetail.tsx), and a person
 * opened from it is /jobs/:jobId/applicants/:id, so the menu keeps Jobs lit
 * the whole way down (the owner: "it should keep me in the job tab. Take me
 * inside."). Everywhere else a profile is /applicants/:id, as it always was.
 */

/** The job this page sits inside, or null (the route's own :jobId). */
export function useJobScope(): string | null {
  const { jobId } = useParams();
  return jobId ?? null;
}

/** One applicant's profile, under the job when the list was the job's. */
export function applicantPath(id: string, jobId: string | null): string {
  return jobId ? `/jobs/${jobId}/applicants/${id}` : `/applicants/${id}`;
}

/** Where a profile's Back goes when there is no history to go back through. */
export function applicantListPath(jobId: string | null): string {
  return jobId ? `/jobs/${jobId}` : "/applicants";
}
