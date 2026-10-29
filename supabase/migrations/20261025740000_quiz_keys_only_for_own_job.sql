-- The nineteenth security review: no browser files quiz answer keys for a
-- job that is not its own.
--
-- Finding 1 (HIGH, not a regression; probes k1_quiz_keys_cross_tenant and
-- k2_quiz_grading_cross_tenant): extract_quiz_answer_keys runs BEFORE INSERT
-- on jobs as SECURITY DEFINER and upserts job_quiz_keys under NEW.id before
-- the row exists. `insert into jobs (id, employer_id, …) values (<another
-- business's job id>, <me>, …) on conflict (id) do nothing` passed the insert
-- policy (employer_id = auth.uid()), skipped the row and kept the key writes:
-- any sign-up could replace a live job's answer keys, and its applicants with
-- the right answers were graded 0 (submit_quiz_attempt reads job_quiz_keys).
-- The insert branch now refuses an id that is already a job, before any key
-- is filed. Checked live before this was written: the one live quiz's five
-- keys were all written together on 2026-10-06 and never since.
--
-- LOW (the same table): "Job owner can write quiz keys" and "Team members can
-- write quiz keys" (FOR ALL) let a browser write keys straight past round
-- 20's lock (jobs_applicant_words_fixed). No browser code writes this table
-- (the editor reads get_job_quiz_keys; the strip trigger and the graders run
-- with full rights), so both write policies go and anon and authenticated
-- keep SELECT only. The two read policies stay.
--
-- extract_quiz_answer_keys is redefined from its latest body,
-- 20260915110000_quiz_answer_keys_server_side.sql (md5(prosrc)
-- aab6d7e22202d55be51a60f08742f50e, the live body's md5 on 2026-10-29), with
-- only the check above added. Its trigger, strip_quiz_answer_keys, is
-- unchanged.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.extract_quiz_answer_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  step           jsonb;
  step_idx       int;
  new_steps      jsonb;
  new_top_level  jsonb;
  q              jsonb;
  q_idx          int;
  q_id           text;
  key_obj        jsonb;
  stripped_q     jsonb;
  questions      jsonb;
  new_questions  jsonb;
BEGIN
  -- The nineteenth security review (finding 1, HIGH): this runs BEFORE INSERT
  -- with full rights and files the keys under NEW.id before the row exists.
  -- An insert carrying another business's job id with ON CONFLICT (id) DO
  -- NOTHING (PostgREST's "ignore duplicates") passes the insert policy,
  -- which checks only the caller's own employer_id; the row is then skipped
  -- and the keys stay, so a rival could make that job's applicants with the
  -- right answers score 0. A new job never has an id that is taken: refuse
  -- it here, as the primary key would, before any key is filed. Nothing in
  -- the app or the functions upserts jobs.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = NEW.id) THEN
    RAISE EXCEPTION 'duplicate key value violates unique constraint "jobs_pkey"'
      USING ERRCODE = 'unique_violation', DETAIL = 'A job with this id already exists.';
  END IF;

  -- Legacy top-level quiz_questions -------------------------------------
  IF NEW.quiz_questions IS NOT NULL AND jsonb_typeof(NEW.quiz_questions) = 'array' THEN
    new_top_level := '[]'::jsonb;
    q_idx := 0;
    FOR q IN SELECT * FROM jsonb_array_elements(NEW.quiz_questions)
    LOOP
      q_id := COALESCE(q->>'id', '__idx_' || q_idx::text);
      key_obj := jsonb_strip_nulls(jsonb_build_object(
        'correct_answer', q->'correct_answer',
        'correctAnswer', q->'correctAnswer',
        'correct_answers', q->'correct_answers',
        'fit_context', q->'fit_context'
      ));
      -- Only touch the stored key when THIS write actually carries answer
      -- data. An employer edit that resends a question without these
      -- fields (e.g. a partial patch) must never wipe an already-saved key.
      IF key_obj <> '{}'::jsonb THEN
        INSERT INTO public.job_quiz_keys (job_id, step_id, question_id, key, updated_at)
        VALUES (NEW.id, '__quiz_questions__', q_id, key_obj, now())
        ON CONFLICT (job_id, step_id, question_id)
        DO UPDATE SET key = EXCLUDED.key, updated_at = now();
      END IF;
      stripped_q := q - 'correct_answer' - 'correctAnswer' - 'correct_answers' - 'fit_context';
      new_top_level := new_top_level || jsonb_build_array(stripped_q);
      q_idx := q_idx + 1;
    END LOOP;
    NEW.quiz_questions := new_top_level;
  END IF;

  -- workflow_steps[*].config.questions for steps of type "quiz" ---------
  IF NEW.workflow_steps IS NOT NULL AND jsonb_typeof(NEW.workflow_steps) = 'array' THEN
    new_steps := '[]'::jsonb;
    FOR step_idx IN 0 .. jsonb_array_length(NEW.workflow_steps) - 1
    LOOP
      step := NEW.workflow_steps -> step_idx;
      IF (step->>'type') = 'quiz' AND jsonb_typeof(step->'config'->'questions') = 'array' THEN
        questions := step->'config'->'questions';
        new_questions := '[]'::jsonb;
        q_idx := 0;
        FOR q IN SELECT * FROM jsonb_array_elements(questions)
        LOOP
          q_id := COALESCE(q->>'id', '__idx_' || q_idx::text);
          key_obj := jsonb_strip_nulls(jsonb_build_object(
            'correct_answer', q->'correct_answer',
            'correctAnswer', q->'correctAnswer',
            'correct_answers', q->'correct_answers',
            'fit_context', q->'fit_context'
          ));
          IF key_obj <> '{}'::jsonb THEN
            INSERT INTO public.job_quiz_keys (job_id, step_id, question_id, key, updated_at)
            VALUES (NEW.id, COALESCE(step->>'id', '__step_' || step_idx::text), q_id, key_obj, now())
            ON CONFLICT (job_id, step_id, question_id)
            DO UPDATE SET key = EXCLUDED.key, updated_at = now();
          END IF;
          stripped_q := q - 'correct_answer' - 'correctAnswer' - 'correct_answers' - 'fit_context';
          new_questions := new_questions || jsonb_build_array(stripped_q);
          q_idx := q_idx + 1;
        END LOOP;
        step := jsonb_set(step, ARRAY['config', 'questions'], new_questions);
      END IF;
      new_steps := new_steps || jsonb_build_array(step);
    END LOOP;
    NEW.workflow_steps := new_steps;
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Job owner can write quiz keys" ON public.job_quiz_keys;
DROP POLICY IF EXISTS "Team members can write quiz keys" ON public.job_quiz_keys;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.job_quiz_keys FROM anon, authenticated;

RESET statement_timeout;
RESET lock_timeout;
