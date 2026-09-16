-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- DEMO ONLY: lets the public/anon key publish a role from the Create-role screen.
-- Replace with auth-scoped policies (employer owns role) before launch.
drop policy if exists "demo insert roles" on public.roles;
create policy "demo insert roles" on public.roles for insert with check (true);
