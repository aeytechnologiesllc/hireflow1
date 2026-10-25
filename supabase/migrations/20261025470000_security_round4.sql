-- Phase 7 security review, round 4 (2026-10-25).
--
-- 1. A document's content is fixed once it is sent: no browser changes its
--    letter, file, name, type or v1 afterwards. Nothing in the app does; a
--    business could PATCH the letter while the applicant was reading it, and
--    the screen showed the new one in place under their half-typed name (the
--    signing function signs what the screen showed, so the new letter was
--    signed). A change is a new document. The document-signing function
--    (service role) is not a browser.
-- 2. What an applicant may still write (20261025430000): an application with
--    no notes yet read as "answers changed" on every notes write once it had
--    moved on (NULL against an array of nulls); no notes now reads as notes
--    without those keys.
-- 3. The resume rule on a new application too: an applicant's own insert
--    keeps resume_url only when it is a file in their own folder (the third
--    review's rule held on UPDATE only).

CREATE OR REPLACE FUNCTION public.documents_client_content_fixed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.file_url IS DISTINCT FROM OLD.file_url
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.v1_hash IS DISTINCT FROM OLD.v1_hash THEN
    RAISE EXCEPTION 'document_content_fixed'
      USING ERRCODE = 'check_violation',
            HINT = 'document_content_fixed',
            DETAIL = 'A sent document cannot be changed. Withdraw it and send a new one.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.documents_client_content_fixed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_client_content_fixed ON public.documents;
CREATE TRIGGER documents_client_content_fixed
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_client_content_fixed();

CREATE OR REPLACE FUNCTION public.applications_applicant_write_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  old_answers jsonb;
  new_answers jsonb;
BEGIN
  -- The resume is the applicant's own: nobody else's browser points it at
  -- another file (round 2: a business set its own application's resume_url to
  -- another file in the applicant's folder and then read it).
  IF current_user = 'authenticated' AND auth.uid() IS DISTINCT FROM OLD.candidate_id THEN
    NEW.resume_url := OLD.resume_url;
  END IF;

  -- Only a write straight from the applicant's own session.
  IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM OLD.candidate_id
     OR public.is_job_owner(OLD.job_id, auth.uid()) OR public.is_active_team_member_for_job(OLD.job_id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- The resume is a file in the applicant's own folder, as the form stores it
  -- (<their id>/<name>): never a page of instructions for the scorer (the
  -- third Phase 7 security review: a 20,000-character resume_url went into
  -- both scoring prompts).
  IF NEW.resume_url IS DISTINCT FROM OLD.resume_url AND NEW.resume_url IS NOT NULL
     AND (length(NEW.resume_url) > 300
          OR NEW.resume_url !~ ('^' || OLD.candidate_id::text || '/[^/\n\r\t][^\n\r\t]*$')
          OR NEW.resume_url LIKE '%..%') THEN
    RAISE EXCEPTION 'resume_not_own_file'
      USING ERRCODE = 'check_violation',
            DETAIL = 'A resume is a file you uploaded to your own folder.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status::text = 'in_progress' AND NEW.status::text = 'pending') THEN
    RAISE EXCEPTION 'applicant_status_change'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Only the hiring team moves an application on once it is sent.';
  END IF;

  IF NOT (OLD.status::text = 'in_progress'
          OR (OLD.status::text = 'pending' AND coalesce(OLD.phase, 'application') = 'application')) THEN
    IF NEW.cover_letter IS DISTINCT FROM OLD.cover_letter OR NEW.resume_url IS DISTINCT FROM OLD.resume_url THEN
      RAISE EXCEPTION 'applicant_answers_locked'
        USING ERRCODE = 'check_violation',
              DETAIL = 'Your application was sent and has moved on: its answers stay as you sent them.';
    END IF;
    BEGIN
      old_answers := CASE WHEN OLD.notes IS NULL OR OLD.notes !~ '^\s*\{' THEN jsonb_build_array(NULL::jsonb, NULL::jsonb, NULL::jsonb) ELSE jsonb_build_array((OLD.notes::jsonb) -> 'applicationAnswers', (OLD.notes::jsonb) -> 'resumeImageUrls', (OLD.notes::jsonb) -> 'fileUploads') END;
    EXCEPTION WHEN others THEN
      old_answers := jsonb_build_array(NULL::jsonb, NULL::jsonb, NULL::jsonb);
    END;
    BEGIN
      new_answers := CASE WHEN NEW.notes IS NULL OR NEW.notes !~ '^\s*\{' THEN jsonb_build_array(NULL::jsonb, NULL::jsonb, NULL::jsonb) ELSE jsonb_build_array((NEW.notes::jsonb) -> 'applicationAnswers', (NEW.notes::jsonb) -> 'resumeImageUrls', (NEW.notes::jsonb) -> 'fileUploads') END;
    EXCEPTION WHEN others THEN
      new_answers := jsonb_build_array(NULL::jsonb, NULL::jsonb, NULL::jsonb);
    END;
    IF new_answers IS DISTINCT FROM old_answers THEN
      RAISE EXCEPTION 'applicant_answers_locked'
        USING ERRCODE = 'check_violation',
              DETAIL = 'Your application was sent and has moved on: its answers stay as you sent them.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_applicant_write_rules() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.applications_insert_resume_own_file()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.resume_url IS NOT NULL
     AND (length(NEW.resume_url) > 300
          OR NEW.resume_url !~ ('^' || NEW.candidate_id::text || '/[^/\n\r\t][^\n\r\t]*$')
          OR NEW.resume_url LIKE '%..%') THEN
    NEW.resume_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_insert_resume_own_file() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_insert_resume_own_file ON public.applications;
CREATE TRIGGER applications_insert_resume_own_file
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_insert_resume_own_file();
