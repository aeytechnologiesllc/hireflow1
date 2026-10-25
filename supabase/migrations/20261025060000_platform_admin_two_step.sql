-- Two-step sign-in for the platform admin (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 1, task 7).
--
-- The platform admin can pause any business, read every help thread and
-- report, and is exempt from the publishing checks. Its sign-in email is in
-- the public repository, and a password was all it took. Supabase Auth's
-- authenticator-app factor (TOTP) is now offered on the admin's Settings
-- page, and once the admin has a verified one, is_platform_admin() answers
-- true only for a session that finished the second step (aal2). Until a
-- factor is verified nothing changes, so turning this on can never lock the
-- admin out; removing the factor (from Settings, after the second step)
-- turns it back off.
--
-- is_platform_admin_account() says whether this account is an admin at all,
-- whatever the session's level, so Settings can show the card and the sign-in
-- page knows to ask for the code.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
    and (
      not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    );
$$;

create or replace function public.is_platform_admin_account()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_platform_admin_account() from public, anon;
grant execute on function public.is_platform_admin_account() to authenticated;
