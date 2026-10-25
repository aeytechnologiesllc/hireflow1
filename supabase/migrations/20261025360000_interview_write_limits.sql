-- Interview writes are counted like messages and bell cards (Phase 7
-- security review, round 2, 2026-10-25, M5).
--
-- An interview insert or move sets off notify_interview_scheduled_or_rescheduled
-- (a SECURITY DEFINER function, so the bell's own browser limit never sees
-- it) and a push for each one: 80 inserts and 40 moves put 120 cards in one
-- applicant's bell, where direct cards stop at 30. Thousands of rows in the
-- next day also crowded interview-reminders' 200-row pick, so other
-- businesses' reminder emails could be starved. And a business could give an
-- interview any length (a video room is opened for that long).
--
-- A browser's interview write now counts against the writer, through the
-- same client_send_allowed: 20 an hour to one applicant and 200 an hour in
-- all, past that refused (too_many_interview_changes); and an interview
-- lasts 5 to 240 minutes. The function's two other kinds are unchanged.
-- interview-reminders reads the soonest interviews still owed a reminder.

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
  ELSIF p_kind = 'interview' THEN
    pair_limit := 20; total_limit := 200;
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

CREATE OR REPLACE FUNCTION public.interviews_client_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  applicant uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.duration_minutes IS NOT NULL THEN
    NEW.duration_minutes := greatest(5, least(NEW.duration_minutes, 240));
  END IF;
  SELECT a.candidate_id INTO applicant FROM public.applications a WHERE a.id = NEW.application_id;
  IF NOT public.client_send_allowed('interview', applicant) THEN
    RAISE EXCEPTION 'too_many_interview_changes'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Too many interview changes in an hour. Please wait a little and try again.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.interviews_client_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS interviews_client_limits ON public.interviews;
CREATE TRIGGER interviews_client_limits
  BEFORE INSERT OR UPDATE OF scheduled_at, status, candidate_response, duration_minutes, proposed_times, employer_windows ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.interviews_client_limits();
