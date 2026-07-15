-- Resume files must not be world-readable. Store canonical resume values as
-- private storage paths and let authorized users mint short-lived signed URLs.

UPDATE storage.buckets
SET public = false
WHERE id = 'resumes';

DROP POLICY IF EXISTS "Resumes are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Employers can view submitted resumes" ON storage.objects;

CREATE POLICY "Employers can view submitted resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    LEFT JOIN public.team_members tm
      ON tm.employer_id = j.employer_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
    WHERE a.resume_url = storage.objects.name
      AND (
        j.employer_id = auth.uid()
        OR tm.id IS NOT NULL
      )
  )
);

UPDATE public.profiles
SET resume_url = regexp_replace(resume_url, '^.*/storage/v1/object/(public/)?resumes/', '')
WHERE resume_url LIKE '%/storage/v1/object/%/resumes/%';

UPDATE public.applications
SET resume_url = regexp_replace(resume_url, '^.*/storage/v1/object/(public/)?resumes/', '')
WHERE resume_url LIKE '%/storage/v1/object/%/resumes/%';
