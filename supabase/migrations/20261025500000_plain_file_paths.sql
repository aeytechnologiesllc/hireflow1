-- File paths an applicant stores are plain paths (the sixth security review,
-- 2026-10-25, finding 2).
--
-- applicant-file-url and requested-document-url sign a stored path with the
-- service key, and storage-js puts that path into the request address as it
-- is: a "%2e%2e" part becomes a parent step once the address is read, so a
-- path that starts with the applicant's own folder could sign a file in
-- another person's folder, or another bucket. Both functions now refuse such a
-- path (isPlainObjectPath, as document-signing and _shared/resume.ts do); the
-- database now refuses to store one at all: no "%", backslash or control
-- character in
--   - an applicant's resume_url, on update (resume_not_own_file) and on
--     insert (dropped, as an insert's other bad resume links are);
--   - the paths the application form lists in notes (fileUploads' url,
--     fileUrl and imageUrls, and resumeImageUrls), whenever the applicant
--     changes them (file_path_not_plain);
--   - a document request's file_url, from the applicant (request_file_not_yours).
-- Storage refuses all of these in a file's name, so no real upload is turned
-- away; the live data has one resume path and no uploaded request files, all
-- plain.
--
-- Each function is its latest body with only this check added:
--   applications_applicant_write_rules   from 20261025470000_security_round4.sql
--   applications_insert_resume_own_file  from 20261025470000_security_round4.sql
--   document_requests_guard_update       from 20261011130000_id_papers_deleted_after_opening.sql
-- Their triggers are unchanged (they call the functions by name).

CREATE OR REPLACE FUNCTION public.applications_applicant_write_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  old_answers jsonb;
  new_answers jsonb;
  old_files jsonb;
  new_files jsonb;
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
  -- both scoring prompts). Every part a plain name: no "%", backslash or
  -- control character (the sixth security review: "%2e%2e" is ".." once the
  -- path is in a signed link's address).
  IF NEW.resume_url IS DISTINCT FROM OLD.resume_url AND NEW.resume_url IS NOT NULL
     AND (length(NEW.resume_url) > 300
          OR NEW.resume_url !~ ('^' || OLD.candidate_id::text || '/[^/\n\r\t][^\n\r\t]*$')
          OR NEW.resume_url LIKE '%..%'
          OR NEW.resume_url ~ '[%\\\x01-\x1f\x7f]') THEN
    RAISE EXCEPTION 'resume_not_own_file'
      USING ERRCODE = 'check_violation',
            DETAIL = 'A resume is a file you uploaded to your own folder.';
  END IF;

  -- The form's file answers are plain paths too (the sixth security review):
  -- applicant-file-url signs every path the notes list (fileUploads' url,
  -- fileUrl and imageUrls, and resumeImageUrls) with the service key. Checked
  -- whenever the applicant changes them.
  BEGIN
    new_files := CASE WHEN NEW.notes IS NULL OR NEW.notes !~ '^\s*\{' THEN NULL ELSE jsonb_build_object('uploads', (NEW.notes::jsonb) -> 'fileUploads', 'pages', (NEW.notes::jsonb) -> 'resumeImageUrls') END;
  EXCEPTION WHEN others THEN
    new_files := NULL;
  END;
  BEGIN
    old_files := CASE WHEN OLD.notes IS NULL OR OLD.notes !~ '^\s*\{' THEN NULL ELSE jsonb_build_object('uploads', (OLD.notes::jsonb) -> 'fileUploads', 'pages', (OLD.notes::jsonb) -> 'resumeImageUrls') END;
  EXCEPTION WHEN others THEN
    old_files := NULL;
  END;
  IF new_files IS DISTINCT FROM old_files AND EXISTS (
       SELECT 1
         FROM (SELECT jsonb_path_query(new_files, 'lax $.uploads.*.url') AS p
               UNION ALL SELECT jsonb_path_query(new_files, 'lax $.uploads.*.fileUrl')
               UNION ALL SELECT jsonb_path_query(new_files, 'lax $.uploads.*.imageUrls[*]')
               UNION ALL SELECT jsonb_path_query(new_files, 'lax $.pages[*]')) listed
        WHERE jsonb_typeof(listed.p) = 'string' AND (listed.p #>> '{}') ~ '[%\\\x01-\x1f\x7f]'
     ) THEN
    RAISE EXCEPTION 'file_path_not_plain'
      USING ERRCODE = 'check_violation',
            DETAIL = 'A file you attach is one you uploaded.';
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
          OR NEW.resume_url LIKE '%..%'
          -- No "%", backslash or control character (the sixth security review).
          OR NEW.resume_url ~ '[%\\\x01-\x1f\x7f]') THEN
    NEW.resume_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_insert_resume_own_file() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.document_requests_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_applicant boolean := auth.uid() IS NOT NULL AND auth.uid() = OLD.candidate_id;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Who it is between, what was asked, and when: never from a client.
  NEW.application_id := OLD.application_id;
  NEW.employer_id := OLD.employer_id;
  NEW.candidate_id := OLD.candidate_id;
  NEW.document_type := OLD.document_type;
  NEW.package_id := OLD.package_id;
  NEW.created_at := OLD.created_at;
  NEW.file_deleted_at := OLD.file_deleted_at;
  NEW.team_opened_at := OLD.team_opened_at;

  IF is_applicant THEN
    -- The applicant: their answer, nothing else.
    NEW.custom_document_name := OLD.custom_document_name;
    NEW.description := OLD.description;
    NEW.is_required := OLD.is_required;
    NEW.due_date := OLD.due_date;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.rejection_reason := OLD.rejection_reason;
    IF OLD.status = 'approved'
       AND (NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.answer_text IS DISTINCT FROM OLD.answer_text OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'request_already_approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'submitted' THEN
      RAISE EXCEPTION 'request_status_not_yours' USING ERRCODE = 'check_violation';
    END IF;
    -- In their own folder, every part a plain name: no "%", backslash or
    -- control character (the sixth security review: requested-document-url
    -- signs this path with the service key, and "%2e%2e" is ".." there).
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL
       AND (left(NEW.file_url, 37) <> OLD.candidate_id::text || '/' OR NEW.file_url LIKE '%..%'
            OR NEW.file_url ~ '[%\\\x01-\x1f\x7f]') THEN
      RAISE EXCEPTION 'request_file_not_yours' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'submitted'
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.answer_text IS DISTINCT FROM OLD.answer_text) THEN
      NEW.submitted_at := now();
    ELSE
      NEW.submitted_at := OLD.submitted_at;
    END IF;
    -- A new file starts its own clock: not yet opened, not deleted.
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL THEN
      NEW.team_opened_at := NULL;
      NEW.file_deleted_at := NULL;
    END IF;
  ELSE
    -- The hiring side: approve or ask again. What the applicant sent is theirs.
    NEW.file_url := OLD.file_url;
    NEW.file_name := OLD.file_name;
    NEW.answer_text := OLD.answer_text;
    NEW.submitted_at := OLD.submitted_at;
    NEW.candidate_viewed_at := OLD.candidate_viewed_at;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('approved', 'rejected') OR OLD.status NOT IN ('submitted', 'reviewed') THEN
        RAISE EXCEPTION 'request_not_received' USING ERRCODE = 'check_violation';
      END IF;
      NEW.reviewed_at := now();
      NEW.reviewed_by := auth.uid();
      IF NEW.status = 'approved' THEN
        NEW.rejection_reason := NULL;
      END IF;
    ELSE
      NEW.reviewed_at := OLD.reviewed_at;
      NEW.reviewed_by := OLD.reviewed_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
