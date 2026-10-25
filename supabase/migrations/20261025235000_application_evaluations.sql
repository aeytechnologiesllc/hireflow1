-- The hiring team's evaluation of an application moves out of the
-- applicant's own row (2026-10-25; docs/LAUNCH-PLAN.md, Phase 7, task 6,
-- carried from Phase 1, task 4).
--
-- "Candidates can view their own applications" lets an applicant read every
-- column of their own public.applications row. Five of those columns are the
-- hiring team's, not theirs:
--
--   ai_score           Ava's overall score
--   ai_analysis        Ava's resume report
--   ai_scorecard       Ava's whole scorecard (why up, why down, red flags)
--   phase_ai_analysis  the one-line summary each grader writes for the team
--   employer_notes     the team's own notes, the decline reason among them
--
-- Writes were already refused (protect_application_columns and
-- protect_application_staff_columns). Reads were not: an applicant's browser
-- could select them. Applicant pages read their row live through realtime,
-- which works only on tables, so a view cannot stand in for the table. So:
--
--   1. public.application_evaluations holds them, one row per application.
--      The job's business and its team read it (the same helpers that decide
--      who reads the application), developers too (as on applications), the
--      applicant never.
--   2. Every writer keeps writing applications as before. A trigger moves
--      each value it sets into application_evaluations and leaves the
--      applicant's row with NULL, so the row an applicant can read never
--      holds them. One trigger per column, BEFORE UPDATE OF that column, so
--      a write that clears a value (employer_notes = null, a re-analysis with
--      no scorecard) clears it here too; the old value is always NULL now, so
--      a comparison with OLD could not tell "cleared" from "not written".
--      They are named zz_… so they fire after every other BEFORE trigger on
--      applications (PostgreSQL fires them by name): the two protect
--      triggers, which refuse an applicant's non-NULL write, see the write as
--      it was sent. An applicant's own NULL for one of these columns (their
--      row shows NULL, so writing it back is no change to them) is dropped
--      and never clears the team's value.
--   3. The values already on applications are copied over, then cleared.
--   4. applications_staff_list (the staff lists' view) reads the five from
--      here, so the cockpit's lists are unchanged.
--   5. The table is in the realtime publication: the staff shell merges a
--      new score into the Applicants list live (useEmployerLiveSync).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- Nothing writes applications while the values move (a score saved between
-- the copy and the clear would be lost). SHARE ROW EXCLUSIVE is what
-- CREATE TRIGGER takes anyway; reads go on.
LOCK TABLE public.applications IN SHARE ROW EXCLUSIVE MODE;

-- ── 1. The table ────────────────────────────────────────────────────────────
-- The foreign key is checked at commit, not at once: the BEFORE INSERT
-- trigger below saves a new application's evaluation before the
-- application's own row exists. Deleting the application deletes its
-- evaluation at once (a cascade is never deferred).
CREATE TABLE IF NOT EXISTS public.application_evaluations (
  application_id uuid PRIMARY KEY
    REFERENCES public.applications(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  ai_score numeric,
  ai_analysis text,
  ai_scorecard jsonb,
  phase_ai_analysis text,
  employer_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each column takes exactly the type it has on applications. The repo's
-- migrations disagree about ai_score (the first table said numeric, a later
-- "add column if not exists" said double precision), so the live type is
-- read rather than guessed; applications_staff_list below needs them equal.
DO $$
DECLARE
  v_col  text;
  v_want text;
  v_have text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['ai_score', 'ai_analysis', 'ai_scorecard', 'phase_ai_analysis', 'employer_notes'] LOOP
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_want
      FROM pg_attribute a
     WHERE a.attrelid = 'public.applications'::regclass AND a.attname = v_col AND NOT a.attisdropped;
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_have
      FROM pg_attribute a
     WHERE a.attrelid = 'public.application_evaluations'::regclass AND a.attname = v_col AND NOT a.attisdropped;
    IF v_want IS NULL THEN
      RAISE EXCEPTION 'applications.% is missing', v_col;
    END IF;
    IF v_want IS DISTINCT FROM v_have THEN
      EXECUTE format('ALTER TABLE public.application_evaluations ALTER COLUMN %I TYPE %s USING %I::%s', v_col, v_want, v_col, v_want);
    END IF;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.application_evaluations IS
  'The hiring team''s evaluation of one application (Ava''s score, report and scorecard, the graders'' summary, the team''s notes). Written through applications (a trigger moves the values here); read by the job''s business and its team, never by the applicant.';

ALTER TABLE public.application_evaluations ENABLE ROW LEVEL SECURITY;

-- Supabase grants every new public table to anon and authenticated by
-- default; take that back and give only what the policies below use.
REVOKE ALL ON TABLE public.application_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.application_evaluations TO authenticated;
GRANT UPDATE (employer_notes) ON TABLE public.application_evaluations TO authenticated;
GRANT ALL ON TABLE public.application_evaluations TO service_role;

-- The same three SELECT rules as on applications ("Employers can view
-- applications to their jobs", "Team members can view applications for
-- assigned jobs", "Developers can view all applications"), through the same
-- helpers. Nothing here lets the applicant in.
DROP POLICY IF EXISTS "Employers can view evaluations for their jobs" ON public.application_evaluations;
CREATE POLICY "Employers can view evaluations for their jobs"
  ON public.application_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_job_owner(a.job_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view evaluations for assigned jobs" ON public.application_evaluations;
CREATE POLICY "Team members can view evaluations for assigned jobs"
  ON public.application_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_active_team_member_for_job(a.job_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Developers can view all evaluations" ON public.application_evaluations;
CREATE POLICY "Developers can view all evaluations"
  ON public.application_evaluations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'developer'));

-- The team's notes, and only them (the column grant above), may also be
-- written here directly, by whoever may update the application: the owner,
-- or a teammate who manages the pipeline. The app writes them through
-- applications today; the trigger below moves them.
DROP POLICY IF EXISTS "Employers can update notes for their jobs" ON public.application_evaluations;
CREATE POLICY "Employers can update notes for their jobs"
  ON public.application_evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_job_owner(a.job_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_job_owner(a.job_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can update notes if permitted" ON public.application_evaluations;
CREATE POLICY "Team members can update notes if permitted"
  ON public.application_evaluations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_active_team_member_for_job(a.job_id, auth.uid(), true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = application_evaluations.application_id
         AND public.is_active_team_member_for_job(a.job_id, auth.uid(), true)
    )
  );

CREATE OR REPLACE TRIGGER application_evaluations_updated_at
  BEFORE UPDATE ON public.application_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. What is already on applications moves over ───────────────────────────
-- A notes text as an object, or NULL when it is not one (never an error).
CREATE OR REPLACE FUNCTION pg_temp.notes_object(p_notes text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE v jsonb;
BEGIN
  IF p_notes IS NULL OR btrim(p_notes) = '' THEN RETURN NULL; END IF;
  v := p_notes::jsonb;
  RETURN CASE WHEN jsonb_typeof(v) = 'object' THEN v END;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$f$;

-- First a copy of everything that moves or leaves the notes, kept only until
-- the move is checked live (private: not reachable through the API; it goes
-- with its application, so "Delete their information" and account deletion
-- reach it too). A later migration drops it.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.application_evaluation_move_backup AS
SELECT a.id AS application_id, a.ai_score, a.ai_analysis, a.ai_scorecard, a.phase_ai_analysis, a.employer_notes,
       a.notes AS notes_before, now() AS copied_at
  FROM public.applications a
 WHERE a.ai_score IS NOT NULL
    OR a.ai_analysis IS NOT NULL
    OR a.ai_scorecard IS NOT NULL
    OR a.phase_ai_analysis IS NOT NULL
    OR a.employer_notes IS NOT NULL
    OR pg_temp.notes_object(a.notes) ? 'avaScorecard'
    OR pg_temp.notes_object(a.notes) -> 'avaAnalysisMeta' ? 'structuredScoring';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'private.application_evaluation_move_backup'::regclass AND contype = 'f'
  ) THEN
    DELETE FROM private.application_evaluation_move_backup b
     WHERE NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = b.application_id);
    ALTER TABLE private.application_evaluation_move_backup
      ADD CONSTRAINT application_evaluation_move_backup_application_fk
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
END;
$$;
REVOKE ALL ON TABLE private.application_evaluation_move_backup FROM PUBLIC, anon, authenticated;

-- Then the values, and Ava's scorecard where only notes.avaScorecard held it.
-- A value already in application_evaluations wins (a second run never puts a
-- stale value back over it).
INSERT INTO public.application_evaluations AS e
  (application_id, ai_score, ai_analysis, ai_scorecard, phase_ai_analysis, employer_notes, updated_at)
SELECT a.id, a.ai_score, a.ai_analysis,
       COALESCE(a.ai_scorecard, pg_temp.notes_object(a.notes) -> 'avaScorecard'),
       a.phase_ai_analysis, a.employer_notes, COALESCE(a.updated_at, now())
  FROM public.applications a
 WHERE a.ai_score IS NOT NULL
    OR a.ai_analysis IS NOT NULL
    OR a.ai_scorecard IS NOT NULL
    OR a.phase_ai_analysis IS NOT NULL
    OR a.employer_notes IS NOT NULL
    OR pg_temp.notes_object(a.notes) ? 'avaScorecard'
ON CONFLICT (application_id) DO UPDATE SET
  ai_score          = COALESCE(e.ai_score, EXCLUDED.ai_score),
  ai_analysis       = COALESCE(e.ai_analysis, EXCLUDED.ai_analysis),
  ai_scorecard      = COALESCE(e.ai_scorecard, EXCLUDED.ai_scorecard),
  phase_ai_analysis = COALESCE(e.phase_ai_analysis, EXCLUDED.phase_ai_analysis),
  employer_notes    = COALESCE(e.employer_notes, EXCLUDED.employer_notes)
WHERE (e.ai_score IS NULL AND EXCLUDED.ai_score IS NOT NULL)
   OR (e.ai_analysis IS NULL AND EXCLUDED.ai_analysis IS NOT NULL)
   OR (e.ai_scorecard IS NULL AND EXCLUDED.ai_scorecard IS NOT NULL)
   OR (e.phase_ai_analysis IS NULL AND EXCLUDED.phase_ai_analysis IS NOT NULL)
   OR (e.employer_notes IS NULL AND EXCLUDED.employer_notes IS NOT NULL);

-- Then the applicant's rows lose them: the five columns, notes.avaScorecard
-- (a second copy of the scorecard) and the structured scores in
-- notes.avaAnalysisMeta. With these triggers off for the moment: the
-- updated_at stamp (clearing what nobody can see any more is not activity,
-- and every staff screen that says "last updated" reads it), the quiz
-- session closer that a notes write wakes, and, on a second run, this
-- migration's own move triggers (they would move these NULLs over the copy).
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
     AND (t.tgname IN ('update_applications_updated_at', 'assessment_quiz_result_landed')
          OR t.tgname LIKE 'zz\_applications\_evaluation\_%');
  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications DISABLE TRIGGER %I', v_name);
  END LOOP;

  UPDATE public.applications
     SET ai_score = NULL,
         ai_analysis = NULL,
         ai_scorecard = NULL,
         phase_ai_analysis = NULL,
         employer_notes = NULL
   WHERE ai_score IS NOT NULL
      OR ai_analysis IS NOT NULL
      OR ai_scorecard IS NOT NULL
      OR phase_ai_analysis IS NOT NULL
      OR employer_notes IS NOT NULL;

  UPDATE public.applications a
     SET notes = ((pg_temp.notes_object(a.notes) - 'avaScorecard') #- '{avaAnalysisMeta,structuredScoring}')::text
   WHERE pg_temp.notes_object(a.notes) ? 'avaScorecard'
      OR pg_temp.notes_object(a.notes) -> 'avaAnalysisMeta' ? 'structuredScoring';

  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications ENABLE TRIGGER %I', v_name);
  END LOOP;
END;
$$;

-- ── 3. From now on every write moves them ───────────────────────────────────
-- Who may set them: the same people the two protect triggers let through
-- (the system, the job's owner, a teammate who manages the pipeline, the
-- quiz and voice submit functions on the applicant's behalf, and anyone who
-- is not the applicant on this row, whose write RLS has already decided).
-- The applicant themselves never: a non-NULL value from them was refused by
-- the protect triggers before this one ran; a NULL is dropped here.
CREATE OR REPLACE FUNCTION public.applications_keep_evaluation_apart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_col       text := TG_ARGV[0];
  v_job       uuid;
  v_candidate uuid;
  v_may       boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_job := NEW.job_id;
    v_candidate := NEW.candidate_id;
  ELSE
    v_job := OLD.job_id;
    v_candidate := OLD.candidate_id;
  END IF;

  v_may := COALESCE(auth.role() = 'service_role', false)
        OR COALESCE(public.is_job_owner(v_job, auth.uid()), false)
        OR COALESCE(public.is_active_team_member_for_job(v_job, auth.uid(), true), false)
        OR auth.uid() IS DISTINCT FROM v_candidate
        OR COALESCE(current_setting('hireflow.in_quiz_submit', true), '') = 'on'
        OR COALESCE(current_setting('hireflow.in_voice_interview_submit', true), '') = 'on';

  IF TG_OP = 'INSERT' THEN
    -- A new application: whatever the insert carried (applications_insert_
    -- starts_clean has already cleared it for anyone but the system).
    IF v_may AND (NEW.ai_score IS NOT NULL OR NEW.ai_analysis IS NOT NULL OR NEW.ai_scorecard IS NOT NULL
                  OR NEW.phase_ai_analysis IS NOT NULL OR NEW.employer_notes IS NOT NULL) THEN
      INSERT INTO public.application_evaluations AS e
        (application_id, ai_score, ai_analysis, ai_scorecard, phase_ai_analysis, employer_notes)
      VALUES (NEW.id, NEW.ai_score, NEW.ai_analysis, NEW.ai_scorecard, NEW.phase_ai_analysis, NEW.employer_notes)
      ON CONFLICT (application_id) DO UPDATE SET
        ai_score          = COALESCE(EXCLUDED.ai_score, e.ai_score),
        ai_analysis       = COALESCE(EXCLUDED.ai_analysis, e.ai_analysis),
        ai_scorecard      = COALESCE(EXCLUDED.ai_scorecard, e.ai_scorecard),
        phase_ai_analysis = COALESCE(EXCLUDED.phase_ai_analysis, e.phase_ai_analysis),
        employer_notes    = COALESCE(EXCLUDED.employer_notes, e.employer_notes),
        updated_at        = now();
    END IF;
    NEW.ai_score := NULL;
    NEW.ai_analysis := NULL;
    NEW.ai_scorecard := NULL;
    NEW.phase_ai_analysis := NULL;
    NEW.employer_notes := NULL;
    RETURN NEW;
  END IF;

  -- An UPDATE that sets this trigger's column (UPDATE OF): the value as
  -- sent, NULL included.
  IF v_col = 'ai_score' THEN
    IF v_may THEN
      INSERT INTO public.application_evaluations AS e (application_id, ai_score)
      VALUES (NEW.id, NEW.ai_score)
      ON CONFLICT (application_id) DO UPDATE SET ai_score = EXCLUDED.ai_score, updated_at = now();
    END IF;
    NEW.ai_score := NULL;
  ELSIF v_col = 'ai_analysis' THEN
    IF v_may THEN
      INSERT INTO public.application_evaluations AS e (application_id, ai_analysis)
      VALUES (NEW.id, NEW.ai_analysis)
      ON CONFLICT (application_id) DO UPDATE SET ai_analysis = EXCLUDED.ai_analysis, updated_at = now();
    END IF;
    NEW.ai_analysis := NULL;
  ELSIF v_col = 'ai_scorecard' THEN
    IF v_may THEN
      INSERT INTO public.application_evaluations AS e (application_id, ai_scorecard)
      VALUES (NEW.id, NEW.ai_scorecard)
      ON CONFLICT (application_id) DO UPDATE SET ai_scorecard = EXCLUDED.ai_scorecard, updated_at = now();
    END IF;
    NEW.ai_scorecard := NULL;
  ELSIF v_col = 'phase_ai_analysis' THEN
    IF v_may THEN
      INSERT INTO public.application_evaluations AS e (application_id, phase_ai_analysis)
      VALUES (NEW.id, NEW.phase_ai_analysis)
      ON CONFLICT (application_id) DO UPDATE SET phase_ai_analysis = EXCLUDED.phase_ai_analysis, updated_at = now();
    END IF;
    NEW.phase_ai_analysis := NULL;
  ELSIF v_col = 'employer_notes' THEN
    IF v_may THEN
      INSERT INTO public.application_evaluations AS e (application_id, employer_notes)
      VALUES (NEW.id, NEW.employer_notes)
      ON CONFLICT (application_id) DO UPDATE SET employer_notes = EXCLUDED.employer_notes, updated_at = now();
    END IF;
    NEW.employer_notes := NULL;
  ELSE
    RAISE EXCEPTION 'applications_keep_evaluation_apart: unknown column %', v_col;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_keep_evaluation_apart() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER zz_applications_evaluation_insert
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('insert');
CREATE OR REPLACE TRIGGER zz_applications_evaluation_ai_score
  BEFORE UPDATE OF ai_score ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('ai_score');
CREATE OR REPLACE TRIGGER zz_applications_evaluation_ai_analysis
  BEFORE UPDATE OF ai_analysis ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('ai_analysis');
CREATE OR REPLACE TRIGGER zz_applications_evaluation_ai_scorecard
  BEFORE UPDATE OF ai_scorecard ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('ai_scorecard');
CREATE OR REPLACE TRIGGER zz_applications_evaluation_phase_ai_analysis
  BEFORE UPDATE OF phase_ai_analysis ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('phase_ai_analysis');
CREATE OR REPLACE TRIGGER zz_applications_evaluation_employer_notes
  BEFORE UPDATE OF employer_notes ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_keep_evaluation_apart('employer_notes');

-- ── 4. The staff lists' view reads them from here ───────────────────────────
-- The same columns in the same order as 20261011201000_applications_staff_list.sql
-- (scripts/staff_list_view.test.mjs checks them against applications). It
-- runs with the caller's rights, so the evaluation's own rules apply: an
-- applicant who selects their row from it sees NULL for all five.
CREATE OR REPLACE VIEW public.applications_staff_list
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.job_id,
  a.candidate_id,
  a.status,
  a.cover_letter,
  a.resume_url,
  e.ai_analysis,
  e.ai_score,
  public.staff_list_notes(a.notes) AS notes,
  a.phase,
  e.phase_ai_analysis,
  a.created_at,
  a.updated_at,
  e.employer_notes,
  a.voice_interview_result,
  a.voice_interview_language,
  a.voice_interview_duration,
  a.voice_interview_recording_url,
  a.voice_interview_language_rule,
  a.voice_interview_video_enabled,
  a.voice_interview_transcript,
  a.rejected_by,
  a.rejected_by_type,
  a.resume_score,
  a.source,
  a.external_provider,
  a.external_application_id,
  e.ai_scorecard
FROM public.applications a
LEFT JOIN public.application_evaluations e ON e.application_id = a.id;

REVOKE ALL ON public.applications_staff_list FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.applications_staff_list FROM authenticated;
GRANT SELECT ON public.applications_staff_list TO authenticated, service_role;

-- ── 5. Live for the staff shell ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'application_evaluations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.application_evaluations;
  END IF;
END;
$$;

RESET statement_timeout;
RESET lock_timeout;
