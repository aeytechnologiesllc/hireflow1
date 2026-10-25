-- profiles.email always comes from the sign-in account (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 1, task 5).
--
-- "Users can update their own profile" lets a user change any column of
-- their own profile row, email included, and send-notification-email sent
-- to profiles.email: a business could sign up a throwaway applicant, set
-- its profile email to anyone's address, and have HireFlow's own address
-- send them up to the per-hour limit of notification emails with a line of
-- its own text in each, a phishing relay that also damages the sending
-- domain. document-signing recorded the same column as the signer's email.
--
-- Both functions now read the address from auth.users (changed only through
-- Supabase Auth's own confirmed email-change flow). This migration keeps the
-- profiles column honest for everything else that reads it:
--
--   - a write through the API (current_user anon or authenticated) can no
--     longer change profiles.email; the old value is kept silently, so a
--     page that sends the whole row back does not start failing. No page
--     edits it today (the profile page shows the sign-in address read-only);
--   - when an account's address changes in auth.users, its profile follows.
--
-- Existing rows are not rewritten (one of 181 differed on 2026-10-25); the
-- functions no longer depend on this column for where an email goes.

create or replace function public.profiles_email_from_account()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Not SECURITY DEFINER on purpose: current_user is the caller's role, so
  -- the API roles are held to the rule and the system's own writes (the
  -- sync below, migrations, service-role functions) are not.
  if current_user in ('anon', 'authenticated') and new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_email_from_account on public.profiles;
create trigger profiles_email_from_account
  before update of email on public.profiles
  for each row execute function public.profiles_email_from_account();

create or replace function public.sync_profile_email_from_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where user_id = new.id;
  end if;
  return new;
exception when others then
  -- Never let a profile write fail the account change itself.
  raise warning 'sync_profile_email_from_account: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.sync_profile_email_from_account() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email_from_account();
