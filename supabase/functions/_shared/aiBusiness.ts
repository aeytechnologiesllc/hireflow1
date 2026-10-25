/**
 * aiBusiness.ts — which business an AI call is for (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 5, task 4), so it is counted against that
 * business's own daily AI budget (_shared/aiBudget.ts, ai_budget_take).
 *
 * Always read by the server from its own rows, never taken from the request.
 * Null when it cannot be read: the call then counts against the platform
 * budget only, the same fail-open rule as the budget itself.
 */

// The small part of a Supabase client these helpers use (the admin client, or a test stand-in).
// deno-lint-ignore no-explicit-any
type Reader = { from: (table: string) => any };

function employerFrom(jobs: unknown): string | null {
  const job = (Array.isArray(jobs) ? jobs[0] : jobs) as { employer_id?: unknown } | null | undefined;
  return job && typeof job.employer_id === "string" ? job.employer_id : null;
}

/** The business whose job an application is for. */
export async function employerOfApplication(admin: Reader | null | undefined, applicationId: string | null | undefined): Promise<string | null> {
  if (!admin || typeof applicationId !== "string" || !applicationId) return null;
  try {
    const { data } = await admin.from("applications").select("jobs(employer_id)").eq("id", applicationId).maybeSingle();
    return employerFrom((data as { jobs?: unknown } | null)?.jobs);
  } catch {
    return null;
  }
}

/** The business a job belongs to. */
export async function employerOfJob(admin: Reader | null | undefined, jobId: string | null | undefined): Promise<string | null> {
  if (!admin || typeof jobId !== "string" || !jobId) return null;
  try {
    const { data } = await admin.from("jobs").select("employer_id").eq("id", jobId).maybeSingle();
    return employerFrom(data);
  } catch {
    return null;
  }
}
