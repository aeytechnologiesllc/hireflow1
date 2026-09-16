-- ============================================================================
-- Trusted step results — FOUNDATION (Part A of the candidate-trust fix).
-- ============================================================================
-- Today, every phase page (TypingTestPhase, ChatSimulationPhase,
-- ChatInterviewPhase, SalesSimulationPhase, PortfolioUploadPhase,
-- VideoIntroPhase) computes its own result in the browser and writes it
-- straight into applications.notes/phase from the candidate's own session —
-- protect_application_columns() (20260915110000_quiz_answer_keys_server_side.sql)
-- already stops a candidate from touching a quiz result or the Ava
-- scorecard that way, but it deliberately left every other self-reported
-- phase result, and `phase` itself, untouched (see that migration's own
-- "6. Stop a candidate..." comment on `phase`: "Known limit: self-reported
-- phase progression itself is unguarded here").
--
-- This migration is ONLY the trigger-side half of the fix, and it changes
-- NOTHING for today's app by itself: every check it adds is gated behind a
-- row in the new public.trusted_result_enforcement table, and this
-- migration seeds every row enforced = false. A part-B worker converts one
-- phase's writer to call supabase/functions/_shared/trustedResults.ts's
-- recordStepResult (service-role, so none of this trigger applies to it —
-- see the existing auth.role() = 'service_role' bypass below) instead of
-- writing notes/phase from the browser, proves it, and ONLY THEN flips that
-- phase's own row to enforced = true in its own migration. See
-- docs/TRUSTED-RESULTS.md for the full per-phase conversion recipe.
--
-- What gets guarded, once (and only once) its own flag is flipped on:
--
--   result_key             notes key(s) it protects (any casing) / notes
--                           object `type` it protects / column it protects
--   ----------------------  -------------------------------------------------
--   typingTestResult        notes.typingTestResult; type = 'typing_test'
--   chatSimulationResult    notes.chatSimulationResult; type = 'chat_simulation'
--   chatInterviewResult     notes.chatInterviewResult; type = 'chat_interview'
--   salesSimulationResult   notes.salesSimulationResult; type = 'sales_simulation'
--   portfolioResult         notes.portfolioResult; type = 'portfolio_upload'
--   videoIntroResult        notes.videoIntroResult; type IN ('video_intro',
--                           'video_message' — the legacy alias
--                           candidateJourney.ts's own typeMatchesPhase treats
--                           as the same step type)
--   voiceInterviewResult    notes.voiceInterviewResult (CondensedAIAnalysis.tsx
--                           :277 reads this as a notes fallback alongside the
--                           real applications.voice_interview_result column,
--                           which was ALREADY unconditionally guarded by
--                           20260915110000 and stays that way); type =
--                           'voice_interview'; and — see "voice_interview_transcript"
--                           below — applications.voice_interview_transcript
--   phase                  applications.phase itself (see "phase" below)
--
-- notes._trusted (the server-only completion marker recordStepResult writes
-- — see trustedResults.ts's mergeTrustedNotes) is protected UNCONDITIONALLY,
-- not gated behind any individual result_key's enforcement flag: nothing
-- client-side writes this key today (only recordStepResult, service-role,
-- ever does), so blocking every candidate change to it — even before a
-- single phase has been converted — changes nothing for today's app and
-- closes the key outright rather than leaving per-stepType gaps open while
-- part-B conversions land one at a time.
--
-- "phase" (applications.phase directly): guarded only once its OWN row
-- (result_key = 'phase') is enforced = true, deliberately a single global
-- flag, not per-phase — a candidate's own UPDATE almost never carries a
-- phase change relevant to just one step type, and half-enforcing it while
-- some phases still advance `phase` from the browser would break exactly
-- the phases not yet converted. It only makes sense to flip this once EVERY
-- phase writer is server-side (the last part-B migration to land, once
-- typingTestResult/chatSimulationResult/chatInterviewResult/
-- salesSimulationResult/portfolioResult/videoIntroResult/voiceInterviewResult
-- are all enforced too) — see docs/TRUSTED-RESULTS.md.
--
-- Once enforced, a candidate may not change `phase` AT ALL — not "only to
-- known step ids", not "only forward" — full stop. This was checked against
-- every current client-side UPDATE of applications from a candidate route
-- (grepped across src/pages for `.update(` on the applications table):
--
--   - ApplicationFormPhase.tsx's own submit-path update (:985-991,
--     `updateApplication.mutateAsync({ id, notes, cover_letter,
--     status: "pending", ... })`) NEVER sets `phase` at all — only `status`.
--     The row's initial `phase: "application"` is set by JobDetails.tsx's
--     application-creating INSERT (:233-242), which this BEFORE UPDATE
--     trigger never sees in the first place. So there is no legitimate
--     client `phase` transition left to carve an exception out for.
--   - TypingTestPhase.tsx:423-430 writes `phase: application.phase` — a
--     same-value passthrough (`NEW.phase IS DISTINCT FROM OLD.phase` is
--     false), unaffected either way.
--   - ChatSimulationPhase.tsx (:683-689) and SalesSimulationPhase.tsx
--     (:658-661) never touch `phase` in their own update — they let
--     trigger-ava-analysis's autopilotDecision do it server-side already.
--   - VideoIntroPhase.tsx:398, PortfolioUploadPhase.tsx:447 and
--     ChatInterviewPhase.tsx:283 (`.update({ phase: nextStep.id })`) DO
--     advance `phase` directly from the browser today — these are exactly
--     the writes part-B's conversion of those three phases must move
--     server-side before 'phase' can ever be flipped on.
--
-- "voice_interview_transcript": VoiceInterviewPhase.tsx:292-298 writes this
-- column directly from the browser (`{ voice_interview_transcript, phase_ai_analysis }`),
-- and — per that call site's own comment — does so AFTER
-- voice_interview_result has already been set server-side (either by
-- ava-voice-tools' end_interview tool call, or by submit_voice_interview_manual_end,
-- both service-role). So "only while voice_interview_result is null" cannot
-- mean "candidate may never write it once evaluated" without breaking that
-- one legitimate write outright — it is gated the same way as every other
-- voiceInterviewResult-protected surface, behind THAT SAME result_key's
-- enforcement row. A part-B voice_interview conversion that flips
-- voiceInterviewResult on must therefore also move this transcript write
-- server-side (into the same recordStepResult call, or its own
-- service-role write) BEFORE flipping the flag, or it will break the
-- candidate's own interview-end flow the moment it does. Documented as an
-- explicit instruction in docs/TRUSTED-RESULTS.md, not left implicit here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enforcement flags — one row per result_key, every row seeded false.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trusted_result_enforcement (
  result_key text PRIMARY KEY,
  enforced   boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trusted_result_enforcement ENABLE ROW LEVEL SECURITY;

-- No policies at all: RLS default-denies every authenticated/anon row
-- access outright. The two functions below that read it are SECURITY
-- DEFINER (run as the functions' owner, unaffected by RLS or these
-- revokes) — this is belt-and-braces against Supabase's own default
-- privilege grants on new tables, same reasoning as
-- 20260915121000_forgery_policy_lockdown.sql's REVOKE on blueprint_purchases.
REVOKE ALL ON public.trusted_result_enforcement FROM PUBLIC, anon, authenticated;

INSERT INTO public.trusted_result_enforcement (result_key, enforced) VALUES
  ('typingTestResult', false),
  ('chatSimulationResult', false),
  ('chatInterviewResult', false),
  ('salesSimulationResult', false),
  ('portfolioResult', false),
  ('videoIntroResult', false),
  ('voiceInterviewResult', false),
  ('phase', false)
ON CONFLICT (result_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. trusted_result_key_for — the one place the notes-key-name <-> notes
--    type-value <-> enforcement-row mapping documented above lives, so the
--    subset function below (and any future caller) doesn't repeat it.
--    Returns NULL when neither p_key nor p_type names a trusted result.
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
    WHEN lower(p_key) = lower('videoIntroResult')     OR p_type IN ('video_intro', 'video_message') THEN 'videoIntroResult'
    WHEN lower(p_key) = lower('voiceInterviewResult') OR p_type = 'voice_interview'  THEN 'voiceInterviewResult'
    ELSE NULL
  END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. protected_trusted_result_notes_subset — extracts, from a parsed
--    applications.notes object, exactly the entries a candidate may not
--    touch: every result_key entry that is CURRENTLY enforced (per
--    trusted_result_key_for + trusted_result_enforcement), plus notes._trusted
--    in full, UNCONDITIONALLY — not gated behind any per-stepType enforcement
--    flag (see this migration's header comment). An unenforced result_key's
--    entry, or anything this mapping doesn't recognize at all, is left out of
--    the subset, i.e. left fully candidate-writable, same shape as
--    protected_application_notes_subset (20260915110000_quiz_answer_keys_server_side.sql)
--    already does for quiz results. protect_application_columns below calls
--    this once on OLD.notes and once on NEW.notes and compares with
--    IS DISTINCT FROM.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protected_trusted_result_notes_subset(p_notes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result         jsonb := '{}'::jsonb;
  k              text;
  v              jsonb;
  step_key       text;
  is_enforced    boolean;
BEGIN
  IF p_notes IS NULL OR jsonb_typeof(p_notes) <> 'object' THEN
    RETURN result;
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(p_notes) LOOP
    IF k = '_trusted' THEN
      CONTINUE; -- handled separately below, unconditionally, not per-entry
    END IF;

    step_key := public.trusted_result_key_for(k, v ->> 'type');
    IF step_key IS NOT NULL THEN
      SELECT enforced INTO is_enforced FROM public.trusted_result_enforcement WHERE result_key = step_key;
      IF COALESCE(is_enforced, false) THEN
        result := result || jsonb_build_object(k, v);
      END IF;
    END IF;
  END LOOP;

  -- _trusted is a server-only marker no client write can ever legitimately
  -- produce — protected in full, regardless of any individual stepType's
  -- own enforcement flag.
  IF p_notes ? '_trusted' THEN
    result := result || jsonb_build_object('_trusted', p_notes -> '_trusted');
  END IF;

  RETURN result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. protect_application_columns — extended, every existing rule kept
--    byte-for-byte (verified against the live function body with
--    pg_get_functiondef before writing this). Only additions: the `phase`
--    guard (replacing the old migration's "deliberately NOT guarded here"
--    comment with an actual, flag-gated check), the
--    protected_trusted_result_notes_subset comparison alongside the
--    existing quiz/scorecard one, and the voice_interview_transcript guard.
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
  phase_enforced  boolean;
  voice_enforced  boolean;
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

  -- voice_interview_transcript: candidate-writable by default (self-reported,
  -- not a score — VoiceInterviewPhase.tsx:292-298 writes it directly from the
  -- browser after the real evaluation has already landed server-side). Only
  -- once 'voiceInterviewResult' is enforced — meaning part-B's voice_interview
  -- conversion has already moved this write server-side too, per this
  -- migration's header comment — does a candidate lose the ability to touch
  -- it at all once the interview has been evaluated (OLD.voice_interview_result
  -- IS NOT NULL). Before that, or while an interview is still ungraded,
  -- nothing changes here.
  IF NEW.voice_interview_transcript IS DISTINCT FROM OLD.voice_interview_transcript THEN
    SELECT enforced INTO voice_enforced FROM public.trusted_result_enforcement WHERE result_key = 'voiceInterviewResult';
    IF COALESCE(voice_enforced, false) AND OLD.voice_interview_result IS NOT NULL THEN
      RAISE EXCEPTION 'Candidates cannot change voice_interview_transcript once the interview has been evaluated';
    END IF;
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

  -- phase: guarded only once public.trusted_result_enforcement's 'phase'
  -- row is enforced = true — see this migration's header comment for the
  -- full per-call-site audit that justifies allowing NO exception once it
  -- is. Until every phase writer is server-side, this is a no-op and every
  -- auto-mode phase page keeps self-advancing `phase` exactly as before
  -- 20260915110000_quiz_answer_keys_server_side.sql's own "Known limit"
  -- comment on this same line described.
  IF NEW.phase IS DISTINCT FROM OLD.phase THEN
    SELECT enforced INTO phase_enforced FROM public.trusted_result_enforcement WHERE result_key = 'phase';
    IF COALESCE(phase_enforced, false) THEN
      RAISE EXCEPTION 'Candidates cannot change application phase directly';
    END IF;
  END IF;

  -- notes: candidates freely record their own self-reported phase results
  -- (typing test WPM, chat/sales simulation transcripts, video/portfolio
  -- links, ...) — that's out of scope for this fix, UNTIL a given step's
  -- result_key is enforced (see protected_trusted_result_notes_subset
  -- above). A quiz result, or the Ava scorecard, was already fully out of
  -- scope for a candidate to touch (unconditionally, from 20260915110000).
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

    IF public.protected_trusted_result_notes_subset(old_notes)
       IS DISTINCT FROM public.protected_trusted_result_notes_subset(new_notes) THEN
      RAISE EXCEPTION 'Candidates cannot edit a trusted step result directly';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_applications_candidate_writes ON public.applications;
CREATE TRIGGER protect_applications_candidate_writes
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_application_columns();
