-- Limits on what one account can put in someone else's bell and inbox
-- (Phase 7 security audit, 2026-10-25, finding 3).
--
-- "Related parties can insert notifications" lets a business write to its
-- applicants and an applicant to the business they applied to (the pages
-- use it: "Documents requested", "Document received", "Ava Interview
-- Completed"...). Nothing bounded it: in one request an applicant put 500
-- notifications of 54 KB each in a business's bell, typed "system" (HireFlow's
-- own cards) and titled "HireFlow: your account is suspended", and every one
-- set off a push to each of the owner's devices. Its link could be any http(s)
-- address, so such a card could also send the owner to a look-alike sign-in
-- page. Messages had no length limit either, and each one rings the bell too.
--
-- A notification a signed-in account writes for someone else now:
--   - keeps at most 160 characters of title and 600 of message;
--   - links only inside HireFlow (a path starting with one "/"); any other
--     link is dropped (every page that writes one uses an in-app path);
--   - is never a "system" card when an applicant writes it to a business
--     (it becomes "application"): only the business side, and the server,
--     write "system";
--   - counts against the writer: 30 an hour to one person, 300 an hour in
--     all. Past that the row is quietly not written (the pages never fail
--     on a notification; the action itself already happened).
-- A message from a signed-in account: at most 10,000 characters, and 120 an
-- hour to one person, 600 an hour in all; past that it is refused
-- (too_many_messages), so nobody thinks a message went that did not.
--
-- Only rows written straight from a browser are touched: the server's own
-- notifications (message bells, report bells, budget alerts, written inside
-- SECURITY DEFINER functions) run as their owner and pass as before. A
-- notification to yourself is only trimmed.

-- Counts for the signed-in account only (it can only spend its own allowance).
CREATE OR REPLACE FUNCTION public.client_send_allowed(p_kind text, p_recipient uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  pair_limit int;
  total_limit int;
  pair jsonb;
  total jsonb;
BEGIN
  IF me IS NULL OR p_recipient IS NULL THEN
    RETURN true;
  END IF;
  IF p_kind = 'notification' THEN
    pair_limit := 30; total_limit := 300;
  ELSIF p_kind = 'message' THEN
    pair_limit := 120; total_limit := 600;
  ELSE
    RETURN false;
  END IF;
  pair := public.check_rate_limit('client-' || p_kind || '-pair', me::text || '>' || p_recipient::text, pair_limit, 3600);
  total := public.check_rate_limit('client-' || p_kind || '-total', me::text, total_limit, 3600);
  RETURN coalesce((pair ->> 'allowed')::boolean, true) AND coalesce((total ->> 'allowed')::boolean, true);
END;
$$;

REVOKE ALL ON FUNCTION public.client_send_allowed(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_send_allowed(text, uuid) TO authenticated, service_role;

-- Runs with the writer's own rights (SECURITY INVOKER), so it can tell a row
-- written from a browser (current_user authenticated or anon) from one the
-- server writes inside its own functions (current_user is their owner).
CREATE OR REPLACE FUNCTION public.notifications_client_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
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

DROP TRIGGER IF EXISTS notifications_client_limits ON public.notifications;
CREATE TRIGGER notifications_client_limits
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_client_limits();

CREATE OR REPLACE FUNCTION public.messages_client_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF char_length(coalesce(NEW.content, '')) > 10000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = 'check_violation',
      DETAIL = 'A message can be up to 10,000 characters.';
  END IF;
  IF NEW.receiver_id IS DISTINCT FROM auth.uid() AND NOT public.client_send_allowed('message', NEW.receiver_id) THEN
    RAISE EXCEPTION 'too_many_messages' USING ERRCODE = 'check_violation',
      DETAIL = 'Too many messages in an hour. Please wait a little and send it again.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.messages_client_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_client_limits ON public.messages;
CREATE TRIGGER messages_client_limits
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_client_limits();
