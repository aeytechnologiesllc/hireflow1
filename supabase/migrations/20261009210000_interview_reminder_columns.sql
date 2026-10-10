-- ============================================================================
-- Interview reminders, part 1 (2026-10-09): where "already sent" is kept.
-- ============================================================================
-- The owner, after his first week of interviews (one no-show, nobody reminded
-- on either side): email the applicant the day before and an hour before.
-- The rule for when each is due is supabase/functions/_shared/
-- interviewReminders.ts; the sender is supabase/functions/interview-reminders,
-- called every five minutes (part 2, *_interview_reminders_schedule.sql).
-- docs/INTERVIEWS.md, "Reminders".
--
-- What this migration adds, and nothing else:
--
--   1. public.interviews.reminder_day_sent_at, reminder_hour_sent_at: when
--      each reminder was claimed by the sender. Empty = not sent.
--
--   2. interviews_reminder_bookkeeping(), a BEFORE INSERT OR UPDATE trigger:
--      - a new interview starts with neither sent (its day-before one marked
--        done when it is less than 24 hours away, as below);
--      - a new time, or a time agreed afresh (candidate_response becoming
--        'confirmed'), clears both, so the new time is reminded too. A time
--        that is then less than 24 hours away gets its day-before one marked
--        as done: the applicant has just been told the time (the owner,
--        2026-10-09: an interview set up six hours ahead), and the
--        hour-before one still goes;
--      - only the service role (the sender) sets them; anyone else's write
--        to them is put back as it was, so an employer or applicant cannot
--        stop a reminder or make one go again;
--      - writing only these two leaves updated_at alone. The sender waits
--        until an interview has been left unchanged for 30 minutes before
--        reminding (someone who booked 50 minutes ahead has just had "Your
--        interview is confirmed"); its own bookkeeping must not count as a
--        change. It is named zz_ so it runs after update_interviews_updated_at
--        (BEFORE triggers run in name order).
--
-- Applying it while people are using the site: adding a nullable column with
-- no default only touches the catalog. lock_timeout makes it give up after 3
-- seconds rather than queue behind a long write; if it times out, nothing is
-- applied and it is simply run again. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS reminder_day_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_hour_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.interviews_reminder_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  bookkeeping constant text[] := ARRAY['reminder_day_sent_at', 'reminder_hour_sent_at', 'updated_at'];
  -- Less than a day away when the time is set or agreed: the applicant has
  -- just been told it, so the day-before reminder is marked done.
  day_done timestamptz := CASE
    WHEN NEW.scheduled_at IS NOT NULL AND NEW.scheduled_at <= now() + interval '24 hours' THEN now()
    ELSE NULL
  END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reminder_day_sent_at := day_done;
    NEW.reminder_hour_sent_at := NULL;
    RETURN NEW;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.reminder_day_sent_at := OLD.reminder_day_sent_at;
    NEW.reminder_hour_sent_at := OLD.reminder_hour_sent_at;
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR (NEW.candidate_response = 'confirmed' AND OLD.candidate_response IS DISTINCT FROM 'confirmed') THEN
    NEW.reminder_day_sent_at := day_done;
    NEW.reminder_hour_sent_at := NULL;
  ELSIF (to_jsonb(NEW) - bookkeeping) = (to_jsonb(OLD) - bookkeeping) THEN
    -- Nothing about the interview itself changed.
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_interviews_reminder_bookkeeping ON public.interviews;
CREATE TRIGGER zz_interviews_reminder_bookkeeping
  BEFORE INSERT OR UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.interviews_reminder_bookkeeping();

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
