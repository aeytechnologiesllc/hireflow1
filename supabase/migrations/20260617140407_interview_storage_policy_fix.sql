-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

drop policy if exists "demo upload interview audio" on storage.objects;
create policy "demo upload interview audio" on storage.objects
  for insert to anon, authenticated with check (true);
-- allow reading bucket metadata during upload
drop policy if exists "demo read interview bucket" on storage.buckets;
create policy "demo read interview bucket" on storage.buckets
  for select to anon, authenticated using (true);
