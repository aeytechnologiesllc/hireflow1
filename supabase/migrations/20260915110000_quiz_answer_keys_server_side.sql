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
--   5. Adds submit_voice_interview_manual_end(...) — SECURITY DEFINER RPC
--      that server-grades the voice interview's manual-end/connection-lost
--      fallback the same way submit_quiz_attempt server-grades the quiz: it
--      accepts only the transcript and duration, and always writes the same
--      fixed "needs manual review" result — no score/recommendation
--      parameter exists for a candidate to forge. See item 6 below for why
--      this exists.
--   6. Adds a BEFORE UPDATE trigger on applications that blocks a candidate
--      from rewriting their own job_id, candidate_id, any AI/score column
--      (ai_score, ai_scorecard, ai_analysis, resume_score, and —
--      re-inspected live per the orchestrator's directive —
--      voice_interview_result: a jsonb column holding Ava's voice-interview
--      score/recommendation/scorecard, read as a trusted signal by
--      ai-shortlist's ranking and evidence-quality score, by trigger-ava-
--      analysis's own ai_score computation, and by autopilot-batch's
--      advance/reject decision — structurally identical to ai_scorecard and
--      just as forgeable, since "Candidates can update their own
--      applications" has no column restriction either. There is no separate
--      ranking/shortlist/autopilot-decision column on applications or jobs
--      today, so guarding ai_scorecard and voice_interview_result covers
--      those, since ai-shortlist/autopilot-batch derive them from these
--      rather than storing them separately), rejected_by/rejected_by_type,
--      or a quiz result inside notes (the notes.quizResult key, or any notes
--      entry whose own "type" is "quiz") — outside of submit_quiz_attempt
--      and submit_voice_interview_manual_end, each given a transaction-local
--      pass via set_config('hireflow.in_quiz_submit', ...) /
--      set_config('hireflow.in_voice_interview_submit', ...) respectively.
--      service_role (edge functions, migrations) is exempted via
--      auth.role() = 'service_role' — not current_user, which inside this
--      SECURITY DEFINER function is always the function's owner, never the
--      calling role.
--
--      voice_interview_result is guarded; voice_interview_transcript is
--      deliberately NOT — it is the candidate's own raw conversation record
--      (what they and Ava actually said), the same self-reported category as
--      a typing-test WPM or a chat-simulation transcript, not a score. A
--      forged transcript is a much higher-effort attack than one field write
--      and is an accepted limit here, same footing as the phase/notes
--      carve-outs below. src/pages/VoiceInterviewPhase.tsx's own write no
--      longer includes voice_interview_result (see that file): the
--      "official" grading path is supabase/functions/ava-voice-tools'
--      end_interview handler, which now performs that column's write with
--      the service-role admin client instead of the caller's own JWT-scoped
--      client, so it clears the auth.role() = 'service_role' bypass below
--      like every other edge function does; the candidate-initiated
--      manual-end fallback (connection lost, or Ava never called
--      end_interview) goes through submit_voice_interview_manual_end, which
--      computes its own fixed, non-attacker-influenceable result rather than
--      trusting whatever the client claims.
--
--      An earlier draft of this trigger allow-listed exactly what a
--      candidate's own status/phase write was allowed to be — reviewers
--      proved that allow-list too fragile: it rejected the actual submit
--      flow (ApplicationFormPhase.tsx's in_progress -> pending write) and
--      auto-mode's own move into the synthetic "decision" stage, because
--      neither value was on the list. This trigger now denies only what a
--      candidate must never do instead: it cannot move its own status INTO
--      'interview', 'offered' or 'hired', and cannot change status at all
--      once it is already 'rejected', 'offered' or 'hired' — every other
--      status write a candidate page makes today (pending, reviewing,
--      in_progress, a same-value passthrough) is unrestricted. `phase` is
--      not guarded here at all — routing is the separate step gate's job;
--      self-reported phase progression is a known, accepted limit of this
--      migration (see the comment inline above, at the removed phase check).
--
--   7. Two review rounds against this same file found the notes guard and
--      submit_voice_interview_manual_end still forgeable in narrower ways
--      than the deny-list above describes, both fixed in place rather than
--      redesigned:
--        - The notes guard's quiz check keyed off CONTENT (the literal
--          'quizResult' key, or any entry whose own 'type' is 'quiz'), never
--          the key NAME. A brand-new top-level key literally named "quiz"
--          with no 'type' field — the exact shape every candidate-page
--          `.update({ notes: ... })` call already sends, and the exact
--          shape ai-shortlist / trigger-ava-analysis / autopilot-batch /
--          generate-applicant-dossier / src/cockpit/lib/mappers.ts /
--          src/utils/getApplicationDisplayState.ts all read as a trusted
--          fallback for notes.quizResult — sailed straight through. The
--          guard now also denies any change to the 'quiz' key by name,
--          exactly like 'quizResult'.
--        - submit_voice_interview_manual_end had no precondition at all: a
--          candidate could call it to silently overwrite a real, already-
--          graded (possibly bad) voice_interview_result with its own fixed
--          neutral "needs manual review" result, or call it as the very
--          first action on a fresh application to fabricate phase
--          completion with no interview ever having happened. It now
--          refuses when voice_interview_result is already non-null, which
--          closes the "erase a real score" half. The "fabricate from
--          nothing" half needs a server-side proof that a real interview
--          session occurred, which the schema has no marker for today —
--          accepted as a known limit here, same footing as the
--          self-reported voice_interview_transcript, rather than solved by
--          adding new schema unilaterally in this pass. ava-voice-tools'
--          end_interview handler (supabase/functions/ava-voice-tools/
--          index.ts) got the matching fix on the edge-function side: it now
--          also refuses to overwrite an already-set voice_interview_result.
--          It has the same accepted "fabricate from nothing" limit — it
--          cannot distinguish a real OpenAI Realtime tool-call from a
--          candidate directly invoking the function with hand-crafted
--          parameters, which needs the same session-proof mechanism to
--          close and is flagged back to the orchestrator rather than
--          resolved here.
--
--   8. A third review round found two more narrow holes, both fixed in
--      place:
--        - notes.avaScorecard (and its sibling notes.avaAnalysisMeta) were
--          completely unguarded. trigger-ava-analysis writes the same
--          scorecard object into both the protected ai_scorecard column and
--          this notes key on every run; ai-shortlist's buildScorecard()
--          reads the notes copy FIRST and trusts it over the real, protected
--          column. A candidate could overwrite notes.avaScorecard directly —
--          it is neither named 'quiz'/'quizResult' nor typed 'quiz' — and
--          have ai-shortlist render a forged aiScore/recommendation to the
--          employer while the real ai_score/ai_scorecard columns (which
--          autopilot-batch actually decides from) stayed correct and
--          untouched. Guarded by key name now, the same way 'quiz' is.
--        - submit_quiz_attempt's notes write used the caller-supplied
--          p_step_id as the object key instead of key_step_id, the id of
--          the step actually matched and graded against (the step lookup
--          matches by id-OR-type='quiz', so p_step_id can legitimately be
--          any value and still resolve to and grade against the real quiz
--          step). Writing under the raw p_step_id let a candidate name an
--          existing, unrelated step key on the same application and have
--          their one legitimate quiz submission silently overwrite whatever
--          real notes entry already lived there (e.g. a real, already-
--          graded portfolio score) — the same "erase a real result" class
--          item 7 already closed for voice_interview_result, left open here.
--          Now uses key_step_id, exactly as the job_quiz_keys lookup two
--          lines earlier already does.
--
--   9. Final round, orchestrator-directed: submit_quiz_attempt's one-shot
--      guard lived entirely in applications.notes — delete the application
--      and re-apply (a fresh row, fresh notes) and the guard is gone, even
--      though nothing about the candidate's actual attempt history changed.
--      Adds public.quiz_attempt_ledger, keyed by (candidate_id, job_id,
--      step_id) rather than application_id specifically so it survives that
--      delete-and-reapply: no FK to applications at all, so an application
--      being deleted (or cascade-deleted with its job) never touches a
--      ledger row. It DOES cascade with jobs (job_id references jobs(id) ON
--      DELETE CASCADE) — a deleted job's per-candidate attempt history has
--      nothing left to gate. RLS is enabled with zero policies for any
--      client role: every read/write from `authenticated` or `anon` gets
--      zero rows / a denied write, same as job_quiz_keys' service-only
--      shape above. The two functions that touch it (submit_quiz_attempt
--      below, and the new grant_quiz_retake) are SECURITY DEFINER, owned by
--      the migration role, which — like table owners generally — bypasses
--      RLS regardless of policy count; that's the only way in or out.
--      submit_quiz_attempt now refuses once attempts >= 1 + retakes_granted
--      for the row matching the actually-graded (candidate_id, job_id,
--      key_step_id) — not the old notes-only check, which stays in place
--      alongside it as a cheap same-application fast path, not the
--      authority. grant_quiz_retake is the only way retakes_granted moves;
--      it's called from ava-voice-tools' move_applicant_to_phase (the one
--      live path that already clears notes[stepId]/quizResult to reopen a
--      quiz step) at the exact moment that clear happens, so the reopened
--      step actually accepts one more submission instead of the ledger
--      still refusing it. Backfilled from every application that already
--      carries a completed quiz result (a top-level notes key whose value
--      has type:'quiz'), grouped per (candidate_id, job_id, step_id) so a
--      candidate who already had more than one such application before this
--      migration counts for that many real historical attempts — otherwise
--      deleting a completed application today and re-applying tomorrow,
--      right after this migration ships, would read as a first attempt.
--
--   10. Also orchestrator-directed: the notes guard inside
--      protect_application_columns keyed off two exact key names
--      ('quiz', 'quizResult') plus a content check (any entry whose own
--      'type' is 'quiz') plus two more exact names (avaScorecard,
--      avaAnalysisMeta) — four separate IF blocks, each only as broad as
--      the specific bypass a prior review round had found. That is
--      necessarily reactive: a new top-level key that starts with "quiz"
--      but isn't spelled exactly 'quiz'/'quizResult' — quizAnswers,
--      quizScore, QuizX, anything — was never checked at all and would sail
--      through exactly like the bare-'quiz'-key hole item 7 found, just one
--      new key name away. Replaced with one helper,
--      protected_application_notes_subset(notes jsonb), that extracts every
--      top-level key whose name starts with "quiz" case-insensitively, every
--      entry whose value is an object with type = 'quiz', and avaScorecard
--      (avaAnalysisMeta kept too, unchanged from item 8 — not asked to
--      change this round) into one jsonb object; the trigger now does one
--      comparison, protected_application_notes_subset(OLD.notes) IS
--      DISTINCT FROM protected_application_notes_subset(NEW.notes), instead
--      of one IF per known name. A candidate adding, changing, or removing
--      ANY key matching that shape is rejected, regardless of what the key
--      is called beyond the "quiz" prefix.
--
--   11. Repairer round found submit_quiz_attempt writing the detailed
--      per-question result under the wrong notes key for the standard job
--      shape (no workflow_steps entry of type "quiz" — the shape every real
--      job-creation path produces: src/lib/jobFromFlow.ts and
--      supabase/functions/ai-generate-workflow/index.ts both deliberately
--      keep the quiz on jobs.quiz_questions only). The ELSE branch below
--      used the same key_step_id ('__quiz_questions__') for both the
--      job_quiz_keys lookup AND the notes write. '__quiz_questions__' is
--      right for the former (extract_quiz_answer_keys, item 2 above, stored
--      the answer rows under exactly that step_id) but wrong for the
--      latter: src/lib/candidateJourney.ts's buildCandidateJourney()
--      always synthesizes this stage's id as the literal string "quiz", so
--      that's what QuizPhase.tsx sends as p_step_id and what every reader
--      of the per-question breakdown already looks for (src/cockpit/lib/
--      mappers.ts's notes.quiz?.score, CandidateApplicationDetail.tsx's
--      notes[phase.id]?.completedAt with phase.id === "quiz",
--      generate-applicant-dossier's notes.quiz || notes.quizResult).
--      Writing under '__quiz_questions__' left every one of those readers
--      empty-handed for the dominant job shape going forward (notes.
--      quizResult, written unconditionally under its own fixed key
--      regardless of step_key, kept the aggregate score/passed working by
--      coincidence, masking the regression). Split into two variables:
--      key_lookup_step_id (job_quiz_keys lookup — stays
--      '__quiz_questions__' for this branch) and key_step_id (the notes
--      write key — now the fixed literal 'quiz' for this branch, unchanged
--      for the workflow_steps-quiz branch, where both still point at the
--      same real, job-config-derived step id). 'quiz' is a fixed literal,
--      not p_step_id itself — using the raw caller-supplied p_step_id here
--      would reopen the exact "clobber an unrelated real notes entry" hole
--      item 8 closed.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE,
-- CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE, an
-- INSERT ... ON CONFLICT DO UPDATE SET x = GREATEST(...) backfill that only
-- ever raises a ledger's stored count to match what applications.notes
-- already shows, never lowers one a real post-migration attempt already
-- incremented past that. Safe to run more than once against the live
-- database as it stands today.
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
-- 1b. quiz_attempt_ledger — the one-shot gate that survives delete + reapply
-- ----------------------------------------------------------------------------
-- Keyed by (candidate_id, job_id, step_id), not application_id: a candidate
-- who deletes a completed application and re-applies gets a brand-new
-- application row (and brand-new, empty notes), but the same candidate_id
-- and job_id, so this row — and its attempts count — survives that and
-- keeps gating. Deliberately no FK to applications at all, so an
-- application (or a batch of them) being deleted never cascades into this
-- table. It DOES cascade with jobs: once a job itself is gone there is
-- nothing left for a per-candidate attempt count on it to gate.
CREATE TABLE IF NOT EXISTS public.quiz_attempt_ledger (
  candidate_id    uuid NOT NULL,
  job_id          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  step_id         text NOT NULL,
  attempts        int NOT NULL DEFAULT 0,
  retakes_granted int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  PRIMARY KEY (candidate_id, job_id, step_id)
);

ALTER TABLE public.quiz_attempt_ledger ENABLE ROW LEVEL SECURITY;

-- Deliberately zero policies, for every role, including `authenticated` and
-- `anon` — this table is server-only. With RLS enabled and no matching
-- policy, any direct client read or write gets zero rows / a denied write,
-- exactly like job_quiz_keys above. The only writers are: submit_quiz_attempt
-- and grant_quiz_retake (both SECURITY DEFINER, both below), which bypass
-- RLS as the table owner regardless of policy count — the same mechanism
-- that already lets submit_quiz_attempt's SECURITY DEFINER body write
-- applications despite protect_application_columns' trigger existing to
-- restrict a candidate's own direct writes to that table (a trigger, not
-- RLS, but the same "table owner" bypass principle applies to RLS here) —
-- and service_role, which bypasses RLS entirely regardless of this table's
-- policy count, same as everywhere else in this file.

-- Backfill: one attempt per application that already carries a completed
-- quiz result (a top-level notes key whose own value has type:'quiz' — the
-- exact shape submit_quiz_attempt below writes under key_step_id, and the
-- same shape protect_application_columns' notes guard already keys off of),
-- grouped per (candidate_id, job_id, step_id) so a candidate who — before
-- this ledger existed — already had more than one application to the same
-- job with a completed quiz result counts for that many real historical
-- attempts, not just one. pg_temp.try_parse_jsonb absorbs applications.notes
-- rows that aren't valid JSON (the same failure protect_application_columns'
-- own old_notes/new_notes casts already guard against elsewhere in this
-- file) rather than aborting the whole backfill; jsonb_each never runs
-- against a NULL/non-object result because the WHERE clause filters those
-- out one CTE level before the LATERAL join reaches them. Idempotent:
-- GREATEST(existing, freshly-computed) only ever raises the stored count to
-- match what's derivable from applications.notes today — since this
-- backfill statement doesn't touch notes, that computed value is identical
-- on every rerun, so rerunning this after real post-migration attempts have
-- already incremented a row further never claws that count back down.
CREATE OR REPLACE FUNCTION pg_temp.try_parse_jsonb(p text) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  RETURN p::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

WITH parsed_notes AS (
  SELECT candidate_id, job_id, notes_json
  FROM (
    SELECT a.candidate_id, a.job_id, pg_temp.try_parse_jsonb(a.notes) AS notes_json
    FROM public.applications a
    WHERE a.notes IS NOT NULL
  ) t
  WHERE jsonb_typeof(notes_json) = 'object'
),
quiz_entries AS (
  SELECT pn.candidate_id, pn.job_id, kv.key AS step_id
  FROM parsed_notes pn,
       LATERAL jsonb_each(pn.notes_json) AS kv(key, value)
  WHERE (kv.value ->> 'type') = 'quiz'
)
INSERT INTO public.quiz_attempt_ledger (candidate_id, job_id, step_id, attempts, retakes_granted)
SELECT candidate_id, job_id, step_id, count(*)::int, 0
FROM quiz_entries
GROUP BY candidate_id, job_id, step_id
ON CONFLICT (candidate_id, job_id, step_id)
DO UPDATE SET attempts = GREATEST(public.quiz_attempt_ledger.attempts, EXCLUDED.attempts);

DROP FUNCTION IF EXISTS pg_temp.try_parse_jsonb(text);

-- ----------------------------------------------------------------------------
-- 2. Strip answer fields out of the jobs row into job_quiz_keys
-- ----------------------------------------------------------------------------
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
  key_lookup_step_id  text;
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
  ledger_attempts     int;
  ledger_retakes      int;
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
    -- A real workflow_steps quiz entry: its own id is both the safe notes
    -- key (it comes from the job's own config, never from the caller) and
    -- the job_quiz_keys lookup key (extract_quiz_answer_keys stored answer
    -- rows under this same step id — see item 2 above).
    key_step_id := COALESCE(quiz_step->>'id', '__step_' || quiz_step_idx::text);
    key_lookup_step_id := key_step_id;
  ELSE
    -- No workflow_steps quiz entry — the standard job shape every real
    -- job-creation path in this codebase produces (src/lib/jobFromFlow.ts,
    -- supabase/functions/ai-generate-workflow/index.ts both deliberately
    -- never emit a workflow_steps entry of type "quiz"; the quiz lives only
    -- in the top-level jobs.quiz_questions column). job_quiz_keys still
    -- must be looked up under '__quiz_questions__' — that's the fixed
    -- step_id extract_quiz_answer_keys wrote those rows under (see item 2's
    -- INSERT above) — but the notes-write key cannot reuse that same
    -- constant: it must be 'quiz', because that is the literal, hardcoded
    -- synthetic step id src/lib/candidateJourney.ts's buildCandidateJourney()
    -- always assigns to this stage (`steps.push({ id: "quiz", ... })`), and
    -- therefore the literal id QuizPhase.tsx sends as p_step_id and the
    -- literal key every reader of the per-question detail already looks
    -- for (src/cockpit/lib/mappers.ts's notes.quiz?.score,
    -- CandidateApplicationDetail.tsx's notes[phase.id]?.completedAt check
    -- with phase.id === "quiz", generate-applicant-dossier's
    -- notes.quiz || notes.quizResult). Writing under '__quiz_questions__'
    -- instead (a prior draft of this function did) left every one of those
    -- readers unable to find the per-question answer breakdown, even though
    -- notes.quizResult (written unconditionally below, under its own fixed
    -- key regardless of key_step_id) kept the aggregate score/passed
    -- working by coincidence. 'quiz' is a fixed literal here, not
    -- p_step_id — using the caller-supplied p_step_id directly would
    -- reopen exactly the "clobber an unrelated real notes entry" hole item
    -- 8 closed (a candidate could pass p_step_id = 'video' and have their
    -- quiz result overwrite a real, already-graded notes.video entry) —
    -- 'quiz' is safe because it is not attacker-influenceable and is the
    -- only id this job's synthesized quiz stage can ever have.
    questions := COALESCE(job.quiz_questions, '[]'::jsonb);
    key_step_id := 'quiz';
    key_lookup_step_id := '__quiz_questions__';
  END IF;

  IF questions IS NULL OR jsonb_typeof(questions) <> 'array' OR jsonb_array_length(questions) = 0 THEN
    RAISE EXCEPTION 'No quiz questions found for this step';
  END IF;

  -- The authoritative one-shot gate: public.quiz_attempt_ledger, keyed by
  -- (candidate_id, job_id, key_step_id) — the actually-matched step, same
  -- as everywhere else this function uses key_step_id rather than the raw
  -- p_step_id (see item 8 in the file header for why). Unlike the
  -- notes-based check above, this survives the candidate deleting this
  -- application and re-applying: a fresh application has fresh (empty)
  -- notes, but the same candidate_id/job_id, so the ledger row (and its
  -- attempts count) is still there. Insert-then-lock rather than a bare
  -- SELECT ... FOR UPDATE: two concurrent first-time submissions for the
  -- same (candidate, job, step) — from two different application rows, so
  -- `app`'s own FOR UPDATE lock above does not serialize them — must not
  -- both see "no row yet, attempts = 0" and both pass. ON CONFLICT DO
  -- NOTHING makes the insert a no-op on the second racer; the SELECT ...
  -- FOR UPDATE that follows then blocks it on the first racer's row lock
  -- until that transaction commits, and re-reads the now-current (already
  -- incremented) row once unblocked, exactly as READ COMMITTED's lock-wait
  -- re-check guarantees.
  INSERT INTO public.quiz_attempt_ledger (candidate_id, job_id, step_id, attempts, retakes_granted)
  VALUES (auth.uid(), app.job_id, key_step_id, 0, 0)
  ON CONFLICT (candidate_id, job_id, step_id) DO NOTHING;

  SELECT attempts, retakes_granted INTO ledger_attempts, ledger_retakes
    FROM public.quiz_attempt_ledger
   WHERE candidate_id = auth.uid() AND job_id = app.job_id AND step_id = key_step_id
     FOR UPDATE;

  IF ledger_attempts >= 1 + ledger_retakes THEN
    RAISE EXCEPTION 'This quiz has already been submitted';
  END IF;

  -- Let this transaction's writes through the applications write-guard.
  PERFORM set_config('hireflow.in_quiz_submit', 'on', true);

  q_idx := 0;
  FOR q IN SELECT * FROM jsonb_array_elements(questions)
  LOOP
    q_id := COALESCE(q->>'id', '__idx_' || q_idx::text);

    SELECT jqk.key INTO key_obj
      FROM public.job_quiz_keys jqk
     WHERE jqk.job_id = job.id AND jqk.step_id = key_lookup_step_id AND jqk.question_id = q_id;
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
  --
  -- step_key is the ACTUALLY-MATCHED quiz step's own id (key_step_id) —
  -- never the caller-supplied p_step_id, and never key_lookup_step_id
  -- either (the two differ for the standard/no-workflow-steps job shape —
  -- see where both are set above). The step-lookup loop above matches
  -- the first workflow step whose id equals p_step_id OR whose type is
  -- 'quiz', so a caller can pass ANY p_step_id (one belonging to a
  -- different, real step on the same job, or one matching nothing at all)
  -- and still have it resolve to the real quiz step and grade correctly
  -- against the real key — key_step_id already reflects that resolved step,
  -- not the raw input, exactly like the job_quiz_keys lookup above uses
  -- key_lookup_step_id. Writing under p_step_id instead would let a candidate pick an existing,
  -- unrelated step key (e.g. a real 'portfolio' entry with its own
  -- already-graded aiAnalysis.score) and have this call's result silently
  -- clobber it via the top-level `existing_notes || jsonb_build_object(...)`
  -- merge below — erasing real evidence for an unrelated phase using their
  -- one legitimate quiz submission, while also leaving the real notes.quiz
  -- entry never written. quizResult (below) is unconditionally written
  -- under its own fixed key regardless of step_key either way, so the
  -- one-shot resubmission guard above is unaffected by this either way.
  step_key := key_step_id;
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

  -- Record the attempt now that grading actually happened. The row was
  -- already inserted (if it didn't exist) and locked FOR UPDATE above, so
  -- this is a plain UPDATE, never an upsert race.
  UPDATE public.quiz_attempt_ledger
     SET attempts = attempts + 1,
         last_attempt_at = now()
   WHERE candidate_id = auth.uid() AND job_id = app.job_id AND step_id = key_step_id;

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
-- 4b. grant_quiz_retake — the only way retakes_granted moves
-- ----------------------------------------------------------------------------
-- Called from ava-voice-tools' move_applicant_to_phase at the exact moment
-- it clears notes[stepId]/notes.quizResult to reopen a quiz step (see that
-- function): a genuine employer/Ava decision that a retake is warranted, not
-- something submit_quiz_attempt or the candidate can trigger themselves.
-- Authorization mirrors get_job_quiz_keys / the job_quiz_keys write
-- policies above: job owner, or a team member with manage-pipeline
-- standing (the same permission move_applicant_to_phase's own caller must
-- already hold to reach this point), or service_role. p_candidate_id/
-- p_step_id are not independently verified against a real application —
-- move_applicant_to_phase already resolved both from an application row it
-- confirmed belongs to this employer's job before calling this; a caller
-- who invoked this RPC directly with an unrelated candidate_id could only
-- ever create a stray, harmless ledger row (it grants nothing by itself —
-- submit_quiz_attempt still requires that candidate to hold a real
-- application and a real job_quiz_keys entry to grade anything), the same
-- class of accepted, narrow limit as this file's other documented ones.
CREATE OR REPLACE FUNCTION public.grant_quiz_retake(
  p_candidate_id uuid,
  p_job_id uuid,
  p_step_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_job_owner(p_job_id, auth.uid())
    OR public.is_active_team_member_for_job(p_job_id, auth.uid(), true)
  ) THEN
    RAISE EXCEPTION 'Not authorized to grant a quiz retake for this job';
  END IF;

  INSERT INTO public.quiz_attempt_ledger (candidate_id, job_id, step_id, attempts, retakes_granted)
  VALUES (p_candidate_id, p_job_id, p_step_id, 0, 1)
  ON CONFLICT (candidate_id, job_id, step_id)
  DO UPDATE SET retakes_granted = public.quiz_attempt_ledger.retakes_granted + 1;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. submit_voice_interview_manual_end — the manual-end/connection-lost
--    fallback for the voice interview, server-graded the same way
--    submit_quiz_attempt is.
-- ----------------------------------------------------------------------------
-- src/pages/VoiceInterviewPhase.tsx's normal path gets its evaluation from
-- Ava (via the ava-voice-tools "end_interview" tool, now written with the
-- service-role admin client). But if the candidate clicks "End Interview"
-- with the connection already dropped, or Ava never calls end_interview
-- within the 12s grace window, the client has always built its own fallback
-- result locally (buildManualEndEvaluation()) and written it straight to
-- applications.voice_interview_result. That write is exactly the same
-- shape/authority as a forged one — nothing before this migration stopped a
-- candidate from calling that same .update() with a fabricated
-- overall_score/recommendation instead of the real fallback object, and
-- nothing stops it now that voice_interview_result is guarded, unless the
-- legitimate fallback has its own protected path. This RPC is that path: it
-- IGNORES any score/recommendation the client might try to pass in (there is
-- no such parameter) and always writes the same fixed "needs manual review"
-- result — score fields null, recommendation "review",
-- credibility_rating "manual_review_required" — mirroring
-- buildManualEndEvaluation() in VoiceInterviewPhase.tsx exactly. Only the
-- transcript and turn/duration bookkeeping (non-scoring metadata) come from
-- the caller.
CREATE OR REPLACE FUNCTION public.submit_voice_interview_manual_end(
  p_application_id uuid,
  p_transcript jsonb,
  p_duration_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  app             public.applications%ROWTYPE;
  candidate_turns int;
  ava_turns       int;
  transcript_turns int;
  evaluation      jsonb;
BEGIN
  SELECT * INTO app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF app.candidate_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to end this interview';
  END IF;

  -- Refuse to overwrite an already-graded interview. Without this, a
  -- candidate who received a real, bad, service-role-written evaluation
  -- from ava-voice-tools' end_interview handler could call this RPC
  -- afterwards to silently replace it with this fixed, neutral
  -- "needs manual review" result — erasing a genuine negative signal
  -- (trigger-ava-analysis's weighted average even fully excludes a null
  -- overall_score rather than counting it as 0, and autopilot-batch reads
  -- any non-null voice_interview_result as phase-complete) via a call only
  -- the candidate can make. This does not require the interview to have
  -- actually happened first — a candidate can still call this RPC as the
  -- very first action on a fresh application, before ever opening the
  -- interview UI, to fabricate phase completion out of nothing. Proving a
  -- real session occurred needs a server-side "interview started" marker
  -- that does not exist in the schema today; closing that half is a
  -- separate, larger design question flagged back to the orchestrator
  -- rather than resolved unilaterally here — same accepted-limit footing
  -- as the self-reported voice_interview_transcript and phase columns
  -- elsewhere in this migration.
  IF app.voice_interview_result IS NOT NULL THEN
    RAISE EXCEPTION 'This interview has already been evaluated';
  END IF;

  transcript_turns := CASE WHEN jsonb_typeof(p_transcript) = 'array' THEN jsonb_array_length(p_transcript) ELSE 0 END;

  SELECT count(*) INTO candidate_turns
    FROM jsonb_array_elements(COALESCE(p_transcript, '[]'::jsonb)) m
   WHERE (m->>'role') = 'user' AND length(trim(COALESCE(m->>'content', ''))) > 0;

  SELECT count(*) INTO ava_turns
    FROM jsonb_array_elements(COALESCE(p_transcript, '[]'::jsonb)) m
   WHERE (m->>'role') = 'assistant' AND length(trim(COALESCE(m->>'content', ''))) > 0;

  -- Fixed, non-attacker-influenceable result — matches
  -- buildManualEndEvaluation() in VoiceInterviewPhase.tsx field-for-field.
  evaluation := jsonb_build_object(
    'overall_score', NULL,
    'recommendation', 'review',
    'technical_score', NULL,
    'communication_score', NULL,
    'culture_fit_score', NULL,
    'credibility_rating', 'manual_review_required',
    'summary', 'The candidate ended the interview manually before Ava returned a structured final evaluation. The transcript and recording were saved for employer review.',
    'concerns', jsonb_build_array('Manual end fallback was used because Ava did not finalize the interview automatically.'),
    'strengths', '[]'::jsonb,
    'candidate_questions', '[]'::jsonb,
    'ended_by', 'candidate_button_fallback',
    'transcript_turns', transcript_turns,
    'candidate_turns', candidate_turns,
    'ava_turns', ava_turns,
    'duration_seconds', p_duration_seconds
  );

  -- Let this transaction's write through the applications write-guard.
  PERFORM set_config('hireflow.in_voice_interview_submit', 'on', true);

  UPDATE public.applications
     SET voice_interview_result = evaluation,
         voice_interview_transcript = p_transcript,
         phase_ai_analysis = evaluation ->> 'summary'
   WHERE id = p_application_id;

  RETURN evaluation;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5b. protected_application_notes_subset — one helper, not one IF per name
-- ----------------------------------------------------------------------------
-- Extracts, from a parsed applications.notes object, every top-level entry a
-- candidate must never add/change/remove directly: any key whose name starts
-- with "quiz" case-insensitively (quiz, quizResult, quizAnswers, quizScore,
-- QuizX, ... — matches by prefix, not by one fixed list of exact names, so a
-- new key spelled any other way than the ones prior review rounds happened
-- to catch is covered too), any entry whose own value is a JSON object with
-- type = 'quiz' (covers a quiz-shaped result saved under an unrelated key
-- name, e.g. a step id that doesn't itself start with "quiz"), and
-- avaScorecard / avaAnalysisMeta (item 8's fix, unchanged — ai-shortlist
-- trusts notes.avaScorecard ahead of the real, protected ai_score/
-- ai_scorecard columns; avaAnalysisMeta is displayed alongside it). Returns
-- an empty object for NULL or non-object input, never raises — callers
-- decide what a parse failure of the raw column means, this function only
-- ever sees an already-parsed jsonb value. protect_application_columns below
-- calls this once on OLD.notes and once on NEW.notes and compares the two
-- results with IS DISTINCT FROM, instead of the four separate exact-name/
-- content IF blocks item 7 and item 8 each added narrowly for the specific
-- bypass that review round found.
CREATE OR REPLACE FUNCTION public.protected_application_notes_subset(p_notes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  k      text;
  v      jsonb;
BEGIN
  IF p_notes IS NULL OR jsonb_typeof(p_notes) <> 'object' THEN
    RETURN result;
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(p_notes)
  LOOP
    IF lower(k) LIKE 'quiz%'
       OR (v ->> 'type') = 'quiz'
       OR k = 'avaScorecard'
       OR k = 'avaAnalysisMeta' THEN
      result := result || jsonb_build_object(k, v);
    END IF;
  END LOOP;

  RETURN result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. Stop a candidate from rewriting their own status/score/quiz result
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

  -- submit_quiz_attempt / submit_voice_interview_manual_end each set their
  -- own transaction-local flag right before they write to columns this
  -- trigger otherwise guards, on the candidate's own behalf.
  IF COALESCE(current_setting('hireflow.in_quiz_submit', true), '') = 'on'
     OR COALESCE(current_setting('hireflow.in_voice_interview_submit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- From here: a candidate is updating their own application directly
  -- (every phase page's supabase.from("applications").update(...) call),
  -- not through submit_quiz_attempt or submit_voice_interview_manual_end.

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
  IF NEW.voice_interview_result IS DISTINCT FROM OLD.voice_interview_result THEN
    RAISE EXCEPTION 'Candidates cannot change voice_interview_result';
  END IF;
  IF NEW.rejected_by IS DISTINCT FROM OLD.rejected_by THEN
    RAISE EXCEPTION 'Candidates cannot change rejected_by';
  END IF;
  IF NEW.rejected_by_type IS DISTINCT FROM OLD.rejected_by_type THEN
    RAISE EXCEPTION 'Candidates cannot change rejected_by_type';
  END IF;

  -- status: a deny-list, not an allow-list. An earlier draft of this guard
  -- only let a candidate's own write land exactly on "reviewing" — which
  -- blocked the actual submit flow (ApplicationFormPhase.tsx moving
  -- in_progress -> pending) the first time it met real candidate traffic.
  -- Candidate pages set status to several different values today (pending on
  -- submit; reviewing after a phase's local grade; and application.status
  -- unchanged — a same-value passthrough NEW.status IS DISTINCT FROM
  -- OLD.status already skips — from TypingTestPhase.tsx's auto-mode write).
  -- Rather than track every value a future phase page might legitimately
  -- write, this only denies what a candidate must never be able to do:
  -- promote themselves into an employer-decided stage, or touch status at
  -- all once an employer/system has already made a decision. Every other
  -- self-write (pending, reviewing, in_progress, even setting their own row
  -- back to something else) is a UI-navigation concern, not a privilege one
  -- — the candidate can only ever act on their own application, and none of
  -- these targets grants them interview/offer/hire standing.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('interview', 'offered', 'hired') THEN
      RAISE EXCEPTION 'Candidates cannot set application status to %', NEW.status;
    END IF;
    IF OLD.status IN ('rejected', 'offered', 'hired') THEN
      RAISE EXCEPTION 'Candidates cannot change application status once it is %', OLD.status;
    END IF;
  END IF;

  -- phase: deliberately NOT guarded here. Every auto-mode phase page
  -- (ChatInterviewPhase.tsx, VideoIntroPhase.tsx, PortfolioUploadPhase.tsx,
  -- TypingTestPhase.tsx) self-advances `phase` after a phase completes,
  -- including into the synthetic "decision" stage id that closes an
  -- auto-mode workflow — a value that never appears in the job's own
  -- workflow_steps array, so the previous allow-list (any step id belonging
  -- to this job's workflow) rejected exactly that write. Routing off `phase`
  -- is now the separate step-gate's job, not this trigger's. Known limit:
  -- self-reported phase progression itself is unguarded here — a candidate
  -- could in principle set `phase` to any step id via devtools and skip
  -- steps client-side. That does not grant them anything this trigger is
  -- responsible for (no status/score/AI-column access follows from `phase`
  -- alone), and closing it is the step gate's scope, not this migration's.

  -- notes: candidates freely record their own self-reported phase results
  -- (typing test WPM, chat/sales simulation transcripts, video/portfolio
  -- links, ...) — that's out of scope for this fix. A quiz result, or the
  -- Ava scorecard, is not: see protected_application_notes_subset above for
  -- exactly what's covered and why. This now does one comparison instead of
  -- one IF per known name/shape.
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

    IF public.protected_application_notes_subset(old_notes)
       IS DISTINCT FROM public.protected_application_notes_subset(new_notes) THEN
      RAISE EXCEPTION 'Candidates cannot edit quiz results or the Ava scorecard directly';
    END IF;
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
GRANT EXECUTE ON FUNCTION public.submit_voice_interview_manual_end(uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_quiz_retake(uuid, uuid, text) TO authenticated;
