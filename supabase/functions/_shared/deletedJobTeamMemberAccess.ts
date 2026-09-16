/**
 * Pure authorization decision for google-indexing's hard-deleted-job
 * fallback (canDeleteMissingJobAsTeamMember in
 * supabase/functions/google-indexing/index.ts).
 *
 * Kept separate from the Deno/Supabase-specific edge function code, with no
 * Deno/network imports, so the fail-closed AND the job-scoping rule can be
 * unit-tested directly under plain Node (see
 * scripts/deleted_job_team_member_access.test.mjs) instead of only being
 * checked by a guard regex over the call site's source text.
 *
 * Why this exists as a separate function instead of an inline expression at
 * the call site: a reviewer showed that scripts/guards/team-scope-siblings.mjs
 * only checked that the substrings "can_delete_jobs" and "assigned_job_ids"
 * appeared *somewhere* in google-indexing/index.ts -- not that
 * canDeleteMissingJobAsTeamMember's actual return value depended on them.
 * Patching that function's return to
 *   `return !!membership && membership.can_delete_jobs === true;`
 * (dropping assigned_job_ids scoping entirely -- the exact cross-job leak
 * this whole task exists to fix) still satisfied every guard check, because
 * the now-dead `.select("can_delete_jobs, assigned_job_ids")` line and the
 * surrounding comments still contained both substrings. Centralizing the
 * decision here lets the guard require the call site to call this function
 * (a call-site check that can't be spoofed by unrelated substrings
 * elsewhere in the file), while the decision itself is covered once,
 * directly, by a real test -- the same pattern already used for
 * isScopedTeamMemberFromRpc in teamMemberRpcAccess.ts and canAccessDossier
 * in dossierAccess.ts.
 *
 * When to use this: ONLY for the hard-deleted-job fallback, where the job
 * row is already gone and is_active_team_member_for_job's own `jobs` join
 * can never match for a non-owner. Every other call site must use the
 * is_active_team_member_for_job RPC (via isScopedTeamMemberFromRpc), not
 * this function.
 */
export interface DeletedJobTeamMembership {
  /** team_members.can_delete_jobs -- must be the literal boolean `true` to grant access. */
  can_delete_jobs: unknown;
  /** team_members.assigned_job_ids -- null/empty means whole-employer access. */
  assigned_job_ids: unknown;
}

/**
 * True only when `membership` is present, `can_delete_jobs` is exactly
 * `true`, AND `assigned_job_ids` is null/empty (whole-employer access) or
 * contains `jobId`. Mirrors the live RLS policy "Team members can delete
 * assigned jobs if permitted" on `jobs` DELETE. A team member scoped to a
 * different job (assigned_job_ids set, without this jobId) must be denied
 * even with can_delete_jobs = true -- that is the specific regression this
 * function exists to keep caught.
 */
export function canDeleteMissingJobAsTeamMemberFromMembership(
  membership: DeletedJobTeamMembership | null | undefined,
  jobId: string,
): boolean {
  if (!membership || membership.can_delete_jobs !== true) return false;

  const raw = membership.assigned_job_ids;
  if (raw === null || raw === undefined) return true; // whole-employer access

  // assigned_job_ids is a Postgres array column, so it should always
  // deserialize as an array or null -- anything else is an unexpected shape
  // and must fail closed rather than be treated as whole-employer access.
  if (!Array.isArray(raw)) return false;

  const assignedJobIds = raw.filter((id): id is string => typeof id === "string");
  return assignedJobIds.length === 0 || assignedJobIds.includes(jobId);
}
