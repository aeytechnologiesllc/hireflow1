-- What a business changes of the words its applicants read is contact, and a
-- report can name the business when its job is gone (the nineteenth Phase 5
-- review, 2026-10-27, findings 1 to 3; the eighteenth security review,
-- finding 1).
--
-- Rounds 15 to 19 each found one more place where a business shows its
-- applicants words it can change after they applied, with nothing recorded
-- as contact: a bell card, an email, a move, a decline, the applicant's own
-- emails and pages. This closes the class rather than the next instance: a
-- business's browser edit of the words an applicant reads (a job's title,
-- description and step text, or the business's own name), while those
-- applicants can still read it and the public cannot, is contact with them.
-- Where the application's own snapshot (applied_job_title,
-- applied_company_name, 20261025700000) covers a page cheaply, the pages show
-- it as well (src/lib/appliedNames.ts, src/lib/liveJobText.ts).
--
-- 1. (MEDIUM, Phase 5 finding 2; security finding 1) Every step page put the
--    job's title today at its top, with the business's own step text (the
--    video introduction's prompt, the work-samples prompt, the form's
--    questions, the quiz, the chat practice's title), and the two overview
--    pages its location, its type and every step's title. "Employers can
--    update their own jobs" allows any column at any status, and nobody else
--    sees a closed job. The review's probe p1_steps_closed closed a job,
--    renamed it "PAY 500 PHP GCASH 0917 000 0000 FIRST - Chat support agent",
--    titled its video step "Pay the 500 PHP fee, then record" with a prompt to
--    hold the GCash receipt up to the camera, and asked the form's question
--    for a GCash reference number; a draft sent the form after the close with
--    "GCash ref 1234567890"; the record held "applied" for all three, and
--    their three reports left the business open. The security review's
--    s1_residual did the same with the job's location ("Remote. To be
--    reconsidered, send the 500 PHP review fee to GCash ..."), its type and a
--    new step's title. Now a browser's change of a job's applicant-facing
--    words (title, description, requirements, responsibilities, benefits,
--    skills, experience level, location, type, the form's questions, the
--    quiz, and every step's title, description and settings) records a
--    "message" for the job's business and each person with an open
--    application to it (not turned down or hired: their pages show only
--    what was there when they applied, or what the public can read)
--    (business_contacts_remember_text, AFTER UPDATE on jobs, WHEN
--    (current_user = 'authenticated')), when the writer is the job's owner or
--    an active teammate on it, and:
--      - the job is not on its public page before or after the change
--        (published, not kept off the list, its business not paused, and its
--        deadline at least a day away: published_jobs_public's rule, with the
--        day; job_text_public); or
--      - what changed is not on the public page whatever the job's status:
--        a step's settings (its prompt, its scenario), a form question's
--        options (published_jobs_public carries a step's id, type, title,
--        description and required, and a question's id, type, question,
--        required, placeholder, time limit and category, never the rest); or
--      - it was a change made while the job was public, and the job stops
--        being public within a day of it (closed, kept off the list, or a
--        deadline set inside the day): a fee ask made public for a moment and
--        then closed away is no change the public saw (private.job_public_text_edits
--        keeps when each job's public words last changed).
--    Only words count (every string in those columns, compared before and
--    after), never a number, a switch or the order of nothing: a time limit,
--    a passing score or "required" moved is not contact. A published job's
--    change the public page shows, and that stays public for a day, is not
--    contact: anyone can read it there, HireFlow's admins included, and
--    counted, any three throwaway applicants could pause any real business
--    that fixes a typo in its live job (what the Phase 7 audit's "reports
--    need contact" closed). The server's own writes (Ava's builder through
--    the service role, a pause, a reopen) never fire it.
-- 2. (MEDIUM, Phase 5 finding 1) The applicant's Messages page named every
--    business by its name today and every role by the job's title today, and
--    every applicant email, the decline included, links there ("Message us in
--    your account"). The page now names them from the applicant's own
--    application (src/hooks/useMessages.ts). And a business's rename of
--    itself (profiles.company_name, from a browser) records a "message" for
--    each person with an open application to any of its jobs
--    (business_contacts_remember_name, AFTER UPDATE OF company_name on
--    profiles, WHEN (current_user = 'authenticated') and the name changed),
--    so a rename followed by a fee ask cannot dodge the pause wherever the
--    name is still read today. A real business renames itself rarely.
-- 3. (LOW-MEDIUM, Phase 5 finding 3) report_employer refused a job that no
--    longer exists (report_job_unknown), and deleting the job takes its
--    applications with it: the people a business asked for money ("To keep
--    your place, pay the 1,500 PHP onboarding fee by GCash ...", probe
--    p3_nowhere_to_report, Fee Desk A) had nowhere to report it, the record
--    held "applied,message" for each, and it posted the same job again. A
--    report may now name the business (report_employer's fourth argument,
--    p_employer): the job's business while the job exists, as before; when
--    the job is gone, or none is named, a business the reporter has a
--    recorded contact with or a message thread with (public.report_choices,
--    the caller's own list; a teammate's account names their business). The
--    report keeps employer_id, its job is NULL, and every rule holds: one
--    open report per person per job, or per business when there is none; the
--    pause count, the heard rule and five a day, all by business as before.
--    Report is offered on the applicant's Messages thread with a business and
--    on the "We can't find that application" screens.
--
-- Redefined from its latest repo body with only this change:
--   report_employer   from 20261025700000_decline_names_the_job_as_applied.sql
--                     (md5(prosrc) a354650500dc3b1369026230cd5d50a5;
--                     a fourth argument, p_employer: with no job, the
--                     business the reporter heard from; one open report per
--                     business when there is no job; the admins' bell names
--                     the business then). Its three-argument form is dropped
--                     and made again with the fourth argument DEFAULT NULL,
--                     so every caller's three arguments still reach it.
-- New: public.job_applicant_words, public.job_text_public,
-- private.job_public_text_edits, public.business_contacts_remember_text and
-- its trigger on jobs; public.business_contacts_remember_name and its
-- trigger on profiles; public.report_business_of and public.report_choices.
-- The record (private.business_contacts), business_has_contacted,
-- report_already_heard and employer_reports_auto_pause are unchanged: a
-- report with no job counts by its business like any other. Re-runnable.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- 1. A job's applicant-facing words ------------------------------------------------
-- Every string an applicant can read of this job, in one array (an edit that
-- changes none of them is no change of words). With p_hidden_only, only the
-- strings the public page never shows: a step's settings and a question's
-- options and anything else published_jobs_public leaves out of each element,
-- and the whole of a list that is not a list.
CREATE OR REPLACE FUNCTION public.job_applicant_words(p_job public.jobs, p_hidden_only boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_path_query_array(
    CASE WHEN p_hidden_only THEN
      jsonb_build_array(
        CASE WHEN jsonb_typeof(p_job.workflow_steps) = 'array' THEN
          (SELECT jsonb_agg(CASE WHEN jsonb_typeof(s.value) = 'object' THEN s.value - ARRAY['id', 'type', 'title', 'description', 'required'] ELSE s.value END)
             FROM jsonb_array_elements(p_job.workflow_steps) s)
        ELSE p_job.workflow_steps END,
        CASE WHEN jsonb_typeof(p_job.application_questions) = 'array' THEN
          (SELECT jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object' THEN q.value - ARRAY['id', 'type', 'question', 'required', 'placeholder', 'time_limit_seconds', 'category'] ELSE q.value END)
             FROM jsonb_array_elements(p_job.application_questions) q)
        ELSE p_job.application_questions END,
        CASE WHEN jsonb_typeof(p_job.quiz_questions) = 'array' THEN
          (SELECT jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object' THEN q.value - ARRAY['id', 'type', 'question', 'options', 'time_limit_seconds', 'category'] ELSE q.value END)
             FROM jsonb_array_elements(p_job.quiz_questions) q)
        ELSE p_job.quiz_questions END
      )
    ELSE
      jsonb_build_array(
        p_job.title, p_job.description, p_job.requirements, p_job.responsibilities,
        to_jsonb(p_job.benefits), to_jsonb(p_job.skills_required), p_job.experience_level,
        p_job.location, p_job.job_type,
        p_job.application_questions, p_job.quiz_questions, p_job.workflow_steps
      )
    END,
    'strict $.** ? (@.type() == "string")'), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.job_applicant_words(public.jobs, boolean) FROM PUBLIC, anon, authenticated;

-- Is this job on its public page, and will it stay there for at least a day?
-- published_jobs_public's own rule (published, not kept off the list, its
-- business not paused, its deadline not passed), with the deadline a day
-- away: words that leave the public page within the day were not public.
CREATE OR REPLACE FUNCTION public.job_text_public(p_job public.jobs)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_job.status = 'published'
     AND NOT coalesce(p_job.exclude_from_feed, false)
     AND (p_job.application_deadline IS NULL OR p_job.application_deadline > now() + interval '1 day')
     AND public.business_status_of(p_job.employer_id) IS DISTINCT FROM 'suspended';
$$;

REVOKE ALL ON FUNCTION public.job_text_public(public.jobs) FROM PUBLIC, anon, authenticated;

-- When each job's public words last changed (one row a job; it goes with the job).
CREATE TABLE IF NOT EXISTS private.job_public_text_edits (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  edited_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.job_public_text_edits FROM PUBLIC, anon, authenticated, service_role;

-- The trigger's WHEN: a browser's own statement (never the server's). Here:
-- only the job's owner or an active teammate on it (the update policies'
-- own people), and only when the words its applicants read changed where
-- the public cannot read them, or are leaving the public page within a day
-- of a change.
CREATE OR REPLACE FUNCTION public.business_contacts_remember_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  was_public boolean;
  is_public boolean;
  words_changed boolean;
  record_it boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_job_owner(NEW.id, auth.uid()) OR public.is_active_team_member_for_job(NEW.id, auth.uid())) THEN
    RETURN NULL;
  END IF;
  was_public := public.job_text_public(OLD);
  is_public := public.job_text_public(NEW);
  words_changed := public.job_applicant_words(OLD, false) IS DISTINCT FROM public.job_applicant_words(NEW, false);

  IF words_changed THEN
    IF NOT was_public OR NOT is_public
       OR public.job_applicant_words(OLD, true) IS DISTINCT FROM public.job_applicant_words(NEW, true) THEN
      record_it := true;
    ELSE
      -- On the public page for everyone: not contact, unless the job leaves
      -- it within a day (below, on that later write).
      INSERT INTO private.job_public_text_edits AS e (job_id) VALUES (NEW.id)
      ON CONFLICT (job_id) DO UPDATE SET edited_at = EXCLUDED.edited_at;
    END IF;
  END IF;

  IF NOT record_it AND was_public AND NOT is_public THEN
    record_it := EXISTS (
      SELECT 1 FROM private.job_public_text_edits e
       WHERE e.job_id = NEW.id AND e.edited_at > now() - interval '1 day'
    );
  END IF;

  IF record_it THEN
    -- Everyone still waiting on this job: turned down or hired, their pages
    -- show only what they applied to or what the public can read.
    INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
    SELECT DISTINCT NEW.employer_id, a.candidate_id, 'message'
      FROM public.applications a
     WHERE a.job_id = NEW.id
       AND a.candidate_id IS NOT NULL
       AND a.candidate_id IS DISTINCT FROM NEW.employer_id
       AND a.candidate_id IS DISTINCT FROM auth.uid()
       AND a.status NOT IN ('rejected', 'hired')
    ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember_text() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_contacts_remember_text ON public.jobs;
CREATE TRIGGER business_contacts_remember_text
  AFTER UPDATE OF title, description, requirements, responsibilities, benefits, skills_required, experience_level, location, job_type, application_questions, quiz_questions, workflow_steps, status, exclude_from_feed, application_deadline ON public.jobs
  FOR EACH ROW
  WHEN (current_user = 'authenticated')
  EXECUTE FUNCTION public.business_contacts_remember_text();

-- 2. A business's rename of itself ---------------------------------------------------
-- Its own browser (the profile is its own: "Users can update their own
-- profile"), and the name it shows changed: everyone still waiting on any
-- of its jobs.
CREATE OR REPLACE FUNCTION public.business_contacts_remember_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RETURN NULL;
  END IF;
  INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
  SELECT DISTINCT NEW.user_id, a.candidate_id, 'message'
    FROM public.jobs j
    JOIN public.applications a ON a.job_id = j.id
   WHERE j.employer_id = NEW.user_id
     AND a.candidate_id IS NOT NULL
     AND a.candidate_id IS DISTINCT FROM NEW.user_id
     AND a.status NOT IN ('rejected', 'hired')
  ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_contacts_remember_name ON public.profiles;
CREATE TRIGGER business_contacts_remember_name
  AFTER UPDATE OF company_name ON public.profiles
  FOR EACH ROW
  WHEN (current_user = 'authenticated' AND NEW.company_name IS DISTINCT FROM OLD.company_name)
  EXECUTE FUNCTION public.business_contacts_remember_name();

-- 3. A report that names the business ------------------------------------------------
-- The business an account is (a business account) or belongs to (a
-- teammate: an account belongs to one business; the newest active row
-- first), or NULL.
CREATE OR REPLACE FUNCTION public.report_business_of(p_account uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_account IS NULL THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p_account AND r.role = 'employer') THEN p_account
           ELSE (SELECT tm.employer_id FROM public.team_members tm
                  WHERE tm.user_id = p_account
                  ORDER BY (tm.status = 'active') DESC, tm.created_at DESC
                  LIMIT 1)
         END;
$$;

REVOKE ALL ON FUNCTION public.report_business_of(uuid) FROM PUBLIC, anon, authenticated;

-- The businesses the caller may report without a job: each one the record
-- says they applied to or heard from, and each one they have a message
-- thread with (its owner or anyone on its team), newest first. Named, when
-- one of their applications to it is still there, as it was when they
-- applied (its newest), never by its name today. Only ever about the caller.
CREATE OR REPLACE FUNCTION public.report_choices()
RETURNS TABLE (employer_id uuid, company_name text, job_id uuid, job_title text, last_heard_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH heard AS (
    SELECT c.employer_id AS business, c.last_at AS at
      FROM private.business_contacts c
     WHERE c.person_id = auth.uid()
    UNION ALL
    SELECT public.report_business_of(CASE WHEN m.sender_id = auth.uid() THEN m.receiver_id ELSE m.sender_id END), m.created_at
      FROM public.messages m
     WHERE (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
       AND m.sender_id IS DISTINCT FROM m.receiver_id
  ),
  businesses AS (
    SELECT h.business, max(h.at) AS at
      FROM heard h
     WHERE h.business IS NOT NULL AND h.business IS DISTINCT FROM auth.uid()
     GROUP BY h.business
  )
  SELECT b.business, newest.applied_company_name, newest.job_id, newest.applied_job_title, b.at
    FROM businesses b
    LEFT JOIN LATERAL (
      SELECT a.job_id, a.applied_job_title, a.applied_company_name
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
       WHERE a.candidate_id = auth.uid() AND j.employer_id = b.business
       ORDER BY a.created_at DESC
       LIMIT 1
    ) newest ON true
   WHERE auth.uid() IS NOT NULL
   ORDER BY b.at DESC
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.report_choices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_choices() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.report_employer(uuid, text, text);
CREATE OR REPLACE FUNCTION public.report_employer(p_job_id uuid, p_reason text, p_details text DEFAULT NULL, p_employer uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  owner uuid;
  job_title text;
  report_job uuid;
  about text;
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
  IF owner IS NOT NULL THEN
    report_job := p_job_id;
    about := '"' || left(coalesce(job_title, 'a job'), 80) || '"';
  ELSIF p_employer IS NOT NULL THEN
    -- No job (deleted, which takes its applications with it, or none named):
    -- the business, when the reporter has a recorded contact or a message
    -- thread with it (report_choices: their own list), a teammate's account
    -- naming their business (the nineteenth Phase 5 review, finding 3: the
    -- people a business asked for money had nowhere to report it once it
    -- deleted the job).
    SELECT c.employer_id INTO owner FROM public.report_choices() c
     WHERE c.employer_id = public.report_business_of(p_employer)
     LIMIT 1;
    IF owner IS NULL THEN
      RAISE EXCEPTION 'report_business_unknown' USING ERRCODE = 'check_violation';
    END IF;
    SELECT 'the business "' || left(coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'with no name'), 80) || '"' INTO about
      FROM public.profiles p WHERE p.user_id = owner;
    about := coalesce(about, 'a business');
  END IF;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'report_job_unknown' USING ERRCODE = 'check_violation';
  END IF;
  IF owner = me THEN
    RAISE EXCEPTION 'report_own_job' USING ERRCODE = 'check_violation';
  END IF;
  -- One open report per person per job, or per business when there is no
  -- job: a second one adds to the first. A report on a job deleted since has
  -- no job any more, and a new one about its business adds to it.
  SELECT r.id, r.reason, r.details INTO existing, was_reason, was_details FROM public.employer_reports r
   WHERE r.reporter_id = me AND r.status = 'open'
     AND (r.job_id = report_job OR (report_job IS NULL AND r.job_id IS NULL AND r.employer_id = owner))
   LIMIT 1;
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
             'Someone added to their report of ' || about || '. Open Admin to look.', '/admin', false
        FROM public.platform_admins a;
    END IF;
    RETURN existing;
  END IF;
  SELECT count(*) INTO recent FROM public.employer_reports r WHERE r.reporter_id = me AND r.created_at > now() - interval '1 day';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'report_too_many' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.employer_reports (employer_id, job_id, reporter_id, reason, details)
  VALUES (owner, report_job, me, p_reason, left(clean, 1000))
  RETURNING id INTO new_id;
  -- Every admin is told in their bell.
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'A job was reported',
         'Someone reported ' || about || '. Open Admin to look.', '/admin', false
    FROM public.platform_admins a;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.report_employer(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_employer(uuid, text, text, uuid) TO authenticated, service_role;

RESET statement_timeout;
RESET lock_timeout;
