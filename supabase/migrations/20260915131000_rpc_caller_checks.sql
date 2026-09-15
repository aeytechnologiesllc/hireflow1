-- Nine SECURITY DEFINER functions are exposed as PostgREST RPC endpoints to
-- anon and/or authenticated with no check that the caller has any right to
-- ask about the target_user_id/employer_id/candidate_id they pass in:
--
--   subscription_plan_for_limits(target_user_id) -- returns billing plan text
--   get_user_role(_user_id)                      -- returns app_role
--   job_limit_for_user(target_user_id)
--   team_member_limit_for_user(target_user_id)
--   document_workflow_limit_for_user(target_user_id)
--   document_workflow_count_for_user(target_user_id)
--   is_team_member(_user_id, _employer_id)
--   get_team_member_permissions(_user_id, _employer_id)
--
-- Any signed-in (several: even signed-out) user could POST
-- /rest/v1/rpc/get_user_role {"_user_id":"<victim>"} and learn a stranger's
-- billing plan, role or team permissions. Root cause, confirmed against the
-- live project: every one of these was CREATE FUNCTION'd without an explicit
-- `REVOKE ... FROM PUBLIC` first, so Postgres's default "EXECUTE granted to
-- PUBLIC on function creation" behavior stuck, and PUBLIC includes anon and
-- authenticated. A later `GRANT ... TO authenticated` (20260328102000,
-- 20260327204500) only ever *added* a redundant explicit grant -- it never
-- revoked the PUBLIC one underneath it.
--
-- Checked live (pg_get_functiondef, pg_policies.qual/with_check, every other
-- function body, every trigger, every src .rpc( call, every edge function):
-- none of these eight is referenced by any RLS policy, any other function,
-- or the app. They exist only to be called from the SECURITY DEFINER
-- functions below them in the chain (subscription_plan_for_limits <-
-- job_limit_for_user/document_workflow_limit_for_user; job_limit_for_user <-
-- can_create_jobs_for_user; team_member_limit_for_user <-
-- can_invite_team_members; document_workflow_limit_for_user/
-- document_workflow_count_for_user <- can_create_document_workflows_for_user)
-- -- or, for is_team_member/get_team_member_permissions, not called at all
-- (the client reads the team_members table directly via its own RLS
-- instead; see src/hooks/useTeamMemberPermissions.ts and
-- src/hooks/useAuth.tsx's checkTeamMembership). All nine SECURITY DEFINER
-- functions in that chain are owned by `postgres`, so revoking anon/
-- authenticated/PUBLIC here changes nothing about the internal calls: a
-- SECURITY DEFINER function runs its body -- including the functions IT
-- calls -- as its owner, and an owner always has implicit EXECUTE on their
-- own functions regardless of what's granted to other roles. Only the
-- PostgREST RPC endpoint (called directly, as the real anon/authenticated
-- role) goes away.
REVOKE ALL ON FUNCTION public.subscription_plan_for_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_limit_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_member_limit_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_workflow_limit_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_workflow_count_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_member_permissions(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The remaining six ARE called directly by RLS policies (checked against
-- live pg_policies.qual/with_check) or, for has_role, by nearly every policy
-- in the schema -- so their EXECUTE grants stay as-is (revoking them would
-- break every "Employers can create jobs"-shaped policy the moment anon
-- evaluates it, per the task's own caution). Instead each function gets a
-- caller check added to its body: the argument that names a user must equal
-- auth.uid() (the one shape every live call site actually uses), the caller
-- must be an active team member of the target employer (the one additional
-- shape jobs/document_requests/documents policies use, calling with
-- tm.employer_id on behalf of a team member whose own id is auth.uid()), or
-- the caller is service_role. Anything else now gets the safe default
-- (false) instead of a real answer, with zero change to any live policy's
-- behavior -- proved by the PGlite test at
-- scripts/rpc_caller_checks.pglite.test.mjs.

-- has_role(_user_id, _role): every live call site (pg_policies, checked) is
-- has_role(auth.uid(), '<role>') -- never a third party's id.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
$function$;

-- can_create_jobs_for_user(target_user_id): called as
-- can_create_jobs_for_user(auth.uid()) by "Employers can create jobs" and as
-- can_create_jobs_for_user(tm.employer_id) by "Team members can create jobs
-- if permitted", where auth.uid() is the team member's own id and
-- tm.employer_id is the target -- so an active team member of target_user_id
-- is a legitimate caller too, not just target_user_id themselves.
CREATE OR REPLACE FUNCTION public.can_create_jobs_for_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH limits AS (
    SELECT public.job_limit_for_user(target_user_id) AS job_limit
  ),
  usage AS (
    SELECT COUNT(*)::integer AS jobs_created
    FROM public.jobs
    WHERE employer_id = target_user_id
  )
  SELECT (
    target_user_id = auth.uid()
    OR auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.employer_id = target_user_id
        AND tm.status = 'active'
    )
  )
  AND CASE
    WHEN limits.job_limit = -1 THEN true
    WHEN limits.job_limit <= 0 THEN false
    ELSE usage.jobs_created < limits.job_limit
  END
  FROM limits, usage;
$function$;

-- can_create_document_workflows_for_user(target_user_id): same shape as
-- can_create_jobs_for_user above -- called with auth.uid() directly
-- (Employers can create documents / document requests) and with
-- tm.employer_id / j.employer_id on behalf of an active team member
-- (Team members can create documents/document requests if permitted).
CREATE OR REPLACE FUNCTION public.can_create_document_workflows_for_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH limits AS (
    SELECT public.document_workflow_limit_for_user(target_user_id) AS document_limit
  ),
  usage AS (
    SELECT public.document_workflow_count_for_user(target_user_id) AS workflows_created
  )
  SELECT (
    target_user_id = auth.uid()
    OR auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.employer_id = target_user_id
        AND tm.status = 'active'
    )
  )
  AND CASE
    WHEN limits.document_limit = -1 THEN true
    WHEN limits.document_limit <= 0 THEN false
    ELSE usage.workflows_created < limits.document_limit
  END
  FROM limits, usage;
$function$;

-- can_invite_team_members(target_user_id): the only live call site is
-- "Employers can create invitations", which calls
-- can_invite_team_members(auth.uid()) -- no team-member-on-behalf-of shape
-- exists for this one (only employers invite), so the caller check is just
-- target_user_id = auth.uid() (or service_role).
CREATE OR REPLACE FUNCTION public.can_invite_team_members(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH limits AS (
    SELECT public.team_member_limit_for_user(target_user_id) AS team_member_limit
  ),
  usage AS (
    SELECT COUNT(*)::integer AS active_team_members
    FROM public.team_members tm
    WHERE tm.employer_id = target_user_id
      AND tm.status = 'active'
  )
  SELECT (target_user_id = auth.uid() OR auth.role() = 'service_role')
  AND CASE
    WHEN limits.team_member_limit = -1 THEN true
    WHEN limits.team_member_limit <= 0 THEN false
    ELSE usage.active_team_members < limits.team_member_limit
  END
  FROM limits, usage;
$function$;

-- can_view_applicant_profile(p_profile_user_id, p_viewer_id): the only live
-- call site is "Employers can view applicant profiles", which always passes
-- p_viewer_id = auth.uid(). p_profile_user_id is deliberately left
-- unrestricted -- it is the candidate being asked about, not the caller --
-- the EXISTS below is what actually gates whether the answer is true.
-- anon is also revoked here: unlike has_role/can_create_*/can_invite_*, no
-- live policy that references this function applies to anon (it's only used
-- by a `TO authenticated`-scoped SELECT policy), so anon never had a
-- legitimate reason to call it and only ever had explicit EXECUTE, not a
-- PUBLIC grant, to lose.
CREATE OR REPLACE FUNCTION public.can_view_applicant_profile(p_profile_user_id uuid, p_viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (p_viewer_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.candidate_id = p_profile_user_id
        AND (
          j.employer_id = p_viewer_id
          OR EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.employer_id = j.employer_id
              AND tm.user_id = p_viewer_id
              AND tm.status = 'active'
              AND (
                array_length(tm.assigned_job_ids, 1) IS NULL
                OR j.id = ANY (tm.assigned_job_ids)
              )
          )
        )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_applicant_profile(uuid, uuid) FROM anon;

-- did_candidate_apply_to_job(p_job_id, p_user_id): the only live call site
-- is "Candidates can view jobs they applied to", which always passes
-- p_user_id = auth.uid(). Same anon story as can_view_applicant_profile:
-- only a `TO authenticated` policy uses it, so anon's explicit grant was
-- never legitimate either.
CREATE OR REPLACE FUNCTION public.did_candidate_apply_to_job(p_job_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.job_id = p_job_id
        AND a.candidate_id = p_user_id
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.did_candidate_apply_to_job(uuid, uuid) FROM anon;
