-- ============================================================================
-- "Waiting to continue on a computer": the staff side of the computer-only
-- rule (docs/COMPUTER-ONLY-TESTS.md, "Staff").
-- ============================================================================
-- On a phone or a tablet, the connection check and every step after it show
-- ONE screen instead of the test, "Continue on your computer"
-- (ContinueOnComputer.tsx). Until now that screen wrote nothing, so the
-- hiring team could not tell "has not opened the step" from "opened it on a
-- phone and is stuck at the gate". This function is the one write the screen
-- makes, once, when it shows:
--
--   applications.notes.waiting_on_computer = {step_id, at, device_kind}
--
-- The record (src/cockpit/lib/assessmentRecord.ts) reads it as the live line
-- "Waiting to continue on a computer · opened on a phone 2 h ago", and the
-- applicants list's one line says "Waiting to continue on a computer" in
-- amber. A reader IGNORES the stamp once the step's result is on file, once
-- the application is decided, and once an attempt on that step has moved
-- since (they went to the computer): nothing has to clear it, and nothing
-- does. A later step's stamp replaces it.
--
-- What it does, and nothing else:
--   * Who: the signed-in applicant of this application only, on an open
--     application, on a step of this job's journey they have reached, that is
--     not finished: assessment_step_access, the record's own rule, raises
--     42501 not_signed_in / not_your_application, HF001 application_closed,
--     HF002 unknown_step, HF003 step_not_reached; a finished step raises
--     HF004 step_finished, as every candidate function here does. An
--     application at 'interview' is refused too (HF001): every reader treats
--     it as decided, and a write here moved updated_at, which the applicants
--     list reads as "Decided today".
--   * Which steps: only a step the computer-only rule covers (the job's first
--     equipment_check and every step after it; with no connection check, the
--     first typing test, chat practice, sales practice, written or voice
--     interview and every step after it; never the application or the skills
--     check). The same rule as stepNeedsComputer in src/lib/deviceGate.ts and
--     supabase/functions/_shared/deviceKind.ts. Any other step: HF002.
--   * Which devices: 'phone' or 'tablet' (22023 otherwise). A computer never
--     sees the screen.
--   * At most once per VISIT to the gate: a stamp already naming this step is
--     left exactly as it is (its `at` is when they FIRST hit the gate) and
--     the call answers stamped = false, unless something happened on the step
--     since it was written: an attempt on the step started or moved
--     (assessment_sessions.started_at / last_activity_at at or after the
--     stamp), or staff reopened it (assessment_step_reopens.reopened_at at or
--     after the stamp). Then they came back to the gate later (a retake, or
--     after starting on a computer) and a FRESH stamp is written: the record
--     shows the line only while every attempt is older than the stamp, so the
--     old one hid them for good. A stamp whose time cannot be read, or that
--     is dated in the future (the applicant can write this key), is replaced
--     too. Idempotent under concurrency: the row is locked before the stamp
--     is read.
--   * The write is merge_application_notes (the one atomic notes path): only
--     the waiting_on_computer key, so a step result or a scorecard landing at
--     the same moment is never erased. updated_at moves, as on every write.
--   * It opens no attempt (no assessment_sessions row), records no integrity
--     event, sends no notification, and changes no status or phase.
--
-- The candidate forgery guard (protect_application_columns) still runs on the
-- write, as the candidate: it passes, because no protected key and no
-- protected column changes. The applicant could also write this one key
-- themselves (the candidate update policy allows notes writes outside the
-- protected subsets); it only ever describes the applicant themselves, so it
-- is not guarded, and readers check its shape and its step.
--
-- Grants: authenticated only (the function checks the caller itself).
-- REVOKE from PUBLIC and anon: Postgres grants EXECUTE to PUBLIC by default,
-- and Supabase's default privileges grant it to anon and authenticated, so a
-- grant alone restricts nothing.
--
-- One migration, re-runnable (CREATE OR REPLACE). Depends on
-- 20261005180943_merge_application_notes.sql,
-- 20261005230146_assessment_record.sql (assessment_journey,
-- assessment_notes_object) and 20261006124409_equipment_check.sql
-- (assessment_step_access with equipment_check).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_waiting_on_computer(
  p_application_id uuid,
  p_step_id text,
  p_device_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access   jsonb;
  v_job      record;
  v_has_quiz boolean;
  v_steps    jsonb;
  v_index    integer;
  v_start    integer;
  v_notes    jsonb;
  v_status   text;
  v_existing jsonb;
  v_existing_at timestamptz;
  v_stamp    jsonb;
BEGIN
  IF p_device_kind IS NULL OR p_device_kind NOT IN ('phone', 'tablet') THEN
    RAISE EXCEPTION 'invalid_device_kind' USING ERRCODE = '22023',
      DETAIL = 'device_kind is phone or tablet.';
  END IF;

  -- Who, which step, reached, open: the record's own rule (it raises).
  v_access := public.assessment_step_access(p_application_id, p_step_id, auth.uid());

  -- The computer-only rule (stepNeedsComputer): the first equipment_check,
  -- else the first of the tests that matter, and every step after it.
  SELECT j.workflow_steps, j.quiz_questions
    INTO v_job
    FROM public.jobs j
   WHERE j.id = (v_access ->> 'job_id')::uuid;
  v_has_quiz := CASE WHEN jsonb_typeof(v_job.quiz_questions) = 'array'
                     THEN jsonb_array_length(v_job.quiz_questions) > 0 ELSE false END;
  v_steps := public.assessment_journey(v_job.workflow_steps, v_has_quiz);
  v_index := (v_access ->> 'step_index')::integer;

  SELECT min((s ->> 'index')::integer) INTO v_start
    FROM jsonb_array_elements(v_steps) AS s
   WHERE s ->> 'type' = 'equipment_check';
  IF v_start IS NULL THEN
    SELECT min((s ->> 'index')::integer) INTO v_start
      FROM jsonb_array_elements(v_steps) AS s
     WHERE s ->> 'type' IN ('typing_test', 'chat_simulation', 'sales_simulation', 'chat_interview', 'voice_interview');
  END IF;
  IF v_start IS NULL
     OR v_index < v_start
     OR (v_access ->> 'step_type') IN ('application', 'quiz') THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002',
      DETAIL = format('Step %s is not one taken on a computer.', p_step_id);
  END IF;

  -- A step whose result is on file waits for nothing.
  IF COALESCE((v_access ->> 'finished')::boolean, false) THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'The result is on file.';
  END IF;

  -- Lock the row, then read: two screens showing at once stamp it once.
  SELECT public.assessment_notes_object(a.notes), a.status::text
    INTO v_notes, v_status
    FROM public.applications a
   WHERE a.id = p_application_id
   FOR UPDATE;

  -- At the interview stage the application is decided for every reader
  -- (DECIDED_STATUSES): nothing waits on a computer, and nothing is written.
  IF v_status = 'interview' THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'HF001',
      DETAIL = 'This application is at the interview stage.';
  END IF;

  v_existing := v_notes -> 'waiting_on_computer';
  IF jsonb_typeof(v_existing) = 'object' AND v_existing ->> 'step_id' = p_step_id THEN
    BEGIN
      v_existing_at := (v_existing ->> 'at')::timestamptz;
    EXCEPTION WHEN others THEN
      v_existing_at := NULL;
    END;
    -- Kept only while nothing has happened on the step since it was written.
    IF v_existing_at IS NOT NULL
       AND v_existing_at <= now() + interval '1 minute'
       AND NOT EXISTS (
         SELECT 1 FROM public.assessment_sessions s
          WHERE s.application_id = p_application_id
            AND s.step_id = p_step_id
            AND greatest(s.started_at, s.last_activity_at) >= v_existing_at)
       AND NOT EXISTS (
         SELECT 1 FROM public.assessment_step_reopens r
          WHERE r.application_id = p_application_id
            AND r.step_id = p_step_id
            AND r.reopened_at >= v_existing_at)
    THEN
      RETURN jsonb_build_object('stamped', false, 'waiting_on_computer', v_existing);
    END IF;
  END IF;

  v_stamp := jsonb_build_object(
    'step_id', p_step_id,
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'device_kind', p_device_kind);

  PERFORM public.merge_application_notes(p_application_id, jsonb_build_object('waiting_on_computer', v_stamp));

  RETURN jsonb_build_object('stamped', true, 'waiting_on_computer', v_stamp);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_waiting_on_computer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_waiting_on_computer(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.mark_waiting_on_computer(uuid, text, text) IS
  'The applicant''s own call from the "Continue on your computer" screen: stamps applications.notes.waiting_on_computer = {step_id, at, device_kind} once per visit to the gate (a stamp naming the step is kept as it is unless an attempt on the step moved or the step was reopened since, or its time is unreadable or in the future), on a reached, unfinished step the computer-only rule covers, for a phone or a tablet, on an application not yet decided (interview included). Opens no attempt and writes nothing else. Readers ignore the stamp once the step has a result, the application is decided, or an attempt on the step has moved since. docs/COMPUTER-ONLY-TESTS.md.';
