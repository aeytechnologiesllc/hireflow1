-- ============================================================================
-- Identity papers: deleted 24 hours after the hiring team first opens them
-- (2026-10-10). docs/DOCUMENT-REQUESTS.md.
-- ============================================================================
-- The owner, on applicants' IDs: "the best thing is we don't save it ... we
-- delete it in 24 hours of the employer receiving the driver license. So that
-- way we are not liable for saving those driver license." Chosen from the
-- mock-up: 24 hours after the team first opens it, or 7 days after it was
-- sent if nobody opens it. Until now an ID was kept 30 days after it was
-- approved, and one never approved was kept for good.
--
--   1. document_requests.team_opened_at: when someone on the hiring side
--      first opened the file now there. Set only by the requested-document-url
--      function (service role); both sides read it, so both screens can say
--      when the file goes.
--   2. The guards: no client sets or clears it (nor file_deleted_at). When
--      the applicant sends a new file, both start over (the database does it).
--   3. The document-cleanup job runs every hour instead of once a day, so
--      "24 hours" means 24 hours, not up to 48.
--
-- document_requests has no rows in production. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- 1. when the team first opened it --------------------------------------------------
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS team_opened_at timestamptz;

-- 2. the guards, with the new column ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_requests_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  applicant uuid;
  owner uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT a.candidate_id, j.employer_id INTO applicant, owner
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = NEW.application_id;
  IF applicant IS NULL OR owner IS NULL THEN
    RAISE EXCEPTION 'request_application_unknown' USING ERRCODE = 'check_violation';
  END IF;
  NEW.candidate_id := applicant;
  -- The insert rules still decide who may ask (the owner, or a team member
  -- allowed to send documents for this job); they are checked on this row.
  NEW.employer_id := owner;
  NEW.status := 'pending';
  NEW.file_url := NULL;
  NEW.file_name := NULL;
  NEW.answer_text := NULL;
  NEW.submitted_at := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.rejection_reason := NULL;
  NEW.candidate_viewed_at := NULL;
  NEW.file_deleted_at := NULL;
  NEW.team_opened_at := NULL;
  RETURN NEW;
END;
$$;


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
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL
       AND (left(NEW.file_url, 37) <> OLD.candidate_id::text || '/' OR NEW.file_url LIKE '%..%') THEN
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


-- 3. every hour ---------------------------------------------------------------------------
SELECT cron.schedule(
  'document-cleanup',
  '17 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/document-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'document_cleanup_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
