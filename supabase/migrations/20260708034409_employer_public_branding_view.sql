-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.
-- NOTE: a later migration (20260904112000_employer_public_branding_view_parity.sql)
-- adjusts this view further; kept here for an accurate history.

-- Public, read-only view of employer BRANDING ONLY (company name + logo).
-- Job listings (site, Google for Jobs prerender, /jobs.xml feed) must show the
-- hiring company's name, but the profiles table is rightly RLS-protected — so
-- anon reads silently fell back to "Confidential"/"Private employer".
-- This view intentionally exposes just the two public-by-nature fields.
create or replace view public.employer_public_branding as
  select user_id, company_name, company_logo
  from public.profiles
  where company_name is not null;

grant select on public.employer_public_branding to anon, authenticated;
