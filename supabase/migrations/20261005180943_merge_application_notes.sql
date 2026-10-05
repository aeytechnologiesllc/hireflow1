-- ============================================================================
-- merge_application_notes: one atomic write path for server-side notes keys
-- (2026-10-05).
-- ============================================================================
-- applications.notes is a TEXT column holding one JSON object that several
-- writers share: the candidate's own application answers, each step's
-- trusted result (recordStepResult in _shared/trustedResults.ts, the quiz
-- RPC), and Ava's scorecard (trigger-ava-analysis). Until now the edge
-- function writers each did read -> merge in JavaScript -> write the WHOLE
-- object back:
--
--   * trigger-ava-analysis parsed notes at the start of its request and,
--     about 40 s later (the length of the LLM call), wrote
--     `notes: JSON.stringify({ ...parsedNotes, avaScorecard, avaAnalysisMeta })`.
--   * recordStepResult read notes, merged its step result, and wrote the
--     whole object back with no compare-and-set.
--
-- That was survivable only because the candidate's browser waited for
-- Ava's analysis before it could start the next step. In auto mode the next
-- step now opens at once and Ava scores in the background, so a whole-object
-- write from a 40 s old snapshot would erase the next step's result (and a
-- step result written from a stale snapshot would erase Ava's scorecard).
--
-- This function merges only the TOP-LEVEL keys a caller owns into the
-- current stored object, under the row lock, in one statement's worth of
-- work. Every other key is left exactly as it is at that moment. A key in
-- p_patch replaces that key's whole value (it is not a deep merge), which is
-- what every caller wants: a retaken step's result replaces the old one.
--
-- * What is stored is read as an object and NEVER thrown away:
--     - NULL, blank or the JSON literal null: nothing stored yet, so {}.
--     - a JSON object: that object. JavaScript writes a NUL character as the
--       escape \u0000, which JSON.parse reads fine and Postgres jsonb
--       refuses, so a failed cast is retried once with every \u0000 spelled
--       \ufffd (the replacement character). Both escapes are six characters,
--       so the swap can never change the text's structure.
--     - anything else (malformed text, an array, a scalar): kept whole under
--       the key _unparsedNotes, and the patch merged next to it. Readers
--       already treat such notes as {}; this only stops a merge from
--       destroying text someone may need to repair. (An earlier draft
--       treated these as {} and wrote the patch over them, which erased a
--       whole application whose chat transcript held a NUL character.)
--   A patch that itself holds a NUL character cannot be passed as jsonb at
--   all; the callers replace it with U+FFFD first (withoutNulCharacters in
--   _shared/trustedResults.ts).
-- * updated_at moves the way it does for any other write: the existing
--   update_applications_updated_at BEFORE UPDATE trigger sets it.
-- * protect_application_columns still runs and, because only service_role
--   may call this, exempts the write the same way it exempts every other
--   service-role update (auth.role() = 'service_role').
-- * Server-only: REVOKE from PUBLIC, anon and authenticated, GRANT to
--   service_role. A candidate must never be able to write a notes key this
--   way (it would bypass the trusted-result guard's intent entirely).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_application_notes(p_application_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw      text;
  v_trimmed  text;
  v_parsed   jsonb;
  v_existing jsonb;
  v_merged   jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'merge_application_notes: p_patch must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- Row lock first, so two merges on the same application serialize and
  -- each one merges into the other's result rather than into a stale copy.
  SELECT a.notes INTO v_raw
    FROM public.applications a
   WHERE a.id = p_application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_application_notes: application % not found', p_application_id
      USING ERRCODE = 'P0002';
  END IF;

  -- What is stored now, as an object (see the header: never thrown away).
  v_trimmed := btrim(COALESCE(v_raw, ''), E' \t\r\n');
  IF v_trimmed = '' THEN
    v_existing := '{}'::jsonb;
  ELSE
    BEGIN
      v_parsed := v_trimmed::jsonb;
    EXCEPTION WHEN others THEN
      BEGIN
        v_parsed := replace(v_trimmed, E'\\u0000', E'\\ufffd')::jsonb;
      EXCEPTION WHEN others THEN
        v_parsed := NULL;
      END;
    END;

    IF v_parsed IS NOT NULL AND jsonb_typeof(v_parsed) = 'object' THEN
      v_existing := v_parsed;
    ELSIF v_parsed IS NOT NULL AND jsonb_typeof(v_parsed) = 'null' THEN
      v_existing := '{}'::jsonb;
    ELSE
      v_existing := jsonb_build_object('_unparsedNotes', v_raw);
    END IF;
  END IF;

  v_merged := v_existing || p_patch;

  UPDATE public.applications
     SET notes = v_merged::text
   WHERE id = p_application_id;

  RETURN v_merged;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_application_notes(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_application_notes(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.merge_application_notes(uuid, jsonb) IS
  'Service-role only. Atomically merges the top-level keys of p_patch into applications.notes (text JSON; empty is treated as {}, and text that is not a JSON object is kept under _unparsedNotes, never erased) and returns the merged object. Used by recordStepResult and trigger-ava-analysis so a background analysis and a step result can never erase each other.';
