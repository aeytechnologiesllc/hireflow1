-- The applicant's bell for an interview says what the interview IS.
--
-- A finalist wrote to the owner on 2026-10-08, the morning after booking: "I
-- previously completed the chat practice and written interview ... Could you
-- please let me know what the upcoming 30-minute video interview will cover
-- and whether this is the final interview stage?" Nothing had told him.
-- The owner: "we should clarify ... chat interview has been done. Now you
-- will have a video interview with the hiring team ... this is the final
-- stage."
--
-- So the two bells an applicant gets when an interview is first set up now
-- say: you passed the online steps, and the final step is a 30-minute video
-- call (or phone call, or meeting in person) with the hiring team. The
-- length and kind come from the interview row itself.
--
-- Only words change. Who is told, when, the link and the fail-open behaviour
-- are exactly as in 20261008020630_interview_bell_one_time.sql. The triggers
-- themselves and the function's grants are untouched.
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
  v_kind TEXT;
  v_what TEXT;
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

    -- "a 30-minute video call": what kind of interview it is, and how long.
    v_kind := CASE
      WHEN NEW.interview_type = 'phone' THEN 'phone call'
      WHEN NEW.interview_type IN ('in_person', 'in-person', 'onsite') THEN 'meeting in person'
      ELSE 'video call'
    END;
    v_what := CASE
      WHEN COALESCE(NEW.duration_minutes, 0) > 0 THEN
        (CASE WHEN NEW.duration_minutes::text ~ '^(8|11|18)' THEN 'an ' ELSE 'a ' END) || NEW.duration_minutes::text || '-minute ' || v_kind
      ELSE 'a ' || v_kind
    END;

    IF TG_OP = 'INSERT' THEN
      IF NEW.candidate_response = 'awaiting_pick' THEN
        -- A time is offered: they book it, or say when they are free.
        v_title := 'You''re invited to an interview';
        v_message := 'You passed the online steps for ' || COALESCE(v_app.job_title, 'the position')
          || '. The final step is ' || v_what
          || ' with the hiring team: book the time they offered, or tell them when you are free.';
      ELSE
        v_title := 'Interview scheduled';
        v_message := 'You passed the online steps for ' || COALESCE(v_app.job_title, 'the position')
          || ' and are scheduled for the final step: ' || v_what
          || ' with the hiring team. Check the details in HireFlow.';
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
