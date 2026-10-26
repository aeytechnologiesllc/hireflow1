-- A paper sent again no longer leaves the earlier copy for the browser alone
-- to delete (the thirteenth Phase 5 review, 2026-10-26, finding 2).
--
-- When an applicant sends a paper again ("please send it again"), the
-- upload dialog deleted the earlier file itself, fire-and-forget, after the
-- new link was saved. When that delete did not go through, the earlier copy,
-- an ID the team had already opened, stayed in the request's folder until the
-- new copy's own deadline (24 hours after the team opens it, or 7 days after
-- it was sent): document_requests_due_pick takes a request by its link, and
-- the earlier file has none. The review's probe: 25 hours after the team
-- opened the first copy, nothing was due.
-- Now the database queues it: when the applicant's update replaces the
-- request's link (or takes it away), the earlier file gets a note in
-- document_file_trash, as a deleted request's file does, naming the business
-- that asked, so document_file_trash_fair_pick takes it in the next run like
-- any other. Only a file storage holds under exactly that name (or when
-- storage cannot say: never left because the database could not look), and
-- at most 50 a day for one applicant (the rate-limit table's own counter,
-- 'document-file-replaced', a UTC day): one account sending a paper again in
-- a loop cannot fill the business's turn in that queue. A real applicant
-- sends one again a handful of times. Past it, the earlier file waits in the
-- request's folder for that request's own deadline, as before, and the
-- dialog's own delete still runs.
-- document-cleanup deletes only that file while its request is still open,
-- never the request's folder (where the copy sent in its place is) and never
-- the file the request links now (supabase/functions/document-cleanup).
--
-- Redefined from its latest repo body with only this change:
--   document_requests_guard_update   from 20261025610000_id_papers_leave_on_time.sql
--                                    (the "earlier file is queued" block)
-- The trigger that calls it is unchanged (it calls it by name).

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
    -- Their own upload for this request: <their id>/<request id>/<one name>,
    -- every part a plain name (no "%", backslash, control character or "."
    -- part: the sixth security review, requested-document-url signs this path
    -- with the service key, and "%2e%2e" is ".." there), and a file storage
    -- holds under exactly that name (the twelfth Phase 5 review: any path in
    -- their folder, with no upload, let one account fill the deleted
    -- requests' queue with thousands of notes). Storage cannot be read: the
    -- path rule alone, so a real upload is never turned away.
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL
       AND (NEW.file_url !~ ('^' || OLD.candidate_id::text || '/' || OLD.id::text || '/[^/]+$')
            OR length(NEW.file_url) > 300
            OR NEW.file_url LIKE '%..%'
            OR NEW.file_url ~ '[%\\\x01-\x1f\x7f]'
            OR right(NEW.file_url, 2) = '/.'
            OR NOT coalesce(private.storage_holds('requested-documents', NEW.file_url, p_exact => true), true)) THEN
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
    -- The earlier file, replaced or taken away, is queued for document-cleanup
    -- (document_file_trash, as a deleted request's file is), so it goes in
    -- the next run even when the browser's own delete does not (the
    -- thirteenth Phase 5 review: an opened ID sent again stayed until the new
    -- copy's own deadline). Only a file storage holds (or cannot say), at
    -- most 50 a day for one applicant, naming the business that asked. Two
    -- IFs, so the counter counts only a file that is there.
    IF OLD.file_url IS NOT NULL AND NEW.file_url IS DISTINCT FROM OLD.file_url
       AND coalesce(private.storage_holds('requested-documents', OLD.file_url, p_exact => true), true) THEN
      IF coalesce((public.check_rate_limit('document-file-replaced', OLD.candidate_id::text, 50, 86400) ->> 'allowed')::boolean, true) THEN
        INSERT INTO public.document_file_trash (candidate_id, request_id, file_url, employer_id)
        VALUES (OLD.candidate_id, OLD.id, OLD.file_url, OLD.employer_id);
      END IF;
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
