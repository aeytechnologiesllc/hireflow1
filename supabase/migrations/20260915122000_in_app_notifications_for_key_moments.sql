-- ============================================================================
-- In-app notifications for key moments, independent of email.
-- ============================================================================
-- With RESEND_API_KEY unset (send-notification-email is a no-op — see
-- supabase/functions/send-notification-email/index.ts), three moments told
-- nobody anything in the app:
--
--   1. A candidate submits an application (status "in_progress" -> "pending",
--      src/pages/ApplicationFormPhase.tsx handleSubmit). The job owner (and
--      any active team member assigned to that job) got no bell.
--   2. An employer schedules an interview or offers a set of time windows
--      (src/components/InterviewSchedulingWizard.tsx handleSchedule inserts
--      into `interviews`). The candidate got no bell — only email, which is
--      off. The same gap exists for a plain reschedule
--      (src/components/RescheduleInterviewDialog.tsx), which never notified
--      in-app even when email worked.
--   3. A candidate's `phase` (their real workflow-step position — see
--      src/lib/candidateJourney.ts) is moved forward by someone else. Today
--      the app never actually does this outside the candidate's own client
--      (auto-mode self-advance — ChatInterviewPhase.tsx, VideoIntroPhase.tsx,
--      QuizPhase.tsx — all writing the candidate's OWN row), but
--      useApplications.ts's notifyPhaseAdvanced (email-only) is written
--      against a hiring-team-initiated advance, and candidate self-advance
--      is being extended next cycle on top of this trigger — see the guard
--      below.
--
-- `status` moving to rejected / hired / offered is UNTOUCHED —
-- notify_application_status_change() (20251217214606_*.sql, relinked by
-- 20260904120000_candidate_notification_links.sql) already writes an in-app
-- notification for every one of those. `status` moving to "interview" is the
-- one exception: that trigger's own "Interview scheduled" notification is
-- now retired (section 4 below) because every status -> "interview"
-- transition in the app (InterviewSchedulingWizard.tsx handleSchedule;
-- ava-voice-tools/index.ts) first inserts the public.interviews row that
-- moment 2's own trigger already notifies the candidate for — more
-- accurately, since it can tell an exact time from windows-offered, which
-- bare status can't. Leaving both triggers active double-notified the
-- candidate for one scheduling action (sometimes with contradictory copy);
-- section 4 is the fix.
--
-- All three triggers below follow the exact shape notify_new_message()
-- (20260904121000_*.sql) established: SECURITY DEFINER, fixed search_path,
-- an internal BEGIN/EXCEPTION so a notification that fails to write can
-- never block the real write, and candidate-facing links routed through
-- candidate sign-in exactly like notify_application_status_change() does —
-- '/candidate/auth?redirect=' + the encoded destination, so a signed-out
-- candidate's bell tap doesn't bounce to the employer login page. Every
-- INSERT lands in public.notifications, so trigger_push_notification()
-- (20260826221000_*.sql, AFTER INSERT ON notifications, unconditional) fires
-- for these exactly like it does for any other notification — nothing
-- extra needed for push.
--
-- Self-notification guard (moments 2's reschedule and 3): a change actually
-- made BY the candidate — the candidate-interview-response edge function
-- (supabase/functions/candidate-interview-response/index.ts) picking or
-- repicking an offered window, or the candidate's own session self-advancing
-- `phase` — must never read back to them as a notification about their own
-- click. The edge function runs on the service_role key (no `sub` claim, so
-- auth.uid() is NULL there); the candidate's own browser session carries
-- their own JWT, so auth.uid() = the candidate's own id. Either way,
-- `auth.uid() IS NULL OR auth.uid() = <candidate_id>` catches it. Moment 1's
-- application INSERT/UPDATE never needs this guard — only a candidate can
-- write their own application row into "pending" in the first place, and
-- the recipients (job owner / team) are never the actor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New application submitted -> job owner + active, assigned team members.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_application_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_candidate_name TEXT;
  v_message TEXT;
  v_link TEXT;
  v_team_member RECORD;
BEGIN
  BEGIN
    SELECT j.id, j.employer_id, j.title INTO v_job
    FROM public.jobs j
    WHERE j.id = NEW.job_id;

    IF v_job.employer_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Same fallback chain fetchJobNotificationContext() uses client-side for
    -- the candidate's own name, so the copy never reads "null applied...".
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(p.email), ''))
      INTO v_candidate_name
      FROM public.profiles p
     WHERE p.user_id = NEW.candidate_id;
    v_candidate_name := COALESCE(v_candidate_name, 'A candidate');

    v_message := v_candidate_name || ' applied for ' || COALESCE(v_job.title, 'your job') || '.';
    -- Employer-facing link: the applicant's own row in the cockpit, same
    -- target the candidate-interview-response edge function already links
    -- employers to for interview activity on this application.
    v_link := '/applicants/' || NEW.id::text;

    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    VALUES (v_job.employer_id, 'application', 'New application', v_message, v_link, false);

    -- Active team members scoped to this job exactly like
    -- is_active_team_member_for_job() (20260715014000_*.sql) scopes their
    -- own access to it: active, and either unrestricted or explicitly
    -- assigned. No specific can_* flag required — seeing that someone
    -- applied is not the same privilege as acting on the pipeline.
    FOR v_team_member IN
      SELECT tm.user_id
      FROM public.team_members tm
      WHERE tm.employer_id = v_job.employer_id
        AND tm.status = 'active'
        AND tm.user_id <> v_job.employer_id
        AND (
          array_length(tm.assigned_job_ids, 1) IS NULL
          OR v_job.id = ANY (tm.assigned_job_ids)
        )
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
      VALUES (v_team_member.user_id, 'application', 'New application', v_message, v_link, false);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'notify_new_application_submitted skipped for application %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_new_application_submitted() IS
  'AFTER INSERT/UPDATE ON public.applications, when status first becomes ''pending'': '
  'one notifications row (type ''application'') for the job owner and every active, '
  'assigned team member. Fail-open — a failed notification never blocks the submit.';

REVOKE ALL ON FUNCTION public.notify_new_application_submitted() FROM PUBLIC, anon, authenticated;

-- Split INSERT/UPDATE into two triggers rather than one combined trigger so
-- neither WHEN clause has to reason about OLD being unset on INSERT.
DROP TRIGGER IF EXISTS on_application_insert_submitted_notify ON public.applications;
CREATE TRIGGER on_application_insert_submitted_notify
  AFTER INSERT ON public.applications
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_new_application_submitted();

DROP TRIGGER IF EXISTS on_application_update_submitted_notify ON public.applications;
CREATE TRIGGER on_application_update_submitted_notify
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  WHEN (NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending')
  EXECUTE FUNCTION public.notify_new_application_submitted();

-- ----------------------------------------------------------------------------
-- 2. Interview scheduled / windows offered / rescheduled -> candidate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_interview_scheduled_or_rescheduled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        v_title := 'Pick a time for your interview';
        v_message := 'The hiring team offered a few times for your interview for '
          || COALESCE(v_app.job_title, 'the position') || '. Pick what works in HireFlow.';
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
      v_title := 'Interview time changed';
      v_message := 'Your interview for ' || COALESCE(v_app.job_title, 'the position')
        || ' moved to a new time. Check the details in HireFlow.';
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

COMMENT ON FUNCTION public.notify_interview_scheduled_or_rescheduled() IS
  'AFTER INSERT ON public.interviews (scheduled or windows offered), and AFTER '
  'UPDATE when scheduled_at changes and the actor is not the candidate (rescheduled): '
  'one notifications row (type ''interview'') for the candidate. Fail-open. This INSERT '
  'trigger is now the sole notifier for a scheduling action -- section 4 below stops '
  'notify_application_status_change() from also firing when status moves to ''interview''.';

REVOKE ALL ON FUNCTION public.notify_interview_scheduled_or_rescheduled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_interview_insert_notify ON public.interviews;
CREATE TRIGGER on_interview_insert_notify
  AFTER INSERT ON public.interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_interview_scheduled_or_rescheduled();

DROP TRIGGER IF EXISTS on_interview_reschedule_notify ON public.interviews;
CREATE TRIGGER on_interview_reschedule_notify
  AFTER UPDATE ON public.interviews
  FOR EACH ROW
  WHEN (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at)
  EXECUTE FUNCTION public.notify_interview_scheduled_or_rescheduled();

-- ----------------------------------------------------------------------------
-- 3. Meaningful phase advance -> candidate (status change is untouched —
--    notify_application_status_change() already owns rejected/hired/
--    interview/offered).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_application_phase_advanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  -- Only the hiring team moving a candidate forward is announced here — a
  -- candidate's own client advancing their OWN phase (today: auto-mode
  -- workflow steps; next cycle: general self-advance, built on top of this
  -- trigger) must never read back to them as a notification about
  -- themselves.
  IF auth.uid() IS NULL OR auth.uid() = NEW.candidate_id THEN
    RETURN NEW;
  END IF;

  -- Legacy/closing literals aren't real workflow steps a candidate performs
  -- (see candidateJourney.ts) — either pre-journey values from before the
  -- step list existed, or the trailing "decision" stage, whose real signal
  -- is the status change notify_application_status_change() already covers.
  IF NEW.phase IN ('decision', 'review', 'interview', 'hired', 'offered', 'rejected') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT j.title INTO v_job_title FROM public.jobs j WHERE j.id = NEW.job_id;

    v_message := 'You''re on to the next step for ' || COALESCE(v_job_title, 'your application') || '.';
    v_link := '/candidate/auth?redirect=' || replace('/applications/' || NEW.id::text, '/', '%2F');

    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    VALUES (NEW.candidate_id, 'status_update', 'You moved to the next step', v_message, v_link, false);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'notify_application_phase_advanced skipped for application %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_application_phase_advanced() IS
  'AFTER UPDATE ON public.applications when phase changes and the actor is not the '
  'candidate: one notifications row (type ''status_update'') for the candidate. '
  'Fail-open. Never fires for status (see notify_application_status_change).';

REVOKE ALL ON FUNCTION public.notify_application_phase_advanced() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_application_phase_advanced_notify ON public.applications;
CREATE TRIGGER on_application_phase_advanced_notify
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  WHEN (OLD.phase IS DISTINCT FROM NEW.phase)
  EXECUTE FUNCTION public.notify_application_phase_advanced();

-- ----------------------------------------------------------------------------
-- 4. Stop notify_application_status_change() from also notifying on
--    status -> "interview" -- moment 2's own trigger (section 2 above)
--    already covers it, more accurately.
-- ----------------------------------------------------------------------------
-- handleSchedule() in InterviewSchedulingWizard.tsx (the only client path
-- that sets applications.status to 'interview' -- confirmed by grep, one
-- call site) always does two writes for one scheduling action: it INSERTs
-- into public.interviews first, then updates applications.status to
-- 'interview'. ava-voice-tools/index.ts (voice-driven scheduling) does the
-- same pair of writes. Before this section, BOTH writes fired their own
-- notification -- on_interview_insert_notify (section 2) from the INSERT,
-- and this trigger from the status UPDATE -- so the candidate got two bell
-- notifications for one action, and for windows-offered scheduling the
-- second one ("You've been invited to interview... Check the details and
-- prepare!") was actively wrong: no exact time exists yet, only offered
-- windows. Since every status -> 'interview' transition in the app already
-- carries an interviews INSERT in the same action, and section 2's trigger
-- fires on that INSERT with the right copy for either case (exact time vs.
-- windows offered), this trigger simply stops treating 'interview' as a
-- notify-worthy status. rejected / hired / offered are unchanged.
CREATE OR REPLACE FUNCTION public.notify_application_status_change()
RETURNS TRIGGER AS $$
DECLARE
  job_title TEXT;
  company_name TEXT;
  team_label TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type notification_type;
  notification_link TEXT;
BEGIN
  -- Only process if status actually changed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Job title and the employer's company name (for the decision copy)
    SELECT j.title, p.company_name
      INTO job_title, company_name
      FROM jobs j
      LEFT JOIN profiles p ON p.user_id = j.employer_id
     WHERE j.id = NEW.job_id;

    team_label := CASE
      WHEN NULLIF(TRIM(company_name), '') IS NOT NULL THEN 'The ' || TRIM(company_name) || ' team'
      ELSE 'The hiring team'
    END;

    -- Candidate links go through candidate sign-in with the destination as a
    -- redirect. A UUID needs no encoding beyond the slashes.
    notification_link := '/candidate/auth?redirect=' || replace('/applications/' || NEW.id::text, '/', '%2F');

    -- Set notification details based on new status
    CASE NEW.status
      WHEN 'rejected' THEN
        notification_title := 'Application update';
        notification_message := team_label || ' has made a decision on your application'
          || CASE WHEN job_title IS NOT NULL THEN ' for ' || job_title ELSE '' END || '.';
        notification_type := 'status_update';
      WHEN 'hired' THEN
        notification_title := 'Congratulations! You''re hired';
        notification_message := 'Great news! You''ve been selected for ' || COALESCE(job_title, 'the position') || '. Welcome aboard!';
        notification_type := 'status_update';
      WHEN 'offered' THEN
        notification_title := 'Offer extended';
        notification_message := 'Congratulations! You''ve received an offer for ' || COALESCE(job_title, 'a position') || '.';
        notification_type := 'status_update';
      ELSE
        -- Don't create notification for other status changes. 'interview'
        -- falls in here now too -- see section 4's header comment: moment
        -- 2's on_interview_insert_notify trigger (section 2 above) already
        -- notified the candidate, for the same scheduling action, with more
        -- accurate copy than this trigger can produce from the status alone.
        RETURN NEW;
    END CASE;

    -- Insert the notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      is_read
    ) VALUES (
      NEW.candidate_id,
      notification_type,
      notification_title,
      notification_message,
      notification_link,
      false
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.notify_application_status_change() IS
  'AFTER UPDATE ON public.applications when status changes: one notifications row for '
  'rejected / hired / offered. ''interview'' is deliberately excluded -- '
  'notify_interview_scheduled_or_rescheduled() (this migration, section 2) already '
  'notifies the candidate when the accompanying interviews row is inserted, with more '
  'accurate copy than status alone can produce. Re-stated here (unchanged trigger) so '
  'this migration is complete on its own if the original is ever squashed away.';

-- Grants intentionally left as-is (this function's permissions were never
-- touched by 20251217214606_*.sql or 20260904120000_*.sql either) -- this
-- section only changes which statuses produce a notification, not who can
-- invoke the function.

DROP TRIGGER IF EXISTS on_application_status_change ON applications;
CREATE TRIGGER on_application_status_change
AFTER UPDATE ON applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_application_status_change();
