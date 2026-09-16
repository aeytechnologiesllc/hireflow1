-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

alter table public.jobs
  add column if not exists location_city text,
  add column if not exists location_region text,
  add column if not exists location_country text,
  add column if not exists location_country_code text,
  add column if not exists is_remote boolean not null default false,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists salary_period text,
  add column if not exists locations jsonb;

comment on column public.jobs.locations is 'Optional array of additional structured locations for multi-city/country postings: [{city,region,country,countryCode,lat,lon}]';
