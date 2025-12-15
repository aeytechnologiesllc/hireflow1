-- Allow employers to delete documents for their jobs
CREATE POLICY "Employers can delete their documents"
ON public.documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = documents.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Allow candidates to delete documents sent to them
CREATE POLICY "Candidates can delete their documents"
ON public.documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM applications a
    WHERE a.id = documents.application_id
    AND a.candidate_id = auth.uid()
  )
);