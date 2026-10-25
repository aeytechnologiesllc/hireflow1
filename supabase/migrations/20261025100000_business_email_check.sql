-- A business proves its email before its first job goes live (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 2, task 4).
--
-- Supabase Auth confirms nobody's address here (mailer_autoconfirm stays on
-- so applicants are never slowed down), so a business could sign up with
-- anyone's address and put a job live under it: applicants would then apply
-- to, and get emails signed by, a business nobody had checked. Applicants
-- stay as they are. A business is asked once, at its first "Publish":
--
--   - issue_business_email_code(p_user) makes a 6-digit code for that
--     account (the system only: send-notification-email's
--     "business_email_code" kind calls it for whoever is signed in and mails
--     the code to the sign-in address). At most one a minute and five an
--     hour; only a hash is kept, for 15 minutes.
--   - verify_business_email_code(p_code) checks it for the caller: five
--     wrong tries end that code. Right: profiles.email_verified_at is
--     stamped.
--   - business_email_verified(p_user) is the one rule: stamped, or signed in
--     with Google (Google has checked the address), or a platform admin.
--   - jobs_publish_needs_email_check refuses a job going to "published"
--     (insert, or update from any other status) unless the job's business
--     passes, with HINT 'email_not_verified' so the page can open the code
--     screen (src/lib/emailCheck.ts). Service-role writes pass (a write as
--     postgres with no sign-in, such as a cron job, is checked like any other).
--   - profiles.email_verified_at is the server's: a write through the API
--     keeps the old value, the way profiles.email does (20261025040000).
--
-- Every account with the employer role today (15, all from before launch)
-- was never asked and is stamped now, so nothing changes for them. (The plan
-- said "the 15 that published or signed in since October"; only the owner's
-- met that, and the others are pre-launch accounts too.) Hardened later by
-- 20261025130000_business_email_check_hardening.sql. published_jobs_public is left as
-- it is: every way a job becomes published passes through this trigger, so
-- a filter there would only hide jobs this rule already let through.

alter table public.profiles add column if not exists email_verified_at timestamptz;

comment on column public.profiles.email_verified_at is
  'When this account proved its sign-in email with a code (business email check, 20261025100000). Server-written only.';

create or replace function public.profiles_email_verified_from_server()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Not SECURITY DEFINER on purpose (as profiles_email_from_account):
  -- current_user is the caller's role, so the API roles are held to the
  -- rule and the system's own writes (the verify function below, which is
  -- SECURITY DEFINER, migrations, service-role functions) are not.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.email_verified_at := null;
    elsif new.email_verified_at is distinct from old.email_verified_at then
      new.email_verified_at := old.email_verified_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_email_verified_from_server on public.profiles;
create trigger profiles_email_verified_from_server
  before insert or update on public.profiles
  for each row execute function public.profiles_email_verified_from_server();

revoke all on function public.profiles_email_verified_from_server() from public, anon, authenticated;

create table if not exists private.business_email_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  wrong_tries integer not null default 0,
  sent_at timestamptz not null,
  window_started_at timestamptz not null,
  sends_in_window integer not null default 1
);

revoke all on table private.business_email_codes from public, anon, authenticated;

create or replace function public.business_email_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and (
    exists (select 1 from public.profiles p where p.user_id = p_user and p.email_verified_at is not null)
    or exists (select 1 from auth.identities i where i.user_id = p_user and i.provider = 'google')
    or exists (select 1 from public.platform_admins a where a.user_id = p_user)
  );
$$;

revoke all on function public.business_email_verified(uuid) from public, anon, authenticated;

-- For the page: has the signed-in account passed? (Its own account only.)
create or replace function public.my_business_email_verified()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.business_email_verified(auth.uid());
$$;

revoke all on function public.my_business_email_verified() from public, anon;
grant execute on function public.my_business_email_verified() to authenticated;

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
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.business_email_verified(p_user) then
    return jsonb_build_object('ok', false, 'reason', 'already_verified');
  end if;

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

  -- Six digits from gen_random_uuid() (a strong random source; random() is not).
  v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');

  insert into private.business_email_codes as c (user_id, code_hash, expires_at, wrong_tries, sent_at, window_started_at, sends_in_window)
  values (p_user, encode(sha256(convert_to(p_user::text || ':' || v_code, 'UTF8')), 'hex'), v_now + interval '15 minutes', 0, v_now, v_window_start, v_in_window)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        wrong_tries = 0,
        sent_at = excluded.sent_at,
        window_started_at = excluded.window_started_at,
        sends_in_window = excluded.sends_in_window;

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
  if v_row.expires_at <= now() or v_row.wrong_tries >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code !~ '^[0-9]{6}$'
     or encode(sha256(convert_to(v_user::text || ':' || v_code, 'UTF8')), 'hex') <> v_row.code_hash then
    update private.business_email_codes set wrong_tries = wrong_tries + 1 where user_id = v_user;
    return jsonb_build_object('ok', false, 'reason', case when v_row.wrong_tries + 1 >= 5 then 'expired' else 'wrong_code' end,
      'tries_left', greatest(0, 4 - v_row.wrong_tries));
  end if;

  update public.profiles set email_verified_at = now() where user_id = v_user;
  if not found then
    -- Every account gets a profile at sign-up; without one the stamp has
    -- nowhere to go, so the code stays usable and the page says try again.
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
    raise exception 'Confirm your email to put this job live. We''ll send you a 6-digit code.'
      using errcode = 'check_violation', hint = 'email_not_verified';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_publish_needs_email_check on public.jobs;
create trigger jobs_publish_needs_email_check
  before insert or update of status on public.jobs
  for each row execute function public.jobs_publish_needs_email_check();

revoke all on function public.jobs_publish_needs_email_check() from public, anon, authenticated;

-- The businesses that exist today were never asked: stamp them.
update public.profiles p
   set email_verified_at = now()
 where p.email_verified_at is null
   and exists (select 1 from public.user_roles r where r.user_id = p.user_id and r.role = 'employer');
