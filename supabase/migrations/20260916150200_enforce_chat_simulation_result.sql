-- ============================================================================
-- Trusted step results — Part B: enforce chatSimulationResult.
-- ============================================================================
-- ChatSimulationPhase.tsx no longer writes `applications.notes` (or
-- `phase_ai_analysis`) directly from the browser for this step —
-- supabase/functions/ai-chat-simulation/index.ts's "evaluate" mode now
-- grades the transcript itself (never a client-supplied score) and records
-- the result via recordStepResult (supabase/functions/_shared/trustedResults.ts),
-- service-role, after verifying the caller is this application's own
-- candidate and has actually reached this step. See docs/TRUSTED-RESULTS.md.
--
-- This flips ONLY this phase's own row in trusted_result_enforcement
-- (seeded enforced = false by 20260915140000_trusted_step_results.sql).
-- It does NOT touch 'phase' — that flag flips once, in the final part-B
-- migration, only after every phase's own result_key is enforced too.
--
-- Idempotent: UPDATE ... WHERE result_key = 'chatSimulationResult' is a
-- no-op if the row is already enforced = true (or already missing, though
-- it never should be — the foundation migration seeds it unconditionally).
-- ============================================================================

UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'chatSimulationResult' AND enforced IS DISTINCT FROM true;
