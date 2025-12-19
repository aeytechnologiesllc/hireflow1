-- Fix RLS policies for documents table to allow creation with or without application_id

-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Employers can create documents" ON documents;
DROP POLICY IF EXISTS "Team members can create documents if permitted" ON documents;

-- Recreate employer INSERT policy with both paths
CREATE POLICY "Employers can create documents" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Path A: Document linked to an application the employer owns
    (
      application_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.id = documents.application_id
        AND j.employer_id = auth.uid()
      )
    )
    OR
    -- Path B: Document NOT linked to application, but sender is the employer
    (
      sender_id = auth.uid() AND
      public.has_role(auth.uid(), 'employer')
    )
  );

-- Recreate team members INSERT policy with both paths
CREATE POLICY "Team members can create documents if permitted" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Path A: With application
    (
      application_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM applications a
        JOIN jobs j ON j.id = a.job_id
        JOIN team_members tm ON tm.employer_id = j.employer_id
        WHERE a.id = documents.application_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.can_send_documents = true
        AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
      )
    )
    OR
    -- Path B: Without application (manual recipient)
    (
      sender_id = auth.uid() AND
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.can_send_documents = true
      )
    )
  );

-- Add SELECT policy for documents sent by user
CREATE POLICY "Users can view documents they sent" ON documents
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid());