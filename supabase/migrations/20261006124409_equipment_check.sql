-- ============================================================================
-- The computer and connection check (step type equipment_check), the
-- database's half. Contract: docs/EQUIPMENT-CHECK.md. The candidate step runs
-- OUR OWN speed test on the applicant's computer, timed by the server from
-- its own clock (connection-test, _shared/connectionStamps.ts), and records
-- what that computer is. Its result lands in notes.equipmentCheckResult
-- through recordStepResult, like every server-recorded step.
--
-- The step type is enumerated in four places in SQL, and every one of them
-- must say 'equipment_check' or the step silently keeps no record:
--
--   1. assessment_sessions.step_type CHECK: without it open_assessment_session's
--      INSERT fails (23514) even after the access rule passes.
--   2. assessment_journey: the title the staff record shows when the job's
--      step has none ("Your computer and connection", the candidate title,
--      the same string as FALLBACK_TITLES in both candidateJourney.ts copies).
--   3. assessment_step_completion: "finished" = notes.equipmentCheckResult
--      holds a value (what makes the record one-shot, closes the attempt and
--      drives the staff reopen marker). Without the WHEN the ELSE branch
--      reads notes[step id], i.e. only the legacyStepEntry.
--   4. assessment_step_access: the allowed-type list, else HF002 "keeps no
--      assessment record" and resolveSession records nothing.
--
-- And in the candidate-side forgery guard (20260915140000_trusted_step_results.sql):
--
--   5. trusted_result_key_for maps the key and the type to one enforcement
--      row, and trusted_result_enforcement gets that row ENFORCED from the
--      start (enforced = true). The older steps were seeded false and flipped
--      later (20260916150100_enforce_typing_test_result.sql and its siblings)
--      because their pages used to write their own results and had to ship
--      without that write first. No client has ever written
--      notes.equipmentCheckResult: the page was server-recorded from day one
--      and never touches `applications` for this step. Left unenforced, an
--      applicant could write the key themselves (the candidate update policy
--      allows a notes write, and protect_application_columns only guards an
--      enforced key), and every reader would take it as a server-timed
--      result: "they cannot lie" (docs/EQUIPMENT-CHECK.md rule 1) would not
--      hold for a single day. 'phase' is not touched here.
--
-- Everything else is type-agnostic: the events trigger (the page records
-- `system` events with a `what`, no new event kind), the sweep, the stale
-- claim expiry, the reopen trigger and the result-landed triggers (an
-- edge-function-graded step closes its own attempt: finishGrading).
--
-- One migration, DDL batched (a PostgREST schema reload per migration, never
-- a burst). Re-runnable: DROP CONSTRAINT IF EXISTS + ADD, CREATE OR REPLACE,
-- ON CONFLICT DO UPDATE. The three functions below are the full bodies of
-- 20261005230146_assessment_record.sql with the one line each adds; CREATE OR
-- REPLACE keeps their existing grants (service_role only), so none are
-- restated here. The two IF EXISTS / to_regclass guards exist because the
-- PGlite proofs load this file over partial schemas: the assessment-record
-- harness has no trusted_result_enforcement, the trusted-results harness has
-- no assessment_sessions. Production has both.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The step_type CHECK (auto-named by the inline column constraint).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.assessment_sessions
  DROP CONSTRAINT IF EXISTS assessment_sessions_step_type_check;
ALTER TABLE IF EXISTS public.assessment_sessions
  ADD CONSTRAINT assessment_sessions_step_type_check CHECK (step_type IN (
    'application', 'quiz', 'typing_test', 'chat_simulation', 'chat_interview',
    'sales_simulation', 'voice_interview', 'video_intro', 'portfolio_upload',
    'equipment_check'));

-- ----------------------------------------------------------------------------
-- 2. assessment_journey: the fallback title.
-- ----------------------------------------------------------------------------

-- buildCandidateJourney (src/lib/candidateJourney.ts) in SQL: the application,
-- the quiz when the job has quiz questions, every configured workflow step in
-- its configured order (skipping entries without an id or type, and any
-- application/quiz entry), then the closing Decision stage. Returns
-- [{index, id, type, title}]. The title is the job's own step title (staff
-- read it; candidate screens sanitise titles themselves), else the same
-- fallback names the client uses.
CREATE OR REPLACE FUNCTION public.assessment_journey(p_workflow_steps jsonb, p_has_quiz boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH configured AS (
    SELECT s.elem, s.ord
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_workflow_steps) = 'array' THEN p_workflow_steps ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS s(elem, ord)
     WHERE jsonb_typeof(s.elem) = 'object'
       AND COALESCE(s.elem ->> 'id', '') <> ''
       AND COALESCE(s.elem ->> 'type', '') <> ''
       AND s.elem ->> 'type' NOT IN ('application', 'quiz')
  ),
  all_steps AS (
    SELECT 0 AS grp, 0::bigint AS ord, 'application'::text AS id, 'application'::text AS type, NULL::text AS title
    UNION ALL
    SELECT 1, 0, 'quiz', 'quiz', NULL WHERE COALESCE(p_has_quiz, false)
    UNION ALL
    SELECT 2, c.ord, c.elem ->> 'id', c.elem ->> 'type', NULLIF(btrim(c.elem ->> 'title'), '') FROM configured c
    UNION ALL
    SELECT 3, 0, 'decision', 'decision', NULL
  ),
  numbered AS (
    SELECT a.*, row_number() OVER (ORDER BY a.grp, a.ord) - 1 AS idx FROM all_steps a
  )
  SELECT jsonb_agg(jsonb_build_object(
           'index', n.idx,
           'id', n.id,
           'type', n.type,
           'title', COALESCE(n.title, CASE n.type
             WHEN 'application' THEN 'Application'
             WHEN 'quiz' THEN 'Skills check'
             WHEN 'typing_test' THEN 'Typing test'
             WHEN 'equipment_check' THEN 'Your computer and connection'
             WHEN 'video_intro' THEN 'Video intro'
             WHEN 'video_message' THEN 'Video intro'
             WHEN 'chat_simulation' THEN 'Chat simulation'
             WHEN 'chat_interview' THEN 'Chat interview'
             WHEN 'sales_simulation' THEN 'Sales simulation'
             WHEN 'voice_interview' THEN 'Voice interview'
             WHEN 'portfolio_upload' THEN 'Portfolio'
             WHEN 'decision' THEN 'Decision'
             ELSE n.type END))
         ORDER BY n.idx)
    FROM numbered n
$$;

-- ----------------------------------------------------------------------------
-- 3. assessment_step_completion: finished = notes.equipmentCheckResult.
-- ----------------------------------------------------------------------------
-- Whether a step is finished, in one place. Never raises.
--   application   — the form is submitted (status is no longer in_progress).
--   quiz          — notes[step].completedAt or notes.quizResult exists: the
--                   same test submit_quiz_attempt uses to refuse a second
--                   submit (it has no reopen carve-out, so neither has this;
--                   a quiz retake is staff clearing those keys).
--   other steps   — their result key holds a value (journeyProgress.ts
--                   stepHasResult), UNLESS the step was reopened for a retake:
--                   status 'pending' with phase = this step (the rule every
--                   phase page uses, ChatInterviewPhase.tsx existingResult)
--                   AND a staff reopen marker (assessment_step_reopens) newer
--                   than the result on file. The result's time is the later
--                   of notes._trusted[step].completedAt (server-written,
--                   candidates cannot change it) and the step's last
--                   completed attempt; a legacy result with neither counts
--                   as older than any marker. The status alone never
--                   reopens a step: the applicant can set it themselves.
-- Returns {result_on_file, reopened, finished}. Also read by the sweep and
-- the reopen trigger, so every place answers "is it finished" the same way.
CREATE OR REPLACE FUNCTION public.assessment_step_completion(
  p_application_id uuid,
  p_step_id text,
  p_step_type text,
  p_app_status text,
  p_phase text,
  p_notes jsonb,
  p_voice_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notes       jsonb := CASE WHEN jsonb_typeof(p_notes) = 'object' THEN p_notes ELSE '{}'::jsonb END;
  v_type        text := CASE WHEN p_step_type = 'video_message' THEN 'video_intro' ELSE p_step_type END;
  v_on_file     boolean;
  v_reopened_at timestamptz;
  v_marker_text text;
  v_result_at   timestamptz;
  v_ended_at    timestamptz;
  v_reopened    boolean := false;
BEGIN
  v_on_file := CASE v_type
    WHEN 'application' THEN p_app_status IS DISTINCT FROM 'in_progress'
    WHEN 'quiz' THEN (v_notes -> p_step_id ->> 'completedAt') IS NOT NULL OR (v_notes -> 'quizResult') IS NOT NULL
    WHEN 'typing_test' THEN public.assessment_jsonb_truthy(v_notes -> 'typingTestResult')
    WHEN 'equipment_check' THEN public.assessment_jsonb_truthy(v_notes -> 'equipmentCheckResult')
    WHEN 'chat_simulation' THEN public.assessment_jsonb_truthy(v_notes -> 'chatSimulationResult')
    WHEN 'chat_interview' THEN public.assessment_jsonb_truthy(v_notes -> 'chatInterviewResult')
    WHEN 'sales_simulation' THEN public.assessment_jsonb_truthy(v_notes -> 'salesSimulationResult')
    WHEN 'portfolio_upload' THEN public.assessment_jsonb_truthy(v_notes -> 'portfolioResult')
    WHEN 'video_intro' THEN public.assessment_jsonb_truthy(v_notes -> 'videoIntroUrl')
                         OR public.assessment_jsonb_truthy(v_notes -> p_step_id -> 'videoUrl')
                         OR public.assessment_jsonb_truthy(v_notes -> p_step_id -> 'completed')
    WHEN 'voice_interview' THEN public.assessment_jsonb_truthy(p_voice_result)
    ELSE public.assessment_jsonb_truthy(v_notes -> p_step_id)
  END;
  v_on_file := COALESCE(v_on_file, false);

  IF v_on_file
     AND v_type NOT IN ('application', 'quiz')
     AND p_app_status = 'pending'
     AND p_phase = p_step_id THEN
    SELECT r.reopened_at INTO v_reopened_at
      FROM public.assessment_step_reopens r
     WHERE r.application_id = p_application_id AND r.step_id = p_step_id;
    IF v_reopened_at IS NOT NULL THEN
      v_marker_text := v_notes -> '_trusted' -> p_step_id ->> 'completedAt';
      IF v_marker_text IS NOT NULL AND pg_input_is_valid(v_marker_text, 'timestamptz') THEN
        v_result_at := v_marker_text::timestamptz;
      END IF;
      SELECT max(s.ended_at) INTO v_ended_at
        FROM public.assessment_sessions s
       WHERE s.application_id = p_application_id AND s.step_id = p_step_id AND s.status = 'completed';
      v_result_at := GREATEST(v_result_at, v_ended_at);  -- GREATEST skips NULLs
      v_reopened := v_result_at IS NULL OR v_reopened_at > v_result_at;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'result_on_file', v_on_file,
    'reopened', v_reopened,
    'finished', v_on_file AND NOT v_reopened);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. assessment_step_access: the allowed-type list.
-- ----------------------------------------------------------------------------
-- Raises unless the caller is the application's candidate, the application is
-- not rejected/hired/offered, the step is a real (non-Decision) step of this
-- job's journey with an assessment record, and the candidate has REACHED it:
-- the index of their own position (positionFor: phase as a step id or type,
-- else Decision for a post-workflow status, else the first step) is at or
-- past the step's index — the exact rule hasReachedStep applies.
--
-- 'offered' is refused as well as rejected/hired (the brief named the latter
-- two): an applicant with an offer is past every test, and advanceAfterStep
-- excludes the same three statuses.
--
-- Returns, without raising, whether the step is FINISHED and whether it was
-- reopened for a retake (assessment_step_completion above).
CREATE OR REPLACE FUNCTION public.assessment_step_access(p_application_id uuid, p_step_id text, p_caller uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app      record;
  v_job      record;
  v_has_quiz boolean;
  v_steps    jsonb;
  v_step     jsonb;
  v_type     text;
  v_target   integer;
  v_actual   integer;
  v_done     jsonb;
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '42501', DETAIL = 'Only the signed-in applicant can record a test.';
  END IF;
  IF p_step_id IS NULL OR length(p_step_id) = 0 OR length(p_step_id) > 200 THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002', DETAIL = 'No usable step id was given.';
  END IF;

  SELECT a.id, a.job_id, a.candidate_id, a.status::text AS status, a.phase, a.notes, a.voice_interview_result
    INTO v_app
    FROM public.applications a
   WHERE a.id = p_application_id;

  -- One answer for "no such application" and "not yours": never confirm that
  -- someone else's application exists.
  IF NOT FOUND OR v_app.candidate_id IS DISTINCT FROM p_caller THEN
    RAISE EXCEPTION 'not_your_application' USING ERRCODE = '42501';
  END IF;

  IF v_app.status IN ('rejected', 'hired', 'offered') THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'HF001',
      DETAIL = format('This application is %s.', v_app.status);
  END IF;

  SELECT j.id, j.workflow_steps, j.quiz_questions, j.application_questions
    INTO v_job
    FROM public.jobs j
   WHERE j.id = v_app.job_id;

  v_has_quiz := CASE WHEN jsonb_typeof(v_job.quiz_questions) = 'array'
                     THEN jsonb_array_length(v_job.quiz_questions) > 0 ELSE false END;
  v_steps := public.assessment_journey(v_job.workflow_steps, v_has_quiz);

  SELECT s INTO v_step
    FROM jsonb_array_elements(v_steps) AS s
   WHERE s ->> 'id' = p_step_id
   ORDER BY (s ->> 'index')::integer
   LIMIT 1;

  IF v_step IS NULL OR v_step ->> 'type' = 'decision' THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002',
      DETAIL = format('Step %s is not a step of this job.', p_step_id);
  END IF;

  v_type := CASE WHEN v_step ->> 'type' = 'video_message' THEN 'video_intro' ELSE v_step ->> 'type' END;
  IF v_type NOT IN ('application', 'quiz', 'typing_test', 'chat_simulation', 'chat_interview',
                    'sales_simulation', 'voice_interview', 'video_intro', 'portfolio_upload',
                    'equipment_check') THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002',
      DETAIL = format('Step type %s keeps no assessment record.', v_type);
  END IF;

  -- hasReachedStep: resolveGatedStep's index against positionFor's.
  v_target := (v_step ->> 'index')::integer;
  SELECT min((s ->> 'index')::integer) INTO v_actual
    FROM jsonb_array_elements(v_steps) AS s
   WHERE COALESCE(v_app.phase, '') <> ''
     AND (s ->> 'id' = v_app.phase OR s ->> 'type' = v_app.phase);
  IF v_actual IS NULL AND v_app.status IN ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected') THEN
    v_actual := jsonb_array_length(v_steps) - 1;  -- the closing Decision stage
  END IF;
  v_actual := COALESCE(v_actual, 0);
  IF v_actual < v_target THEN
    RAISE EXCEPTION 'step_not_reached' USING ERRCODE = 'HF003',
      DETAIL = format('The applicant has not reached step %s yet.', p_step_id);
  END IF;

  v_done := public.assessment_step_completion(
    v_app.id, p_step_id, v_type, v_app.status, v_app.phase,
    public.assessment_notes_object(v_app.notes), v_app.voice_interview_result);

  RETURN jsonb_build_object(
    'application_id', v_app.id,
    'job_id', v_app.job_id,
    'candidate_id', v_app.candidate_id,
    'step_id', p_step_id,
    'step_type', v_type,
    'step_title', v_step ->> 'title',
    'step_index', v_target,
    'application_status', v_app.status,
    'phase', v_app.phase,
    'finished', COALESCE((v_done ->> 'finished')::boolean, false),
    'reopened', COALESCE((v_done ->> 'reopened')::boolean, false)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. The forgery guard's mapping and its row, enforced from the start (see
--    the header). ON CONFLICT DO UPDATE, not DO NOTHING: a row left at false
--    by an earlier run of this file is turned on too.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trusted_result_key_for(p_key text, p_type text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN lower(p_key) = lower('typingTestResult')    OR p_type = 'typing_test'      THEN 'typingTestResult'
    WHEN lower(p_key) = lower('chatSimulationResult') OR p_type = 'chat_simulation'  THEN 'chatSimulationResult'
    WHEN lower(p_key) = lower('chatInterviewResult')  OR p_type = 'chat_interview'   THEN 'chatInterviewResult'
    WHEN lower(p_key) = lower('salesSimulationResult') OR p_type = 'sales_simulation' THEN 'salesSimulationResult'
    WHEN lower(p_key) = lower('portfolioResult')      OR p_type = 'portfolio_upload' THEN 'portfolioResult'
    -- videoIntroUrl is the flat legacy key VideoIntroPhase.tsx:390 writes
    -- alongside videoIntroResult — see 20260915140000_trusted_step_results.sql.
    -- Folded into the SAME result_key (not its own row) since it is the
    -- same underlying fact ("was a video submitted") duplicated at a second
    -- key for two readers that check it exclusively; one enforcement flag
    -- covers both.
    WHEN lower(p_key) = lower('videoIntroResult')
      OR lower(p_key) = lower('videoIntroUrl')
      OR p_type IN ('video_intro', 'video_message')                                 THEN 'videoIntroResult'
    WHEN lower(p_key) = lower('voiceInterviewResult') OR p_type = 'voice_interview'  THEN 'voiceInterviewResult'
    -- The computer and connection check (docs/EQUIPMENT-CHECK.md §5): the
    -- result key, and the legacyStepEntry's type under the step's own id.
    WHEN lower(p_key) = lower('equipmentCheckResult') OR p_type = 'equipment_check'  THEN 'equipmentCheckResult'
    ELSE NULL
  END;
$function$;

DO $$
BEGIN
  IF to_regclass('public.trusted_result_enforcement') IS NOT NULL THEN
    INSERT INTO public.trusted_result_enforcement (result_key, enforced)
    VALUES ('equipmentCheckResult', true)
    ON CONFLICT (result_key) DO UPDATE SET enforced = true, updated_at = now();
  END IF;
END;
$$;
