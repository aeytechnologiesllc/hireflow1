-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Enable the public candidate apply flow.
-- Adds applicant contact fields and opens the two write paths the public
-- /apply/:roleId page needs: create a candidate + submit their application.
-- Mirrors the existing demo-open RLS pattern (public read using(true)); these
-- open INSERT policies are demo-grade — scope to real accounts before launch.

alter table public.candidates add column if not exists email text;
alter table public.candidates add column if not exists phone text;

drop policy if exists "public apply insert candidate" on public.candidates;
create policy "public apply insert candidate" on public.candidates
  for insert with check (true);

drop policy if exists "public apply insert application" on public.applications;
create policy "public apply insert application" on public.applications
  for insert with check (true);
