-- Add DELETE policy for employers to delete interviews
CREATE POLICY "Employers can delete interviews"
ON public.interviews
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM applications
    JOIN jobs ON (jobs.id = applications.job_id)
    WHERE applications.id = interviews.application_id
    AND jobs.employer_id = auth.uid()
  )
);

-- Add DELETE policy for team members with permission
CREATE POLICY "Team members can delete interviews if permitted"
ON public.interviews
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON (j.id = a.job_id)
    JOIN team_members tm ON (tm.employer_id = j.employer_id)
    WHERE a.id = interviews.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.can_schedule_interviews = true
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);