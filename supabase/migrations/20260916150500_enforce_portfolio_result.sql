-- ============================================================================
-- Trusted step results — Part B, portfolio_upload conversion.
-- ============================================================================
-- PortfolioUploadPhase.tsx no longer writes applications.notes/phase itself
-- (see src/pages/PortfolioUploadPhase.tsx and the rewritten
-- supabase/functions/ai-analyze-portfolio/index.ts, which now verifies the
-- caller and every submitted file's ownership, runs the AI review, and calls
-- supabase/functions/_shared/trustedResults.ts's recordStepResult itself).
-- That server path is live as of this migration, so it is now safe to flip
-- this ONE result_key's enforcement flag on — see
-- supabase/migrations/20260915140000_trusted_step_results.sql and
-- docs/TRUSTED-RESULTS.md for the full mechanism and recipe this follows.
--
-- Flips ONLY 'portfolioResult'. Every other result_key (including 'phase',
-- which stays off until every phase's own conversion has landed) is
-- untouched. Idempotent — safe to run once against the live DB and safe to
-- re-run.
-- ============================================================================

UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'portfolioResult';
