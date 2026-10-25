-- The business email check, hardened (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 2, task 4; found by the second Pass C review of
-- 20261025100000_business_email_check.sql).
--
-- 1. The stamp is for an ADDRESS. A business could confirm its own address,
--    change its sign-in email to someone else's (Supabase applies the change
--    to auth.users), and keep publishing on the old stamp; or ask for a code
--    at one address and enter it after switching to another. Now:
--      - profiles.email_verified_for keeps the address that was confirmed,
--        and business_email_verified() passes only while it is still the
--        account's sign-in address;
--      - a code remembers where it was sent (sent_to), and is good only while
--        the account still has that address.
-- 2. The code email cannot flood an inbox:
--      - only a business account (the employer role) can ask for one:
--        applicants never need it;
--      - one account's requests are serialised (an advisory lock), so a burst
--        of parallel first requests sends one email, not one each;
--      - at most five codes an hour to one inbox, whatever account asks: the
--        address is normalised (lower case; "+tag" removed; Gmail's dots
--        removed and googlemail.com read as gmail.com), so victim+1@,
--        victim+2@ ... share one limit;
--      - at most 300 codes an hour for everyone together.
--    (send-notification-email also limits each IP to ten an hour, and the
--    email no longer carries the account's name, which its owner types.)
-- 3. Five wrong tries say "used up", not "expired".
-- 4. The publish refusal's words no longer promise a code: some write paths
--    show the message without the code screen.
-- The existing stamps are kept and tied to each account's current address.

alter table public.profiles add column if not exists email_verified_for text;

comment on column public.profiles.email_verified_for is
  'The sign-in address that email_verified_at confirmed. The stamp counts only while this is still the account''s address. Server-written only.';

update public.profiles p
   set email_verified_for = u.email
  from auth.users u
 where u.id = p.user_id
   and p.email_verified_at is not null
   and p.email_verified_for is null;

create or replace function public.profiles_email_verified_from_server()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Not SECURITY DEFINER on purpose: the API roles are held to the rule, the
  -- system's own writes (the SECURITY DEFINER verify function, migrations,
  -- service-role functions) are not.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.email_verified_at := null;
      new.email_verified_for := null;
    else
      if new.email_verified_at is distinct from old.email_verified_at then
        new.email_verified_at := old.email_verified_at;
      end if;
      if new.email_verified_for is distinct from old.email_verified_for then
        new.email_verified_for := old.email_verified_for;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_email_verified_from_server() from public, anon, authenticated;

alter table private.business_email_codes add column if not exists sent_to text;

create table if not exists private.business_email_code_sends (
  id bigint generated always as identity primary key,
  address_key text not null,
  sent_at timestamptz not null default now()
);
create index if not exists business_email_code_sends_key_time on private.business_email_code_sends (address_key, sent_at desc);
create index if not exists business_email_code_sends_time on private.business_email_code_sends (sent_at desc);

revoke all on table private.business_email_code_sends from public, anon, authenticated;

-- One inbox, however it is written: lower case, no "+tag", and for Gmail no
-- dots and googlemail.com read as gmail.com.
create or replace function private.inbox_key(p_email text)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then lower(coalesce(p_email, ''))
    else (
      with parts as (
        select lower(split_part(p_email, '@', 1)) as local_part,
               lower(split_part(p_email, '@', 2)) as domain_part
      ),
      cleaned as (
        select split_part(local_part, '+', 1) as local_part,
               case when domain_part = 'googlemail.com' then 'gmail.com' else domain_part end as domain_part
          from parts
      )
      select case when domain_part = 'gmail.com' then replace(local_part, '.', '') else local_part end || '@' || domain_part
        from cleaned
    )
  end;
$$;

revoke all on function private.inbox_key(text) from public, anon, authenticated;

create or replace function public.business_email_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and (
    exists (
      select 1
        from public.profiles p
        join auth.users u on u.id = p.user_id
       where p.user_id = p_user
         and p.email_verified_at is not null
         and p.email_verified_for is not null
         and lower(p.email_verified_for) = lower(u.email)
    )
    or exists (select 1 from auth.identities i where i.user_id = p_user and i.provider = 'google')
    or exists (select 1 from public.platform_admins a where a.user_id = p_user)
  );
$$;

revoke all on function public.business_email_verified(uuid) from public, anon, authenticated;

create or replace function public.issue_business_email_code(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row private.business_email_codes%rowtype;
  v_now timestamptz := now();
  v_code text;
  v_in_window integer;
  v_window_start timestamptz;
  v_email text;
  v_key text;
  v_inbox_hour integer;
  v_all_hour integer;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  -- One request at a time per account: a burst of first requests used to
  -- find no row to lock and each send an email.
  perform pg_advisory_xact_lock(hashtextextended('business_email_code:' || p_user::text, 0));

  if public.business_email_verified(p_user) then
    return jsonb_build_object('ok', false, 'reason', 'already_verified');
  end if;
  if not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'employer') then
    return jsonb_build_object('ok', false, 'reason', 'not_a_business');
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_address');
  end if;
  v_key := private.inbox_key(v_email);

  select * into v_row from private.business_email_codes where user_id = p_user for update;
  if found then
    if v_row.sent_at > v_now - interval '60 seconds' then
      return jsonb_build_object('ok', false, 'reason', 'too_soon',
        'retry_after', ceil(extract(epoch from (v_row.sent_at + interval '60 seconds' - v_now)))::integer);
    end if;
    if v_row.window_started_at > v_now - interval '1 hour' then
      if v_row.sends_in_window >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'too_many',
          'retry_after', ceil(extract(epoch from (v_row.window_started_at + interval '1 hour' - v_now)))::integer);
      end if;
      v_window_start := v_row.window_started_at;
      v_in_window := v_row.sends_in_window + 1;
    else
      v_window_start := v_now;
      v_in_window := 1;
    end if;
  else
    v_window_start := v_now;
    v_in_window := 1;
  end if;

  -- One inbox, whatever account asks for it.
  select count(*) into v_inbox_hour from private.business_email_code_sends
   where address_key = v_key and sent_at > v_now - interval '1 hour';
  if v_inbox_hour >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many', 'retry_after', 3600);
  end if;
  -- Everyone together.
  select count(*) into v_all_hour from private.business_email_code_sends where sent_at > v_now - interval '1 hour';
  if v_all_hour >= 300 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');

  insert into private.business_email_codes as c (user_id, code_hash, expires_at, wrong_tries, sent_at, window_started_at, sends_in_window, sent_to)
  values (p_user, encode(sha256(convert_to(p_user::text || ':' || v_code, 'UTF8')), 'hex'), v_now + interval '15 minutes', 0, v_now, v_window_start, v_in_window, lower(v_email))
  on conflict (user_id) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        wrong_tries = 0,
        sent_at = excluded.sent_at,
        window_started_at = excluded.window_started_at,
        sends_in_window = excluded.sends_in_window,
        sent_to = excluded.sent_to;

  insert into private.business_email_code_sends (address_key, sent_at) values (v_key, v_now);
  -- Keep the log short: an hour is all any limit reads.
  delete from private.business_email_code_sends where sent_at < v_now - interval '2 hours';

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

revoke all on function public.issue_business_email_code(uuid) from public, anon, authenticated;
grant execute on function public.issue_business_email_code(uuid) to service_role;

create or replace function public.verify_business_email_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row private.business_email_codes%rowtype;
  v_code text := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  v_email text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.business_email_verified(v_user) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into v_row from private.business_email_codes where user_id = v_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_code');
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  -- A code is for the address it went to.
  if v_row.sent_to is null or v_email is null or v_row.sent_to <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'address_changed');
  end if;
  if v_row.wrong_tries >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'used_up');
  end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code !~ '^[0-9]{6}$'
     or encode(sha256(convert_to(v_user::text || ':' || v_code, 'UTF8')), 'hex') <> v_row.code_hash then
    update private.business_email_codes set wrong_tries = wrong_tries + 1 where user_id = v_user;
    return jsonb_build_object('ok', false, 'reason', case when v_row.wrong_tries + 1 >= 5 then 'used_up' else 'wrong_code' end,
      'tries_left', greatest(0, 4 - v_row.wrong_tries));
  end if;

  update public.profiles set email_verified_at = now(), email_verified_for = v_email where user_id = v_user;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  delete from private.business_email_codes where user_id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.verify_business_email_code(text) from public, anon;
grant execute on function public.verify_business_email_code(text) to authenticated;

create or replace function public.jobs_publish_needs_email_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'published'::job_status then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published'::job_status then
    return new;
  end if;
  if auth.role() = 'service_role' then
    return new;
  end if;
  if not public.business_email_verified(new.employer_id) then
    raise exception 'Confirm your email to put this job live: press Publish in the job editor and we''ll send a code to your sign-in address.'
      using errcode = 'check_violation', hint = 'email_not_verified';
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_publish_needs_email_check() from public, anon, authenticated;
