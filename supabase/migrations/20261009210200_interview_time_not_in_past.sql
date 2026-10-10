-- ============================================================================
-- An interview time can never be one that has already passed (2026-10-09).
-- ============================================================================
-- The owner: "make sure ... they can't do a time interview before or
-- something in past". The scheduling screens already switch passed times off
-- (docs/INTERVIEWS.md), and the applicant's booking is refused on the server
-- when its time has passed (candidate-interview-response). But the hiring
-- team's screens write the time straight to the table, so a screen left open
-- overnight, a time accepted from the applicant's suggestions days later, or
-- an older screen without the check could still set a time in the past. A
-- past time is never reminded and can never be joined.
--
-- What this migration adds, and nothing else:
--
--   interviews_refuse_past_time(), a BEFORE INSERT OR UPDATE trigger on
--   public.interviews: setting a live interview (status 'scheduled') to a
--   time more than two minutes ago is refused with
--   "interview_time_passed: That time has already passed. Choose a later
--   one." (SQLSTATE 23514). The two minutes are for the time between
--   pressing the button and the row being written.
--
--   Only when the time is set: a new interview, or scheduled_at changing.
--   Everything else about an interview whose time has passed (marking it
--   completed, a no-show, cancelled, a rating, a note) is untouched, and so
--   is every row already in the table. It applies to every caller, the
--   service role included: no path should set a passed time.
--
-- Applying it: creating a trigger takes a brief lock on public.interviews;
-- lock_timeout makes it give up after 3 seconds rather than queue behind a
-- long write. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.interviews_refuse_past_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status::text = 'scheduled'
     AND NEW.scheduled_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at)
     AND NEW.scheduled_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'interview_time_passed: That time has already passed. Choose a later one.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interviews_refuse_past_time ON public.interviews;
CREATE TRIGGER interviews_refuse_past_time
  BEFORE INSERT OR UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.interviews_refuse_past_time();

RESET lock_timeout;
RESET statement_timeout;
