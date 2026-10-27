-- A decline names the job and the business as they were when the person
-- applied, and goes once, for a real decline; the hiring team's moves of an
-- application are contact; a repeat report keeps its newest words (the
-- seventeenth Phase 5 review, 2026-10-26, findings 1 and 2; the sixteenth
-- security review, finding 1).
--
-- A decline is not contact (decided in the sixteenth review and kept): it is
-- the email a business sends most, to people it turned down, so counting it
-- would let three of them pause a real business by reporting. What both
-- reviews showed is that it carried text the business can change after the
-- person applied: the job's title (a closed job can be renamed to anything,
-- and nobody else sees it: probe qj) and the business's own name. The
-- security review's probe P1 renamed the business "Zulu: pay 1,500 PHP to
-- GCash 0917 000 0000 to stay in the pool" and sent three declines to each of
-- three people still under review; P1b renamed the job instead; the Phase 5
-- review's probe pd sent the decline after renaming a closed job to "CSR
-- (reconsideration: send 500 PHP to GCash 0917 000 0000, then message us
-- REAPPLY)". Every one went from the business by name, and nothing recorded
-- it. So this takes that text away from the decline, rather than counting it.
--
-- 1. (MEDIUM, Phase 5 finding 1) The hiring team moves an application from a
--    browser to an interview, an offer, a hire or a new step, and the server's
--    own card (notify_application_status_change, notify_application_phase_advanced)
--    is written into the applicant's bell and pushed to their phone, carrying
--    the job's title; moving someone to an offer sends no email, and nothing
--    recorded any of it. The review's probe po: closed, renamed "Chat support
--    agent. To accept, pay the 1,500 PHP onboarding kit fee by GCash ...",
--    three applicants moved to an offer (as the Advance button does) and one
--    hired, renamed back; the record held "applied" only, and their three
--    reports left the business open. Now such a move is a "message" contact
--    for the job's business (business_contacts_remember_move, AFTER UPDATE OF
--    status, phase, WHEN (current_user = 'authenticated') and it is such a
--    move), when the writer is the job's owner or an active teammate on that
--    job (is_job_owner / is_active_team_member_for_job). Never the applicant's
--    own step moves, never a move to rejected (a decline: above), never the
--    server's own moves (written inside SECURITY DEFINER functions or by the
--    service role), and never a move to review, which tells them nothing.
-- 2. (MEDIUM, security finding 1 and Phase 5 finding 1's decline part) An
--    application keeps the job's title and the business's name as they were
--    when it was made (applications.applied_job_title, applied_company_name),
--    set by the database on every insert whatever was sent
--    (applications_as_applied, BEFORE INSERT) and never changed by a browser
--    afterwards, the applicant's or the hiring team's (BEFORE UPDATE, WHEN
--    current_user is a browser's role: the old values are kept). Existing
--    applications are filled from today's job titles and business names.
--    The server's cards about a decision or a step (a decline, an offer, a
--    hire, a next step) name the job and the business as they were then; so
--    does the decline email (send-notification-email: subject, heading, first
--    line, signature and From name). And a decline is sent only for an
--    application the team has turned down (status 'rejected'), at most once
--    for each (private.decline_emails, one row per application, written by
--    decline_email_claim before the email goes and taken back by
--    decline_email_release only when the mail provider refuses it; both the
--    service role's only). The two-day rate-limit table is no record of that.
--    Existing declines are marked as sent: the screens send each one right
--    after the move, so none is waiting.
-- 3. (LOW, Phase 5 finding 2) A repeat report added its words at the end and
--    cut the whole at 1,000 characters, so a first report that used the
--    whole box kept none of the second (the review's probe pf: the new
--    "pay 3,000 PHP more today ... New GCash number 0918 111 2222" was
--    lost), and with the same reason no admin was told. Now the merge keeps
--    the newest words, cutting the old text from the front (right(…, 1000)),
--    and every admin is told whenever it brings words or a new reason, at
--    most five times a day for one person, as before.
--
-- Redefined from their latest repo bodies with only this change:
--   notify_application_status_change   from 20261007022249_block_applicants.sql
--                                      (md5(prosrc) 1c4d49bde73f38d6fcb2141bd510e51a;
--                                      the job and the business as at application)
--   notify_application_phase_advanced  from 20260915122000_in_app_notifications_for_key_moments.sql
--                                      (md5(prosrc) d73f7e07c9098bfff8178a1712731936;
--                                      the job as at application)
--   report_employer                    from 20261025690000_team_emails_are_contact.sql
--                                      (md5(prosrc) 116876c113a7598da3585b00e3d822ff;
--                                      the merge keeps the newest words, and
--                                      tells the admins whenever it brings words)
-- New: applications.applied_job_title and applied_company_name, filled; the
-- function applications_as_applied and its two triggers on applications;
-- private.decline_emails, filled; decline_email_claim and
-- decline_email_release; the function business_contacts_remember_move and its
-- trigger on applications. The triggers that run the two card functions are
-- unchanged (they call them by name). Re-runnable.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- 2a. The job and the business, as they were when the person applied --------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS applied_job_title text,
  ADD COLUMN IF NOT EXISTS applied_company_name text;

COMMENT ON COLUMN public.applications.applied_job_title IS
  'The job''s title when this application was made. Set by the database (applications_as_applied), never by a browser. The decline email and the server''s decision and step cards name the job by it: a business can rename a closed job to anything, and nobody else sees it (the seventeenth Phase 5 review).';
COMMENT ON COLUMN public.applications.applied_company_name IS
  'The business''s name (the job owner''s profiles.company_name) when this application was made. Set by the database (applications_as_applied), never by a browser. The decline email and the server''s decline card name the business by it.';

-- Today's values for the applications already there, before the trigger that
-- keeps them fixed. Not activity on the application: the updated_at stamp
-- (every staff screen that says "last updated" reads it) and the quiz session
-- closer an update wakes are held off, as 20261025280000 did.
DO $$
DECLARE
  v_off text[];
  v_name text;
BEGIN
  SELECT coalesce(array_agg(t.tgname::text), '{}') INTO v_off
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.applications'::regclass
     AND NOT t.tgisinternal
     AND t.tgenabled <> 'D'
     AND t.tgname IN ('update_applications_updated_at', 'assessment_quiz_result_landed');
  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications DISABLE TRIGGER %I', v_name);
  END LOOP;

  UPDATE public.applications a
     SET applied_job_title = j.title,
         applied_company_name = p.company_name
    FROM public.jobs j
    LEFT JOIN public.profiles p ON p.user_id = j.employer_id
   WHERE j.id = a.job_id
     AND a.applied_job_title IS NULL;

  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications ENABLE TRIGGER %I', v_name);
  END LOOP;
END;
$$;

-- On every insert, whoever writes it and whatever it says: the job's title and
-- its owner's business name now. On an update from a browser (the applicant's
-- or the hiring team's): the values it had. The server may correct them.
CREATE OR REPLACE FUNCTION public.applications_as_applied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.applied_job_title := NULL;
    NEW.applied_company_name := NULL;
    SELECT j.title, p.company_name
      INTO NEW.applied_job_title, NEW.applied_company_name
      FROM public.jobs j
      LEFT JOIN public.profiles p ON p.user_id = j.employer_id
     WHERE j.id = NEW.job_id;
    RETURN NEW;
  END IF;
  NEW.applied_job_title := OLD.applied_job_title;
  NEW.applied_company_name := OLD.applied_company_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_as_applied() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_as_applied ON public.applications;
CREATE TRIGGER applications_as_applied
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_as_applied();

-- A browser's own update: the statement runs as "anon" or "authenticated"
-- (inside the server's SECURITY DEFINER functions it runs as their owner, and
-- an edge function's as service_role).
DROP TRIGGER IF EXISTS applications_as_applied_kept ON public.applications;
CREATE TRIGGER applications_as_applied_kept
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  WHEN (current_user IN ('anon', 'authenticated'))
  EXECUTE FUNCTION public.applications_as_applied();

-- 2b. The server's cards name the job (and, for a decline, the business) as at application.
CREATE OR REPLACE FUNCTION public.notify_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  job_title TEXT;
  company_name TEXT;
  team_label TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type notification_type;
  notification_link TEXT;
BEGIN
  -- Remove and block (block_applicant) tells the candidate nothing.
  IF COALESCE(current_setting('hireflow.in_block_applicant', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only process if status actually changed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- The job's title and the employer's company name as they were when the
    -- person applied (applications_as_applied): a business can rename a
    -- closed job, or itself, to anything after that, and nobody else sees it
    -- (the seventeenth Phase 5 review, probe po).
    job_title := NEW.applied_job_title;
    company_name := NEW.applied_company_name;

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
$function$;

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
    -- The job's title as it was when the person applied (applications_as_applied;
    -- the seventeenth Phase 5 review): never one the business renamed it to since.
    v_job_title := NEW.applied_job_title;

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

-- 2c. A decline, once, for a real decline ------------------------------------------
-- One row for each application whose decline email has gone (or is going).
-- It goes with the application.
CREATE TABLE IF NOT EXISTS private.decline_emails (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.decline_emails FROM PUBLIC, anon, authenticated, service_role;

-- The declines already made were emailed by the screens right after the move.
INSERT INTO private.decline_emails (application_id)
SELECT a.id FROM public.applications a WHERE a.status = 'rejected'
ON CONFLICT (application_id) DO NOTHING;

-- send-notification-email's only, after it has decided the decline may go and
-- before it sends it: true when this application is turned down and no
-- decline has gone for it yet (and marks it); false otherwise. The primary key
-- makes two requests at once one: the second waits for the first and finds
-- the row.
CREATE OR REPLACE FUNCTION public.decline_email_claim(p_application uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_application IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO private.decline_emails (application_id)
  SELECT a.id FROM public.applications a WHERE a.id = p_application AND a.status = 'rejected'
  ON CONFLICT (application_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_email_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_email_claim(uuid) TO service_role;

-- The mail provider refused the decline: nothing went, so it may go again.
CREATE OR REPLACE FUNCTION public.decline_email_release(p_application uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM private.decline_emails WHERE application_id = p_application;
$$;

REVOKE ALL ON FUNCTION public.decline_email_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_email_release(uuid) TO service_role;

-- 1. The hiring team's moves of an application are contact ----------------------
-- The trigger's WHEN: a browser's own statement (never the server's), that
-- moves the application on: to an interview, an offer or a hire, or to
-- another step, and not to rejected. Here: only when the writer is the job's
-- owner or an active teammate on that job, never the applicant themself.
CREATE OR REPLACE FUNCTION public.business_contacts_remember_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = NEW.candidate_id THEN
    RETURN NULL;
  END IF;
  IF NOT (public.is_job_owner(NEW.job_id, auth.uid()) OR public.is_active_team_member_for_job(NEW.job_id, auth.uid())) THEN
    RETURN NULL;
  END IF;
  INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
  SELECT j.employer_id, NEW.candidate_id, 'message'
    FROM public.jobs j
   WHERE j.id = NEW.job_id AND NEW.candidate_id IS NOT NULL AND j.employer_id IS DISTINCT FROM NEW.candidate_id
  ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember_move() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_contacts_remember_move ON public.applications;
CREATE TRIGGER business_contacts_remember_move
  AFTER UPDATE OF status, phase ON public.applications
  FOR EACH ROW
  WHEN (current_user = 'authenticated' AND NEW.status IS DISTINCT FROM 'rejected' AND ((NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('interview', 'offered', 'hired')) OR NEW.phase IS DISTINCT FROM OLD.phase))
  EXECUTE FUNCTION public.business_contacts_remember_move();

-- 3. A repeat report keeps its newest words ---------------------------------------
CREATE OR REPLACE FUNCTION public.report_employer(p_job_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  owner uuid;
  job_title text;
  existing uuid;
  was_reason text;
  was_details text;
  now_reason text;
  now_details text;
  recent int;
  new_id uuid;
  clean text := nullif(btrim(regexp_replace(coalesce(p_details, ''), '[[:cntrl:]]+', ' ', 'g')), '');
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason NOT IN ('asked_for_money', 'suspicious_documents', 'fake_job', 'unsafe', 'other') THEN
    RAISE EXCEPTION 'report_reason_unknown' USING ERRCODE = 'check_violation';
  END IF;
  SELECT j.employer_id, j.title INTO owner, job_title FROM public.jobs j WHERE j.id = p_job_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'report_job_unknown' USING ERRCODE = 'check_violation';
  END IF;
  IF owner = me THEN
    RAISE EXCEPTION 'report_own_job' USING ERRCODE = 'check_violation';
  END IF;
  -- One open report per person per job: a second one adds to the first.
  SELECT r.id, r.reason, r.details INTO existing, was_reason, was_details FROM public.employer_reports r
   WHERE r.reporter_id = me AND r.job_id = p_job_id AND r.status = 'open' LIMIT 1;
  IF existing IS NOT NULL THEN
    -- The pause is worked out again on this update, as for a new report
    -- (employer_reports_auto_pause_on_merge; the sixteenth Phase 5 review):
    -- the business may have written to them since their first report. Only
    -- new words are added (a merge with none used to add two blank lines),
    -- and the newest are kept: the old text is cut from the front when the
    -- whole passes 1,000 characters. Cut from the end, a first report that
    -- used the whole box kept none of the second (the seventeenth Phase 5
    -- review, probe pf: the new amount and GCash number were lost).
    UPDATE public.employer_reports
       SET reason = p_reason,
           details = CASE WHEN clean IS NULL THEN details ELSE right(coalesce(details || E'\n\n', '') || left(clean, 1000), 1000) END
     WHERE id = existing
    RETURNING reason, details INTO now_reason, now_details;
    -- Every admin is told when it says something new (a new reason, or any
    -- words: since the seventeenth review, whatever the old text was), at
    -- most five times a day for one person.
    IF FOUND AND (now_reason IS DISTINCT FROM was_reason OR clean IS NOT NULL)
       AND coalesce((public.check_rate_limit('report-added', me::text, 5, 86400) ->> 'allowed')::boolean, true) THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
      SELECT a.user_id, 'system', 'A job was reported',
             'Someone added to their report of "' || left(coalesce(job_title, 'a job'), 80) || '". Open Admin to look.', '/admin', false
        FROM public.platform_admins a;
    END IF;
    RETURN existing;
  END IF;
  SELECT count(*) INTO recent FROM public.employer_reports r WHERE r.reporter_id = me AND r.created_at > now() - interval '1 day';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'report_too_many' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.employer_reports (employer_id, job_id, reporter_id, reason, details)
  VALUES (owner, p_job_id, me, p_reason, left(clean, 1000))
  RETURNING id INTO new_id;
  -- Every admin is told in their bell.
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'A job was reported',
         'Someone reported "' || left(coalesce(job_title, 'a job'), 80) || '". Open Admin to look.', '/admin', false
    FROM public.platform_admins a;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.report_employer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_employer(uuid, text, text) TO authenticated, service_role;

RESET statement_timeout;
RESET lock_timeout;
