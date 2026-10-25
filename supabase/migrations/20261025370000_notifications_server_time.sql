-- A notification a browser writes carries the database's own time (Phase 5
-- review, round 7, 2026-10-25).
--
-- Anyone may put a card in their own bell, and nothing reset its created_at:
-- a card dated 2099, titled like one of document-cleanup's alerts ("ID papers
-- were not deleted on time"), made the job think the admins had been told
-- that day, every day, so they never were. notifications_client_limits
-- (20261025310000) now sets created_at to now() for every browser insert,
-- and document-cleanup reads only the admins' own bells. Unchanged otherwise.

CREATE OR REPLACE FUNCTION public.notifications_client_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- The database's own time, never the browser's: a card dated 2099 with
  -- an alert's title switched that alert off for good (document-cleanup's
  -- "told today" check; the seventh Phase 5 review).
  NEW.created_at := now();
  NEW.title := left(NEW.title, 160);
  NEW.message := left(NEW.message, 600);
  IF NEW.user_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  IF NEW.link IS NOT NULL AND NEW.link !~ '^/([^/\\]|$)' THEN
    NEW.link := NULL;
  END IF;
  IF NEW.type::text = 'system'
     AND NOT EXISTS (
       SELECT 1 FROM public.applications a
        WHERE a.candidate_id = NEW.user_id
          AND (public.is_job_owner(a.job_id, auth.uid()) OR public.is_active_team_member_for_job(a.job_id, auth.uid()))
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.document_requests dr
        WHERE dr.employer_id = auth.uid() AND dr.candidate_id = NEW.user_id
     ) THEN
    NEW.type := 'application';
  END IF;
  IF NOT public.client_send_allowed('notification', NEW.user_id) THEN
    RAISE LOG 'notifications_client_limits: % over the limit writing to %', auth.uid(), NEW.user_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_client_limits() FROM PUBLIC, anon, authenticated;
