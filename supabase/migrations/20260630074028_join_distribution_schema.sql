-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.
-- NOTE: this table and columns were later removed/superseded by the repo's own
-- 20260715010000_remove_join_distribution.sql. Kept here for an accurate history.

-- JOIN.com (and future providers) job-distribution tracking.
-- One row per (job, provider): records the provider's job id, live status, sync state, and last error.
create table if not exists public.job_distribution_posts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  employer_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'join',
  provider_job_id text,                 -- the provider's (JOIN's) internal job id
  external_id text,                      -- the externalId we send to the provider (the HireFlow job id)
  status text not null default 'draft',  -- draft | ready | publishing | live | offline | needs_attention | archived
  last_synced_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  last_error text,
  raw_provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, provider)
);

create index if not exists idx_jdp_provider_status on public.job_distribution_posts(provider, status);
create index if not exists idx_jdp_employer on public.job_distribution_posts(employer_id);

alter table public.job_distribution_posts enable row level security;

-- Employers can read the distribution status of their own jobs. Writes happen
-- server-side via service-role edge functions (which bypass RLS).
drop policy if exists "employers read own distribution posts" on public.job_distribution_posts;
create policy "employers read own distribution posts"
  on public.job_distribution_posts for select
  using (employer_id = auth.uid());

-- Source tracking on applications so imported (JOIN) candidates are distinguishable
-- and de-duplicated. candidate_id stays NOT NULL — imported applicants get a real
-- candidate user+profile, so they flow through the normal pipeline unchanged.
alter table public.applications
  add column if not exists source text not null default 'hireflow',
  add column if not exists external_provider text,
  add column if not exists external_application_id text;

-- Dedupe guard: never import the same provider application twice.
create unique index if not exists uq_applications_external_app
  on public.applications(external_provider, external_application_id)
  where external_application_id is not null;
