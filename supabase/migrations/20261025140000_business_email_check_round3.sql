-- The business email check, third review round (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 2, task 4; found by the third Pass C review of
-- 20261025130000_business_email_check_hardening.sql).
--
-- 1. The code goes where the database says it went. send-notification-email
--    looked the address up again after the code was made, so an address
--    changed in between got a code recorded for the old one: a business
--    could confirm an address it does not own. issue_business_email_code now
--    returns the address it recorded (sent_to), and the function mails that
--    one only.
-- 2. The inbox and the overall limits hold under a burst: requests for one
--    inbox, and the overall count, are serialised with advisory locks (the
--    per-account lock alone let parallel requests from many accounts at one
--    inbox all read "none sent yet").
-- 3. Ten codes an hour and twenty a day per inbox (an account still has its
--    own five an hour), and the wait it reports is the real one, not always
--    an hour. This does not stop a stranger: twenty sign-ups at you+N@ still
--    use up an inbox's day (docs/BUSINESS-TRUST.md, "Known limit"; a bot
--    check on sign-up is the fix).
-- 4. A Google sign-in passes only while its Google address is still the
--    account's sign-in address.
-- 5. A platform admin's own writes (reopening a paused business's jobs) are
--    not refused by the check; the business still confirms before publishing
--    anything itself.

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
    or exists (
      select 1
        from auth.identities i
        join auth.users u on u.id = i.user_id
       where i.user_id = p_user
         and i.provider = 'google'
         and lower(coalesce(i.identity_data ->> 'email', '')) = lower(u.email)
    )
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
  v_inbox_day integer;
  v_oldest timestamptz;
  v_all_hour integer;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  -- One request at a time per account.
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
  -- One request at a time per inbox, and for the overall count.
  perform pg_advisory_xact_lock(hashtextextended('business_email_inbox:' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('business_email_all', 0));

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

  -- One inbox, whatever account asks for it: ten an hour, twenty a day.
  select count(*) filter (where sent_at > v_now - interval '1 hour'),
         count(*),
         min(sent_at) filter (where sent_at > v_now - interval '1 hour')
    into v_inbox_hour, v_inbox_day, v_oldest
    from private.business_email_code_sends
   where address_key = v_key and sent_at > v_now - interval '1 day';
  if v_inbox_hour >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many',
      'retry_after', greatest(60, ceil(extract(epoch from (v_oldest + interval '1 hour' - v_now)))::integer));
  end if;
  if v_inbox_day >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_today');
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
  -- Keep the log short: a day is all any limit reads.
  delete from private.business_email_code_sends where sent_at < v_now - interval '2 days';

  -- The address the code is for: the function mails this one and no other.
  return jsonb_build_object('ok', true, 'code', v_code, 'email', v_email);
end;
$$;

revoke all on function public.issue_business_email_code(uuid) from public, anon, authenticated;
grant execute on function public.issue_business_email_code(uuid) to service_role;

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
  -- The system's own writes, and a platform admin's (reopening a paused
  -- business's jobs), are not the business publishing.
  if auth.role() = 'service_role' or public.is_platform_admin() then
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
