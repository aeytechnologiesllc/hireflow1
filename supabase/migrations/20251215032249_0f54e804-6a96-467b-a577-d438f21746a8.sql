-- Allow candidates to delete their own applications
CREATE POLICY "Candidates can delete their own applications"
ON public.applications
FOR DELETE
USING (auth.uid() = candidate_id);