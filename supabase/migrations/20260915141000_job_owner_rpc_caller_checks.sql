-- public.is_job_owner(p_job_id, p_user_id) and
-- public.is_active_team_member_for_job(p_job_id, p_user_id, ...) are
-- SECURITY DEFINER, STABLE, and exposed as PostgREST RPC endpoints
-- (confirmed live: EXECUTE granted to postgres, anon, authenticated,
-- service_role -- no caller check at all in either body, from
-- 20260715014000_break_jobs_applications_rls_recursion.sql). Either one
-- answers about an ARBITRARY p_user_id with no relationship to the caller,
-- so any signed-in stranger (anon too) could
-- POST /rest/v1/rpc/is_job_owner {"p_job_id":"<job>","p_user_id":"<victim>"}
-- or the team-member equivalent and learn whether some other user owns a
-- job, or is an active team member of it with specific permissions.
--
-- Checked live (pg_get_functiondef, pg_policies.qual/with_check across all
-- schemas, every other function body with prokind='f', every trigger, every
-- src .rpc( call -- none found): every calling policy/function passes
-- auth.uid() as p_user_id EXCEPT two policy branches, both added in
-- 20260915121000_forgery_policy_lockdown.sql /
-- 20260827211000_lockdown_notification_inserts.sql, which ask "is the OTHER
-- party (the message/notification recipient) the owner of this job" on a
-- candidate's behalf:
--
--   * messages "Counterparties can send messages", candidate branch:
--       is_job_owner(a.job_id, messages.receiver_id)
--   * notifications "Related parties can insert notifications", branch (c):
--       is_job_owner(a.job_id, notifications.user_id)
--
-- Adding a plain "p_user_id must be auth.uid()" check straight into
-- is_job_owner would silently break both -- a candidate messaging/notifying
-- the employer of a job they applied to would stop working, because the
-- policy is asking about the employer's id, not the candidate's own. Fixed
-- in two parts:
--
-- 1) Both policies are recreated (DROP POLICY IF EXISTS + CREATE, live text
--    copied verbatim otherwise) with just that one branch rewritten as an
--    inline EXISTS(... JOIN public.jobs j ...) instead of a call to
--    is_job_owner with someone else's id. This is not a SECURITY DEFINER
--    escape hatch -- it runs with the policy's own (authenticated) caller
--    privileges, same as the rest of the policy already does, and needs the
--    querying role to be able to see the joined jobs row. It can: in both
--    rewritten branches the candidate is a.candidate_id = auth.uid(), and
--    "Candidates can view jobs they applied to" (jobs SELECT policy,
--    did_candidate_apply_to_job(id, auth.uid())) already lets that same
--    candidate read that exact jobs row directly -- confirmed live via
--    pg_policies. The semantics are identical to the is_job_owner call they
--    replace (j.id = a.job_id AND j.employer_id = <target>), just without
--    asking the RPC-exposed function to vouch for a third party.
--
-- 2) Both functions gain the same caller check the six kept functions in
--    20260915131000_rpc_caller_checks.sql use: p_user_id must equal
--    auth.uid(), or the caller must be service_role. Every remaining call
--    site (applications employer/team policies, document_audit_logs,
--    job_quiz_keys x4, get_job_quiz_keys, grant_quiz_retake,
--    protect_application_columns, notify_new_application_submitted) already
--    only ever passes auth.uid(), so none of them change behavior. EXECUTE
--    is then revoked from anon (and PUBLIC, defensively, though the ACL
--    check showed no separate PUBLIC grant) -- authenticated and
--    service_role keep it, because RLS on job_quiz_keys/applications/etc.
--    still needs to call these as the real signed-in caller. Internal
--    callers (get_job_quiz_keys, grant_quiz_retake,
--    protect_application_columns, notify_new_application_submitted) are all
--    themselves SECURITY DEFINER and owned by postgres, so they keep
--    working regardless of what's granted to anon/authenticated -- a
--    SECURITY DEFINER function's body runs, including the functions it
--    calls, as its owner (same reasoning as 20260915131000's header
--    comment).
--
-- PGlite proof: scripts/job_owner_rpc_caller_checks.pglite.test.mjs.

-- ---------------------------------------------------------------------
-- 1) Rewrite the two policy branches that ask is_job_owner about someone
--    other than the caller, so the caller check below doesn't break them.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Counterparties can send messages" ON public.messages;

CREATE POLICY "Counterparties can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    -- candidate -> owner of a job they applied to. Was
    -- is_job_owner(a.job_id, messages.receiver_id) -- asking the RPC-exposed
    -- function to vouch for messages.receiver_id, a party who is not the
    -- caller. Same answer, computed inline instead: the candidate can read
    -- their own applied-to job's row ("Candidates can view jobs they
    -- applied to"), so just check its employer_id directly.
    EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.candidate_id = auth.uid()
        AND j.employer_id = messages.receiver_id
        AND (messages.application_id IS NULL OR messages.application_id = a.id)
    )
    -- job owner -> candidate of an application on one of their jobs.
    -- is_job_owner(a.job_id, auth.uid()) already passes the caller's own id
    -- -- unchanged.
    OR EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.candidate_id = messages.receiver_id
        AND public.is_job_owner(a.job_id, auth.uid())
        AND (messages.application_id IS NULL OR messages.application_id = a.id)
    )
  )
);

DROP POLICY IF EXISTS "Related parties can insert notifications" ON public.notifications;

CREATE POLICY "Related parties can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  -- (d) self-insert
  auth.uid() = user_id

  -- (a) employer/team-member -> candidate of an application on one of the
  -- employer's jobs. Both calls already pass the caller's own id --
  -- unchanged.
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.candidate_id = notifications.user_id
      AND (
        public.is_job_owner(a.job_id, auth.uid())
        OR public.is_active_team_member_for_job(a.job_id, auth.uid())
      )
  )

  -- (b) employer/requester -> candidate of a document_requests row they
  -- created
  OR EXISTS (
    SELECT 1
    FROM public.document_requests dr
    WHERE dr.employer_id = auth.uid()
      AND dr.candidate_id = notifications.user_id
  )

  -- (c) candidate -> employer of a job they applied to. Was
  -- is_job_owner(a.job_id, notifications.user_id) -- asking about
  -- notifications.user_id, not the caller. Same inline rewrite as the
  -- messages policy above.
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.candidate_id = auth.uid()
      AND j.employer_id = notifications.user_id
  )

  -- (c) candidate -> employer/requester of a document_requests row
  -- addressed to them
  OR EXISTS (
    SELECT 1
    FROM public.document_requests dr
    WHERE dr.candidate_id = auth.uid()
      AND dr.employer_id = notifications.user_id
  )
);

-- Belt and braces, same as 20260827211000: `TO authenticated` already
-- excludes anon, this just makes it impossible to accidentally re-open via
-- a future broad GRANT.
REVOKE INSERT ON public.notifications FROM anon;

-- ---------------------------------------------------------------------
-- 2) Add the caller check to both functions and lock the RPC endpoint down.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = p_job_id
        AND j.employer_id = p_user_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(
  p_job_id uuid,
  p_user_id uuid,
  p_require_manage_pipeline boolean DEFAULT false,
  p_require_create_jobs boolean DEFAULT false,
  p_require_delete_jobs boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
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
$function$;

REVOKE EXECUTE ON FUNCTION public.is_job_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
