-- Null-safe ownership checks in the two candidate-only RPCs (2026-09-16).
--
-- submit_quiz_attempt and submit_voice_interview_manual_end refused a caller
-- with:
--     IF app.candidate_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized ...'
-- For a signed-out caller auth.uid() is NULL, so `candidate_id <> NULL` is
-- NULL, IF treats NULL as false, and the check never fired. Both functions are
-- SECURITY DEFINER and were executable by anon, so anyone holding an
-- application id could submit that candidate's quiz or end (and grade) their
-- voice interview. Proven on the live database in a rolled-back dry run: anon
-- got past the check in both ("No quiz questions found for this step" /
-- no error at all).
--
-- Fix, in two layers:
--   1. IS DISTINCT FROM, which is true (so the check raises) when auth.uid()
--      is NULL.
--   2. Signed-out callers can no longer execute either function at all.
--
-- The function bodies are patched in place from the catalog rather than
-- re-pasted: submit_quiz_attempt alone is ~21KB, and re-pasting it would risk
-- silently reverting any other change. Each patch asserts the old check occurs
-- exactly once, so drift fails the migration loudly instead of half-applying.
-- CREATE OR REPLACE (what pg_get_functiondef emits) keeps existing grants.

DO $$
DECLARE
  fn regprocedure;
  def text;
  old_check constant text := 'IF app.candidate_id <> auth.uid() THEN';
  new_check constant text := 'IF app.candidate_id IS DISTINCT FROM auth.uid() THEN';
  occurrences int;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.submit_quiz_attempt(uuid, text, jsonb, jsonb)'::regprocedure,
    'public.submit_voice_interview_manual_end(uuid, jsonb, integer)'::regprocedure
  ] LOOP
    def := pg_get_functiondef(fn);
    occurrences := (length(def) - length(replace(def, old_check, ''))) / length(old_check);
    IF occurrences <> 1 THEN
      RAISE EXCEPTION '% has % copies of the ownership check (expected exactly 1); refusing to patch', fn, occurrences;
    END IF;
    EXECUTE replace(def, old_check, new_check);
  END LOOP;
END $$;

-- Layer 2: a candidate is always signed in. PUBLIC must be revoked too, or
-- anon keeps EXECUTE through it.
REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_voice_interview_manual_end(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_voice_interview_manual_end(uuid, jsonb, integer) TO authenticated, service_role;

-- Advisor finding (function_search_path_mutable): pin the one trigger function
-- that was created without a fixed search_path.
DO $$
BEGIN
  IF to_regprocedure('public.applications_pin_candidate_id()') IS NOT NULL THEN
    ALTER FUNCTION public.applications_pin_candidate_id() SET search_path = public, pg_temp;
  END IF;
END $$;
