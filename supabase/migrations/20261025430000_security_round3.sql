-- Phase 7 security review, round 3 (2026-10-25).
--
-- 1. What an applicant may still write on their own application
--    (20261025350000, M1 again): the resume link was writable for ever and
--    went raw into both scoring prompts (a 20,105-character link carrying an
--    instruction to the scorer was saved on a rejected application). It is
--    now a file in the applicant's own folder, at most 300 characters with no
--    line breaks, and it is locked with the answers once the form has moved
--    on, as are the form's file answers (notes.resumeImageUrls and
--    notes.fileUploads, which the scorer also reads).
-- 2. A document a browser inserts is sent now, by the signed-in account:
--    created_at and sender_id are the database's (20261025340000 left them to
--    the business).

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
      old_answers := CASE WHEN OLD.notes IS NULL OR OLD.notes !~ '^\s*\{' THEN NULL ELSE jsonb_build_array((OLD.notes::jsonb) -> 'applicationAnswers', (OLD.notes::jsonb) -> 'resumeImageUrls', (OLD.notes::jsonb) -> 'fileUploads') END;
    EXCEPTION WHEN others THEN
      old_answers := NULL;
    END;
    BEGIN
      new_answers := CASE WHEN NEW.notes IS NULL OR NEW.notes !~ '^\s*\{' THEN NULL ELSE jsonb_build_array((NEW.notes::jsonb) -> 'applicationAnswers', (NEW.notes::jsonb) -> 'resumeImageUrls', (NEW.notes::jsonb) -> 'fileUploads') END;
    EXCEPTION WHEN others THEN
      new_answers := NULL;
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

CREATE OR REPLACE FUNCTION public.documents_insert_starts_unsigned()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- Sent now, by whoever is signed in (the third Phase 7 security review: a
  -- business chose both, so the certificate's "sent" time could be backdated
  -- and the countersign's "sender's own upload" read a sender it picked).
  NEW.created_at := now();
  NEW.sender_id := auth.uid();
  NEW.status := 'pending';
  NEW.is_locked := false;
  NEW.locked_at := NULL;
  NEW.signature_data := NULL;
  NEW.signed_at := NULL;
  NEW.candidate_signature_data := NULL;
  NEW.candidate_signed_at := NULL;
  NEW.employer_signature_data := NULL;
  NEW.employer_signed_at := NULL;
  NEW.v2_hash := NULL;
  NEW.v3_hash := NULL;
  NEW.document_hash := NULL;
  NEW.final_pdf_hash := NULL;
  NEW.completion_certificate := NULL;
  NEW.declined_at := NULL;
  NEW.decline_reason := NULL;
  NEW.is_voided := false;
  NEW.voided_at := NULL;
  NEW.voided_reason := NULL;
  NEW.viewed_at := NULL;
  NEW.ip_address := NULL;
  NEW.user_agent := NULL;
  NEW.reminder_sent_at := NULL;
  -- set_document_code (it runs after this one: triggers fire by name) makes a fresh one.
  NEW.document_code := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.documents_insert_starts_unsigned() FROM PUBLIC, anon, authenticated;
