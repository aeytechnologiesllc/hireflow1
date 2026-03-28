CREATE OR REPLACE FUNCTION public.subscription_plan_for_limits(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_record public.subscriptions%ROWTYPE;
BEGIN
  SELECT *
  INTO sub_record
  FROM public.subscriptions
  WHERE user_id = target_user_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'trial';
  END IF;

  IF sub_record.status = 'active' THEN
    RETURN COALESCE(sub_record.plan_type, 'growth');
  END IF;

  IF sub_record.status = 'trialing'
     AND (sub_record.trial_end IS NULL OR sub_record.trial_end > now()) THEN
    RETURN 'trial';
  END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.job_limit_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.subscription_plan_for_limits(target_user_id)
    WHEN 'business' THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'growth' THEN 3
    WHEN 'trial' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.document_workflow_limit_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.subscription_plan_for_limits(target_user_id)
    WHEN 'business' THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'growth' THEN 20
    WHEN 'trial' THEN 10
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.document_workflow_count_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH generated_docs AS (
    SELECT COUNT(*)::integer AS total
    FROM public.documents d
    JOIN public.applications a ON a.id = d.application_id
    JOIN public.jobs j ON j.id = a.job_id
    WHERE j.employer_id = target_user_id
  ),
  requested_docs AS (
    SELECT COUNT(*)::integer AS total
    FROM public.document_requests dr
    WHERE dr.employer_id = target_user_id
  )
  SELECT COALESCE((SELECT total FROM generated_docs), 0)
       + COALESCE((SELECT total FROM requested_docs), 0);
$$;

CREATE OR REPLACE FUNCTION public.can_create_jobs_for_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits AS (
    SELECT public.job_limit_for_user(target_user_id) AS job_limit
  ),
  usage AS (
    SELECT COUNT(*)::integer AS jobs_created
    FROM public.jobs
    WHERE employer_id = target_user_id
  )
  SELECT CASE
    WHEN limits.job_limit = -1 THEN true
    WHEN limits.job_limit <= 0 THEN false
    ELSE usage.jobs_created < limits.job_limit
  END
  FROM limits, usage;
$$;

CREATE OR REPLACE FUNCTION public.can_create_document_workflows_for_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits AS (
    SELECT public.document_workflow_limit_for_user(target_user_id) AS document_limit
  ),
  usage AS (
    SELECT public.document_workflow_count_for_user(target_user_id) AS workflows_created
  )
  SELECT CASE
    WHEN limits.document_limit = -1 THEN true
    WHEN limits.document_limit <= 0 THEN false
    ELSE usage.workflows_created < limits.document_limit
  END
  FROM limits, usage;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_plan_for_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_limit_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_workflow_limit_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_workflow_count_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_jobs_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_document_workflows_for_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Employers can create jobs" ON public.jobs;

CREATE POLICY "Employers can create jobs"
ON public.jobs
FOR INSERT
WITH CHECK (
  auth.uid() = employer_id
  AND public.has_role(auth.uid(), 'employer')
  AND public.can_create_jobs_for_user(auth.uid())
);

DROP POLICY IF EXISTS "Team members can create jobs if permitted" ON public.jobs;

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
      AND public.can_create_jobs_for_user(tm.employer_id)
  )
);

DROP POLICY IF EXISTS "Employers can create documents" ON public.documents;

CREATE POLICY "Employers can create documents"
ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  public.can_create_document_workflows_for_user(auth.uid())
  AND (
    (
      application_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE a.id = documents.application_id
          AND j.employer_id = auth.uid()
      )
    )
    OR (
      sender_id = auth.uid()
      AND public.has_role(auth.uid(), 'employer')
    )
  )
);

DROP POLICY IF EXISTS "Team members can create documents if permitted" ON public.documents;

CREATE POLICY "Team members can create documents if permitted"
ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  (
    application_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.team_members tm ON tm.employer_id = j.employer_id
      WHERE a.id = documents.application_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.can_send_documents = true
        AND public.can_create_document_workflows_for_user(j.employer_id)
        AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
    )
  )
  OR (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.can_send_documents = true
        AND public.can_create_document_workflows_for_user(tm.employer_id)
    )
  )
);

DROP POLICY IF EXISTS "Employers can create document requests" ON public.document_requests;

CREATE POLICY "Employers can create document requests"
ON public.document_requests
FOR INSERT
WITH CHECK (
  auth.uid() = employer_id
  AND public.can_create_document_workflows_for_user(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.id = document_requests.application_id
      AND j.employer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Team members can create document requests if permitted" ON public.document_requests;

CREATE POLICY "Team members can create document requests if permitted"
ON public.document_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_requests.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_send_documents = true
      AND public.can_create_document_workflows_for_user(j.employer_id)
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);
