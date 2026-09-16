-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

alter table public.applications
  add column if not exists ai_score double precision,
  add column if not exists ai_scorecard jsonb,
  add column if not exists ai_analysis text,
  add column if not exists notes jsonb,
  add column if not exists status text,
  add column if not exists rejected_by_type text,
  add column if not exists phase_ai_analysis text,
  add column if not exists phase text,
  add column if not exists resume_url text,
  add column if not exists voice_interview_result jsonb;
