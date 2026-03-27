CREATE OR REPLACE FUNCTION public.team_member_limit_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = target_user_id
        AND s.status = 'active'
        AND s.plan_type IN ('business', 'enterprise')
    ) THEN -1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_invite_team_members(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits AS (
    SELECT public.team_member_limit_for_user(target_user_id) AS team_member_limit
  ),
  usage AS (
    SELECT COUNT(*)::integer AS active_team_members
    FROM public.team_members tm
    WHERE tm.employer_id = target_user_id
      AND tm.status = 'active'
  )
  SELECT CASE
    WHEN limits.team_member_limit = -1 THEN true
    WHEN limits.team_member_limit <= 0 THEN false
    ELSE usage.active_team_members < limits.team_member_limit
  END
  FROM limits, usage;
$$;

GRANT EXECUTE ON FUNCTION public.team_member_limit_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_invite_team_members(uuid) TO authenticated;

DROP POLICY IF EXISTS "Employers can create invitations" ON public.team_invitations;

CREATE POLICY "Employers can create invitations"
ON public.team_invitations
FOR INSERT
WITH CHECK (
  auth.uid() = inviter_id
  AND public.has_role(auth.uid(), 'employer')
  AND public.can_invite_team_members(auth.uid())
);

CREATE POLICY "Team members can create jobs if permitted"
ON public.jobs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.employer_id = jobs.employer_id
      AND tm.can_create_jobs = true
  )
);

CREATE POLICY "Team members can update assigned jobs if permitted"
ON public.jobs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.employer_id = jobs.employer_id
      AND tm.can_create_jobs = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR jobs.id = ANY(tm.assigned_job_ids))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.employer_id = jobs.employer_id
      AND tm.can_create_jobs = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR jobs.id = ANY(tm.assigned_job_ids))
  )
);

CREATE POLICY "Team members can delete assigned jobs if permitted"
ON public.jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.employer_id = jobs.employer_id
      AND tm.can_delete_jobs = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR jobs.id = ANY(tm.assigned_job_ids))
  )
);
