-- ============================================================================
-- The quiz answer key was riding along in the candidate's own browser.
-- ============================================================================
-- src/pages/QuizPhase.tsx selected "jobs(... quiz_questions, workflow_steps)"
-- to render the quiz — which meant every correct_answer / correctAnswer /
-- correct_answers / fit_context in the job row shipped to the candidate's
-- tab too, because RLS's "Candidates can view jobs they applied to" policy
-- has no column list. The client then graded itself (calculateResults /
-- handleSubmit) and wrote the score straight into applications.notes and
-- applications.phase_ai_analysis with a plain .update() — a call any
-- candidate could replay from devtools with any score they liked, because
-- "Candidates can update their own applications" has no column restriction
-- either.
--
-- This migration:
--   1. Adds public.job_quiz_keys — a private table holding exactly the
--      answer-bearing fields, keyed by (job_id, step_id, question_id).
--   2. Adds a BEFORE INSERT OR UPDATE trigger on jobs that moves those
--      fields out of quiz_questions[*] and workflow_steps[*].config.
--      questions[*] into job_quiz_keys, and backfills every job that has
--      them today.
--   3. Adds get_job_quiz_keys(p_job_id) — owner/team-only RPC so the job
--      edit screen can still show and edit the answers it wrote.
--   4. Adds submit_quiz_attempt(...) — SECURITY DEFINER RPC that grades a
--      quiz submission server-side with the exact rules QuizPhase.tsx used
--      to run in the browser, and returns only {score, correct, total,
--      passed}. QuizPhase.tsx no longer selects, sees, or grades against
--      the key. It is unconditionally one-shot per application/step (see
--      the comment above the guard inside the function): once a result
--      exists it refuses to grade again, full stop. Without this, the
--      RPC's own returned score is an oracle a candidate can query
--      repeatedly (fixing all-but-one answer and cycling the rest) to
--      reconstruct the whole answer key through the "legitimate" endpoint.
--      An employer sending a candidate back to redo a quiz step (Ava's
--      move_applicant_to_phase tool, supabase/functions/ava-voice-tools)
--      now clears that step's saved notes/quizResult as part of the same
--      move, which is what actually reopens the one-shot guard — see that
--      function for why. The notes/phase_ai_analysis this RPC writes never
--      carry correctAnswer / correctAnswers / fit_context: applications.
--      notes is readable by the candidate via their own unrestricted SELECT
--      policy (and QuizPhase.tsx holds a live realtime subscription on
--      their own application row), so writing the key into notes would
--      hand it straight back to the candidate's browser seconds after they
--      submit — the exact bug this migration exists to close, one layer
--      down. Only the candidate's own answers and per-question isCorrect/
--      isPartialCredit are stored; an employer view that needs the actual
--      key merges it in separately via get_job_quiz_keys, the same
--      owner/team-only RPC the job edit screen already uses (src/lib/
--      quizAnswerKeys.ts) — no employer-facing code today reads a
--      per-question correctAnswer out of notes (checked: src/cockpit/lib/
--      mappers.ts and src/cockpit/pages/Applicants.tsx only ever read the
--      aggregate notes.quizResult.score/passed).
--   5. Adds a BEFORE UPDATE trigger on applications that blocks a candidate
--      from rewriting their own status, job_id, candidate_id, any AI/score
--      column, or a quiz result inside notes — outside of
--      submit_quiz_attempt, which is given a transaction-local pass via
--      set_config('hireflow.in_quiz_submit', ...). service_role (edge
--      functions, migrations) is exempted via auth.role() = 'service_role'
--      — not current_user, which inside this SECURITY DEFINER function is
--      always the function's owner, never the calling role.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE,
-- CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE. Safe to run
-- once against the live database as it stands today.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. job_quiz_keys
-- ----------------------------------------------------------------------------
-- job_id's FK is DEFERRABLE INITIALLY DEFERRED: the trigger below writes a
-- key row from a BEFORE INSERT trigger on jobs, before the jobs row itself
-- has actually been written — an immediate FK check would always fail. A
-- deferred check waits until COMMIT, by which point the jobs row exists.
CREATE TABLE IF NOT EXISTS public.job_quiz_keys (
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  step_id     text NOT NULL,
  question_id text NOT NULL,
  key         jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, step_id, question_id)
);

ALTER TABLE public.job_quiz_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job owner can read quiz keys" ON public.job_quiz_keys;
CREATE POLICY "Job owner can read quiz keys"
  ON public.job_quiz_keys FOR SELECT
  USING (public.is_job_owner(job_id, auth.uid()));

DROP POLICY IF EXISTS "Team members can read quiz keys" ON public.job_quiz_keys;
CREATE POLICY "Team members can read quiz keys"
  ON public.job_quiz_keys FOR SELECT
  USING (public.is_active_team_member_for_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "Job owner can write quiz keys" ON public.job_quiz_keys;
CREATE POLICY "Job owner can write quiz keys"
  ON public.job_quiz_keys FOR ALL
  USING (public.is_job_owner(job_id, auth.uid()))
  WITH CHECK (public.is_job_owner(job_id, auth.uid()));

DROP POLICY IF EXISTS "Team members can write quiz keys" ON public.job_quiz_keys;
CREATE POLICY "Team members can write quiz keys"
  ON public.job_quiz_keys FOR ALL
  USING (public.is_active_team_member_for_job(job_id, auth.uid(), true))
  WITH CHECK (public.is_active_team_member_for_job(job_id, auth.uid(), true));

-- No SELECT/INSERT/UPDATE/DELETE policy exists for anyone else, including
-- the candidate whose applications reference the job — with RLS enabled and
-- no matching policy, every other role gets zero rows. Nothing here grants
-- service_role anything: service_role bypasses RLS entirely, which is how
-- edge functions read this table.

-- ----------------------------------------------------------------------------
-- 2. Strip answer fields out of the jobs row into job_quiz_keys
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extract_quiz_answer_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS strip_quiz_answer_keys ON public.jobs;
CREATE TRIGGER strip_quiz_answer_keys
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.extract_quiz_answer_keys();

-- Backfill every job that has answer fields sitting in it today. A no-op
-- UPDATE re-fires the BEFORE UPDATE trigger above, which does the real work;
-- only jobs that actually carry answer fields are touched, so this does not
-- bump updated_at on jobs with no quiz or with an already-clean quiz.
UPDATE public.jobs
SET quiz_questions = quiz_questions
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(quiz_questions, '[]'::jsonb)) q
  WHERE q ? 'correct_answer' OR q ? 'correctAnswer' OR q ? 'correct_answers' OR q ? 'fit_context'
)
OR EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(workflow_steps, '[]'::jsonb)) s,
       jsonb_array_elements(COALESCE(s->'config'->'questions', '[]'::jsonb)) q
  WHERE s->>'type' = 'quiz'
    AND (q ? 'correct_answer' OR q ? 'correctAnswer' OR q ? 'correct_answers' OR q ? 'fit_context')
);

-- ----------------------------------------------------------------------------
-- 3. get_job_quiz_keys — owner/team read RPC for the job edit screen
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_quiz_keys(p_job_id uuid)
RETURNS TABLE (step_id text, question_id text, key jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.is_job_owner(p_job_id, auth.uid())
    OR public.is_active_team_member_for_job(p_job_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to read this job''s quiz answer keys';
  END IF;

  RETURN QUERY
    SELECT jqk.step_id, jqk.question_id, jqk.key
    FROM public.job_quiz_keys jqk
    WHERE jqk.job_id = p_job_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. submit_quiz_attempt — grades a quiz step server-side
-- ----------------------------------------------------------------------------
-- Reproduces QuizPhase.tsx's getQuestionType / calculateResults exactly, so
-- a candidate gets the identical score the old client-side grader gave —
-- just computed where they cannot see or edit the key or the result.
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_application_id uuid,
  p_step_id text,
  p_answers jsonb,
  p_violations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  app                 public.applications%ROWTYPE;
  job                 public.jobs%ROWTYPE;
  quiz_step           jsonb;
  quiz_step_idx       int;
  ordv                int;
  step_elem           jsonb;
  key_step_id         text;
  questions           jsonb;
  q                   jsonb;
  q_idx               int;
  q_id                text;
  q_type              text;
  valid_option_count  int;
  key_row             record;
  key_obj             jsonb;
  user_answer         jsonb;
  correct_total       numeric := 0;
  scored_total         int := 0;
  selected_texts      text[];
  correct_texts       text[];
  all_correct_sel     boolean;
  no_extras           boolean;
  any_overlap         boolean;
  correct_answer_idx  int;
  score_pct           int;
  passing              int;
  answers_summary     jsonb := '[]'::jsonb;
  question_summary    jsonb;
  existing_notes      jsonb;
  new_notes           jsonb;
  step_key            text;
  phase_analysis      text;
  result              jsonb;
BEGIN
  SELECT * INTO app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF app.candidate_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to submit this quiz';
  END IF;

  IF app.status = 'rejected' THEN
    RAISE EXCEPTION 'This application has already been decided';
  END IF;

  BEGIN
    existing_notes := COALESCE(app.notes::jsonb, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    existing_notes := '{}'::jsonb;
  END;

  -- One-shot, unconditionally: once this application already carries a
  -- graded result for this step, submit_quiz_attempt refuses to grade
  -- again — no exceptions. Without this, the RPC's own returned {score,
  -- correct, total} is an adaptive oracle: fix every answer but one, cycle
  -- that one through its options, and the score change reveals whether it
  -- was correct. A handful of calls per question fully reconstructs the
  -- key (and, since keys are shared per job, hands it to every other
  -- candidate applying to the same job) — exactly the "candidate can
  -- rewrite their own score" hole this migration exists to close, just
  -- moved one layer down.
  --
  -- QuizPhase.tsx's own existingResult check (and every sibling phase
  -- page's) treats status="pending" AND phase=stepId as "the employer
  -- reconsidered, let them retake" and was mirrored here in an earlier
  -- draft of this guard — that turned out to be a second, worse hole:
  -- submit_quiz_attempt never changes status or phase itself, so once that
  -- condition is true it stays true forever, turning "one legitimate
  -- retake" into unlimited retries — the exact brute-force oracle this
  -- guard exists to close, just gated behind one extra UPDATE the
  -- candidate's own devtools can issue directly (protect_application_
  -- columns allows a candidate to move their own status to "reviewing",
  -- not to set it to "pending" — but nothing stops the *employer*, or a
  -- future feature, from doing so, and this RPC must not then reopen the
  -- oracle). Grep across src/ turned up no code path that actually sets
  -- applications.status back to "pending" as a reconsideration signal for
  -- the quiz phase — real reconsideration (CandidateApplicationDetail.tsx)
  -- transitions rejected -> reviewing, never -> pending — so this carve-out
  -- was dead for the happy path and live only as an attack surface; it has
  -- been removed rather than hardened. A first-time candidate is unaffected
  -- either way, since no completedAt/quizResult exists yet for them and
  -- this check is a no-op until one does. `app` is locked FOR UPDATE above,
  -- so two attempts racing each other still serialize correctly — the
  -- second sees the first's committed result before it grades anything.
  --
  -- Retaking a quiz after the fact: move_applicant_to_phase (supabase/
  -- functions/ava-voice-tools/index.ts), the one live employer/Ava action
  -- that sends a candidate back to a quiz step, now clears notes[stepId]
  -- and notes.quizResult as part of that same move when the destination
  -- phase is a quiz step — an employer write, not this RPC, since only the
  -- employer/team member has standing to decide a retake is warranted.
  -- That is the only place in the app that reopens this guard today; any
  -- future feature that wants to allow a retake must clear the same two
  -- keys before the candidate calls this RPC again.
  IF (existing_notes -> p_step_id ->> 'completedAt') IS NOT NULL
     OR (existing_notes -> 'quizResult') IS NOT NULL THEN
    RAISE EXCEPTION 'This quiz has already been submitted';
  END IF;

  SELECT * INTO job FROM public.jobs WHERE id = app.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found for this application';
  END IF;

  -- Find the quiz step: same lookup order as the client (fetchedQuestions in
  -- QuizPhase.tsx) — first workflow step whose id matches p_step_id OR whose
  -- type is "quiz", in array order.
  quiz_step := NULL;
  quiz_step_idx := NULL;
  IF job.workflow_steps IS NOT NULL AND jsonb_typeof(job.workflow_steps) = 'array' THEN
    FOR ordv IN 0 .. jsonb_array_length(job.workflow_steps) - 1
    LOOP
      step_elem := job.workflow_steps -> ordv;
      IF (step_elem->>'id') = p_step_id OR (step_elem->>'type') = 'quiz' THEN
        quiz_step := step_elem;
        quiz_step_idx := ordv;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF quiz_step IS NOT NULL AND (quiz_step->'config'->'questions') IS NOT NULL THEN
    IF (quiz_step->>'type') IS DISTINCT FROM 'quiz' THEN
      RAISE EXCEPTION 'Step % is not a quiz step', p_step_id;
    END IF;
    questions := quiz_step->'config'->'questions';
    key_step_id := COALESCE(quiz_step->>'id', '__step_' || quiz_step_idx::text);
  ELSE
    questions := COALESCE(job.quiz_questions, '[]'::jsonb);
    key_step_id := '__quiz_questions__';
  END IF;

  IF questions IS NULL OR jsonb_typeof(questions) <> 'array' OR jsonb_array_length(questions) = 0 THEN
    RAISE EXCEPTION 'No quiz questions found for this step';
  END IF;

  -- Let this transaction's writes through the applications write-guard.
  PERFORM set_config('hireflow.in_quiz_submit', 'on', true);

  q_idx := 0;
  FOR q IN SELECT * FROM jsonb_array_elements(questions)
  LOOP
    q_id := COALESCE(q->>'id', '__idx_' || q_idx::text);

    SELECT jqk.key INTO key_obj
      FROM public.job_quiz_keys jqk
     WHERE jqk.job_id = job.id AND jqk.step_id = key_step_id AND jqk.question_id = q_id;
    key_obj := COALESCE(key_obj, '{}'::jsonb);

    user_answer := p_answers -> q_id;

    -- getQuestionType(): same precedence as the client.
    valid_option_count := (
      SELECT count(*) FROM jsonb_array_elements_text(COALESCE(q->'options', '[]'::jsonb)) o
      WHERE trim(o) <> ''
    );
    IF (q->>'type') IN ('text', 'open_ended', 'short_answer', 'long_answer') THEN
      q_type := 'text';
    ELSIF valid_option_count = 0 THEN
      q_type := 'text';
    ELSIF (q->>'type') IN ('personality', 'situational', 'work_style') THEN
      q_type := 'fit';
    ELSIF (q->>'type') = 'multi_select' THEN
      q_type := 'multi_select';
    ELSE
      q_type := 'multiple_choice';
    END IF;

    question_summary := NULL;

    IF q_type = 'text' THEN
      question_summary := jsonb_build_object(
        'questionId', q_id,
        'question', q->'question',
        'questionType', 'text',
        'textAnswer', CASE WHEN jsonb_typeof(user_answer) = 'string' THEN user_answer ELSE to_jsonb(''::text) END,
        'selectedAnswer', NULL,
        'selectedAnswerText', CASE WHEN jsonb_typeof(user_answer) = 'string' THEN user_answer ELSE to_jsonb('Not answered'::text) END,
        'correctAnswer', NULL,
        'isCorrect', NULL
      );

    ELSIF q_type = 'fit' THEN
      DECLARE
        ans_idx int;
        opt_text jsonb;
      BEGIN
        ans_idx := CASE WHEN jsonb_typeof(user_answer) = 'number' THEN (user_answer)::int ELSE NULL END;
        opt_text := CASE WHEN ans_idx IS NOT NULL THEN (q->'options'->ans_idx) ELSE NULL END;
        -- fit_context is answer-key content (an internal rubric note, not
        -- anything the candidate chose), so it is deliberately NOT written
        -- into notes here — see the big comment above this function for why
        -- notes must never carry answer-key material.
        question_summary := jsonb_build_object(
          'questionId', q_id,
          'question', q->'question',
          'questionType', 'fit',
          'selectedAnswer', ans_idx,
          'selectedAnswerText', COALESCE(opt_text, to_jsonb('Not answered'::text)),
          'correctAnswer', NULL,
          'isCorrect', NULL
        );
      END;

    ELSIF q_type = 'multi_select' AND jsonb_typeof(key_obj->'correct_answers') = 'array' THEN
      scored_total := scored_total + 1;
      SELECT array_agg(lower(trim(opt)))
        INTO correct_texts
        FROM jsonb_array_elements_text(key_obj->'correct_answers') opt;
      correct_texts := COALESCE(correct_texts, ARRAY[]::text[]);

      -- Empty-string fallback for a missing option, matching the client's
      -- `q.options?.[i] || ''` — never SQL NULL, so comparisons below behave
      -- exactly like the original .toLowerCase().trim() chain.
      selected_texts := ARRAY[]::text[];
      IF jsonb_typeof(user_answer) = 'array' THEN
        SELECT array_agg(lower(trim(COALESCE(q->'options'->(idx.value::int) #>> '{}', ''))))
          INTO selected_texts
          FROM jsonb_array_elements_text(user_answer) idx;
      END IF;
      selected_texts := COALESCE(selected_texts, ARRAY[]::text[]);

      -- allCorrectSelected / noExtras, computed unconditionally (this is the
      -- handleSubmit() summary logic, which — unlike calculateResults() —
      -- does not early-return on an empty/missing answer).
      all_correct_sel := (
        array_length(correct_texts, 1) IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(correct_texts) ct WHERE ct <> ALL (selected_texts))
      );
      no_extras := (
        array_length(selected_texts, 1) IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(selected_texts) st WHERE st <> ALL (correct_texts))
      );
      any_overlap := EXISTS (SELECT 1 FROM unnest(selected_texts) st WHERE st = ANY (correct_texts));

      -- Numeric credit mirrors calculateResults(), which DOES early-return
      -- (no credit, not even partial) when the answer is missing or empty.
      IF array_length(selected_texts, 1) IS NOT NULL AND all_correct_sel AND no_extras THEN
        correct_total := correct_total + 1;
      ELSIF array_length(selected_texts, 1) IS NOT NULL AND any_overlap THEN
        correct_total := correct_total + 0.5;
      END IF;

      -- correctAnswers is the answer key itself — deliberately omitted from
      -- what gets written to notes (see the big comment above this
      -- function). isCorrect/isPartialCredit report on THIS candidate's own
      -- answer, which is fine for them to read back.
      question_summary := jsonb_build_object(
        'questionId', q_id,
        'question', q->'question',
        'questionType', 'multi_select',
        'selectedAnswers', (
          SELECT COALESCE(jsonb_agg(COALESCE(q->'options'->(idx.value::int), to_jsonb(''::text))), '[]'::jsonb)
          FROM jsonb_array_elements_text(COALESCE(user_answer, '[]'::jsonb)) idx
        ),
        'isCorrect', (all_correct_sel AND no_extras),
        'isPartialCredit', ((NOT all_correct_sel) AND any_overlap)
      );

    ELSE
      -- Standard multiple choice (and multi_select questions with no stored
      -- correct_answers, which the original client also fell through to
      -- this branch for and never gave credit).
      scored_total := scored_total + 1;
      correct_answer_idx := NULL;
      IF jsonb_typeof(key_obj->'correctAnswer') = 'number' THEN
        correct_answer_idx := (key_obj->>'correctAnswer')::int;
      ELSIF key_obj ? 'correct_answer' AND key_obj->'correct_answer' <> 'null'::jsonb THEN
        IF jsonb_typeof(key_obj->'correct_answer') = 'number' THEN
          correct_answer_idx := (key_obj->>'correct_answer')::int;
        ELSIF jsonb_typeof(key_obj->'correct_answer') = 'string' THEN
          SELECT (idx.ord - 1) INTO correct_answer_idx
            FROM jsonb_array_elements_text(COALESCE(q->'options', '[]'::jsonb)) WITH ORDINALITY AS idx(value, ord)
           WHERE lower(trim(idx.value)) = lower(trim(key_obj->>'correct_answer'))
           LIMIT 1;
        END IF;
      END IF;

      IF correct_answer_idx IS NOT NULL
         AND jsonb_typeof(user_answer) = 'number'
         AND (user_answer)::int = correct_answer_idx THEN
        correct_total := correct_total + 1;
      END IF;

      -- correct_answer_idx is the answer key itself — used above only to
      -- compute isCorrect/credit, deliberately never written into notes
      -- (see the big comment above this function).
      question_summary := jsonb_build_object(
        'questionId', q_id,
        'question', q->'question',
        'questionType', 'multiple_choice',
        'selectedAnswer', CASE WHEN jsonb_typeof(user_answer) = 'number' THEN user_answer ELSE NULL END,
        'selectedAnswerText', CASE
          WHEN jsonb_typeof(user_answer) = 'number' THEN COALESCE(q->'options'->((user_answer)::int), to_jsonb('Not answered'::text))
          ELSE to_jsonb('Not answered'::text)
        END,
        'isCorrect', (correct_answer_idx IS NOT NULL AND jsonb_typeof(user_answer) = 'number' AND (user_answer)::int = correct_answer_idx)
      );
    END IF;

    answers_summary := answers_summary || jsonb_build_array(question_summary);
    q_idx := q_idx + 1;
  END LOOP;

  score_pct := CASE WHEN scored_total > 0 THEN round((correct_total / scored_total) * 100) ELSE 100 END;
  passing := COALESCE(job.passing_score, 60);

  -- existing_notes was already computed (and checked) above, before the
  -- one-shot guard; app.notes hasn't changed since (the row has been held
  -- FOR UPDATE the whole time), so it's still current here.
  step_key := p_step_id;
  new_notes := existing_notes || jsonb_build_object(
    step_key, jsonb_build_object(
      'type', 'quiz',
      'answers', answers_summary,
      'score', score_pct,
      'correct', correct_total,
      'total', scored_total,
      'passed', score_pct >= passing,
      'completedAt', to_jsonb(now()),
      'antiCheatViolations', COALESCE(p_violations, '[]'::jsonb),
      'totalViolations', jsonb_array_length(COALESCE(p_violations, '[]'::jsonb)),
      'violationSummary', CASE WHEN jsonb_array_length(COALESCE(p_violations, '[]'::jsonb)) > 0
        THEN jsonb_array_length(COALESCE(p_violations, '[]'::jsonb))::text || ' violation(s) detected'
        ELSE 'No violations detected'
      END
    ),
    'quizResult', jsonb_build_object(
      'score', score_pct,
      'correct', correct_total,
      'total', scored_total,
      'passed', score_pct >= passing
    )
  );

  phase_analysis := format(
    'Quiz: %s/%s correct (%s%%). Local calculation: %s. Backend will compute final weighted score.',
    correct_total, scored_total, score_pct,
    CASE WHEN score_pct >= passing THEN 'PASSED' ELSE 'FAILED' END
  );
  IF jsonb_array_length(COALESCE(p_violations, '[]'::jsonb)) > 0 THEN
    phase_analysis := phase_analysis || format(' %s anti-cheat violation(s) detected during quiz.', jsonb_array_length(p_violations));
  END IF;

  UPDATE public.applications
     SET notes = new_notes::text,
         phase_ai_analysis = phase_analysis
   WHERE id = p_application_id;

  result := jsonb_build_object(
    'score', score_pct,
    'correct', correct_total,
    'total', scored_total,
    'passed', score_pct >= passing
  );
  RETURN result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Stop a candidate from rewriting their own status/score/quiz result
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_application_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  old_notes       jsonb;
  new_notes       jsonb;
  note_key        text;
  old_entry       jsonb;
  new_entry       jsonb;
  valid_step_ids  text[];
BEGIN
  -- service_role (edge functions, migrations) bypasses RLS entirely but
  -- NOT triggers — this BEFORE UPDATE trigger still fires for their writes,
  -- so it still needs to exempt them explicitly. current_user is the wrong
  -- check here: this function is SECURITY DEFINER, and inside a SECURITY
  -- DEFINER function current_user is the function's OWNER for the whole
  -- call, never the role that invoked it — so `current_user = 'service_role'`
  -- can never be true (confirmed directly in PGlite: a SECURITY DEFINER
  -- probe called from a session genuinely SET ROLE service_role reported
  -- current_user as the function owner, not service_role). auth.role()
  -- instead reads the request.jwt.claim.role / request.jwt.claims GUC that
  -- PostgREST sets from the caller's JWT for the whole request — a plain
  -- session setting, unaffected by SECURITY DEFINER's role switch either
  -- way, and it's the same signal auth.uid() itself already relies on.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Employer / active team member on this job: unrestricted, same as today.
  -- Deliberately OLD.job_id, not NEW.job_id: job_id is otherwise unchecked
  -- by RLS's WITH CHECK, so checking the attacker-supplied NEW value here
  -- would let a candidate who also owns some other job point job_id at it
  -- and bypass every check below (including the job_id-change check itself,
  -- since this bypass runs before it). Authorization is about who OLD.job_id
  -- says this application already belongs to.
  IF public.is_job_owner(OLD.job_id, auth.uid())
     OR public.is_active_team_member_for_job(OLD.job_id, auth.uid(), true) THEN
    RETURN NEW;
  END IF;

  -- Not the candidate on this row either (and not owner/team) — RLS should
  -- already have refused this write; don't second-guess it here.
  IF auth.uid() IS DISTINCT FROM OLD.candidate_id THEN
    RETURN NEW;
  END IF;

  -- submit_quiz_attempt sets this transaction-local flag right before it
  -- writes notes/phase_ai_analysis on the candidate's own behalf.
  IF COALESCE(current_setting('hireflow.in_quiz_submit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- From here: a candidate is updating their own application directly
  -- (every phase page's supabase.from("applications").update(...) call),
  -- not through submit_quiz_attempt.

  IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'Candidates cannot change job_id';
  END IF;
  IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id THEN
    RAISE EXCEPTION 'Candidates cannot change candidate_id';
  END IF;
  IF NEW.ai_score IS DISTINCT FROM OLD.ai_score THEN
    RAISE EXCEPTION 'Candidates cannot change ai_score';
  END IF;
  IF NEW.ai_scorecard IS DISTINCT FROM OLD.ai_scorecard THEN
    RAISE EXCEPTION 'Candidates cannot change ai_scorecard';
  END IF;
  IF NEW.ai_analysis IS DISTINCT FROM OLD.ai_analysis THEN
    RAISE EXCEPTION 'Candidates cannot change ai_analysis';
  END IF;
  IF NEW.resume_score IS DISTINCT FROM OLD.resume_score THEN
    RAISE EXCEPTION 'Candidates cannot change resume_score';
  END IF;
  IF NEW.rejected_by IS DISTINCT FROM OLD.rejected_by THEN
    RAISE EXCEPTION 'Candidates cannot change rejected_by';
  END IF;
  IF NEW.rejected_by_type IS DISTINCT FROM OLD.rejected_by_type THEN
    RAISE EXCEPTION 'Candidates cannot change rejected_by_type';
  END IF;

  -- status: the only self-service transition every phase page makes today
  -- is into "reviewing" after submitting a phase (see ChatInterviewPhase.tsx,
  -- ChatSimulationPhase.tsx, SalesSimulationPhase.tsx). A candidate can never
  -- set themselves to interview/offered/hired/rejected, and can't reopen a
  -- row that's already rejected or hired.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'reviewing' OR OLD.status IN ('rejected', 'hired') THEN
      RAISE EXCEPTION 'Candidates cannot set application status to %', NEW.status;
    END IF;
  END IF;

  -- phase: candidates self-advance to the next workflow step after an
  -- auto-mode phase completes (ChatInterviewPhase.tsx, PortfolioUploadPhase.
  -- tsx, VideoIntroPhase.tsx, TypingTestPhase.tsx all write phase directly).
  -- Any step id that actually belongs to this job's own workflow is allowed;
  -- this is UI navigation, not a scoring or access decision.
  IF NEW.phase IS DISTINCT FROM OLD.phase THEN
    SELECT COALESCE(array_agg(step->>'id'), ARRAY[]::text[])
      INTO valid_step_ids
      FROM public.jobs j, jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) step
     WHERE j.id = NEW.job_id;

    IF NEW.phase IS NULL OR NOT (NEW.phase = ANY (valid_step_ids)) THEN
      RAISE EXCEPTION 'Candidates cannot set application phase to %', NEW.phase;
    END IF;
  END IF;

  -- notes: candidates freely record their own self-reported phase results
  -- (typing test WPM, chat/sales simulation transcripts, video/portfolio
  -- links, ...) — that's out of scope for this fix. A quiz result is not:
  -- it may only be written by submit_quiz_attempt.
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    BEGIN
      old_notes := COALESCE(OLD.notes::jsonb, '{}'::jsonb);
    EXCEPTION WHEN others THEN
      old_notes := '{}'::jsonb;
    END;
    BEGIN
      new_notes := NEW.notes::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Application notes must be valid JSON';
    END;

    IF (new_notes -> 'quizResult') IS DISTINCT FROM (old_notes -> 'quizResult') THEN
      RAISE EXCEPTION 'Candidates cannot edit quiz results directly';
    END IF;

    FOR note_key IN
      SELECT key FROM jsonb_object_keys(new_notes) AS key
      UNION
      SELECT key FROM jsonb_object_keys(old_notes) AS key
    LOOP
      new_entry := new_notes -> note_key;
      old_entry := old_notes -> note_key;
      IF new_entry IS DISTINCT FROM old_entry THEN
        IF (new_entry ->> 'type') = 'quiz' OR (old_entry ->> 'type') = 'quiz' THEN
          RAISE EXCEPTION 'Candidates cannot edit quiz answers directly';
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_applications_candidate_writes ON public.applications;
CREATE TRIGGER protect_applications_candidate_writes
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_application_columns();

GRANT EXECUTE ON FUNCTION public.get_job_quiz_keys(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, jsonb) TO authenticated;
