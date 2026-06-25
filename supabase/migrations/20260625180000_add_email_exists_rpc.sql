-- Authoritative email-existence check used by the auth screen to turn
-- Supabase's deliberately-vague "Invalid login credentials" into actionable
-- feedback ("no account" vs "wrong password") and to power the password-reset
-- "email not found" message. SECURITY DEFINER so it can read auth.users.
create extension if not exists pgcrypto;

create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from auth.users where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;
