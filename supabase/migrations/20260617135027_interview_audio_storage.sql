-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Storage for candidate voice-interview audio. Private bucket; the public apply
-- page uploads with the publishable key, the score-interview edge function reads
-- with the service role. Demo-open insert (scope before launch).
insert into storage.buckets (id, name, public) values ('interviews', 'interviews', false)
  on conflict (id) do nothing;

drop policy if exists "demo upload interview audio" on storage.objects;
create policy "demo upload interview audio" on storage.objects
  for insert with check (bucket_id = 'interviews');
