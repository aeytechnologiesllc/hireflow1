-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Configured screening flow + rigor + openings captured on Create-role.
alter table public.roles
  add column if not exists openings int,
  add column if not exists rigor    text check (rigor in ('easy','medium','hard')),
  add column if not exists flow     jsonb;
