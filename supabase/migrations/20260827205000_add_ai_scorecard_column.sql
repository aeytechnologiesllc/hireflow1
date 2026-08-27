-- The scoring pipeline's single source of truth: trigger-ava-analysis has been
-- writing applications.ai_scorecard since 2026-07-18, but the column was never
-- created — the whole atomic UPDATE fails with 42703, so no real applicant's
-- score, narrative, or scorecard has persisted since. Additive + nullable:
-- safe on live data.
--
-- Applied to yqklrkpptnhubsnijqze via the MCP on 2026-08-27; this file records it.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS ai_scorecard jsonb;
