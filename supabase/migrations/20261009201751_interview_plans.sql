-- ============================================================================
-- Interview plans (2026-10-09): the hiring team's own changes to the
-- questions asked on a live interview, kept per job.
-- ============================================================================
-- The owner, the day the interview guide was reworded: "Why don't you also
-- allow me to edit the interview guide so people can also make some changes
-- here? That way it would be a good thing."
--
-- The guide's plan (the welcome, the opening question, the questions
-- everyone gets, the close) is written by hand in src/lib/interviewGuide.ts.
-- This keeps a job's CHANGES to it: a welcome of their own, built-in
-- questions reworded or not asked, and questions of their own
-- (src/lib/interviewGuide.ts, PlanEdits). Only what was changed is kept, laid
-- over the plan when the guide is shown, so a question nobody touched still
-- follows the code. It is per job, not per applicant: everyone interviewed
-- for the job is asked the same set, which is what lets answers be compared.
--
-- An applicant must never see what they will be asked or what the
-- interviewer is listening for, so this is a table only the job's hiring
-- team can read, like public.interview_guides.
--
-- Applying it while people are applying: the ONLY lock this takes on a table
-- that already exists is the foreign key's (section 3, the last statement),
-- on jobs, for the instant it takes to add a constraint to an empty table,
-- and only on the first run: a re-run finds the constraint and adds nothing.
-- lock_timeout makes it give up after 3 seconds rather than queue anything
-- behind it; if it times out, nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.interview_plans: one row per job: the changes as JSON, who
--      last saved them and when. RLS: the job's owner and its active team
--      members read it; nobody else sees a row. No INSERT, UPDATE or DELETE
--      policy, and no write grant to a client role.
--
--   2. save_interview_plan(p_job_id, p_edits): SECURITY DEFINER, for the
--      job's owner or an active team member on that job who may manage the
--      pipeline. NULL (or changes with nothing in them) takes the row away:
--      the job is asked the plan as written. Otherwise every part is read
--      and bounded, and what is stored is rebuilt from the parts that passed:
--      a welcome of at most 400 characters; up to 20 built-in questions
--      reworded (question up to 320 characters, "listen for" and "red flag"
--      up to 220); up to 20 not asked; up to 10 of their own, each with an id
--      of the form custom_xxxxxx and a question. Line breaks become spaces.
--      Anything malformed is refused whole. A job the caller may not change,
--      or that does not exist, reads the same: refused.
--
--   3. The foreign key, last: a job that is deleted takes its plan with it.
--
-- It does not touch public.jobs' or public.applications' rows, columns,
-- triggers or policies, and no existing function is changed.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_plans (
  job_id     uuid PRIMARY KEY,
  edits      jsonb NOT NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_plans_edits_object CHECK (jsonb_typeof(edits) = 'object')
);

COMMENT ON TABLE public.interview_plans IS
  'A job''s own changes to the interview guide''s plan: a welcome, built-in questions reworded or not asked, and questions of the hiring team''s own (src/lib/interviewGuide.ts PlanEdits). One row per job, so every applicant for the job is asked the same set. Private to the job''s owner and its active team members; an applicant can never read it. Written only through save_interview_plan.';

ALTER TABLE public.interview_plans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.interview_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.interview_plans TO authenticated;
GRANT ALL ON public.interview_plans TO service_role;

DROP POLICY IF EXISTS "Hiring team can read their interview plans" ON public.interview_plans;
CREATE POLICY "Hiring team can read their interview plans"
  ON public.interview_plans FOR SELECT TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- ── 2. Saving a job's changes ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_interview_plan(p_job_id uuid, p_edits jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_welcome  text;
  v_changed  jsonb := '{}'::jsonb;
  v_removed  jsonb := '[]'::jsonb;
  v_added    jsonb := '[]'::jsonb;
  v_key      text;
  v_val      jsonb;
  v_part     text;
  v_text     text;
  v_edit     jsonb;
  v_id       text;
  v_seen     text[] := ARRAY[]::text[];
  v_count    integer;
  v_clean    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_interview_plan: not signed in' USING ERRCODE = '42501';
  END IF;
  -- Not found and not allowed read the same: a job id says nothing about
  -- whether it exists. Changing what everyone is asked is for the owner and
  -- for a team member who may manage the pipeline.
  IF p_job_id IS NULL
     OR NOT (public.is_job_owner(p_job_id, v_uid) OR public.is_active_team_member_for_job(p_job_id, v_uid, true)) THEN
    RAISE EXCEPTION 'save_interview_plan: not allowed' USING ERRCODE = '42501';
  END IF;

  -- Back to the plan as written.
  IF p_edits IS NULL OR jsonb_typeof(p_edits) = 'null' THEN
    DELETE FROM public.interview_plans WHERE job_id = p_job_id;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_edits) <> 'object' THEN
    RAISE EXCEPTION 'save_interview_plan: the changes must be an object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_edits::text) > 60000 THEN
    RAISE EXCEPTION 'save_interview_plan: too much to save' USING ERRCODE = '22023';
  END IF;

  -- The welcome: text or nothing.
  IF p_edits ? 'welcome' AND jsonb_typeof(p_edits -> 'welcome') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'save_interview_plan: the welcome is text' USING ERRCODE = '22023';
  END IF;
  v_welcome := btrim(regexp_replace(COALESCE(p_edits ->> 'welcome', ''), '\s+', ' ', 'g'));
  IF char_length(v_welcome) > 400 THEN
    RAISE EXCEPTION 'save_interview_plan: the welcome is at most 400 characters' USING ERRCODE = '22023';
  END IF;

  -- Built-in questions reworded.
  IF p_edits ? 'changed' AND jsonb_typeof(p_edits -> 'changed') <> 'null' THEN
    IF jsonb_typeof(p_edits -> 'changed') <> 'object' THEN
      RAISE EXCEPTION 'save_interview_plan: the reworded questions must be an object' USING ERRCODE = '22023';
    END IF;
    v_count := 0;
    FOR v_key, v_val IN SELECT e.key, e.value FROM jsonb_each(p_edits -> 'changed') AS e LOOP
      IF v_key !~ '^[a-z0-9_]{1,40}$' OR jsonb_typeof(v_val) <> 'object' THEN
        RAISE EXCEPTION 'save_interview_plan: a reworded question is not readable' USING ERRCODE = '22023';
      END IF;
      v_edit := '{}'::jsonb;
      FOREACH v_part IN ARRAY ARRAY['question', 'listenFor', 'redFlag'] LOOP
        IF NOT (v_val ? v_part) OR jsonb_typeof(v_val -> v_part) = 'null' THEN
          CONTINUE;
        END IF;
        IF jsonb_typeof(v_val -> v_part) <> 'string' THEN
          RAISE EXCEPTION 'save_interview_plan: a question''s words are text' USING ERRCODE = '22023';
        END IF;
        v_text := btrim(regexp_replace(v_val ->> v_part, '\s+', ' ', 'g'));
        IF char_length(v_text) > (CASE WHEN v_part = 'question' THEN 320 ELSE 220 END) THEN
          RAISE EXCEPTION 'save_interview_plan: a question is at most 320 characters, and what to listen for 220' USING ERRCODE = '22023';
        END IF;
        IF v_text <> '' THEN
          v_edit := v_edit || jsonb_build_object(v_part, v_text);
        END IF;
      END LOOP;
      IF v_edit = '{}'::jsonb THEN
        CONTINUE;
      END IF;
      v_count := v_count + 1;
      IF v_count > 20 THEN
        RAISE EXCEPTION 'save_interview_plan: at most 20 reworded questions' USING ERRCODE = '22023';
      END IF;
      v_changed := v_changed || jsonb_build_object(v_key, v_edit);
    END LOOP;
  END IF;

  -- Built-in questions not asked.
  IF p_edits ? 'removed' AND jsonb_typeof(p_edits -> 'removed') <> 'null' THEN
    IF jsonb_typeof(p_edits -> 'removed') <> 'array' THEN
      RAISE EXCEPTION 'save_interview_plan: the questions not asked must be a list' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_edits -> 'removed') > 20 THEN
      RAISE EXCEPTION 'save_interview_plan: at most 20 questions not asked' USING ERRCODE = '22023';
    END IF;
    FOR v_val IN SELECT e.value FROM jsonb_array_elements(p_edits -> 'removed') AS e LOOP
      IF jsonb_typeof(v_val) <> 'string' OR (v_val #>> '{}') !~ '^[a-z0-9_]{1,40}$' THEN
        RAISE EXCEPTION 'save_interview_plan: a question not asked is named by its id' USING ERRCODE = '22023';
      END IF;
      IF NOT (v_removed @> jsonb_build_array(v_val #>> '{}')) THEN
        v_removed := v_removed || jsonb_build_array(v_val #>> '{}');
      END IF;
    END LOOP;
  END IF;

  -- Questions of their own.
  IF p_edits ? 'added' AND jsonb_typeof(p_edits -> 'added') <> 'null' THEN
    IF jsonb_typeof(p_edits -> 'added') <> 'array' THEN
      RAISE EXCEPTION 'save_interview_plan: the added questions must be a list' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_edits -> 'added') > 10 THEN
      RAISE EXCEPTION 'save_interview_plan: at most 10 questions of your own' USING ERRCODE = '22023';
    END IF;
    FOR v_val IN SELECT e.value FROM jsonb_array_elements(p_edits -> 'added') AS e LOOP
      IF jsonb_typeof(v_val) <> 'object' OR jsonb_typeof(v_val -> 'id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_val -> 'question') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'save_interview_plan: an added question needs an id and its words' USING ERRCODE = '22023';
      END IF;
      v_id := v_val ->> 'id';
      IF v_id !~ '^custom_[a-z0-9]{6,16}$' OR v_id = ANY (v_seen) THEN
        RAISE EXCEPTION 'save_interview_plan: an added question''s id is not usable' USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_id;
      v_edit := jsonb_build_object('id', v_id);
      FOREACH v_part IN ARRAY ARRAY['question', 'listenFor', 'redFlag'] LOOP
        IF v_val ? v_part AND jsonb_typeof(v_val -> v_part) NOT IN ('string', 'null') THEN
          RAISE EXCEPTION 'save_interview_plan: a question''s words are text' USING ERRCODE = '22023';
        END IF;
        v_text := btrim(regexp_replace(COALESCE(v_val ->> v_part, ''), '\s+', ' ', 'g'));
        IF char_length(v_text) > (CASE WHEN v_part = 'question' THEN 320 ELSE 220 END) THEN
          RAISE EXCEPTION 'save_interview_plan: a question is at most 320 characters, and what to listen for 220' USING ERRCODE = '22023';
        END IF;
        IF v_part = 'question' AND v_text = '' THEN
          RAISE EXCEPTION 'save_interview_plan: an added question needs its words' USING ERRCODE = '22023';
        END IF;
        v_edit := v_edit || jsonb_build_object(v_part, v_text);
      END LOOP;
      v_added := v_added || jsonb_build_array(v_edit);
    END LOOP;
  END IF;

  -- Nothing left after reading: the plan as written.
  IF v_welcome = '' AND v_changed = '{}'::jsonb AND v_removed = '[]'::jsonb AND v_added = '[]'::jsonb THEN
    DELETE FROM public.interview_plans WHERE job_id = p_job_id;
    RETURN NULL;
  END IF;

  v_clean := jsonb_build_object(
    'version', 1,
    'welcome', CASE WHEN v_welcome = '' THEN NULL ELSE v_welcome END,
    'changed', v_changed,
    'removed', v_removed,
    'added', v_added
  );

  INSERT INTO public.interview_plans (job_id, edits, updated_by, updated_at)
  VALUES (p_job_id, v_clean, v_uid, now())
  ON CONFLICT (job_id) DO UPDATE
    SET edits = EXCLUDED.edits, updated_by = EXCLUDED.updated_by, updated_at = now();

  RETURN v_clean;
END;
$$;

COMMENT ON FUNCTION public.save_interview_plan(uuid, jsonb) IS
  'Saves a job''s own changes to the interview guide''s plan (a welcome, built-in questions reworded or not asked, questions of the hiring team''s own), or takes them away when given NULL or nothing. For the job''s owner or an active team member on that job who may manage the pipeline. Every part is read and bounded; anything malformed is refused whole.';

REVOKE ALL ON FUNCTION public.save_interview_plan(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_interview_plan(uuid, jsonb) TO authenticated, service_role;

-- ── 3. The foreign key, last (the only lock on jobs) ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interview_plans_job_fkey'
       AND conrelid = 'public.interview_plans'::regclass
  ) THEN
    ALTER TABLE public.interview_plans
      ADD CONSTRAINT interview_plans_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
