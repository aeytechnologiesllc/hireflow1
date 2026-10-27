-- The hiring team's emails are contact, a repeat report is worked out again,
-- and an interview's new time, link or notes is contact (the sixteenth Phase
-- 5 review, 2026-10-26, findings 1 and 2; the fifteenth security review,
-- finding 1 (MEDIUM), finding 2 and its first LOW).
--
-- 1. (MEDIUM) send-notification-email sends the hiring team's own text to
--    anyone who applied, with no row behind it: a job title of the team's
--    choosing (up to 200 characters, in the subject), a document's or a
--    step's name, a message preview with no message, an interview
--    invitation's twelve "times" of 120 characters. The security review's
--    probe: "You're hired! You're joining <business> as CSR. Send the 1,500
--    PHP onboarding fee to GCash 0917 000 0000 by Friday to keep your slot",
--    to three people who had only applied; no message, request, document,
--    interview or card existed, so their three reports left the business
--    open. The function now records a "message" contact for the job's
--    business and that person before it sends one of the team's emails to an
--    applicant (a staff kind, or a message), through
--    public.business_contacts_remember_email (service role only), with the
--    record's own ON CONFLICT ... last_at, so an email after an admin's close
--    makes a heard person count again too. It writes only for someone the
--    record says applied to that business, never for the business itself,
--    and the function decides who may send what exactly as before. (The
--    function also takes the job's title from the job row and an
--    invitation's times from the interview row now: docs/NOTIFICATION-EMAILS.md.)
-- 2. (LOW, a regression of 20261025680000) A second report on the same job
--    adds to the open one (report_employer), and the pause was worked out
--    only when a report was inserted (employer_reports_auto_pause, AFTER
--    INSERT). After a reopen, the people an admin had heard report again at
--    once (not counted, as round 15 meant); their reports stay open, so when
--    the business wrote to them again and they reported the new demand, each
--    report was merged into the open one: no count, no bell (the review's
--    probe pa; the security review's heard2, which paused only when a
--    fourth person filed a new report). Three people who reported a fake ad
--    before any contact, then were asked for money and reported again, the
--    same (probe pb). Now the merge runs the same check
--    (employer_reports_auto_pause_on_merge, AFTER UPDATE OF reason, details,
--    on an open report), and every admin is told when a merge gives a new
--    reason or adds words ("A job was reported", at most five a day for one
--    person; a merge that adds nothing tells nobody and adds no blank
--    lines). A merge never rings "reported 3 times" (it makes no new
--    reporter), and someone already heard, not written to since, still
--    counts for nothing.
-- 3. (LOW) After a reopen the business could change the time, the meeting
--    link or the notes of an interview already booked with someone it had
--    heard, and they stayed heard: the record moved only on an insert. A
--    browser's change of an interview's time (scheduled_at, or the offered
--    times, employer_windows), link or notes now moves that interview
--    contact's last time (business_contacts_remember_edit, AFTER UPDATE on
--    interviews, WHEN (current_user = 'authenticated') and one of them
--    changed). Only a browser can change one that way (the job's owner, or a
--    teammate who schedules interviews: the update policies), and the
--    business is the application's job's, as for a new interview. The
--    server's own changes (reminders, an applicant's answer through
--    candidate-interview-response) never fire it.
--
-- Redefined from their latest repo bodies with only this change:
--   report_employer               from 20261011100000_business_trust.sql
--                                 (md5(prosrc) 872f25df0bab08fe8eaad2d978ec67a8;
--                                 the merge adds only new words, and tells
--                                 every admin when it says something new)
--   employer_reports_auto_pause   from 20261025680000_reports_heard_stay_heard.sql
--                                 (md5(prosrc) f4a9c217dcc565b56996589c8ec5c02e;
--                                 "reported 3 times" only for a new report)
-- New: public.business_contacts_remember_email, the trigger
-- employer_reports_auto_pause_on_merge on employer_reports, and the trigger
-- business_contacts_remember_edit on interviews (it runs
-- business_contacts_remember, unchanged: md5(prosrc)
-- c326ea81bfdcf2e604189f60c7e5f02e, from 20261025680000). The trigger that
-- runs employer_reports_auto_pause on a new report is unchanged.
-- Re-runnable.

-- 1. An email from the hiring team to someone who applied ----------------------
-- send-notification-email's only, after it has decided the email may go:
-- the job's business (the one that signs it) and the recipient. Nothing for
-- a person the record says never applied to that business, or for the
-- business itself; true when the record holds the contact.
CREATE OR REPLACE FUNCTION public.business_contacts_remember_email(p_employer uuid, p_person uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_employer IS NULL OR p_person IS NULL OR p_employer = p_person THEN
    RETURN false;
  END IF;
  INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
  SELECT p_employer, p_person, 'message'
   WHERE EXISTS (
     SELECT 1 FROM private.business_contacts a
      WHERE a.employer_id = p_employer AND a.person_id = p_person AND a.kind = 'applied'
   )
  ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember_email(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_contacts_remember_email(uuid, uuid) TO service_role;

-- 2. A repeat report ------------------------------------------------------------
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
    -- new words are added (a merge with none used to add two blank lines).
    UPDATE public.employer_reports
       SET reason = p_reason,
           details = CASE WHEN clean IS NULL THEN details ELSE left(coalesce(details || E'\n\n', '') || clean, 1000) END
     WHERE id = existing
    RETURNING reason, details INTO now_reason, now_details;
    -- Every admin is told when it says something new (a new reason, or more
    -- words), at most five times a day for one person.
    IF FOUND AND (now_reason IS DISTINCT FROM was_reason OR now_details IS DISTINCT FROM was_details)
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

CREATE OR REPLACE FUNCTION public.employer_reports_auto_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  applied int;
  contacted int;
  new_applied boolean;
  who text;
BEGIN
  IF public.business_status_of(NEW.employer_id) = 'suspended' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = NEW.employer_id) THEN
    RETURN NULL;
  END IF;
  -- Different people with an open report, each of whom applied to this
  -- business; and of those, the ones it has been in touch with. "Applied" is
  -- the record of it (private.business_contacts), so an application the
  -- business deleted since still counts (the fourteenth Phase 5 review).
  -- Someone an admin already heard about it counts again only once the
  -- business is in touch with them after that (report_already_heard; the
  -- fifteenth Phase 5 review): the same three could pause it again after
  -- every reopen, for good.
  SELECT count(*), count(*) FILTER (WHERE public.business_has_contacted(NEW.employer_id, people.reporter_id))
    INTO applied, contacted
    FROM (
      SELECT DISTINCT r.reporter_id
        FROM public.employer_reports r
       WHERE r.employer_id = NEW.employer_id
         AND r.status = 'open'
         AND EXISTS (
           SELECT 1 FROM private.business_contacts c
            WHERE c.employer_id = NEW.employer_id AND c.person_id = r.reporter_id
         )
         AND NOT public.report_already_heard(NEW.employer_id, r.reporter_id)
    ) people;
  SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), '')) INTO who
    FROM public.profiles p WHERE p.user_id = NEW.employer_id;

  IF contacted >= 3 THEN
    PERFORM public.business_pause(NEW.employer_id, 'Paused by itself: 3 people it was in touch with reported it', NULL);
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    SELECT a.user_id, 'system', 'A business was paused',
           left(coalesce(who, 'A business'), 80) || ' was reported by 3 people it had been in touch with, so its jobs are closed. Open Admin to look.', '/admin', false
      FROM public.platform_admins a;
    RETURN NULL;
  END IF;

  -- The third person who applied, without three the business contacted: it
  -- stays open, and the admins are told once (when this report makes three;
  -- a report from someone already heard makes nothing). Only a new report
  -- can make three: one added to a reporter's open report (worked out again
  -- since the sixteenth Phase 5 review) brings nobody new.
  SELECT EXISTS (
    SELECT 1 FROM private.business_contacts c
     WHERE c.employer_id = NEW.employer_id AND c.person_id = NEW.reporter_id
  ) AND NOT public.report_already_heard(NEW.employer_id, NEW.reporter_id) INTO new_applied;
  IF TG_OP = 'INSERT' AND applied = 3 AND new_applied
     AND NOT EXISTS (
       SELECT 1 FROM public.employer_reports r
        WHERE r.employer_id = NEW.employer_id AND r.status = 'open'
          AND r.reporter_id = NEW.reporter_id AND r.id <> NEW.id
     ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    SELECT a.user_id, 'system', 'A business was reported 3 times',
           left(coalesce(who, 'A business'), 80) || ' was reported by 3 people who applied. It stays open because it has no recorded contact with them. Open Admin to look.', '/admin', false
      FROM public.platform_admins a;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.employer_reports_auto_pause() FROM PUBLIC, anon, authenticated;

-- A report added to (report_employer's merge: it always sets both columns),
-- while it is open: the same check as a new report.
DROP TRIGGER IF EXISTS employer_reports_auto_pause_on_merge ON public.employer_reports;
CREATE TRIGGER employer_reports_auto_pause_on_merge
  AFTER UPDATE OF reason, details ON public.employer_reports
  FOR EACH ROW
  WHEN (OLD.status = 'open' AND NEW.status = 'open')
  EXECUTE FUNCTION public.employer_reports_auto_pause();

-- 3. An interview's new time, link or notes --------------------------------------
DROP TRIGGER IF EXISTS business_contacts_remember_edit ON public.interviews;
CREATE TRIGGER business_contacts_remember_edit
  AFTER UPDATE OF scheduled_at, employer_windows, meeting_link, notes ON public.interviews
  FOR EACH ROW
  WHEN (current_user = 'authenticated' AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employer_windows IS DISTINCT FROM OLD.employer_windows OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link OR NEW.notes IS DISTINCT FROM OLD.notes))
  EXECUTE FUNCTION public.business_contacts_remember();
