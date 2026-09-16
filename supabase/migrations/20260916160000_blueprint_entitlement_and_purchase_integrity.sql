-- Improvement Blueprint (the $1.99 candidate coaching report): give the
-- owner's billing launch a single server-side switch, and close a race in
-- how a paid purchase gets recorded.
--
-- (1) ENTITLEMENT SWITCH
--
-- Today ai-generate-performance-report only grants a candidate access to
-- their own report once a `blueprint_purchases` row exists. The owner
-- decided (2026-09-16) the report stays FREE while billing is off (the
-- free tier opened 2026-09-04, migration 20260904110000_free_tier_open) --
-- nothing may sit behind a paywall while billing is off. Rather than have
-- every function guess "is billing on" from environment presence (fragile,
-- and different functions could disagree), this is one row the owner's
-- eventual billing launch flips:
--
--   app_settings.key = 'blueprint_paid', value = 'true'::jsonb
--
-- Default is `false` (free/included), matching the free tier being open on
-- purpose right now. `app_settings` is a small, generic table so it can
-- hold future flags the same way (name each key clearly, scoped to what it
-- gates -- this migration only touches 'blueprint_paid'). Readable by
-- anyone (it is non-sensitive config, and the client needs it to render
-- honest pricing copy), writable only by the service role -- no client can
-- flip their own report from paid to free.
--
-- (2) PURCHASE IDEMPOTENCY
--
-- verify-blueprint-purchase does a check-then-insert (SELECT by
-- stripe_session_id, then INSERT if not found) with no unique constraint
-- backing it, so two near-simultaneous calls for the same Stripe session
-- (a double-click, or the browser retrying, or stripe-webhook racing the
-- redirect-verify path) can both pass the SELECT and both INSERT --
-- duplicate purchase rows for the same payment. A unique index on
-- stripe_session_id lets both writers use
-- `ON CONFLICT (stripe_session_id) DO NOTHING` (supabase-js:
-- `.upsert(..., { onConflict: "stripe_session_id", ignoreDuplicates: true })`)
-- and makes "already recorded" a guarantee instead of a best-effort check.
--
-- Deliberately NOT a partial index (`WHERE stripe_session_id IS NOT NULL`):
-- that reads like the right idea (older/manual rows may have no session id,
-- and a partial index still lets any number of NULLs coexist) but Postgres
-- will only use a partial index as an ON CONFLICT arbiter when the conflict
-- clause repeats the exact same WHERE predicate -- supabase-js's plain
-- `onConflict: "stripe_session_id"` does not, so every upsert would fail
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". A plain (non-partial) unique index needs no such
-- predicate to be inferred AND still allows unlimited NULLs on its own --
-- SQL NULLs are never equal to each other, so uniqueness is simply never
-- violated between two NULL rows.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE UNIQUE INDEX IF NOT
-- EXISTS, INSERT ... ON CONFLICT DO NOTHING. Safe to run against the live
-- database more than once.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings readable by anyone" on public.app_settings;
create policy "app_settings readable by anyone"
  on public.app_settings
  for select
  using (true);

-- No insert/update/delete policy for anon or authenticated: with RLS on and
-- no matching write policy, every client write is denied. Only the
-- service-role key (used by edge functions and the eventual billing admin
-- tooling) can flip a flag -- it bypasses RLS entirely, same as every other
-- server-only table in this repo (voice_session_log, quiz_attempt_ledger).
revoke insert, update, delete on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

insert into public.app_settings (key, value)
values ('blueprint_paid', 'false'::jsonb)
on conflict (key) do nothing;

create unique index if not exists blueprint_purchases_stripe_session_id_key
  on public.blueprint_purchases (stripe_session_id);
