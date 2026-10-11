-- Papers an applicant sent never outlive their request (2026-10-11, the
-- final gap check).
--
-- document-cleanup finds files to delete through document_requests rows. When
-- a job, an application or a business's account is deleted, those rows go
-- with it (cascade) and their files stayed in storage for good: an ID photo
-- kept forever, against "deleted 24 hours after you first open them".
-- Now every request deleted with a file still attached leaves a note here,
-- and the hourly document-cleanup deletes that file (and its folder) and the
-- note. Only the service role (the cleanup) reads or writes this table.

CREATE TABLE IF NOT EXISTS public.document_file_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  request_id uuid NOT NULL,
  file_url text,
  queued_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_file_trash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_file_trash FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.document_requests_trash_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.file_url IS NOT NULL AND OLD.candidate_id IS NOT NULL THEN
    INSERT INTO public.document_file_trash (candidate_id, request_id, file_url)
    VALUES (OLD.candidate_id, OLD.id, OLD.file_url);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.document_requests_trash_file() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS document_requests_trash_file ON public.document_requests;
CREATE TRIGGER document_requests_trash_file
  AFTER DELETE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_trash_file();
