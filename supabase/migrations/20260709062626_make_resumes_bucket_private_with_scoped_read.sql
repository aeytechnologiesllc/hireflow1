-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Close the world-readable-resume PII hole (verified 2026-07-09).
-- Client viewers now mint signed URLs (deployed); AI screening signs via
-- service role. Make the bucket private and scope reads to: the owner, and the
-- employer who owns the job the resume was submitted to.

UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "Resumes are publicly readable" ON storage.objects;

CREATE POLICY "Employers read applicant resumes"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE j.employer_id = auth.uid()
        AND a.resume_url LIKE ('%/resumes/' || storage.objects.name)
    )
  );
