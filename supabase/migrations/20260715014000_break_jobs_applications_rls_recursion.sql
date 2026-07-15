-- Break jobs/applications/profiles RLS recursion by moving cross-table checks
-- into SECURITY DEFINER helpers owned by the migration role.

CREATE OR REPLACE FUNCTION public.did_candidate_apply_to_job(
  p_job_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.job_id = p_job_id
      AND a.candidate_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_job_owner(
  p_job_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.employer_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(
  p_job_id uuid,
  p_user_id uuid,
  p_require_manage_pipeline boolean DEFAULT false,
  p_require_create_jobs boolean DEFAULT false,
  p_require_delete_jobs boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE j.id = p_job_id
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
      AND (NOT p_require_manage_pipeline OR tm.can_manage_pipeline = true)
      AND (NOT p_require_create_jobs OR tm.can_create_jobs = true)
      AND (NOT p_require_delete_jobs OR tm.can_delete_jobs = true)
      AND (
        array_length(tm.assigned_job_ids, 1) IS NULL
        OR j.id = ANY (tm.assigned_job_ids)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_applicant_profile(
  p_profile_user_id uuid,
  p_viewer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
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
$$;

REVOKE ALL ON FUNCTION public.did_candidate_apply_to_job(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_job_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_applicant_profile(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.did_candidate_apply_to_job(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_job_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_applicant_profile(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Candidates can view jobs they applied to" ON public.jobs;
CREATE POLICY "Candidates can view jobs they applied to"
ON public.jobs
FOR SELECT
TO authenticated
USING (public.did_candidate_apply_to_job(jobs.id, auth.uid()));

DROP POLICY IF EXISTS "Employers can view applications to their jobs" ON public.applications;
CREATE POLICY "Employers can view applications to their jobs"
ON public.applications
FOR SELECT
TO authenticated
USING (public.is_job_owner(applications.job_id, auth.uid()));

DROP POLICY IF EXISTS "Employers can update applications to their jobs" ON public.applications;
CREATE POLICY "Employers can update applications to their jobs"
ON public.applications
FOR UPDATE
TO authenticated
USING (public.is_job_owner(applications.job_id, auth.uid()));

DROP POLICY IF EXISTS "Employers can delete applications to their jobs" ON public.applications;
CREATE POLICY "Employers can delete applications to their jobs"
ON public.applications
FOR DELETE
TO authenticated
USING (public.is_job_owner(applications.job_id, auth.uid()));

DROP POLICY IF EXISTS "Team members can view applications for assigned jobs" ON public.applications;
CREATE POLICY "Team members can view applications for assigned jobs"
ON public.applications
FOR SELECT
TO authenticated
USING (public.is_active_team_member_for_job(applications.job_id, auth.uid()));

DROP POLICY IF EXISTS "Team members can update applications if permitted" ON public.applications;
CREATE POLICY "Team members can update applications if permitted"
ON public.applications
FOR UPDATE
TO authenticated
USING (public.is_active_team_member_for_job(applications.job_id, auth.uid(), true));

DROP POLICY IF EXISTS "Team members can delete applications if permitted" ON public.applications;
CREATE POLICY "Team members can delete applications if permitted"
ON public.applications
FOR DELETE
TO authenticated
USING (public.is_active_team_member_for_job(applications.job_id, auth.uid(), true));

DROP POLICY IF EXISTS "Employers can view applicant profiles" ON public.profiles;
CREATE POLICY "Employers can view applicant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.can_view_applicant_profile(profiles.user_id, auth.uid())
);
