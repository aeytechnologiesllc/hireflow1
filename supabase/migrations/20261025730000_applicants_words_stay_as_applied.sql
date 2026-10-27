-- What an applicant already relies on stops changing under them; an ordinary
-- edit is no contact with everyone waiting (the twentieth Phase 5 review,
-- 2026-10-27, findings 1 and 2).
--
-- Contact is the business reaching a person: a message, an email, papers, an
-- interview, a move of their application. Round 19 (20261025720000) also
-- counted a broadcast as contact with everyone still waiting on a job: a
-- browser's edit of the job's words while the public could not read them,
-- and a business's rename of itself. The review showed that breaks the rule
-- reports rest on ("Reports pause a business only from people it has been in
-- touch with"): three throwaway accounts that only started an application get
-- the contact they need to pause a real business from one ordinary edit, and
-- again after every reopen (finding 2, a regression; probe q3_blanket):
--   (i)   a third choice, "Weekend", added to a live job's "Which shift can
--         you work?" (options were not in published_jobs_public);
--   (ii)  "LLC" added to the business's name in Settings;
--   (iii) a closed job published again with one more line of description,
--         in one save (the editor sends the status with every edit);
--   (iv)  a typo in a live job's title fixed, the job closed the same day;
--   (v)   a typo fixed on a live job whose deadline is tonight.
-- After each, all three had "applied,message", and their next word on their
-- reports paused the business. And the other way round (finding 1, probe
-- q2_live_unshown): on a live job the form's questions, every step's title
-- and description and the quiz counted as public because the view carries
-- them, but no public page shows them; a business rewrote all three into a
-- GCash fee ask ("Paste your GCash reference number for the 500 PHP
-- processing fee ..."), a draft sent "GCash ref 1234567890", nothing was
-- recorded, and three reports left it open.
--
-- So the broadcast is undone, and the class is closed the other way:
--
-- 1. Undone: business_contacts_remember_text (on jobs) and
--    business_contacts_remember_name (on profiles) are dropped, with the
--    helpers only they used (job_applicant_words, job_text_public,
--    private.job_public_text_edits). The "message" rows they wrote stay in
--    private.business_contacts, like every record of contact. Live, the one
--    job is HireFlow's own (a platform admin's business is never paused),
--    so any row they wrote is HireFlow's. report_business_of, report_choices
--    and report_employer's fourth argument stay: a report can still name the
--    business once its job is gone.
-- 2. Every application keeps the job's location and type as they were when it
--    was made, as it keeps the title and the business's name since
--    20261025700000 (applications.applied_location, applied_job_type): set by
--    the database on every insert, kept from every browser after, filled for
--    the applications already there from today's values with the updated_at
--    stamp held off. The applicant's overview pages show these
--    (src/lib/appliedNames.ts): a closed job relabelled "Remote. To be
--    reconsidered, send the 500 PHP review fee to GCash ..." (the eighteenth
--    security review's s1_residual) never reaches them.
-- 3. What applicants answer and read in a job's steps is fixed once the job
--    has any application, drafts included: a browser may not change any word
--    of the form's questions (their text and options), the quiz, or any step
--    (its title, description, prompt, scenario, every setting written in
--    words), nor add or remove a step or a question, nor change the quiz's
--    answer key (jobs_applicant_words_fixed, BEFORE UPDATE OF
--    application_questions, quiz_questions, workflow_steps, WHEN current_user
--    is anon or authenticated; HINT job_steps_fixed). The editor already kept
--    the tests read-only after a job is made; it now shows the questions so
--    too once anyone has applied, and says to copy the job to drafts instead.
--    A number or a switch is not words: a time limit, "required", or the
--    connection check's bars (the editor's one setting it lets a business
--    change on a live job, docs/EQUIPMENT-CHECK.md) stay the business's. The
--    same words saved again are taken. The server's own writes (Ava's
--    builder, an edge function's service role, the database's own functions)
--    are not held. The job's title, description, responsibilities,
--    requirements, benefits and skills stay editable: on a live job they are
--    on its public page, and on a closed one every applicant surface names
--    the job by the application's own snapshot.
--
-- Redefined from its latest repo body with only this change:
--   applications_as_applied   from 20261025700000_decline_names_the_job_as_applied.sql
--                             (md5(prosrc) f086e7d7e1bdf7848b0c4ec1ccc6987d;
--                             also applied_location and applied_job_type)
-- Dropped (live bodies, md5(prosrc), as replayed from the repo and read live
-- by the twentieth review):
--   business_contacts_remember_text()     f68934dfeafc81607943015ce6e232de
--   business_contacts_remember_name()     9a18b4edaae39579ffd8e43386685a86
--   job_applicant_words(jobs, boolean)    f2809dd172364f703adc5b081bf29264
--   job_text_public(jobs)                 65621fb9179c860206bc65209dc2c1b8
--   their two triggers, and the table private.job_public_text_edits (0 rows live).
-- New: applications.applied_location and applied_job_type, filled;
-- public.job_step_words, public.job_answer_keys_sent,
-- public.jobs_applicant_words_fixed and its trigger on jobs. The two
-- applications_as_applied triggers are unchanged (they call it by name).
-- Re-runnable.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- 1. The broadcast, undone ------------------------------------------------------------
DROP TRIGGER IF EXISTS business_contacts_remember_text ON public.jobs;
DROP TRIGGER IF EXISTS business_contacts_remember_name ON public.profiles;
DROP FUNCTION IF EXISTS public.business_contacts_remember_text();
DROP FUNCTION IF EXISTS public.business_contacts_remember_name();
DROP FUNCTION IF EXISTS public.job_applicant_words(public.jobs, boolean);
DROP FUNCTION IF EXISTS public.job_text_public(public.jobs);
DROP TABLE IF EXISTS private.job_public_text_edits;

-- 2. The job's place and type, as they were when the person applied -------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS applied_location text,
  ADD COLUMN IF NOT EXISTS applied_job_type text;

COMMENT ON COLUMN public.applications.applied_location IS
  'The job''s location when this application was made. Set by the database (applications_as_applied), never by a browser. The applicant''s pages show it: a business can change a closed job''s location to anything, and nobody else sees it (the twentieth Phase 5 review).';
COMMENT ON COLUMN public.applications.applied_job_type IS
  'The job''s type (jobs.job_type) when this application was made. Set by the database (applications_as_applied), never by a browser. The applicant''s pages show it.';

-- Today's values for the applications already there. Not activity on the
-- application: the updated_at stamp and the quiz session closer an update
-- wakes are held off, as 20261025700000 did. Only rows that would change.
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
     SET applied_location = j.location,
         applied_job_type = j.job_type
    FROM public.jobs j
   WHERE j.id = a.job_id
     AND a.applied_location IS NULL
     AND a.applied_job_type IS NULL
     AND (j.location IS NOT NULL OR j.job_type IS NOT NULL);

  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications ENABLE TRIGGER %I', v_name);
  END LOOP;
END;
$$;

-- On every insert, whoever writes it and whatever it says: the job's title,
-- location and type and its owner's business name now. On an update from a
-- browser (the applicant's or the hiring team's): the values it had. The
-- server may correct them.
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
    NEW.applied_location := NULL;
    NEW.applied_job_type := NULL;
    SELECT j.title, p.company_name, j.location, j.job_type
      INTO NEW.applied_job_title, NEW.applied_company_name, NEW.applied_location, NEW.applied_job_type
      FROM public.jobs j
      LEFT JOIN public.profiles p ON p.user_id = j.employer_id
     WHERE j.id = NEW.job_id;
    RETURN NEW;
  END IF;
  NEW.applied_job_title := OLD.applied_job_title;
  NEW.applied_company_name := OLD.applied_company_name;
  NEW.applied_location := OLD.applied_location;
  NEW.applied_job_type := OLD.applied_job_type;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_as_applied() FROM PUBLIC, anon, authenticated;

-- 3. A job's step words, fixed once anyone has applied --------------------------------
-- Every string, in order, of a job's form questions, quiz and steps: what an
-- applicant answers and reads there (a step's title, description, prompt,
-- scenario, a question's text and options, and every other setting written
-- in words; the ids and kinds of the steps and questions too, so adding,
-- removing or reordering one changes them). The quiz's answer fields
-- (correct_answer, correctAnswer, correct_answers, fit_context) are left out:
-- the database keeps those apart in job_quiz_keys (extract_quiz_answer_keys,
-- 20260915110000), and job_answer_keys_sent below compares them there.
-- Numbers, switches and nulls are not words.
CREATE OR REPLACE FUNCTION public.job_step_words(p_questions jsonb, p_quiz jsonb, p_steps jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_path_query_array(
    jsonb_build_array(
      p_questions,
      CASE WHEN jsonb_typeof(p_quiz) = 'array' THEN
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object'
                                        THEN q.value - ARRAY['correct_answer', 'correctAnswer', 'correct_answers', 'fit_context']
                                        ELSE q.value END ORDER BY q.n), '[]'::jsonb)
           FROM jsonb_array_elements(p_quiz) WITH ORDINALITY q(value, n))
      ELSE p_quiz END,
      CASE WHEN jsonb_typeof(p_steps) = 'array' THEN
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(s.value) = 'object' AND s.value ->> 'type' = 'quiz'
                                         AND jsonb_typeof(s.value -> 'config' -> 'questions') = 'array'
                                        THEN jsonb_set(s.value, '{config,questions}',
                                               (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object'
                                                                               THEN q.value - ARRAY['correct_answer', 'correctAnswer', 'correct_answers', 'fit_context']
                                                                               ELSE q.value END ORDER BY q.n), '[]'::jsonb)
                                                  FROM jsonb_array_elements(s.value -> 'config' -> 'questions') WITH ORDINALITY q(value, n)))
                                        ELSE s.value END ORDER BY s.n), '[]'::jsonb)
           FROM jsonb_array_elements(p_steps) WITH ORDINALITY s(value, n))
      ELSE p_steps END
    ),
    'strict $.** ? (@.type() == "string")'), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.job_step_words(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- The quiz answer keys a write carries, each named as extract_quiz_answer_keys
-- files it in job_quiz_keys (a question's id, else "__idx_<n>"; the step's id,
-- else "__step_<n>", or "__quiz_questions__" for the top-level quiz), and only
-- those that carry one. The editor puts the stored keys back into the quiz it
-- loads (src/lib/quizAnswerKeys.ts), so a save of the connection check's bars
-- sends them unchanged.
CREATE OR REPLACE FUNCTION public.job_answer_keys_sent(p_quiz jsonb, p_steps jsonb)
RETURNS TABLE (step_id text, question_id text, key jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH questions AS (
    SELECT '__quiz_questions__'::text AS step_id, q.value AS q, q.n - 1 AS idx
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_quiz) = 'array' THEN p_quiz ELSE '[]'::jsonb END) WITH ORDINALITY q(value, n)
    UNION ALL
    SELECT coalesce(s.value ->> 'id', '__step_' || (s.n - 1)::text), q.value, q.n - 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_steps) = 'array' THEN p_steps ELSE '[]'::jsonb END) WITH ORDINALITY s(value, n)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.value) = 'object' AND s.value ->> 'type' = 'quiz' AND jsonb_typeof(s.value -> 'config' -> 'questions') = 'array'
             THEN s.value -> 'config' -> 'questions' ELSE '[]'::jsonb END) WITH ORDINALITY q(value, n)
  ),
  keyed AS (
    SELECT x.step_id,
           coalesce(CASE WHEN jsonb_typeof(x.q) = 'object' THEN x.q ->> 'id' END, '__idx_' || x.idx::text) AS question_id,
           CASE WHEN jsonb_typeof(x.q) = 'object' THEN jsonb_strip_nulls(jsonb_build_object(
             'correct_answer', x.q -> 'correct_answer',
             'correctAnswer', x.q -> 'correctAnswer',
             'correct_answers', x.q -> 'correct_answers',
             'fit_context', x.q -> 'fit_context'
           )) ELSE '{}'::jsonb END AS key
      FROM questions x
  )
  SELECT k.step_id, k.question_id, k.key FROM keyed k WHERE k.key <> '{}'::jsonb;
$$;

REVOKE ALL ON FUNCTION public.job_answer_keys_sent(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- The trigger's WHEN: a browser's own statement. It runs before every other
-- BEFORE trigger on jobs (its name sorts first), so it sees what the browser
-- sent, answer keys included, before extract_quiz_answer_keys files them.
CREATE OR REPLACE FUNCTION public.jobs_applicant_words_fixed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Nobody has applied yet (not even a draft): the job is the business's to shape.
  IF NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.job_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  IF public.job_step_words(OLD.application_questions, OLD.quiz_questions, OLD.workflow_steps)
       IS DISTINCT FROM public.job_step_words(NEW.application_questions, NEW.quiz_questions, NEW.workflow_steps)
     OR EXISTS (
       SELECT 1
         FROM public.job_answer_keys_sent(NEW.quiz_questions, NEW.workflow_steps) k
         LEFT JOIN public.job_quiz_keys s
           ON s.job_id = NEW.id AND s.step_id = k.step_id AND s.question_id = k.question_id
        WHERE s.key IS DISTINCT FROM k.key
     ) THEN
    RAISE EXCEPTION 'People have applied to this job, so its application questions, quiz and steps stay as they were. To ask something different, use Copy to drafts on the Jobs page and post the copy.'
      USING ERRCODE = 'check_violation', HINT = 'job_steps_fixed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_applicant_words_fixed() FROM PUBLIC, anon, authenticated;

-- A browser's own statement runs as "anon" or "authenticated" (inside the
-- server's SECURITY DEFINER functions it runs as their owner, and an edge
-- function's as service_role).
DROP TRIGGER IF EXISTS jobs_applicant_words_fixed ON public.jobs;
CREATE TRIGGER jobs_applicant_words_fixed
  BEFORE UPDATE OF application_questions, quiz_questions, workflow_steps ON public.jobs
  FOR EACH ROW
  WHEN (current_user IN ('anon', 'authenticated'))
  EXECUTE FUNCTION public.jobs_applicant_words_fixed();

RESET statement_timeout;
RESET lock_timeout;
