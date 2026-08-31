-- Reconciliation for accounts that exist in auth.users but are missing the
-- public rows a working account needs.
--
-- Background. `handle_new_user` deliberately swallows every exception
-- (`exception when others then raise warning`) so that a failure in profile
-- creation can never block a signup. That is the right trade — a customer who
-- cannot sign up is worse than a customer with a missing row — but it means the
-- failure is silent, and nothing has ever reconciled afterwards.
--
-- 20260826212000_profiles_backfill_and_harden.sql ran a one-time backfill and
-- brought `users_without_profile` to 0. On 2026-08-31 it was 1 again: a user
-- created at 00:38:11 UTC, email-confirmed and signed in, with a real business
-- name in their signup metadata, has no `profiles` row and no `user_roles` row.
-- They were created 13 seconds after that migration replaced the signup trigger.
--
-- Why this matters beyond one row: no profile means no company_name, and a job
-- published by an employer with no company name is withheld from /jobs.xml by the
-- feed quality gate and renders as an anonymous employer to Google. The account
-- looks fine to its owner right up to the moment it silently cannot be found.
--
-- A one-time backfill has now failed to hold twice, so this ships the repair as a
-- callable, idempotent function rather than a bare UPDATE. Run it again any time;
-- it only ever fills gaps and never overwrites a value someone set themselves.

create or replace function public.reconcile_orphaned_profiles()
returns table (profiles_created integer, company_names_filled integer, roles_assigned integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profiles integer := 0;
  v_company  integer := 0;
  v_roles    integer := 0;
begin
  -- 1. Any auth user with no profile at all gets one, from their own signup metadata.
  with inserted as (
    insert into public.profiles (user_id, email, full_name, company_name)
    select
      u.id,
      u.email,
      coalesce(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(trim(u.raw_user_meta_data ->> 'company_name'), '')
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where p.user_id is null
    on conflict (user_id) do nothing
    returning 1
  )
  select count(*) into v_profiles from inserted;

  -- 2. A profile that exists but lost its company name, where the signup metadata
  --    still has it. Never overwrites a non-blank value already on the profile.
  with filled as (
    update public.profiles p
    set company_name = nullif(trim(u.raw_user_meta_data ->> 'company_name'), '')
    from auth.users u
    where u.id = p.user_id
      and nullif(trim(coalesce(p.company_name, '')), '') is null
      and nullif(trim(u.raw_user_meta_data ->> 'company_name'), '') is not null
    returning 1
  )
  select count(*) into v_company from filled;

  -- 3. Role. Only for users who used the EMPLOYER signup form — it is the only
  --    form that collects a business name, so metadata carrying one is reliable
  --    evidence of intent. Deliberately never grants 'developer', the privileged
  --    role; this restores a normal customer account, it does not elevate one.
  with assigned as (
    insert into public.user_roles (user_id, role)
    select u.id, 'employer'::app_role
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    where r.user_id is null
      and nullif(trim(u.raw_user_meta_data ->> 'company_name'), '') is not null
    returning 1
  )
  select count(*) into v_roles from assigned;

  return query select v_profiles, v_company, v_roles;
end;
$$;

revoke all on function public.reconcile_orphaned_profiles() from public, anon, authenticated;

comment on function public.reconcile_orphaned_profiles() is
  'Heals accounts missing profiles/company_name/role rows. Idempotent — only fills gaps. Service-role only.';

-- Heal what is broken right now.
select * from public.reconcile_orphaned_profiles();
