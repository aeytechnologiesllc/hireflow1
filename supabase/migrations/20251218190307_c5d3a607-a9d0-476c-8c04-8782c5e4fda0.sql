-- Allow employers to delete applications for their jobs
CREATE POLICY "Employers can delete applications to their jobs"
  ON applications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND jobs.employer_id = auth.uid()
    )
  );

-- Allow team members to delete if they have pipeline management permission
CREATE POLICY "Team members can delete applications if permitted"
  ON applications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN team_members tm ON tm.employer_id = j.employer_id
      WHERE j.id = applications.job_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_manage_pipeline = true
      AND (
        array_length(tm.assigned_job_ids, 1) IS NULL
        OR j.id = ANY(tm.assigned_job_ids)
      )
    )
  );