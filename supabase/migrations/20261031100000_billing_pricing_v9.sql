-- Billing, pricing v9 (2026-10-31; docs/BILLING.md; docs/LAUNCH-PLAN.md,
-- "Later → Stripe", steps 2, 3 and the database half of 5).
--
-- THE MODEL (the owner's decisions):
--   - A business's FIRST published job is free, live for 30 days: once per
--     business and once per email address (a one-way fingerprint of the
--     sign-in address outlives the account).
--   - After that, $99 a job keeps that one job live for 30 days, with
--     unlimited applicants.
--   - Or "Unlimited", $299 a month: every job live, unlimited applicants,
--     while the subscription is active; cancel any time. Never two at once.
--   - The owner's own account (the one row in public.platform_admins) never
--     pays and is never gated. platform_admins is the ONLY exemption: never
--     business_pages.home_alias, never subscription_bypass /
--     private.has_subscription_bypass_for_user (guard
--     billing-exemption-is-platform-admins-only).
--
-- THE SWITCH: app_settings.billing_enabled (false since 20260916170000).
-- While it is false NOTHING here changes anything for anyone: the publish
-- check returns before it looks at a single row, the hourly run returns 0,
-- billing_state reports no plan, billing-checkout refuses, and the app shows
-- no price (CLAUDE.md: "Nothing may sit behind a paywall or show a price as
-- due while billing is off"; guard billing-off-changes-nothing;
-- launch_locks_behaviour section 33). The owner turns it on with
-- public.billing_switch_on() (service role only), which also gives each job
-- live at that moment 30 days, once.
--
-- WHO PAYS: the business owner (jobs.employer_id). A teammate acts for the
-- business they are on; the owner's passes and plan cover their jobs. Only
-- the owner starts or manages Unlimited.
--
-- WHAT IS HERE
--   1. billing_on(), billing_exempt(), billing_unlimited_active(),
--      billing_unlimited_end_unconfirmed(), billing_job_has_time(),
--      billing_email_fingerprint(), billing_free_job_available(): the rules,
--      in one place.
--   2. billing_customers (a Stripe customer per business owner, per mode),
--      job_passes (each job's 30 days: free | paid | launch, plus an
--      'unlimited' marker), billing_events (every Stripe event handled, by
--      its id), billing_free_job_emails (the fingerprints), billing_refunds
--      (money HireFlow owes back, and what Stripe said), billing_refunded_payments,
--      billing_checkouts (one open Checkout per business for Unlimited, per
--      job for $99), billing_switch_ons, subscriptions (reused for
--      Unlimited: plan_type 'unlimited'). Owners read their own rows (never
--      a Stripe id); only the service role writes.
--   3. jobs_publish_needs_pass: AFTER INSERT OR UPDATE on jobs, beside
--      jobs_publish_needs_email_check (it sorts after it, so the email
--      refusal comes first) and jobs_publish_needs_good_standing (BEFORE).
--      Refuses a job going live with HINT 'payment_required' unless billing
--      is off, the owner is a platform admin, the job has time left on a
--      pass, the owner has an active Unlimited, or the owner and its email
--      address have never used the free job (then the free pass is recorded,
--      once, under a unique index). Re-opening a closed job is a job going live.
--   4. billing_close_ended_jobs(): pg_cron, hourly. Closes published jobs
--      whose time has ended and tells the owner in the app. It never makes a
--      pass: billing_switch_on() gives the jobs already live their 30 days,
--      once; a live job with no pass is left as it is and the admins are told
--      once a day. An Unlimited whose period ran out closes nothing until
--      billing-sync (pg_cron, hourly) has read it again from Stripe.
--   5. The server's own calls, service role only: billing_state (what
--      get-subscription reports), billing_checkout_check / _begin / _opened /
--      _closed, billing_portal_check, billing_save_customer (billing-checkout,
--      billing-portal), billing_apply_* and the refunds (billing-webhook),
--      billing_sync_* (billing-sync). Each billing_apply_* records the Stripe
--      event id first, in the same transaction as its effect, so a repeated
--      event changes nothing and a failed one leaves no trace.
--   6. The old plan limits are retired: job_limit_for_user,
--      document_workflow_limit_for_user and team_member_limit_for_user are
--      -1 for everyone (v9 prices jobs only; drafts, documents and teammates
--      are never limited), so a business's first publish is the only place
--      money is asked for. The old $49-unlock model's sealing
--      (get_employer_sealed_application_ids) seals nothing. business_has_paid
--      reads real payments, as 20261011100000 said billing would.
--
-- Not applied anywhere yet. Re-runnable.

set lock_timeout = '3s';

-- 1. The rules ---------------------------------------------------------------

-- Billing is on only when the owner has set app_settings.billing_enabled to
-- true. A missing row, a malformed value or anything else is off.
create or replace function public.billing_on()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'billing_enabled'), false);
$$;

-- The one exemption: the platform's own account (public.platform_admins).
create or replace function public.billing_exempt(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_owner is not null and exists (select 1 from public.platform_admins a where a.user_id = p_owner);
$$;

-- 2. The tables ----------------------------------------------------------------

-- A Stripe customer per business owner, one for test mode and one for live
-- (a test-mode customer id means nothing to live mode).
create table if not exists public.billing_customers (
  owner_id uuid not null references auth.users (id) on delete cascade,
  livemode boolean not null,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  primary key (owner_id, livemode)
);

-- The Stripe customers of deleted accounts, remembered when their
-- billing_customers row goes (billing_customers_remember_deleted). An
-- Unlimited Stripe still bills to one of them (a checkout page left open when
-- the account was deleted, paid after) is owed back: cancelled and refunded,
-- never left charging nobody. Only Stripe's id is kept, nothing about a person.
create table if not exists public.billing_deleted_customers (
  stripe_customer_id text primary key,
  livemode boolean not null,
  deleted_at timestamptz not null default now()
);

-- Each job's time live. kind:
--   free      the business's first published job, 30 days (one per owner)
--   paid      $99, 30 days, from the payment (or from the end of time still
--             left on the job, so a payment made twice is never lost)
--   launch    a job already live when billing was first turned on
--             (billing_switch_on): 30 days from then, once per job, ever
--   unlimited a marker: this job went live under Unlimited. It has no end of
--             its own; when Unlimited ends, the hourly run closes the job.
-- A job's passes outlive the job (job_id goes NULL), so deleting the free job
-- never frees the free job again; and a payment's record outlives the
-- account (owner_id goes NULL), while the account's own data goes.
create table if not exists public.job_passes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('free', 'paid', 'launch', 'unlimited')),
  status text not null default 'active' check (status in ('active', 'ended', 'refunded')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text,
  livemode boolean,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_passes_end_matches_kind check ((kind = 'unlimited') = (ends_at is null))
);

create unique index if not exists job_passes_one_free_job on public.job_passes (owner_id) where kind = 'free';
create unique index if not exists job_passes_one_launch_per_job on public.job_passes (job_id) where kind = 'launch';
create index if not exists job_passes_job_idx on public.job_passes (job_id);
create index if not exists job_passes_owner_idx on public.job_passes (owner_id);
create index if not exists job_passes_payment_intent_idx on public.job_passes (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

drop trigger if exists update_job_passes_updated_at on public.job_passes;
create trigger update_job_passes_updated_at before update on public.job_passes
  for each row execute function public.update_updated_at_column();

-- Every Stripe event handled, by Stripe's own id: a repeat is recognised and
-- changes nothing.
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  livemode boolean,
  outcome text,
  received_at timestamptz not null default now()
);

-- The free job is once per email address, not once per account: a one-way
-- fingerprint (sha256) of the normalised sign-in address, kept when the
-- account is deleted (billing_email_fingerprint). Nothing else about the
-- address or the account is kept here.
create table if not exists public.billing_free_job_emails (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz not null default now()
);

-- Money HireFlow owes back: a payment for a job that was deleted, or that
-- the server cannot match to its business (job_payment), or a second
-- Unlimited (second_subscription, cancelled too). billing-webhook refunds it
-- in Stripe and reports here; until Stripe says done it is owed, and
-- Stripe's retry of the event tries again.
create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  kind text not null check (kind in ('job_payment', 'second_subscription')),
  reason text not null,
  owner_id uuid references auth.users (id) on delete set null,
  job_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  amount_cents integer,
  currency text,
  livemode boolean,
  status text not null default 'owed' check (status in ('owed', 'done', 'failed')),
  stripe_refund_ids text,
  tries integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create unique index if not exists billing_refunds_one_per_payment on public.billing_refunds (stripe_payment_intent_id) where kind = 'job_payment';
create unique index if not exists billing_refunds_one_per_subscription on public.billing_refunds (stripe_subscription_id) where kind = 'second_subscription';
create index if not exists billing_refunds_event_idx on public.billing_refunds (event_id);

-- Payments Stripe has refunded in full (charge.refunded). A payment's own
-- event that arrives after its refund (a retried delivery) puts nothing live.
create table if not exists public.billing_refunded_payments (
  stripe_payment_intent_id text primary key,
  refunded_at timestamptz not null default now()
);

-- Checkout pages billing-checkout opened: at most one open for Unlimited per
-- business and one for $99 per job (claim_key), the earlier expired in
-- Stripe before a new one is made; two requests at the same moment cannot
-- both open one (billing_checkout_begin).
create table if not exists public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('job', 'unlimited')),
  job_id uuid,
  livemode boolean not null,
  status text not null default 'opening' check (status in ('opening', 'open', 'failed', 'expired', 'complete')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz
);
create unique index if not exists billing_checkouts_one_opening on public.billing_checkouts (claim_key) where status = 'opening';
create index if not exists billing_checkouts_claim_idx on public.billing_checkouts (claim_key, status);

-- Each time billing was switched on (billing_switch_on): when, and whether
-- that was the first time (the only one that gives jobs already live 30 days).
create table if not exists public.billing_switch_ons (
  id bigserial primary key,
  switched_on_at timestamptz not null default now(),
  first boolean not null,
  grandfathered integer not null default 0
);

-- Unlimited lives on the existing subscriptions row (one per user):
-- plan_type 'unlimited', Stripe's status and period. The old 'trial' rows are
-- never Unlimited. past_due_since: when it first went past_due (cleared when
-- paid). stripe_checked_at: when it was last read from Stripe (billing-webhook
-- and billing-sync).
alter table public.subscriptions add column if not exists livemode boolean;
alter table public.subscriptions add column if not exists past_due_since timestamptz;
alter table public.subscriptions add column if not exists stripe_checked_at timestamptz;

-- Who reads what. Owners read their own customer and passes, and their team
-- reads the passes of the jobs they are on (days left on the job page),
-- never a Stripe id (the columns are not granted). The rest is nobody's but
-- the server's. Nobody but the service role writes any of it (it bypasses
-- RLS; no write policy exists).
alter table public.billing_customers enable row level security;
alter table public.job_passes enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_free_job_emails enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_refunded_payments enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_switch_ons enable row level security;
alter table public.billing_deleted_customers enable row level security;

drop policy if exists "Owners read their own billing customer" on public.billing_customers;
create policy "Owners read their own billing customer" on public.billing_customers
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "Owners and their team read job passes" on public.job_passes;
create policy "Owners and their team read job passes" on public.job_passes
  for select to authenticated
  using (owner_id = auth.uid() or (job_id is not null and public.is_active_team_member_for_job(job_id, auth.uid())));

revoke all on table public.billing_customers from public, anon, authenticated;
revoke all on table public.job_passes from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.billing_free_job_emails from public, anon, authenticated;
revoke all on table public.billing_refunds from public, anon, authenticated;
revoke all on table public.billing_refunded_payments from public, anon, authenticated;
revoke all on table public.billing_checkouts from public, anon, authenticated;
revoke all on table public.billing_switch_ons from public, anon, authenticated;
revoke all on table public.billing_deleted_customers from public, anon, authenticated;
grant select on table public.billing_customers to authenticated;
grant select (id, job_id, owner_id, kind, status, starts_at, ends_at, ended_at, created_at, updated_at) on table public.job_passes to authenticated;
grant all on table public.billing_customers, public.job_passes, public.billing_events, public.billing_free_job_emails,
  public.billing_refunds, public.billing_refunded_payments, public.billing_checkouts, public.billing_switch_ons,
  public.billing_deleted_customers to service_role;
grant usage, select on sequence public.billing_switch_ons_id_seq to service_role;

-- subscriptions: still only the onboarding flag for a browser (20260827210000).
revoke insert, delete on public.subscriptions from anon, authenticated;
revoke update on public.subscriptions from anon, authenticated;
grant update (onboarding_completed) on public.subscriptions to authenticated;

-- 1 (continued). The rules that read the tables ----------------------------------

-- Unlimited is active while Stripe says so and its period has not run out (a
-- day's grace, so a renewal whose webhook is late closes nothing). A payment
-- Stripe is still retrying (past_due) counts for 7 days from when it went
-- past_due, no longer. The old 'trial' / 'trialing' rows never count.
create or replace function public.billing_unlimited_active(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_owner is not null and exists (
    select 1 from public.subscriptions s
     where s.user_id = p_owner
       and s.plan_type = 'unlimited'
       and s.status in ('active', 'trialing', 'past_due')
       and (s.status <> 'past_due' or s.past_due_since > now() - interval '7 days')
       and s.current_period_end is not null
       and s.current_period_end > now() - interval '1 day'
  );
$$;

-- Unlimited no longer counts, but only by the database's own clock: Stripe
-- still said it was billing (active, trialing or past_due) when it was last
-- read, and it has not been read again since it stopped counting (its period
-- end, or 7 days past_due). The hourly run closes nothing of such a business
-- until billing-sync has read it again (a webhook missed across a renewal
-- must never close the jobs of a business Stripe has just charged).
create or replace function public.billing_unlimited_end_unconfirmed(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_owner is not null and not public.billing_unlimited_active(p_owner) and exists (
    select 1 from public.subscriptions s
     where s.user_id = p_owner
       and s.plan_type = 'unlimited'
       and s.stripe_subscription_id is not null
       and s.status in ('active', 'trialing', 'past_due')
       and (s.stripe_checked_at is null
            or s.stripe_checked_at <= least(coalesce(s.current_period_end, 'infinity'::timestamptz),
                                            case when s.status = 'past_due' then coalesce(s.past_due_since + interval '7 days', 'infinity'::timestamptz)
                                                 else 'infinity'::timestamptz end))
  );
$$;

-- A job has time left: a free, paid or launch pass, not ended or refunded,
-- whose end is still ahead.
create or replace function public.billing_job_has_time(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_job is not null and exists (
    select 1 from public.job_passes p
     where p.job_id = p_job
       and p.kind in ('free', 'paid', 'launch')
       and p.status = 'active'
       and p.ends_at > now()
  );
$$;

-- The one-way fingerprint of an email address for the free job: lower case,
-- no "+tag", and for Gmail no dots and one domain (gmail.com and
-- googlemail.com are the same inbox), then sha256 with HireFlow's own label.
-- NULL for something that is not an address.
create or replace function public.billing_email_fingerprint(p_email text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_email, '')));
  v_at integer;
  v_local text;
  v_domain text;
begin
  v_at := strpos(reverse(v), '@');
  if v = '' or v_at = 0 then
    return null;
  end if;
  v_local := left(v, length(v) - v_at);
  v_domain := right(v, v_at - 1);
  v_local := split_part(v_local, '+', 1);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  if v_local = '' or v_domain = '' then
    return null;
  end if;
  return encode(sha256(convert_to('hireflow:free-job:' || v_local || '@' || v_domain, 'UTF8')), 'hex');
end;
$$;

-- The free job is still there: neither this business nor its sign-in email
-- address (by its fingerprint, whatever account used it) has used it.
create or replace function public.billing_free_job_available(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_owner is not null
     and not exists (select 1 from public.job_passes p where p.owner_id = p_owner and p.kind = 'free')
     and coalesce((select not exists (select 1 from public.billing_free_job_emails e where e.email_hash = public.billing_email_fingerprint(u.email))
                          and public.billing_email_fingerprint(u.email) is not null
                     from auth.users u where u.id = p_owner), false);
$$;

revoke all on function public.billing_on() from public, anon, authenticated;
revoke all on function public.billing_exempt(uuid) from public, anon, authenticated;
revoke all on function public.billing_unlimited_active(uuid) from public, anon, authenticated;
revoke all on function public.billing_unlimited_end_unconfirmed(uuid) from public, anon, authenticated;
revoke all on function public.billing_job_has_time(uuid) from public, anon, authenticated;
revoke all on function public.billing_email_fingerprint(text) from public, anon, authenticated;
revoke all on function public.billing_free_job_available(uuid) from public, anon, authenticated;
grant execute on function public.billing_on(), public.billing_exempt(uuid), public.billing_unlimited_active(uuid),
  public.billing_unlimited_end_unconfirmed(uuid), public.billing_job_has_time(uuid), public.billing_email_fingerprint(text),
  public.billing_free_job_available(uuid) to service_role;

-- The platform admins are told, in the app. With a key, at most once a day
-- (claim_daily_alert). Reads platform_admins only to address the card.
create or replace function public.billing_alert_admins(p_key text, p_title text, p_message text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_key is not null and not public.claim_daily_alert(left(p_key, 200)) then
    return false;
  end if;
  insert into public.notifications (user_id, type, title, message, link, is_read)
  select a.user_id, 'system', left(coalesce(p_title, 'Billing'), 160), left(coalesce(p_message, ''), 600), '/admin', false
    from public.platform_admins a;
  return true;
end;
$$;

-- 3. The publish check -----------------------------------------------------------

create or replace function public.jobs_publish_needs_pass()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := new.employer_id;
  v_taken integer;
  v_fingerprint text;
begin
  -- Only a job going live: an insert as published, or any other status to published.
  if new.status is distinct from 'published'::job_status then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published'::job_status then
    return null;
  end if;
  -- Billing off: nothing changes for anyone.
  if not public.billing_on() then
    return null;
  end if;
  -- The platform's own account never pays (platform_admins, the only exemption).
  if public.billing_exempt(v_owner) then
    return null;
  end if;
  -- The system's own writes (billing-webhook puts a paid job live after
  -- recording its pass) and a platform admin reopening a paused business's
  -- jobs are not the business publishing. Nothing else is: a write with no
  -- role at all is checked like any other. A job they put live with no
  -- pass is left live and the admins are told (billing_close_for).
  if auth.role() = 'service_role' or public.is_platform_admin() then
    return null;
  end if;
  -- Time left on this job's own pass (re-opening a job closed early).
  if public.billing_job_has_time(new.id) then
    return null;
  end if;
  -- Unlimited covers every job while it lasts; the marker lets the hourly run
  -- close the job when it ends.
  if public.billing_unlimited_active(v_owner) then
    insert into public.job_passes (job_id, owner_id, kind)
    select new.id, v_owner, 'unlimited'
     where not exists (select 1 from public.job_passes p where p.job_id = new.id and p.kind = 'unlimited' and p.status = 'active');
    return null;
  end if;
  -- The first job is free, once per business (job_passes_one_free_job: two
  -- publishes at the same moment cannot both take it) and once per email
  -- address: the fingerprint of the sign-in address, which the email check
  -- before this one has just confirmed (billing_free_job_emails outlives the
  -- account, so deleting it and signing up again, or a "+tag", is no new
  -- free job). Refused, both inserts are undone with the publish.
  insert into public.job_passes (job_id, owner_id, kind, starts_at, ends_at)
  values (new.id, v_owner, 'free', now(), now() + interval '30 days')
  on conflict (owner_id) where kind = 'free' do nothing;
  get diagnostics v_taken = row_count;
  if v_taken > 0 then
    v_fingerprint := public.billing_email_fingerprint((select u.email from auth.users u where u.id = v_owner));
    if v_fingerprint is not null then
      insert into public.billing_free_job_emails (email_hash) values (v_fingerprint) on conflict (email_hash) do nothing;
      get diagnostics v_taken = row_count;
      if v_taken > 0 then
        return null;
      end if;
    end if;
  end if;
  raise exception 'Your free job is used. Pay for this job, or go Unlimited, to put it live.'
    using errcode = 'check_violation', hint = 'payment_required';
end;
$$;

revoke all on function public.jobs_publish_needs_pass() from public, anon, authenticated;

drop trigger if exists jobs_publish_needs_pass on public.jobs;
create trigger jobs_publish_needs_pass
  after insert or update on public.jobs
  for each row execute function public.jobs_publish_needs_pass();

-- 4. The hourly run ----------------------------------------------------------------

-- Closes what nothing covers any more, for one owner or (NULL) everyone, and
-- tells each owner in the app. Returns how many jobs it closed. It never makes
-- a pass. A live job with no pass at all (one put live by the server or a
-- platform admin, or while billing was off after it had been on) is left as
-- it is, and the admins are told once a day. A business whose Unlimited has
-- run out only by the database's clock is left until billing-sync reads it
-- again (billing_unlimited_end_unconfirmed).
create or replace function public.billing_close_for(p_owner uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_closed integer := 0;
  v_unlimited_closed jsonb := '{}'::jsonb;
  v_owner text;
  v_count integer;
  v_no_pass integer;
begin
  if not public.billing_on() then
    return 0;
  end if;

  -- Passes whose 30 days are over.
  update public.job_passes
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where status = 'active'
     and kind in ('free', 'paid', 'launch')
     and ends_at <= now()
     and (p_owner is null or owner_id = p_owner);

  for r in
    select j.id, j.employer_id, j.title,
           exists (select 1 from public.job_passes p where p.job_id = j.id and p.kind in ('free', 'paid', 'launch')) as had_days
      from public.jobs j
     where j.status = 'published'::job_status
       and (p_owner is null or j.employer_id = p_owner)
       and not public.billing_exempt(j.employer_id)
       and exists (select 1 from public.job_passes p where p.job_id = j.id)
       and not public.billing_unlimited_active(j.employer_id)
       and not public.billing_unlimited_end_unconfirmed(j.employer_id)
       and not public.billing_job_has_time(j.id)
     order by j.employer_id, j.created_at
       for no key update of j skip locked
  loop
    update public.jobs set status = 'closed'::job_status where id = r.id and status = 'published'::job_status;
    if not found then
      continue;
    end if;
    update public.job_passes set status = 'ended', ended_at = coalesce(ended_at, now())
     where job_id = r.id and kind = 'unlimited' and status = 'active';
    v_closed := v_closed + 1;
    if r.had_days then
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (r.employer_id, 'system', 'Your job''s 30 days have ended',
              left(format('"%s" is closed now. Everyone who applied is still there. Post it again to keep hiring.', left(coalesce(r.title, 'Your job'), 80)), 500),
              '/jobs/' || r.id::text, false);
    else
      v_unlimited_closed := jsonb_set(v_unlimited_closed, array[r.employer_id::text],
        to_jsonb(coalesce((v_unlimited_closed ->> r.employer_id::text)::integer, 0) + 1));
    end if;
  end loop;

  -- Unlimited ended (or its payment failed for 7 days): one card for each
  -- owner, however many jobs it closed.
  for v_owner, v_count in select key, value::integer from jsonb_each_text(v_unlimited_closed)
  loop
    if exists (select 1 from public.subscriptions s where s.user_id = v_owner::uuid and s.plan_type = 'unlimited' and s.status = 'past_due') then
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (v_owner::uuid, 'system', 'Your Unlimited payment didn''t go through',
              case when v_count = 1
                then 'We couldn''t take your Unlimited payment for 7 days, so your live job is closed. Everyone who applied is still there. Update your card in Settings, under Billing, then post it again.'
                else format('We couldn''t take your Unlimited payment for 7 days, so your %s live jobs are closed. Everyone who applied is still there. Update your card in Settings, under Billing, then post them again.', v_count) end,
              '/settings', false);
    else
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (v_owner::uuid, 'system', 'Your Unlimited plan has ended',
              case when v_count = 1
                then 'Your live job is closed now. Everyone who applied is still there. Post it again to keep hiring.'
                else format('Your %s live jobs are closed now. Everyone who applied is still there. Post one again to keep hiring.', v_count) end,
              '/jobs', false);
    end if;
  end loop;

  -- Live with no pass at all: never closed here, never given days; the
  -- admins look (once a day).
  if p_owner is null then
    select count(*)::integer into v_no_pass
      from public.jobs j
     where j.status = 'published'::job_status
       and not public.billing_exempt(j.employer_id)
       and not exists (select 1 from public.job_passes p where p.job_id = j.id);
    if v_no_pass > 0 then
      perform public.billing_alert_admins('billing:live-without-pass', 'Live jobs with no pass',
        format('%s live job(s) have no pass: put live by the server or an admin, or while billing was off. They stay live until you close them or the business pays. Open Admin to look.', v_no_pass));
    end if;
  end if;

  return v_closed;
end;
$$;

create or replace function public.billing_close_ended_jobs()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.billing_close_for(null);
$$;

revoke all on function public.billing_close_for(uuid) from public, anon, authenticated;
revoke all on function public.billing_close_ended_jobs() from public, anon, authenticated;
grant execute on function public.billing_close_ended_jobs() to service_role;

-- Turning billing on (the owner, last: docs/BILLING.md, "Going live"). The
-- first time ever, each job live at that moment that has never had a pass
-- gets 30 days from then (a launch pass, once per job, ever), so nothing
-- closes unannounced. Later times give nothing: a job put live while billing
-- was off since is left live with no pass and the admins are told
-- (billing_close_for). Service role only; no migration calls it.
create or replace function public.billing_switch_on()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_first boolean;
  v_given integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing_switch_on', 0));
  v_first := not exists (select 1 from public.billing_switch_ons);
  insert into public.app_settings (key, value, updated_at) values ('billing_enabled', 'true'::jsonb, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  if v_first then
    insert into public.job_passes (job_id, owner_id, kind, starts_at, ends_at)
    select j.id, j.employer_id, 'launch', now(), now() + interval '30 days'
      from public.jobs j
     where j.status = 'published'::job_status
       and not public.billing_exempt(j.employer_id)
       and not exists (select 1 from public.job_passes p where p.job_id = j.id)
    on conflict do nothing;
    get diagnostics v_given = row_count;
  end if;
  insert into public.billing_switch_ons (first, grandfathered) values (v_first, v_given);
  return jsonb_build_object('ok', true, 'first', v_first, 'grandfathered', v_given);
end;
$$;

revoke all on function public.billing_switch_on() from public, anon, authenticated;
grant execute on function public.billing_switch_on() to service_role;

-- billing-sync (pg_cron, hourly) proves it is the scheduler with a secret made
-- here, inside the database, and kept only in Vault ('billing_sync_secret'),
-- as document-cleanup does (20261010150100). Never in this file, the repo or
-- a function setting.
do $$
begin
  if to_regclass('vault.secrets') is not null then
    if not exists (select 1 from vault.secrets where name = 'billing_sync_secret') then
      perform vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'billing_sync_secret',
        'Sent by the billing-sync pg_cron job; checked by public.billing_sync_secret_matches'
      );
    end if;
  end if;
end $$;

-- plpgsql, so a database with no Vault (a test's stand-in) can still make it.
create or replace function public.billing_sync_secret_matches(p_given text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce(
    length(p_given) >= 32
      and p_given = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'billing_sync_secret' limit 1),
    false
  );
end;
$$;

revoke all on function public.billing_sync_secret_matches(text) from public, anon, authenticated;
grant execute on function public.billing_sync_secret_matches(text) to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if exists (select 1 from cron.job where jobname = 'billing-close-ended-jobs') then
      perform cron.unschedule('billing-close-ended-jobs');
    end if;
    perform cron.schedule('billing-close-ended-jobs', '17 * * * *', 'select public.billing_close_ended_jobs()');
    -- Ten minutes before it, billing-sync reads again from Stripe every
    -- Unlimited whose period has ended or ends within a day.
    if exists (select 1 from cron.job where jobname = 'billing-sync') then
      perform cron.unschedule('billing-sync');
    end if;
    perform cron.schedule('billing-sync', '7 * * * *', $job$
      select net.http_post(
        url := 'https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/billing-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-billing-sync-secret', coalesce(
            (select decrypted_secret from vault.decrypted_secrets where name = 'billing_sync_secret' limit 1),
            ''
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$);
  end if;
end $$;

-- 5. The server's own calls ----------------------------------------------------------

-- What get-subscription reports for a business. With billing off: only that it
-- is off (no plan, no prices, nothing to show). p_viewer is who asks: the
-- owner (or the server, NULL) sees every job's days; a teammate only those
-- of the jobs they are on.
create or replace function public.billing_state(p_owner uuid, p_viewer uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exempt boolean := public.billing_exempt(p_owner);
  v_sub public.subscriptions%rowtype;
  v_has_sub boolean;
  v_jobs jsonb;
begin
  if p_owner is null then
    return null;
  end if;
  if not public.billing_on() then
    return jsonb_build_object('billingEnabled', false, 'exempt', v_exempt, 'plan', null, 'freeJobAvailable', null,
      'unlimited', null, 'hasCustomer', false, 'jobs', '{}'::jsonb);
  end if;

  select * into v_sub from public.subscriptions s where s.user_id = p_owner and s.plan_type = 'unlimited';
  v_has_sub := found;

  select coalesce(jsonb_object_agg(j.id::text, jsonb_build_object(
           'kind', (select p.kind from public.job_passes p where p.job_id = j.id and p.status <> 'refunded'
                     order by (p.kind = 'unlimited'), p.ends_at desc nulls last, p.created_at desc limit 1),
           'endsAt', (select max(p.ends_at) from public.job_passes p where p.job_id = j.id and p.kind in ('free', 'paid', 'launch') and p.status <> 'refunded'),
           'timeLeft', public.billing_job_has_time(j.id),
           'refunded', exists (select 1 from public.job_passes p where p.job_id = j.id and p.status = 'refunded')
         )), '{}'::jsonb)
    into v_jobs
    from public.jobs j
   where j.employer_id = p_owner
     and exists (select 1 from public.job_passes p where p.job_id = j.id)
     and (p_viewer is null or p_viewer = p_owner or public.is_active_team_member_for_job(j.id, p_viewer));

  return jsonb_build_object(
    'billingEnabled', true,
    'exempt', v_exempt,
    'plan', case when public.billing_unlimited_active(p_owner) then 'unlimited' else 'pay_per_job' end,
    'freeJobAvailable', not v_exempt and public.billing_free_job_available(p_owner),
    'unlimited', case when v_has_sub then jsonb_build_object(
        'status', v_sub.status,
        'active', public.billing_unlimited_active(p_owner),
        'periodEnd', v_sub.current_period_end,
        'cancelAtPeriodEnd', coalesce(v_sub.cancel_at_period_end, false)) end,
    'hasCustomer', exists (select 1 from public.billing_customers c where c.owner_id = p_owner),
    'jobs', v_jobs
  );
end;
$$;

-- The business a signed-in account pays for: its own as an owner, or the one
-- whose team it is on when it may create jobs (as it may publish them).
create or replace function public.billing_business_of(p_caller uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_caller is null then null
    when exists (select 1 from public.user_roles r where r.user_id = p_caller and r.role = 'employer') then p_caller
    else (select tm.employer_id from public.team_members tm
           where tm.user_id = p_caller and tm.status = 'active' and tm.can_create_jobs = true
           order by tm.joined_at desc nulls last limit 1)
  end;
$$;

-- billing-checkout asks before it talks to Stripe. kind 'job' needs one of the
-- business's own jobs with no time left on it (live or not); 'unlimited' is
-- the owner's own to start, never a second, and may name a job (it goes live
-- when Unlimited starts).
create or replace function public.billing_checkout_check(p_caller uuid, p_kind text, p_job uuid, p_livemode boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.billing_business_of(p_caller);
  v_job public.jobs%rowtype;
  v_email text;
  v_company text;
begin
  if not public.billing_on() then
    return jsonb_build_object('ok', false, 'reason', 'billing_off');
  end if;
  if p_kind is null or p_kind not in ('job', 'unlimited') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_hiring_account');
  end if;
  if public.billing_exempt(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'exempt');
  end if;
  -- Unlimited is started and cancelled by the owner (the billing portal is theirs only).
  if p_kind = 'unlimited' and p_caller is distinct from v_owner then
    return jsonb_build_object('ok', false, 'reason', 'owner_only');
  end if;
  if p_kind = 'job' and p_job is null then
    return jsonb_build_object('ok', false, 'reason', 'job_not_found');
  end if;
  if p_job is not null then
    select * into v_job from public.jobs j where j.id = p_job;
    if not found or v_job.employer_id is distinct from v_owner
       or (p_caller <> v_owner and not exists (
             select 1 from public.team_members tm
              where tm.user_id = p_caller and tm.employer_id = v_owner and tm.status = 'active' and tm.can_create_jobs = true
                and (array_length(tm.assigned_job_ids, 1) is null or p_job = any (tm.assigned_job_ids)))) then
      return jsonb_build_object('ok', false, 'reason', 'job_not_found');
    end if;
  end if;
  if p_kind = 'unlimited' and public.billing_unlimited_active(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'already_unlimited');
  end if;
  -- One Unlimited at a time: one Stripe still says is on, or is still trying
  -- to charge, is one already (billing-checkout asks Stripe too).
  if p_kind = 'unlimited' and exists (select 1 from public.subscriptions s where s.user_id = v_owner and s.plan_type = 'unlimited'
       and s.stripe_subscription_id is not null and s.status in ('active', 'trialing')) then
    return jsonb_build_object('ok', false, 'reason', 'already_unlimited');
  end if;
  if p_kind = 'unlimited' and exists (select 1 from public.subscriptions s where s.user_id = v_owner and s.plan_type = 'unlimited'
       and s.stripe_subscription_id is not null and s.status in ('past_due', 'unpaid', 'incomplete')) then
    return jsonb_build_object('ok', false, 'reason', 'unlimited_retrying');
  end if;
  if p_kind = 'job' and public.billing_unlimited_active(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'unlimited_active');
  end if;
  -- Days still paid for on this job, live or closed: publishing it is free.
  if p_kind = 'job' and public.billing_job_has_time(p_job) then
    return jsonb_build_object('ok', false, 'reason', 'job_has_time');
  end if;
  -- The first job is free: publishing it takes the free job, nothing to pay.
  if p_kind = 'job' and public.billing_free_job_available(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'free_job_available');
  end if;
  -- What publishing needs besides money, so nobody pays for a job that
  -- cannot go live (the webhook would leave it as it is).
  if not public.business_email_verified(v_owner) then
    return jsonb_build_object('ok', false, 'reason', 'email_not_verified');
  end if;
  if public.business_status_of(v_owner) = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'business_suspended');
  end if;

  select u.email into v_email from auth.users u where u.id = v_owner;
  select nullif(btrim(p.company_name), '') into v_company from public.profiles p where p.user_id = v_owner;
  return jsonb_build_object(
    'ok', true,
    'owner_id', v_owner,
    'email', v_email,
    'company', v_company,
    'job_title', case when p_job is not null then v_job.title end,
    'customer_id', (select c.stripe_customer_id from public.billing_customers c where c.owner_id = v_owner and c.livemode = coalesce(p_livemode, false))
  );
end;
$$;

-- billing-checkout's claim on a Checkout page: one for Unlimited per business,
-- one for $99 per job, per mode. Two requests at the same moment: the second
-- is told a checkout is already opening. The earlier open pages are handed
-- back to be expired in Stripe before a new one is made.
create or replace function public.billing_checkout_begin(p_owner uuid, p_kind text, p_job uuid, p_livemode boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_id uuid;
  v_earlier jsonb;
begin
  if p_owner is null or p_kind is null or p_kind not in ('job', 'unlimited') or (p_kind = 'job' and p_job is null) then
    raise exception 'billing_checkout_begin: an owner, a kind and (for a job) the job are needed' using errcode = 'check_violation';
  end if;
  v_key := case when p_kind = 'unlimited'
                then format('unlimited:%s:%s', p_owner, coalesce(p_livemode, false))
                else format('job:%s:%s', p_job, coalesce(p_livemode, false)) end;
  perform pg_advisory_xact_lock(hashtextextended('billing_checkout:' || v_key, 0));
  if exists (select 1 from public.billing_checkouts c where c.claim_key = v_key and c.status = 'opening' and c.created_at > now() - interval '2 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'checkout_busy');
  end if;
  -- An opening that never finished (the function stopped): let it go.
  update public.billing_checkouts set status = 'failed', closed_at = now() where claim_key = v_key and status = 'opening';
  select coalesce(jsonb_agg(c.stripe_session_id order by c.created_at), '[]'::jsonb) into v_earlier
    from public.billing_checkouts c
   where c.claim_key = v_key and c.status = 'open' and c.stripe_session_id is not null;
  insert into public.billing_checkouts (claim_key, owner_id, kind, job_id, livemode, status)
  values (v_key, p_owner, p_kind, p_job, coalesce(p_livemode, false), 'opening')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'claim', v_id, 'earlier', v_earlier);
end;
$$;

-- The claim's page is open in Stripe (a cs_ id), or it could not be made (NULL).
create or replace function public.billing_checkout_opened(p_claim uuid, p_session text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_session is not null and p_session ~ '^cs_[A-Za-z0-9_]+$' then
    update public.billing_checkouts set status = 'open', stripe_session_id = p_session, opened_at = now()
     where id = p_claim and status = 'opening';
  else
    update public.billing_checkouts set status = 'failed', closed_at = now()
     where id = p_claim and status = 'opening';
  end if;
end;
$$;

-- An earlier page, as Stripe has it now: expired (by billing-checkout, or by
-- Stripe after a day) or complete (paid).
create or replace function public.billing_checkout_closed(p_session text, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('expired', 'complete') then
    raise exception 'billing_checkout_closed: expired or complete' using errcode = 'check_violation';
  end if;
  update public.billing_checkouts set status = p_status, closed_at = now()
   where stripe_session_id = p_session and status = 'open';
end;
$$;

-- billing-portal: the owner's own customer, in this mode.
create or replace function public.billing_portal_check(p_caller uuid, p_livemode boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_caller is null or not exists (select 1 from public.user_roles r where r.user_id = p_caller and r.role = 'employer')
      then jsonb_build_object('ok', false, 'reason', 'owner_only')
    when public.billing_exempt(p_caller) then jsonb_build_object('ok', false, 'reason', 'exempt')
    when not exists (select 1 from public.billing_customers c where c.owner_id = p_caller and c.livemode = coalesce(p_livemode, false))
      then jsonb_build_object('ok', false, 'reason', 'no_customer')
    else jsonb_build_object('ok', true, 'customer_id',
      (select c.stripe_customer_id from public.billing_customers c where c.owner_id = p_caller and c.livemode = coalesce(p_livemode, false)))
  end;
$$;

-- Keeps the customer billing-checkout made (or the one already kept, if two
-- checkouts raced) and answers which one to use.
create or replace function public.billing_save_customer(p_owner uuid, p_livemode boolean, p_customer text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_owner is null or p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'billing_save_customer: owner and a Stripe customer id are needed' using errcode = 'check_violation';
  end if;
  insert into public.billing_customers (owner_id, livemode, stripe_customer_id)
  values (p_owner, coalesce(p_livemode, false), p_customer)
  on conflict (owner_id, livemode) do nothing;
  return (select c.stripe_customer_id from public.billing_customers c where c.owner_id = p_owner and c.livemode = coalesce(p_livemode, false));
end;
$$;

-- Whose customer this is (any mode).
create or replace function public.billing_owner_of_customer(p_customer text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.owner_id from public.billing_customers c where c.stripe_customer_id = p_customer limit 1;
$$;

-- A business's Stripe customer outlives its account in Stripe: remembered
-- when its row goes (the account deleted, by cascade), so a subscription
-- Stripe bills to it afterwards is owed back (billing_apply_subscription).
create or replace function public.billing_customers_remember_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.billing_deleted_customers (stripe_customer_id, livemode)
  values (old.stripe_customer_id, old.livemode)
  on conflict (stripe_customer_id) do nothing;
  return old;
end;
$$;
revoke all on function public.billing_customers_remember_deleted() from public, anon, authenticated;
drop trigger if exists billing_customers_remember_deleted on public.billing_customers;
create trigger billing_customers_remember_deleted
  after delete on public.billing_customers
  for each row execute function public.billing_customers_remember_deleted();

-- The event is new: record it (true), or it was handled already (false).
create or replace function public.billing_event_new(p_event_id text, p_type text, p_livemode boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taken integer;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then
    raise exception 'billing: not a Stripe event id' using errcode = 'check_violation';
  end if;
  insert into public.billing_events (id, type, livemode) values (p_event_id, left(coalesce(p_type, ''), 100), p_livemode)
  on conflict (id) do nothing;
  get diagnostics v_taken = row_count;
  return v_taken > 0;
end;
$$;

create or replace function public.billing_event_outcome(p_event_id text, p_outcome text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.billing_events set outcome = left(p_outcome, 200) where id = p_event_id;
$$;

-- A refund owed, as billing-webhook acts on it: { refund: {...} } while
-- Stripe has not done it, {} once it has.
create or replace function public.billing_refund_json(p_refund uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select jsonb_build_object('refund', jsonb_build_object(
           'id', r.id, 'eventId', r.event_id, 'kind', r.kind, 'reason', r.reason,
           'paymentIntent', r.stripe_payment_intent_id, 'subscription', r.stripe_subscription_id,
           'livemode', r.livemode))
      from public.billing_refunds r where r.id = p_refund and r.status <> 'done'), '{}'::jsonb);
$$;

-- Records money owed back (once per payment, once per second subscription)
-- and answers it for billing-webhook to refund.
create or replace function public.billing_refund_owe(
  p_event_id text, p_kind text, p_reason text, p_owner uuid, p_job uuid, p_session text,
  p_payment_intent text, p_subscription text, p_amount integer, p_currency text, p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if (p_kind = 'job_payment' and p_payment_intent is null) or (p_kind = 'second_subscription' and p_subscription is null) then
    insert into public.billing_refunds (event_id, kind, reason, owner_id, job_id, stripe_checkout_session_id, amount_cents, currency, livemode, status, last_error)
    values (p_event_id, p_kind, p_reason, p_owner, p_job, p_session, p_amount, lower(left(p_currency, 10)), p_livemode, 'failed', 'Stripe named no payment to refund');
    perform public.billing_alert_admins(null, 'A payment needs a refund by hand',
      format('Stripe event %s: a payment (%s) with nothing given for it, and no payment named to refund. Refund it in Stripe.', left(p_event_id, 80), p_reason));
    return '{}'::jsonb;
  end if;
  insert into public.billing_refunds (event_id, kind, reason, owner_id, job_id, stripe_checkout_session_id,
                                      stripe_payment_intent_id, stripe_subscription_id, amount_cents, currency, livemode)
  values (p_event_id, p_kind, p_reason, p_owner, p_job, p_session, p_payment_intent, p_subscription, p_amount, lower(left(p_currency, 10)), p_livemode)
  on conflict do nothing;
  select r.id into v_id from public.billing_refunds r
   where r.kind = p_kind
     and ((p_kind = 'job_payment' and r.stripe_payment_intent_id = p_payment_intent)
          or (p_kind = 'second_subscription' and r.stripe_subscription_id = p_subscription));
  return public.billing_refund_json(v_id);
end;
$$;

-- An event Stripe sends again: the refund it owed, if Stripe has not done it yet.
create or replace function public.billing_refund_owed(p_event_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.billing_refund_json(r.id) from public.billing_refunds r
                    where r.event_id = p_event_id and r.status <> 'done' order by r.created_at limit 1), '{}'::jsonb);
$$;

-- What Stripe said to billing-webhook's refund (and, for a second Unlimited,
-- its cancel): done, so the admins and the business are told; or not, so it
-- stays owed, the admins are told once a day, and Stripe's retry tries again.
create or replace function public.billing_refund_result(p_refund uuid, p_stripe_refunds text, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.billing_refunds%rowtype;
  v_who text;
begin
  select * into r from public.billing_refunds where id = p_refund for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.status = 'done' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  select coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), '')) into v_who from public.profiles p where p.user_id = r.owner_id;
  if p_error is not null then
    update public.billing_refunds set status = 'failed', tries = tries + 1, last_error = left(p_error, 300) where id = r.id;
    perform public.billing_alert_admins('billing:refund-failed:' || r.id::text, 'A refund failed',
      left(format('Stripe did not do the refund for %s (%s): %s. Stripe sends the event again and it is tried again; if it keeps failing, refund it in Stripe.',
                  coalesce(v_who, 'a business'), r.reason, left(p_error, 200)), 600));
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;
  update public.billing_refunds set status = 'done', tries = tries + 1, last_error = null, done_at = now(),
         stripe_refund_ids = left(p_stripe_refunds, 500) where id = r.id;
  if r.kind = 'second_subscription' and r.reason = 'account_deleted' then
    perform public.billing_alert_admins(null, 'An Unlimited paid after its account was deleted',
      'A checkout page left open when a business deleted its account was paid afterwards. The subscription was cancelled at once and its payment refunded.');
  elsif r.kind = 'second_subscription' then
    perform public.billing_alert_admins(null, 'A second Unlimited was cancelled',
      left(format('%s started Unlimited a second time. It was cancelled at once and its payment refunded; the first stays on.', coalesce(v_who, 'A business')), 600));
    if r.owner_id is not null then
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (r.owner_id, 'system', 'Your second Unlimited was cancelled',
              'You started Unlimited twice. We cancelled the second one and refunded its payment. Your Unlimited stays on.', '/settings', false);
    end if;
  else
    perform public.billing_alert_admins(null, 'A payment was refunded',
      left(format('A payment from %s was refunded automatically: %s.', coalesce(v_who, 'a deleted account'),
        case r.reason when 'job_gone' then 'the job it paid for had been deleted'
                      when 'not_owner' then 'the job it named is another business''s'
                      else 'its Stripe customer is not the business it named' end), 600));
    if r.owner_id is not null then
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (r.owner_id, 'system', 'We refunded your payment',
              case when r.reason = 'job_gone'
                then 'The job you paid for had been deleted, so we refunded your payment. It can take a few days to show on your card.'
                else 'We couldn''t match your payment to one of your jobs, so we refunded it. It can take a few days to show on your card.' end,
              '/jobs', false);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', 'done');
end;
$$;

-- Puts a job that has just been paid for live, as the system, only when the
-- business could publish it itself (its email confirmed, not paused): the
-- other publish checks let the service role through, so they are asked here.
create or replace function public.billing_publish_paid_job(p_job uuid, p_owner uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs j where j.id = p_job for update;
  if not found then
    return 'job_gone';
  end if;
  if v_job.employer_id is distinct from p_owner then
    return 'not_owner';
  end if;
  if v_job.status = 'published'::job_status then
    return 'already_live';
  end if;
  if not public.business_email_verified(p_owner) then
    return 'email_not_verified';
  end if;
  if public.business_status_of(p_owner) = 'suspended' then
    return 'business_suspended';
  end if;
  update public.jobs set status = 'published'::job_status where id = p_job;
  return 'published';
end;
$$;

-- checkout.session.completed for a job ($99): the paid pass, then the job live.
-- Money for which nothing can be given (the job deleted, another business's
-- job, a customer that is not the business named) is owed back: billing-webhook
-- refunds it.
create or replace function public.billing_apply_job_payment(
  p_event_id text, p_event_type text, p_livemode boolean,
  p_owner uuid, p_customer text, p_job uuid, p_session text, p_payment_intent text,
  p_amount integer, p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_job_owner uuid;
  v_title text;
  v_start timestamptz;
  v_published text;
  v_taken integer;
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- The customer is the server's own record of who pays; the metadata only
  -- has to agree with it.
  v_owner := public.billing_owner_of_customer(p_customer);
  if v_owner is null or v_owner is distinct from p_owner then
    perform public.billing_event_outcome(p_event_id, 'refund owed: customer does not match the owner');
    return jsonb_build_object('ok', true, 'ignored', 'owner_mismatch')
        || public.billing_refund_owe(p_event_id, 'job_payment', 'owner_mismatch', v_owner, p_job, p_session, p_payment_intent, null, p_amount, p_currency, p_livemode);
  end if;
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$' then
    perform public.billing_event_outcome(p_event_id, 'ignored: no checkout session');
    return jsonb_build_object('ok', true, 'ignored', 'no_session');
  end if;
  update public.billing_checkouts set status = 'complete', closed_at = now() where stripe_session_id = p_session and status <> 'complete';
  -- Refunded in full before this event came (a retried delivery): nothing to give.
  if p_payment_intent is not null and exists (select 1 from public.billing_refunded_payments x where x.stripe_payment_intent_id = p_payment_intent) then
    perform public.billing_event_outcome(p_event_id, 'ignored: refunded before it was recorded');
    return jsonb_build_object('ok', true, 'ignored', 'refunded');
  end if;
  select j.employer_id, j.title into v_job_owner, v_title from public.jobs j where j.id = p_job for update;
  if v_job_owner is not null and v_job_owner is distinct from v_owner then
    perform public.billing_event_outcome(p_event_id, 'refund owed: the job is another business''s');
    return jsonb_build_object('ok', true, 'ignored', 'not_owner')
        || public.billing_refund_owe(p_event_id, 'job_payment', 'not_owner', v_owner, p_job, p_session, p_payment_intent, null, p_amount, p_currency, p_livemode);
  end if;
  if v_job_owner is null then
    perform public.billing_event_outcome(p_event_id, 'refund owed: job gone');
    return jsonb_build_object('ok', true, 'published', 'job_gone')
        || public.billing_refund_owe(p_event_id, 'job_payment', 'job_gone', v_owner, p_job, p_session, p_payment_intent, null, p_amount, p_currency, p_livemode);
  end if;

  -- 30 days from now, or from the end of time already paid for on this job.
  v_start := greatest(now(), coalesce((select max(p.ends_at) from public.job_passes p
                                         where p.job_id = p_job and p.kind in ('free', 'paid', 'launch') and p.status = 'active'), now()));
  insert into public.job_passes (job_id, owner_id, kind, starts_at, ends_at, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, currency, livemode)
  values (p_job, v_owner, 'paid', v_start, v_start + interval '30 days',
          p_session, p_payment_intent, p_amount, lower(left(p_currency, 10)), p_livemode)
  on conflict (stripe_checkout_session_id) do nothing;
  get diagnostics v_taken = row_count;
  if v_taken = 0 then
    perform public.billing_event_outcome(p_event_id, 'already recorded');
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  v_published := public.billing_publish_paid_job(p_job, v_owner);
  if v_published in ('published', 'already_live') then
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (v_owner, 'system', 'Your job is live',
            left(format('Payment received. "%s" is live for 30 days.', left(coalesce(v_title, 'Your job'), 80)), 500),
            '/jobs/' || p_job::text, false);
  else
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (v_owner, 'system', 'Payment received',
            left(format('Your payment for "%s" went through. Open the job and press Publish to put it live; its 30 days are paid for.', left(coalesce(v_title, 'your job'), 80)), 500),
            '/jobs/' || p_job::text, false);
  end if;
  perform public.billing_event_outcome(p_event_id, 'paid: ' || v_published);
  return jsonb_build_object('ok', true, 'published', v_published);
end;
$$;

-- The subscription row as Stripe has it now (billing-webhook and billing-sync
-- both read it again first): past_due_since kept while it stays past_due,
-- cleared once paid; stripe_checked_at is now.
create or replace function public.billing_write_subscription(
  p_owner uuid, p_customer text, p_subscription text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_amount integer, p_currency text, p_livemode boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.subscriptions as s (user_id, stripe_customer_id, stripe_subscription_id, plan_type, status,
                                         trial_start, trial_end, current_period_start, current_period_end,
                                         cancel_at_period_end, currency, amount, livemode, past_due_since, stripe_checked_at,
                                         onboarding_completed, updated_at)
  values (p_owner, p_customer, p_subscription, 'unlimited', left(coalesce(p_status, 'incomplete'), 40),
          null, null, p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false),
          lower(left(coalesce(p_currency, 'usd'), 10)), p_amount, p_livemode,
          case when p_status = 'past_due' then now() end, now(), true, now())
  on conflict (user_id) do update
     set stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         plan_type = 'unlimited',
         status = excluded.status,
         trial_start = null,
         trial_end = null,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         currency = excluded.currency,
         amount = excluded.amount,
         livemode = excluded.livemode,
         past_due_since = case when excluded.status = 'past_due'
                               then coalesce(case when s.status = 'past_due' and s.stripe_subscription_id = excluded.stripe_subscription_id
                                                  then s.past_due_since end, now()) end,
         stripe_checked_at = now(),
         updated_at = now();
end;
$$;

-- Unlimited: checkout.session.completed (subscription) and
-- customer.subscription.created / updated / deleted, with the subscription as
-- billing-webhook just read it from Stripe. Never two: a second one Stripe
-- still bills while the first does is owed back (billing-webhook cancels and
-- refunds it); the first stays.
create or replace function public.billing_apply_subscription(
  p_event_id text, p_event_type text, p_livemode boolean,
  p_customer text, p_subscription text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_amount integer, p_currency text, p_job uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_row public.subscriptions%rowtype;
  v_has_row boolean;
  v_billing_states text[] := array['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];
  v_published text := null;
  v_closed integer := 0;
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_owner := public.billing_owner_of_customer(p_customer);
  if v_owner is null then
    if p_subscription ~ '^sub_[A-Za-z0-9_]+$' and p_status = any (v_billing_states) then
      -- A deleted account's customer (a checkout page left open, paid after
      -- the account went): owed back, cancelled and refunded.
      if exists (select 1 from public.billing_deleted_customers d where d.stripe_customer_id = p_customer) then
        perform public.billing_event_outcome(p_event_id, 'deleted account''s Unlimited: cancel and refund');
        return jsonb_build_object('ok', true, 'ignored', 'deleted_account')
            || public.billing_refund_owe(p_event_id, 'second_subscription', 'account_deleted', null, null, null, null, p_subscription, p_amount, p_currency, p_livemode);
      end if;
      -- A customer HireFlow never made (one set up by hand in Stripe): a person looks.
      perform public.billing_alert_admins('billing:unknown-customer:' || left(p_subscription, 120), 'An Unlimited for an unknown customer',
        left(format('Stripe bills Unlimited %s to customer %s, which no HireFlow account holds. Check it in Stripe.', p_subscription, left(coalesce(p_customer, 'none'), 80)), 600));
    end if;
    perform public.billing_event_outcome(p_event_id, 'ignored: unknown customer');
    return jsonb_build_object('ok', true, 'ignored', 'unknown_customer');
  end if;
  if p_subscription is null or p_subscription !~ '^sub_[A-Za-z0-9_]+$' then
    perform public.billing_event_outcome(p_event_id, 'ignored: no subscription');
    return jsonb_build_object('ok', true, 'ignored', 'no_subscription');
  end if;

  select * into v_row from public.subscriptions s where s.user_id = v_owner for update;
  v_has_row := found;
  if v_has_row and v_row.plan_type = 'unlimited' and v_row.stripe_subscription_id is not null
     and v_row.stripe_subscription_id <> p_subscription then
    -- A late event about another subscription that no longer bills changes nothing.
    if not (p_status = any (v_billing_states)) then
      perform public.billing_event_outcome(p_event_id, 'ignored: older subscription');
      return jsonb_build_object('ok', true, 'ignored', 'older_subscription');
    end if;
    -- A second Unlimited while the first still bills: cancelled and refunded.
    if v_row.status = any (v_billing_states) then
      perform public.billing_event_outcome(p_event_id, 'second Unlimited: cancel and refund');
      return jsonb_build_object('ok', true, 'ignored', 'second_subscription', 'owner', v_owner)
          || public.billing_refund_owe(p_event_id, 'second_subscription', 'second_unlimited', v_owner, null, null, null, p_subscription, p_amount, p_currency, p_livemode);
    end if;
  end if;

  perform public.billing_write_subscription(v_owner, p_customer, p_subscription, p_status, p_period_start, p_period_end,
                                            p_cancel_at_period_end, p_amount, p_currency, p_livemode);

  if public.billing_unlimited_active(v_owner) then
    if p_job is not null then
      v_published := public.billing_publish_paid_job(p_job, v_owner);
      if v_published = 'published' then
        insert into public.job_passes (job_id, owner_id, kind)
        select p_job, v_owner, 'unlimited'
         where not exists (select 1 from public.job_passes p where p.job_id = p_job and p.kind = 'unlimited' and p.status = 'active');
      end if;
    end if;
    if p_event_type = 'checkout.session.completed' then
      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (v_owner, 'system', 'Unlimited is on',
              'Every job you publish stays live while Unlimited is on. Manage it in Settings.', '/settings', false);
    end if;
  elsif p_status in ('canceled', 'unpaid', 'incomplete_expired') then
    -- Ended: whatever nothing else pays for closes now (and the owner is told).
    -- ('incomplete' is a Checkout subscription before its first payment, and
    -- 'past_due' is still active for 7 days: neither closes anything here.)
    v_closed := public.billing_close_for(v_owner);
  end if;

  perform public.billing_event_outcome(p_event_id, format('subscription %s%s', left(coalesce(p_status, '?'), 40),
    case when v_published is not null then ', job ' || v_published else '' end));
  return jsonb_build_object('ok', true, 'owner', v_owner, 'status', p_status, 'published', v_published, 'closed', v_closed);
end;
$$;

-- invoice.payment_failed: the owner is told in the app, at most once a day
-- for a subscription (Stripe retries a payment several times).
create or replace function public.billing_apply_payment_failed(p_event_id text, p_event_type text, p_livemode boolean, p_customer text, p_subscription text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_owner := public.billing_owner_of_customer(p_customer);
  if v_owner is null then
    perform public.billing_event_outcome(p_event_id, 'ignored: unknown customer');
    return jsonb_build_object('ok', true, 'ignored', 'unknown_customer');
  end if;
  if not public.claim_daily_alert('billing:payment-failed:' || left(coalesce(p_subscription, p_customer), 120)) then
    perform public.billing_event_outcome(p_event_id, 'owner already told today');
    return jsonb_build_object('ok', true, 'owner', v_owner, 'told', false);
  end if;
  insert into public.notifications (user_id, type, title, message, link, is_read)
  values (v_owner, 'system', 'Your payment didn''t go through',
          'We couldn''t take your Unlimited payment. Update your card in Settings, under Billing, to keep your jobs live.', '/settings', false);
  perform public.billing_event_outcome(p_event_id, 'owner told');
  return jsonb_build_object('ok', true, 'owner', v_owner, 'told', true);
end;
$$;

-- charge.refunded (in full): that payment's pass ends, and its job closes
-- unless something else still covers it. The payment is remembered as
-- refunded, so its own event arriving later gives nothing.
create or replace function public.billing_apply_refund(p_event_id text, p_event_type text, p_livemode boolean, p_payment_intent text, p_fully_refunded boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_ended integer := 0;
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if not coalesce(p_fully_refunded, false) or p_payment_intent is null then
    perform public.billing_event_outcome(p_event_id, 'ignored: not a full refund of a job');
    return jsonb_build_object('ok', true, 'ignored', 'partial');
  end if;
  insert into public.billing_refunded_payments (stripe_payment_intent_id) values (p_payment_intent) on conflict do nothing;
  for r in
    update public.job_passes p
       set status = 'refunded', ended_at = now()
     where p.stripe_payment_intent_id = p_payment_intent and p.kind = 'paid' and p.status <> 'refunded'
    returning p.job_id, p.owner_id
  loop
    v_ended := v_ended + 1;
    if r.job_id is not null and r.owner_id is not null and public.billing_on()
       and not public.billing_exempt(r.owner_id)
       and not public.billing_unlimited_active(r.owner_id)
       and not public.billing_job_has_time(r.job_id) then
      update public.jobs set status = 'closed'::job_status where id = r.job_id and status = 'published'::job_status;
      if found then
        insert into public.notifications (user_id, type, title, message, link, is_read)
        select r.owner_id, 'system', 'Your payment was refunded',
               left(format('"%s" is closed now because its payment was refunded. Everyone who applied is still there.', left(coalesce(j.title, 'Your job'), 80)), 500),
               '/jobs/' || r.job_id::text, false
          from public.jobs j where j.id = r.job_id;
      end if;
    end if;
  end loop;
  perform public.billing_event_outcome(p_event_id, format('refund: %s pass(es) ended', v_ended));
  return jsonb_build_object('ok', true, 'ended', v_ended);
end;
$$;

-- An event billing-webhook does not act on is still recorded once.
create or replace function public.billing_record_event(p_event_id text, p_event_type text, p_livemode boolean, p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  perform public.billing_event_outcome(p_event_id, p_outcome);
  return jsonb_build_object('ok', true);
end;
$$;

-- A Checkout that finished without being paid (payment_status not 'paid':
-- Checkout takes cards only, so this should never happen): recorded, nothing
-- given, and the admins are told.
create or replace function public.billing_record_unpaid_checkout(p_event_id text, p_event_type text, p_livemode boolean, p_session text, p_kind text, p_payment_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.billing_event_new(p_event_id, p_event_type, p_livemode) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  perform public.billing_event_outcome(p_event_id, format('not paid: %s (%s)', left(coalesce(p_payment_status, 'unknown'), 40), left(coalesce(p_kind, '?'), 20)));
  perform public.billing_alert_admins(null, 'A checkout finished unpaid',
    left(format('Stripe says checkout %s (%s) finished with payment "%s". Nothing was given for it. Check in Stripe that Checkout takes cards only.',
                left(coalesce(p_session, '?'), 80), left(coalesce(p_kind, '?'), 20), left(coalesce(p_payment_status, 'unknown'), 40)), 600));
  return jsonb_build_object('ok', true, 'ignored', 'not_paid');
end;
$$;

-- billing-sync: the Unlimited subscriptions to read again from Stripe, in the
-- key's mode: those Stripe last said still bill whose period has ended or
-- ends within a day, or that have been past_due for 6 days (all of them with
-- p_all, after a webhook outage), not read in the last 50 minutes, 200 a run.
-- Nothing while billing is off.
create or replace function public.billing_sync_due(p_livemode boolean, p_all boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.billing_on() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('subscription', d.stripe_subscription_id, 'owner', d.user_id) order by d.stripe_checked_at nulls first)
      from (select s.stripe_subscription_id, s.user_id, s.stripe_checked_at
              from public.subscriptions s
             where s.plan_type = 'unlimited'
               and s.stripe_subscription_id is not null
               and coalesce(s.livemode, false) = coalesce(p_livemode, false)
               and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
               and (coalesce(p_all, false)
                    or s.current_period_end is null
                    or s.current_period_end < now() + interval '1 day'
                    or (s.status = 'past_due' and s.past_due_since < now() - interval '6 days'))
               and (coalesce(p_all, false) or s.stripe_checked_at is null or s.stripe_checked_at < now() - interval '50 minutes')
             order by s.stripe_checked_at nulls first
             limit case when coalesce(p_all, false) then 1000 else 200 end) d), '[]'::jsonb) end;
$$;

-- billing-sync: one subscription as Stripe has it now. Only the one a
-- business's row tracks, and only for the business whose customer it is;
-- whatever nothing covers any more closes (and the owner is told).
create or replace function public.billing_sync_subscription(
  p_subscription text, p_customer text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_amount integer, p_currency text, p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.subscriptions%rowtype;
  v_closed integer := 0;
begin
  select * into v_row from public.subscriptions s
   where s.stripe_subscription_id = p_subscription and s.plan_type = 'unlimited' for update;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'not_tracked');
  end if;
  if public.billing_owner_of_customer(p_customer) is distinct from v_row.user_id then
    perform public.billing_alert_admins('billing:sync-customer:' || p_subscription, 'Billing could not match a subscription',
      left(format('Stripe says Unlimited %s belongs to customer %s, which is not the business it is recorded for. Nothing was changed.', p_subscription, coalesce(p_customer, '?')), 600));
    return jsonb_build_object('ok', true, 'ignored', 'customer_mismatch');
  end if;
  perform public.billing_write_subscription(v_row.user_id, p_customer, p_subscription, p_status, p_period_start, p_period_end,
                                            p_cancel_at_period_end, p_amount, p_currency, p_livemode);
  if not public.billing_unlimited_active(v_row.user_id) then
    v_closed := public.billing_close_for(v_row.user_id);
  end if;
  return jsonb_build_object('ok', true, 'owner', v_row.user_id, 'status', p_status, 'closed', v_closed);
end;
$$;

-- billing-sync: Stripe has no such subscription in this mode. Nothing is
-- changed (its jobs stay live) and the admins are told once a day.
create or replace function public.billing_sync_missing(p_subscription text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.billing_alert_admins('billing:sync-missing', 'Billing could not find a subscription',
    left(format('Stripe has no subscription %s in this mode, while HireFlow records it as Unlimited. Its jobs stay live until you look (check the Stripe key''s mode).', coalesce(p_subscription, '?')), 600));
  return jsonb_build_object('ok', true, 'missing', p_subscription);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.billing_state(uuid, uuid)',
    'public.billing_business_of(uuid)',
    'public.billing_checkout_check(uuid, text, uuid, boolean)',
    'public.billing_checkout_begin(uuid, text, uuid, boolean)',
    'public.billing_checkout_opened(uuid, text)',
    'public.billing_checkout_closed(text, text)',
    'public.billing_portal_check(uuid, boolean)',
    'public.billing_save_customer(uuid, boolean, text)',
    'public.billing_owner_of_customer(text)',
    'public.billing_event_new(text, text, boolean)',
    'public.billing_event_outcome(text, text)',
    'public.billing_alert_admins(text, text, text)',
    'public.billing_refund_json(uuid)',
    'public.billing_refund_owe(text, text, text, uuid, uuid, text, text, text, integer, text, boolean)',
    'public.billing_refund_owed(text)',
    'public.billing_refund_result(uuid, text, text)',
    'public.billing_publish_paid_job(uuid, uuid)',
    'public.billing_write_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, integer, text, boolean)',
    'public.billing_apply_job_payment(text, text, boolean, uuid, text, uuid, text, text, integer, text)',
    'public.billing_apply_subscription(text, text, boolean, text, text, text, timestamptz, timestamptz, boolean, integer, text, uuid)',
    'public.billing_apply_payment_failed(text, text, boolean, text, text)',
    'public.billing_apply_refund(text, text, boolean, text, boolean)',
    'public.billing_record_event(text, text, boolean, text)',
    'public.billing_record_unpaid_checkout(text, text, boolean, text, text, text)',
    'public.billing_sync_due(boolean, boolean)',
    'public.billing_sync_subscription(text, text, text, timestamptz, timestamptz, boolean, integer, text, boolean)',
    'public.billing_sync_missing(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- 6. The old plan limits, retired ------------------------------------------------------

-- v9 prices jobs, at publish (jobs_publish_needs_pass). Drafts, documents and
-- teammates are never limited, with billing on or off. (The old functions
-- read the trial row and has_subscription_bypass_for_user; nothing in billing
-- reads either any more.)
create or replace function public.job_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select -1;
$$;

create or replace function public.document_workflow_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select -1;
$$;

create or replace function public.team_member_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select -1;
$$;

revoke all on function public.job_limit_for_user(uuid) from public, anon, authenticated;
revoke all on function public.document_workflow_limit_for_user(uuid) from public, anon, authenticated;
revoke all on function public.team_member_limit_for_user(uuid) from public, anon, authenticated;

-- The $49-unlock model's sealing never ships: flipping billing on seals no
-- applicant (nothing in the app reads it; this makes sure nothing could).
create or replace function public.get_employer_sealed_application_ids()
returns table(application_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select null::uuid where false;
$$;

-- A paid job or Unlimited counts as trust (20261011100000 left this false
-- until billing shipped). Every business is approved by default since
-- 20261011190000, so it changes nothing today.
create or replace function public.business_has_paid(p_employer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_employer is not null and (
    exists (select 1 from public.job_passes p where p.owner_id = p_employer and p.kind = 'paid' and p.status <> 'refunded')
    or exists (select 1 from public.subscriptions s where s.user_id = p_employer and s.plan_type = 'unlimited' and s.stripe_subscription_id is not null)
  );
$$;

revoke all on function public.business_has_paid(uuid) from public, anon, authenticated;
grant execute on function public.business_has_paid(uuid) to service_role;

comment on table public.job_passes is 'Each job''s time live under pricing v9 (docs/BILLING.md): free, paid, launch, or the unlimited marker. Server-written only; a payment''s row outlives the account (owner_id NULL).';
comment on table public.billing_customers is 'The Stripe customer of each business owner, per mode (docs/BILLING.md). Server-written only.';
comment on table public.billing_deleted_customers is 'Stripe customer ids of deleted accounts: an Unlimited still billed to one is cancelled and refunded (docs/BILLING.md). Server only.';
comment on table public.billing_events is 'Every Stripe event billing-webhook handled, by its id (idempotency; docs/BILLING.md). Server only.';
comment on table public.billing_free_job_emails is 'A one-way fingerprint (sha256) of each sign-in email address that used the free job (docs/BILLING.md). Kept when the account is deleted. Server only.';
comment on table public.billing_refunds is 'Money HireFlow owes back and what Stripe said to the refund (docs/BILLING.md). Server only.';
comment on table public.billing_checkouts is 'Checkout pages billing-checkout opened: one open for Unlimited per business, one for $99 per job (docs/BILLING.md). Server only.';
