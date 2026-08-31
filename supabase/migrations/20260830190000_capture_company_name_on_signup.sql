-- Root cause fix: profiles.company_name was never captured anywhere for
-- employers — not the sign-up form, not handle_new_user (any revision), not
-- the job-publish flow. Every real employer signs up with company_name NULL,
-- which cascades into: candidates reading the literal string "null" in
-- status-update notifications (src/hooks/useApplications.ts), public job
-- pages falling back to "confidential" for Google for Jobs
-- (JobPostingJsonLd.tsx), and new employers' jobs being silently dropped from
-- the aggregator feed entirely (api/job-feed.mjs quality gate).
--
-- The client now collects a business name at employer sign-up
-- (src/pages/Auth.tsx and src/components/PublishSignupModal.tsx) and passes
-- it through supabase.auth.signUp() as auth metadata under `company_name`
-- (src/hooks/useAuth.tsx). This migration makes profile creation persist it.
--
-- Additive and idempotent — safe to run against a live database with real
-- rows:
--   * CREATE OR REPLACE on functions that already exist (same signatures).
--   * The ON CONFLICT merge never overwrites a company_name an employer
--     already set themselves (e.g. via Settings) — it only fills it in when
--     the existing value is null/blank.
--   * No backfill UPDATE against existing profiles: those accounts signed up
--     before this fix existed, so their auth metadata never contained a
--     company name to recover. (Recovery for those rows is a separate
--     in-app prompt, not a migration.)

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    insert into public.profiles (user_id, email, full_name, company_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_name'), '')
    )
    on conflict (user_id) do update
      set email = coalesce(excluded.email, public.profiles.email),
          company_name = coalesce(public.profiles.company_name, excluded.company_name);
  exception when others then
    raise warning 'handle_new_user: profile insert failed for % (%)', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- Self-healing net (see 20260826212000_profiles_backfill_and_harden.sql) —
-- keep it consistent with the same metadata source.
create or replace function public.ensure_profile_exists(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, email, full_name, company_name)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(trim(u.raw_user_meta_data ->> 'company_name'), '')
  from auth.users u where u.id = p_user_id
  on conflict (user_id) do nothing;
end; $$;
