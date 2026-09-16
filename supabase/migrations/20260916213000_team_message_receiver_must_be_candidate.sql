-- Team members can only message the candidate on the application (2026-09-16).
--
-- "Team members can send messages if permitted" checked that the sender is an
-- active team member with can_message_candidates on the job behind
-- application_id, but never looked at receiver_id. A team member could attach
-- any application from an assigned job and set receiver_id to ANY user on
-- HireFlow (another employer, a candidate who never applied). "Users can view
-- their own messages" then put that message in the stranger's inbox, and the
-- message notification trigger pinged them.
--
-- 20260915121000_forgery_policy_lockdown.sql fixed the non-team policy the same
-- way and left this one untouched, judging it already well-shaped. It was
-- missing exactly this one condition.
--
-- Every UI path that sends as a team member targets the application's
-- candidate: BulkMessageDialog (receiver_id: app.candidate_id),
-- ApplicantMessageDialog (receiver_id: candidateId) and the cockpit Messages
-- thread (conversations are keyed on applications).

DROP POLICY IF EXISTS "Team members can send messages if permitted" ON public.messages;

CREATE POLICY "Team members can send messages if permitted"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = messages.application_id
      AND messages.receiver_id = a.candidate_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_message_candidates = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
  )
);
