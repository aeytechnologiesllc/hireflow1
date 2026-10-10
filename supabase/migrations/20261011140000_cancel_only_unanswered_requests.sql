-- ============================================================================
-- A request can be cancelled only while nothing has been sent for it
-- (2026-10-10). docs/DOCUMENT-REQUESTS.md.
-- ============================================================================
-- The owner asked for an NBI clearance by mistake and wants it gone. The
-- live rule "Employers can delete document requests" let the job's owner
-- delete ANY request, including one with an uploaded ID: the row went, but
-- the photo stayed in the private bucket with nothing pointing at it, where
-- the 24-hour cleanup (document-cleanup) never looks. An ID kept forever,
-- against what the applicant was promised.
--
-- Now the owner may delete a request only while it holds no file and no
-- typed answer (waiting, or asked again with the file already gone). Who may
-- delete is unchanged: the job's owner. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

DROP POLICY IF EXISTS "Employers can delete document requests" ON public.document_requests;
CREATE POLICY "Employers can delete document requests"
  ON public.document_requests FOR DELETE
  USING (
    document_requests.file_url IS NULL
    AND document_requests.answer_text IS NULL
    AND EXISTS (
      SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
       WHERE a.id = document_requests.application_id
         AND j.employer_id = auth.uid()
    )
  );

RESET lock_timeout;
RESET statement_timeout;
