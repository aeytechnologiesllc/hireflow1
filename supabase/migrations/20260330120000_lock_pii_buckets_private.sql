-- =====================================================================
-- P0-9 / P1-1: Lock candidate-PII storage buckets to PRIVATE + signed URLs
-- =====================================================================
-- Buckets `resumes`, `videos`, `portfolios`, `message-attachments` were
-- created with public=true. Public buckets serve via an unauthenticated CDN
-- path (/storage/v1/object/public/...) that BYPASSES storage.objects RLS,
-- so the scoped SELECT policies on those buckets were dead code and anyone
-- with (or guessing) an object URL could download resumes, video intros,
-- portfolios and private chat attachments with no auth.
--
-- This migration:
--   1. Flips the four PII buckets to public=false (avatars stays public -
--      avatars are intended to be world-readable).
--   2. Drops the "publicly readable" SELECT policies.
--   3. Re-scopes message-attachments INSERT/SELECT/DELETE to the owner
--      (and, for SELECT, the message recipient) instead of bucket-only.
--   4. Adds owner + reviewer (employer / active team member) SELECT
--      policies on resumes and portfolios so employer review keeps working
--      via short-lived signed URLs (videos already has an employer policy;
--      a team-member policy is added for parity).
--
-- After this, all reads MUST go through createSignedUrl(); the persisted
-- /object/public/ links stop resolving. App call sites that must switch
-- from getPublicUrl() to createSignedUrl() are listed in the fix notes.
-- The server-side resume fetch (_shared/resume.ts) and ava-voice-session
-- already fall back to admin createSignedUrl(), so the AI analysis path is
-- unaffected.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Make the PII buckets private (idempotent).
-- ---------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id IN ('resumes', 'videos', 'portfolios', 'message-attachments');

-- ---------------------------------------------------------------------
-- 2. Drop the world-readable / bucket-only SELECT policies.
--    (DROP ... IF EXISTS is idempotent and safe to re-run.)
-- ---------------------------------------------------------------------

-- resumes: "Resumes are publicly readable" (no TO, no owner check) -> P0-9
DROP POLICY IF EXISTS "Resumes are publicly readable" ON storage.objects;

-- portfolios: "Portfolio files are publicly accessible" (no owner check) -> P0-9
DROP POLICY IF EXISTS "Portfolio files are publicly accessible" ON storage.objects;

-- message-attachments: all three policies were scoped only by bucket_id
-- (no auth.uid()/folder check) -> P1-1: cross-tenant read/write/DELETE.
DROP POLICY IF EXISTS "Users can upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their message attachments" ON storage.objects;

-- ---------------------------------------------------------------------
-- 3. message-attachments: owner-scoped INSERT/DELETE + participant SELECT.
--    Path layout is `${auth.uid()}/<file>` (useMessages.ts:346), so the
--    first folder segment is the uploader. SELECT also allows the other
--    party of a message that references the object (sender or receiver).
-- ---------------------------------------------------------------------

CREATE POLICY "Users can upload their own message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own message attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owner can read their own uploads.
CREATE POLICY "Users can view their own message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- The other participant of a message that references this object can read it.
-- messages.file_url is the persisted storage URL and ends with the object
-- `name`; matching on the suffix keeps the check robust to the public-vs-
-- signed URL prefix.
CREATE POLICY "Message participants can view shared attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
      AND m.file_url LIKE '%' || storage.objects.name
  )
);

-- ---------------------------------------------------------------------
-- 4. resumes: add reviewer SELECT (owner SELECT/INSERT/DELETE already
--    exist from 20251214222311). Path layout is `${candidate auth.uid()}/...`
--    (ApplicationFormPhase.tsx:506, Profile.tsx:135), so the first folder
--    segment is the candidate. Employers/team members who have an
--    application from that candidate may read.
-- ---------------------------------------------------------------------

CREATE POLICY "Employers can view applicant resumes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE j.employer_id = auth.uid()
      AND a.candidate_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Team members can view applicant resumes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE a.candidate_id::text = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- ---------------------------------------------------------------------
-- 5. portfolios: add reviewer SELECT (owner SELECT/INSERT/UPDATE/DELETE
--    already exist from 20251216220244). Path layout is
--    `${candidate auth.uid()}/...` (PortfolioUploadPhase.tsx:236).
-- ---------------------------------------------------------------------

CREATE POLICY "Employers can view applicant portfolios"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portfolios'
  AND EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE j.employer_id = auth.uid()
      AND a.candidate_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Team members can view applicant portfolios"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portfolios'
  AND EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE a.candidate_id::text = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- ---------------------------------------------------------------------
-- 6. videos: employer SELECT already exists (20251215001652). Add the
--    team-member SELECT for parity. (Owner SELECT/INSERT also already
--    exist.) The candidate owner-SELECT policy "Users can view their own
--    videos" remains in force.
-- ---------------------------------------------------------------------

CREATE POLICY "Team members can view candidate videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'videos'
  AND EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE a.candidate_id::text = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);
