-- Allow anyone to view invitations by code (for JoinTeam page)
CREATE POLICY "Anyone can view invitations by code" 
ON public.team_invitations 
FOR SELECT 
USING (invite_code IS NOT NULL);

-- Allow users to insert themselves as team members when joining via invitation
CREATE POLICY "Users can join via invitation" 
ON public.team_members 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Team members can view interviews for their assigned jobs
CREATE POLICY "Team members can view interviews for assigned jobs"
ON public.interviews
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = interviews.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can create interviews if they have permission
CREATE POLICY "Team members can create interviews if permitted"
ON public.interviews
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = interviews.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_schedule_interviews = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can update interviews if they have permission
CREATE POLICY "Team members can update interviews if permitted"
ON public.interviews
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = interviews.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_schedule_interviews = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can view messages for their assigned jobs
CREATE POLICY "Team members can view messages for assigned jobs"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = messages.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can send messages if they have permission
CREATE POLICY "Team members can send messages if permitted"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = messages.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_message_candidates = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can view documents for their assigned jobs
CREATE POLICY "Team members can view documents for assigned jobs"
ON public.documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = documents.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can create documents if they have permission
CREATE POLICY "Team members can create documents if permitted"
ON public.documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = documents.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_send_documents = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can update documents if they have permission
CREATE POLICY "Team members can update documents if permitted"
ON public.documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = documents.application_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_send_documents = true
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);