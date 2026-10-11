-- An applicant can answer a team member (2026-10-11 overview).
--
-- A team member allowed to message applicants can write to one on a job they
-- are on ("Team members can send messages if permitted"), but the applicant
-- could only ever write to the job's OWNER ("Counterparties can send
-- messages"), so the reply to the team member's message was refused and the
-- thread was a dead end. Now an applicant may also write to an active team
-- member of the business they applied to, who is allowed to message
-- applicants and is on that job.
--
-- The check reads team_members, which an applicant cannot see, so it is a
-- SECURITY DEFINER function that answers only about the caller as the
-- applicant. Re-runnable.

CREATE OR REPLACE FUNCTION public.applicant_can_message_team_member(p_receiver uuid, p_application uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.team_members tm ON tm.employer_id = j.employer_id
     WHERE a.candidate_id = auth.uid()
       AND (p_application IS NULL OR a.id = p_application)
       AND tm.user_id = p_receiver
       AND tm.status = 'active'
       AND tm.can_message_candidates = true
       AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
  );
$$;
REVOKE ALL ON FUNCTION public.applicant_can_message_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.applicant_can_message_team_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Applicants can reply to the hiring team" ON public.messages;
CREATE POLICY "Applicants can reply to the hiring team"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.applicant_can_message_team_member(receiver_id, application_id));
