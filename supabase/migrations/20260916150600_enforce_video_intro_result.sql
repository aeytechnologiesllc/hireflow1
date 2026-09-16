-- ============================================================================
-- Trusted step results — part B, video_intro / video_message conversion.
-- ============================================================================
-- VideoIntroPhase.tsx no longer writes notes.videoIntroResult, notes[stepId]
-- (the legacy by-id entry), notes.videoIntroUrl (the flat legacy key
-- autopilot-batch/index.ts:129 and usePendingActionsCount.ts:77 read
-- exclusively), or applications.phase directly from the candidate's own
-- browser session — it now calls the service-role edge function
-- complete-video-intro, which verifies the caller and the uploaded video
-- object, then writes all of that through
-- supabase/functions/_shared/trustedResults.ts's recordStepResult. See
-- docs/TRUSTED-RESULTS.md for the full recipe this conversion follows.
--
-- This flips ONLY the 'videoIntroResult' row in
-- public.trusted_result_enforcement (seeded enforced = false by
-- 20260915140000_trusted_step_results.sql) to enforced = true. That single
-- flag already covers notes.videoIntroUrl too — folded into the same
-- result_key by trusted_result_key_for, not a separate row — and
-- notes[stepId] for any entry whose own `type` is 'video_intro' or the
-- legacy 'video_message' alias. It does NOT touch 'phase' (see
-- docs/TRUSTED-RESULTS.md: that flag flips once, last, only once every
-- phase's own result_key is enforced) or any other phase's own result_key.
--
-- Idempotent: re-running this only re-asserts enforced = true for the same
-- row, which is already its value after the first run.
-- ============================================================================
UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'videoIntroResult';
