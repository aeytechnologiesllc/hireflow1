-- ============================================================================
-- Typing test — part B of the candidate-trust conversion
-- (docs/TRUSTED-RESULTS.md). TypingTestPhase.tsx used to compute
-- wpm/accuracy/score in the browser from the candidate's own typed text and
-- their own JS-measured elapsed time, then write it straight into
-- applications.notes with a plain candidate-session
-- `supabase.from("applications").update(...)` call — trivially forgeable
-- from devtools. supabase/functions/submit-typing-test now does that
-- grading server-side (off a SERVER-recorded start time, not the client's),
-- via _shared/trustedResults.ts's recordStepResult, and the page's own
-- direct `applications` write is gone. This migration:
--
--   1. creates typing_test_starts — the server clock start-time-per-attempt
--      table submit-typing-test's "start" action writes and "submit"
--      reads, so elapsed time is always measured server-side;
--   2. flips ONLY this phase's own trusted_result_enforcement row
--      (result_key = 'typingTestResult') to enforced = true, now that the
--      client write it protects is actually gone.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and a
-- plain UPDATE keyed by result_key (safe to re-run — always converges on
-- enforced = true, never errors if already true).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. typing_test_starts — server-only, same shape as voice_session_log
--    (20260916140000_voice_session_log.sql) and quiz_attempt_ledger
--    (20260915110000_quiz_answer_keys_server_side.sql): RLS enabled, zero
--    policies for any role including authenticated and anon, so any direct
--    client SELECT/INSERT/UPDATE/DELETE gets zero rows / a denied write.
--    The only reader/writer is submit-typing-test, which uses the
--    service-role admin client and so bypasses RLS entirely.
--
--    One row per (application_id, step_id): "start" upserts on that pair,
--    so pressing "Start typing test" again after "Try again" legitimately
--    resets both started_at and the chosen passage — never leaves a stale
--    start time from an earlier attempt sitting around to be measured
--    against on the next submit.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.typing_test_starts (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  step_id        text NOT NULL,
  target_text    text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT typing_test_starts_application_step_unique UNIQUE (application_id, step_id)
);

CREATE INDEX IF NOT EXISTS typing_test_starts_application_id_idx
  ON public.typing_test_starts (application_id);

ALTER TABLE public.typing_test_starts ENABLE ROW LEVEL SECURITY;

-- Belt-and-braces against Supabase's own default privilege grants on new
-- tables, same reasoning as trusted_result_enforcement
-- (20260915140000_trusted_step_results.sql) and
-- 20260915121000_forgery_policy_lockdown.sql's REVOKE on blueprint_purchases.
-- RLS with no policies already default-denies every authenticated/anon row
-- access; this closes the (irrelevant while RLS is on, but cheap) gap of a
-- future RLS-disabling migration accidentally leaving this table open too.
REVOKE ALL ON public.typing_test_starts FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Flip typingTestResult on. TypingTestPhase.tsx no longer writes
--    notes.typingTestResult / notes[stepId] (type: "typing_test") directly —
--    supabase/functions/submit-typing-test does it via recordStepResult
--    instead, after grading server-side. Only this phase's own result_key —
--    never 'phase', which stays off until every part-B phase conversion has
--    landed (see docs/TRUSTED-RESULTS.md).
-- ----------------------------------------------------------------------------
UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'typingTestResult';
