-- Allow candidates to update their own applications (for phase submissions)
CREATE POLICY "Candidates can update their own applications"
ON public.applications
FOR UPDATE
USING (auth.uid() = candidate_id)
WITH CHECK (auth.uid() = candidate_id);