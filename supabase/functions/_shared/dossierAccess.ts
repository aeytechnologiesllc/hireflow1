/**
 * Pure authorization decision for generate-applicant-dossier.
 *
 * Kept separate from the Deno/Supabase-specific edge function code so it can
 * be unit-tested with plain node (see scripts/dossier_access.test.mjs)
 * without a live Supabase project or the Deno-only imports the rest of that
 * function needs.
 *
 * The dossier is a candidate's private hiring evaluation (assessment
 * scores, voice interview results, notes) rendered as a PDF. Access is
 * allowed only for:
 *   (a) the application's own candidate,
 *   (b) the job's owner (jobs.employer_id),
 *   (c) an active team member of that employer who is scoped to THIS job
 *       the same way the live RLS policy on `applications` scopes it
 *       ("Team members can view applications for assigned jobs" ->
 *       public.is_active_team_member_for_job(job_id, auth.uid())), or
 *   (d) a platform developer.
 * Everyone else — including a team member of the same employer who is
 * scoped to a *different* job — is refused.
 */
export interface DossierAccessInput {
  isCandidateOwner: boolean;
  isEmployerOwner: boolean;
  /**
   * Result of calling public.is_active_team_member_for_job(job_id, callerId)
   * with the caller-JWT client (so the RPC's own `p_user_id = auth.uid()`
   * check passes) for THIS application's job_id — true only when the caller
   * is an active team member of the employer AND either has a null
   * assigned_job_ids (whole-employer access) or has this job in
   * assigned_job_ids. Any RPC error must be treated as false (fail closed),
   * never as true.
   */
  isScopedTeamMember: boolean;
  isDeveloper: boolean;
}

export function canAccessDossier(input: DossierAccessInput): boolean {
  const { isCandidateOwner, isEmployerOwner, isScopedTeamMember, isDeveloper } = input;
  return isCandidateOwner || isEmployerOwner || isScopedTeamMember || isDeveloper;
}
