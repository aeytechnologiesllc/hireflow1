-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Make employer cockpit actions real: a decision on an application (offer/pass),
-- sending messages, and marking conversations read. Demo-open write policies
-- (single-tenant demo) — scoped to the authenticated employer in the auth phase.

alter table public.applications add column if not exists decision text
  check (decision in ('offer','passed'));

drop policy if exists "demo update application" on public.applications;
create policy "demo update application" on public.applications
  for update using (true) with check (true);

drop policy if exists "demo insert message" on public.messages;
create policy "demo insert message" on public.messages
  for insert with check (true);

drop policy if exists "demo update conversation" on public.conversations;
create policy "demo update conversation" on public.conversations
  for update using (true) with check (true);
