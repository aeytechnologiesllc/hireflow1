-- What an applicant can still read of Ava's evaluation, after the move's
-- second review (2026-10-25; the move: 20261025235000_application_evaluations.sql).
--
-- 1. Improvement reports saved before the move (notes.improvement_blueprint,
--    19 live) were written with Ava's score and report in their prompt and
--    her score in their metadata, and the applicant reads their own notes.
--    They go; the report page writes a new one when the applicant next opens
--    it, from their own answers only (ai-generate-performance-report).
-- 2. resume_score, Ava's score of the resume, sat on the applicant's own row.
--    Nothing reads it and trigger-ava-analysis no longer writes it; the one
--    live value goes.
-- Neither is the applicant's own writing; both are derived and regenerable.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

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

DO $$
DECLARE
  v_off text[];
  v_name text;
BEGIN
  -- Not activity on the application (the staff screens' "last updated"), and
  -- no quiz session to close: the same triggers the move held off.
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
     SET notes = (pg_temp.notes_object(a.notes) - 'improvement_blueprint' - 'improvement_blueprint_generated_at')::text
   WHERE pg_temp.notes_object(a.notes) ? 'improvement_blueprint';

  UPDATE public.applications SET resume_score = NULL WHERE resume_score IS NOT NULL;

  FOREACH v_name IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE public.applications ENABLE TRIGGER %I', v_name);
  END LOOP;
END;
$$;

RESET statement_timeout;
RESET lock_timeout;
