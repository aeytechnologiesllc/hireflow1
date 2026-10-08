-- The applicant's bell for an interview, reworded for one offered time.
--
-- The owner, 2026-10-07: "I wanna just give them one time for the interview,
-- not two, just one. And ... if they cannot make it on that time ... let them
-- write a message ... and then I get to schedule it."
--
-- Until now this bell said "Pick a time for your interview: the hiring team
-- offered a few times ... Pick what works", which is no longer what happens.
-- And when the team set a NEW time after "I can't make it", it said the
-- interview "moved to a new time", as if it were already booked.
--
-- Only the words change, plus one branch for a new offered time. Who is
-- told, when, the link, and the fail-open behaviour are exactly as in
-- 20260915122000_in_app_notifications_for_key_moments.sql (section 2). The
-- triggers themselves and the function's grants are untouched.
-- Proof: scripts/notifications_triggers.pglite.test.mjs.

CREATE OR REPLACE FUNCTION public.notify_interview_scheduled_or_rescheduled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app RECORD;
  v_title TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  BEGIN
    SELECT a.id AS application_id, a.candidate_id, j.title AS job_title
      INTO v_app
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.id = NEW.application_id;

    IF v_app.candidate_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NEW.candidate_response = 'awaiting_pick' THEN
        -- A time is offered: they book it, or say when they are free.
        v_title := 'You''re invited to an interview';
        v_message := 'The hiring team offered you a time for your interview for '
          || COALESCE(v_app.job_title, 'the position') || '. Book it, or tell them when you are free.';
      ELSE
        v_title := 'Interview scheduled';
        v_message := 'You''re scheduled for an interview for '
          || COALESCE(v_app.job_title, 'the position') || '. Check the details in HireFlow.';
      END IF;
    ELSE
      -- Reschedule. Skip when the candidate themselves is the one who moved
      -- it — picking/repicking an offered window via candidate-interview-
      -- response (service_role -> auth.uid() IS NULL) already tells the
      -- EMPLOYER; telling the candidate here would just announce their own
      -- click back to them.
      IF auth.uid() IS NULL OR auth.uid() = v_app.candidate_id THEN
        RETURN NEW;
      END IF;
      IF NEW.candidate_response = 'awaiting_pick' THEN
        -- The team set a new time after "I can't make it": offered, not booked.
        v_title := 'A new time for your interview';
        v_message := 'The hiring team set a new time for your interview for '
          || COALESCE(v_app.job_title, 'the position') || '. Book it, or tell them when you are free.';
      ELSE
        v_title := 'Interview time changed';
        v_message := 'Your interview for ' || COALESCE(v_app.job_title, 'the position')
          || ' moved to a new time. Check the details in HireFlow.';
      END IF;
    END IF;

    -- Candidate-facing link, routed through candidate sign-in exactly like
    -- notify_application_status_change() — a signed-out tap must never
    -- bounce to the employer login page.
    v_link := '/candidate/auth?redirect=' || replace('/applications/' || v_app.application_id::text, '/', '%2F');

    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    VALUES (v_app.candidate_id, 'interview', v_title, v_message, v_link, false);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'notify_interview_scheduled_or_rescheduled skipped for interview %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
