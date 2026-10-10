-- ============================================================================
-- Document requests, made safe to use (2026-10-10). docs/DOCUMENT-REQUESTS.md.
-- ============================================================================
-- The owner: "how do I ask them for things like their driver license or a
-- government ID? And banking information ... and have it encrypted in some
-- way?" The pieces existed (this table, the applicant's upload screen, the
-- private `requested-documents` bucket) but were never wired to the hiring
-- team, and reading them before wiring them found three holes:
--
--   a. "Candidates can update their own document requests" let an applicant
--      change ANY column of their own request: mark their own ID "approved",
--      rename what was asked, move it to another employer.
--   b. The applicant could point file_url anywhere, and the employers' storage
--      rule matched file_url with LIKE '%' || name || '%': an applicant could
--      make their employer read a file from someone else's folder.
--   c. An employer could insert a request naming any candidate_id, not the
--      one on the application, and read what that person then sent.
--
-- What this migration adds, and nothing else:
--
--   1. document_requests.answer_text (at most 120 characters): a typed answer
--      (a TIN, the email they use on Wise or PayPal). Bank account numbers are
--      never asked for (src/lib/documentRequests.ts).
--      document_requests.file_deleted_at: when an approved identity paper was
--      deleted (the document-cleanup function).
--   2. document_requests_guard_insert (BEFORE INSERT): from a client, a new
--      request is always pending and empty, for the applicant on that
--      application, filed under that job's owner (also when a team member
--      sends it, so their answer and the owner's document count go to the
--      owner).
--   3. document_requests_guard_update (BEFORE UPDATE): who, what was asked,
--      and when it was made never change from a client. The applicant may
--      only send their answer (a file in their own folder, or a typed answer)
--      and mark it sent; never once it is approved. The hiring side may only
--      approve or ask again, of something that has been sent, and never
--      touches what the applicant sent. The service role (the cleanup
--      function) is not limited.
--   4. public.document_request_events: who opened a file, and when it was
--      deleted. Written only by the requested-document-url and
--      document-cleanup functions; read by the job's owner and the applicant.
--   5. The employers' storage rule on `requested-documents` is dropped.
--      Employers now open a file only through requested-document-url, which
--      checks they own the job, signs a five-minute link to that exact file,
--      and records the opening. Applicants keep their own-folder rules.
--
-- Applying it: document_requests has no rows in production; every change is
-- quick. lock_timeout gives up after 3 seconds rather than queue. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- 1. the typed answer, and when a file was deleted ------------------------------
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS answer_text text,
  ADD COLUMN IF NOT EXISTS file_deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_requests_answer_length' AND conrelid = 'public.document_requests'::regclass) THEN
    ALTER TABLE public.document_requests
      ADD CONSTRAINT document_requests_answer_length CHECK (answer_text IS NULL OR char_length(answer_text) <= 120);
  END IF;
END;
$$;

-- 2. a new request: pending, empty, for the applicant on that application -------
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requests_guard_insert ON public.document_requests;
CREATE TRIGGER document_requests_guard_insert
  BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_guard_insert();

-- 3. each side changes only its own part ------------------------------------------
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

DROP TRIGGER IF EXISTS document_requests_guard_update ON public.document_requests;
CREATE TRIGGER document_requests_guard_update
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_guard_update();

-- 4. who opened what, and when it was deleted -------------------------------------
CREATE TABLE IF NOT EXISTS public.document_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL CHECK (action IN ('opened', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_request_events_request_idx ON public.document_request_events (request_id, created_at DESC);
ALTER TABLE public.document_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_request_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_request_events TO authenticated;
GRANT ALL ON public.document_request_events TO service_role;
DROP POLICY IF EXISTS "The job owner and the applicant read a request's log" ON public.document_request_events;
CREATE POLICY "The job owner and the applicant read a request's log"
  ON public.document_request_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.document_requests dr
        JOIN public.applications a ON a.id = dr.application_id
        JOIN public.jobs j ON j.id = a.job_id
       WHERE dr.id = document_request_events.request_id
         AND (j.employer_id = auth.uid() OR dr.candidate_id = auth.uid())
    )
  );

-- 5. employers open files only through requested-document-url -----------------------
DROP POLICY IF EXISTS "Employers can view applicant requested documents" ON storage.objects;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
