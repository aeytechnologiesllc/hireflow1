-- ============================================================================
-- Trusted step results — part B, voice_interview.
-- ============================================================================
-- Converts VoiceInterviewPhase.tsx's last remaining candidate-side
-- applications write (voice_interview_transcript + phase_ai_analysis,
-- written straight from the browser after voice_interview_result already
-- existed) to go through the server, then flips this phase's own
-- trusted_result_enforcement flag on. See docs/TRUSTED-RESULTS.md's
-- "voice_interview is special" section for the full write-up of why this
-- one phase needed an extra step beyond the standard part-B recipe.
--
-- What changed on the application/edge-function side (not this file):
--
--   - supabase/functions/ava-voice-tools/index.ts gained a new
--     "record_interview_transcript" case. It is called directly by
--     VoiceInterviewPhase.tsx's handleInterviewEnd (never by Ava herself),
--     once an evaluation already exists — it re-reads
--     applications.voice_interview_result fresh (never trusting a client
--     copy), refuses to run before that evaluation exists or after a
--     transcript is already on file (the same "refuse to overwrite" shape
--     as "end_interview" and submit_voice_interview_manual_end already use),
--     calls trustedResults.ts's recordStepResult with
--     resultKey: "voiceInterviewResult" (recording notes.voiceInterviewResult
--     and advancing phase/status exactly like every other converted phase),
--     and only then saves voice_interview_transcript / phase_ai_analysis —
--     all with the service-role client, so none of this trigger's candidate
--     checks apply to it in the first place.
--   - VoiceInterviewPhase.tsx no longer writes voice_interview_transcript or
--     phase_ai_analysis itself; it calls that new edge function case
--     instead, for both the Ava-ended path and the manual-end/
--     connection-lost fallback path.
--
-- What changes here, in this migration:
--
--   1. submit_voice_interview_manual_end (20260915110000_quiz_answer_keys_
--      server_side.sql) is extended — CREATE OR REPLACE, same signature,
--      every existing guard kept byte-for-byte (the candidate-ownership
--      check, the "already evaluated" refusal, the fixed
--      non-attacker-influenceable evaluation shape, the
--      hireflow.in_voice_interview_submit flag bypass it already sets for
--      its own write). The ONLY change: its own UPDATE no longer sets
--      voice_interview_transcript or phase_ai_analysis — those two are now
--      saved by the SAME "record_interview_transcript" edge function case
--      as the Ava-ended path, which VoiceInterviewPhase.tsx calls right
--      after this RPC returns, so both paths end up recording
--      notes.voiceInterviewResult and advancing phase/status the same way
--      instead of only the Ava-ended path doing so. This does not weaken
--      anything this RPC already refused: voice_interview_result itself
--      (the only value a candidate could otherwise forge through this RPC)
--      is written here exactly as before, still fully fixed and
--      non-attacker-influenceable.
--
--      This RPC's writes were ALREADY fully exempt from
--      protect_application_columns() before this migration (the
--      hireflow.in_voice_interview_submit flag bypass returns NEW
--      unconditionally, before any per-column check runs) and remain so —
--      nothing about this change depends on, or is protected by, the flag
--      flipped in step 2 below.
--
--   2. Flips this phase's own trusted_result_enforcement row —
--      ONLY 'voiceInterviewResult', never 'phase' (that flag stays false
--      until every part-B phase conversion has landed — see
--      docs/TRUSTED-RESULTS.md). Once flipped, a candidate can no longer:
--        - write notes.voiceInterviewResult (any casing) or a notes entry
--          whose own `type` is 'voice_interview' directly;
--        - write applications.voice_interview_transcript at all once
--          voice_interview_result is already non-null (the guard
--          20260915140000_trusted_step_results.sql already added, gated on
--          this exact flag — see that migration's own
--          protect_application_columns for the full rule).
--      applications.voice_interview_result itself was, and remains,
--      guarded unconditionally regardless of this flag (20260915110000's
--      own protect_application_columns rule, kept byte-for-byte by every
--      later CREATE OR REPLACE of that function).
--
-- Idempotent: CREATE OR REPLACE FUNCTION is naturally idempotent, and the
-- UPDATE below is a no-op the second time it runs (already enforced = true).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. submit_voice_interview_manual_end — stop writing voice_interview_transcript
--    and phase_ai_analysis itself; VoiceInterviewPhase.tsx now saves both,
--    for this path exactly like the Ava-ended path, via ava-voice-tools'
--    new "record_interview_transcript" case (recordStepResult) right after
--    this RPC returns. Every other line below is unchanged from
--    20260915110000_quiz_answer_keys_server_side.sql (verified against that
--    migration's own function body with pg_get_functiondef before writing
--    this one).
-- ----------------------------------------------------------------------------
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

  -- Refuse to overwrite an already-graded interview — unchanged from
  -- 20260915110000; see that migration's own comment on this same check for
  -- the full rationale (kept out of this file to avoid drifting two copies
  -- of the same explanation).
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

  -- Let this transaction's write through the applications write-guard —
  -- voice_interview_result is unconditionally guarded regardless of any
  -- trusted_result_enforcement flag (20260915110000's own rule, kept
  -- byte-for-byte through every later protect_application_columns
  -- CREATE OR REPLACE), so this bypass is still required for this write.
  PERFORM set_config('hireflow.in_voice_interview_submit', 'on', true);

  -- voice_interview_transcript / phase_ai_analysis are NOT set here anymore
  -- — VoiceInterviewPhase.tsx calls ava-voice-tools' "record_interview_transcript"
  -- (recordStepResult) right after this RPC returns, the same call the
  -- Ava-ended path already makes, so both paths record
  -- notes.voiceInterviewResult and advance phase/status identically instead
  -- of only one of them doing so.
  UPDATE public.applications
     SET voice_interview_result = evaluation
   WHERE id = p_application_id;

  RETURN evaluation;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_voice_interview_manual_end(uuid, jsonb, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Flip this phase's own flag. Only 'voiceInterviewResult' — never 'phase'.
-- ----------------------------------------------------------------------------
UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'voiceInterviewResult';
