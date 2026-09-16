-- ============================================================================
-- Enforce salesSimulationResult — part B of the candidate-trust fix for the
-- Sales Simulation phase (see docs/TRUSTED-RESULTS.md and the foundation
-- migration this depends on, 20260915140000_trusted_step_results.sql).
-- ============================================================================
-- SalesSimulationPhase.tsx (src/pages/SalesSimulationPhase.tsx) no longer
-- writes applications.notes/phase_ai_analysis directly. It now calls the new
-- submit-sales-simulation edge function, which grades the transcript
-- service-role and calls recordStepResult (supabase/functions/_shared/
-- trustedResults.ts) — which independently re-verifies the caller is this
-- application's own candidate and that they've actually reached this step
-- before writing anything. Only now, with that write already moved
-- server-side and proven (scripts/sales_simulation_trusted_result.pglite.test.mjs,
-- scripts/sales_simulation_grading.test.mjs), is it safe to flip this flag —
-- see the foundation migration's own header comment for why flipping it any
-- earlier would have broken the still-client-side writer outright.
--
-- Idempotent: re-running this migration is a no-op the second time (the
-- UPDATE simply re-asserts the same value; no error either way).
-- ============================================================================
UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'salesSimulationResult';
