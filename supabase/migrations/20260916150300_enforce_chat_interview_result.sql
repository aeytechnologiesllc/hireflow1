-- ============================================================================
-- Trusted step results — part B, chat_interview conversion.
-- ============================================================================
-- src/pages/ChatInterviewPhase.tsx no longer writes notes.chatInterviewResult
-- (nor notes[stepId], nor phase/status for this step) from the browser —
-- supabase/functions/ai-chat-interview/index.ts's new "submit" mode grades
-- the transcript server-side (never trusting a client-relayed evaluation),
-- verifies the caller is this application's own candidate, and calls
-- recordStepResult (supabase/functions/_shared/trustedResults.ts) instead.
-- See docs/TRUSTED-RESULTS.md for the conversion recipe this follows.
--
-- This flips ONLY the 'chatInterviewResult' row in
-- public.trusted_result_enforcement — every other result_key (including
-- 'phase', which stays global and flips only once every phase is
-- converted) is untouched. Idempotent: safe to run more than once.
-- ============================================================================
UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'chatInterviewResult';
