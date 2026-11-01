-- Billing receipts and payment history (2026-11-01; docs/BILLING.md, "What a
-- business sees after paying").
--
-- WHY: billing went live on 2026-11-01 and the owner's own $1 test payment
-- worked end to end, but he could not see what he had paid for: "there was
-- no payment confirmation ... I don't get to see what package I'm on ... It
-- doesn't show any invoice history." One-time Checkout payments made no
-- invoice, so Stripe's billing page listed nothing either.
--
-- WHAT IS HERE
--   1. job_passes keeps the receipt of the $99 payment that bought it
--      (receipt_url: the Stripe-hosted invoice, or the charge's receipt when
--      there is no invoice; stripe_invoice_id) and the job's title when it
--      was paid for (job_title: the pass outlives its job). A browser still
--      reads only a pass's days (the column grants of 20261031100000 are
--      unchanged), never these.
--   2. billing_invoices: each paid Unlimited invoice (the first, and every
--      renewal billing-webhook hears of through invoice.paid), with its
--      amount, when it was paid, the period it paid for and its receipt.
--      Only the Unlimited HireFlow tracks for that business is kept: a second
--      Unlimited (cancelled and refunded by billing-webhook) or one billed to
--      a deleted account never shows as a payment. The service role only.
--   3. billing_save_receipt / billing_save_invoice: billing-webhook keeps the
--      receipt it read again from Stripe (service role only; idempotent by
--      Stripe's own ids; only an https address on stripe.com is kept).
--   4. billing_history(owner): what Settings -> Billing shows under
--      "Payment history": every $99 payment and every Unlimited payment,
--      newest first (50), with its amount, date, what it paid for, its
--      receipt and whether it was refunded. Nothing while billing is off or
--      for the exempt account. get-subscription gives it to the business
--      OWNER only: a teammate never sees an amount.
--
-- Billing stays exactly as it was otherwise: no rule of 20261031100000
-- changes (guards in scripts/guards/billing-locks.mjs; launch_locks_behaviour
-- section 33 (u)).

-- 1. The receipt of a $99 payment, on its pass -----------------------------------

alter table public.job_passes add column if not exists receipt_url text;
alter table public.job_passes add column if not exists stripe_invoice_id text;
alter table public.job_passes add column if not exists job_title text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_passes_receipt_on_stripe') then
    alter table public.job_passes add constraint job_passes_receipt_on_stripe
      check (receipt_url is null or (length(receipt_url) <= 2000 and receipt_url ~ '^https://([a-z0-9-]+\.)*stripe\.com/[^[:space:]"''<>]*$'));
  end if;
end $$;

-- 2. Each paid Unlimited invoice ---------------------------------------------------

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  stripe_invoice_id text not null unique,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text,
  paid_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,
  receipt_url text check (receipt_url is null or (length(receipt_url) <= 2000 and receipt_url ~ '^https://([a-z0-9-]+\.)*stripe\.com/[^[:space:]"''<>]*$')),
  livemode boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_invoices_owner_idx on public.billing_invoices (owner_id, paid_at desc);

drop trigger if exists update_billing_invoices_updated_at on public.billing_invoices;
create trigger update_billing_invoices_updated_at before update on public.billing_invoices
  for each row execute function public.update_updated_at_column();

alter table public.billing_invoices enable row level security;
revoke all on table public.billing_invoices from public, anon, authenticated;
grant all on table public.billing_invoices to service_role;

-- 3. billing-webhook keeps the receipts --------------------------------------------

-- A receipt address worth keeping: https on stripe.com, nothing else.
create or replace function public.billing_receipt_url(p_url text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case when p_url is not null and length(p_url) <= 2000
                   and p_url ~ '^https://([a-z0-9-]+\.)*stripe\.com/[^[:space:]"''<>]*$'
              then p_url end;
$$;

-- The receipt of a $99 payment, on the pass that payment bought (billing-
-- webhook, after billing_apply_job_payment). Idempotent: a receipt already
-- kept is only ever replaced by another one, never by nothing.
create or replace function public.billing_save_receipt(p_payment_intent text, p_invoice text, p_receipt_url text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := public.billing_receipt_url(p_receipt_url);
  v_kept integer;
begin
  if p_payment_intent is null or p_payment_intent !~ '^pi_[A-Za-z0-9_]+$' then
    return jsonb_build_object('ok', false, 'reason', 'no_payment');
  end if;
  update public.job_passes p
     set receipt_url = coalesce(v_url, p.receipt_url),
         stripe_invoice_id = coalesce(case when p_invoice ~ '^in_[A-Za-z0-9_]+$' then p_invoice end, p.stripe_invoice_id),
         job_title = coalesce(p.job_title, (select left(j.title, 200) from public.jobs j where j.id = p.job_id))
   where p.stripe_payment_intent_id = p_payment_intent and p.kind = 'paid';
  get diagnostics v_kept = row_count;
  return jsonb_build_object('ok', true, 'kept', v_kept);
end;
$$;

-- A paid Unlimited invoice (billing-webhook: the first one when Unlimited
-- starts, each renewal on invoice.paid). Kept only for the Unlimited
-- subscription HireFlow tracks for the business whose Stripe customer paid.
create or replace function public.billing_save_invoice(
  p_customer text, p_subscription text, p_invoice text, p_payment_intent text,
  p_amount integer, p_currency text, p_paid_at timestamptz,
  p_period_start timestamptz, p_period_end timestamptz, p_receipt_url text, p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if p_invoice is null or p_invoice !~ '^in_[A-Za-z0-9_]+$' or p_subscription is null then
    return jsonb_build_object('ok', false, 'reason', 'not_an_invoice');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', true, 'ignored', 'nothing_paid');
  end if;
  v_owner := public.billing_owner_of_customer(p_customer);
  if v_owner is null then
    return jsonb_build_object('ok', true, 'ignored', 'unknown_customer');
  end if;
  if not exists (select 1 from public.subscriptions s
                  where s.user_id = v_owner and s.plan_type = 'unlimited' and s.stripe_subscription_id = p_subscription) then
    return jsonb_build_object('ok', true, 'ignored', 'not_the_tracked_unlimited');
  end if;
  insert into public.billing_invoices as i (owner_id, stripe_invoice_id, stripe_subscription_id, stripe_payment_intent_id,
                                           amount_cents, currency, paid_at, period_start, period_end, receipt_url, livemode)
  values (v_owner, p_invoice, p_subscription, case when p_payment_intent ~ '^pi_[A-Za-z0-9_]+$' then p_payment_intent end,
          p_amount, lower(left(coalesce(p_currency, 'usd'), 10)), coalesce(p_paid_at, now()),
          p_period_start, p_period_end, public.billing_receipt_url(p_receipt_url), p_livemode)
  on conflict (stripe_invoice_id) do update
     set receipt_url = coalesce(excluded.receipt_url, i.receipt_url),
         stripe_payment_intent_id = coalesce(i.stripe_payment_intent_id, excluded.stripe_payment_intent_id),
         period_start = coalesce(i.period_start, excluded.period_start),
         period_end = coalesce(i.period_end, excluded.period_end);
  return jsonb_build_object('ok', true, 'kept', true);
end;
$$;

-- 4. What the owner sees: Settings -> Billing -> Payment history -------------------

create or replace function public.billing_history(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  if not public.billing_on() then
    return '[]'::jsonb;
  end if;
  if p_owner is null or public.billing_exempt(p_owner) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(x.row order by x.paid_at desc), '[]'::jsonb) into v_rows
    from (
      select h.paid_at, h.row
        from (
          select p.created_at as paid_at,
                 jsonb_build_object(
                   'kind', 'job',
                   'jobId', p.job_id,
                   'title', coalesce(j.title, p.job_title),
                   'amountCents', p.amount_cents,
                   'currency', p.currency,
                   'paidAt', p.created_at,
                   'startsAt', p.starts_at,
                   'endsAt', p.ends_at,
                   'receiptUrl', p.receipt_url,
                   'refunded', p.status = 'refunded') as row
            from public.job_passes p
            left join public.jobs j on j.id = p.job_id
           where p.owner_id = p_owner and p.kind = 'paid'
          union all
          select i.paid_at,
                 jsonb_build_object(
                   'kind', 'unlimited',
                   'jobId', null,
                   'title', null,
                   'amountCents', i.amount_cents,
                   'currency', i.currency,
                   'paidAt', i.paid_at,
                   'startsAt', i.period_start,
                   'endsAt', i.period_end,
                   'receiptUrl', i.receipt_url,
                   'refunded', i.stripe_payment_intent_id is not null and exists (
                     select 1 from public.billing_refunded_payments x where x.stripe_payment_intent_id = i.stripe_payment_intent_id))
            from public.billing_invoices i
           where i.owner_id = p_owner
        ) h
       order by h.paid_at desc
       limit 50
    ) x;
  return v_rows;
end;
$$;

revoke all on function public.billing_receipt_url(text) from public, anon, authenticated;
revoke all on function public.billing_save_receipt(text, text, text) from public, anon, authenticated;
revoke all on function public.billing_save_invoice(text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.billing_history(uuid) from public, anon, authenticated;
grant execute on function public.billing_receipt_url(text) to service_role;
grant execute on function public.billing_save_receipt(text, text, text) to service_role;
grant execute on function public.billing_save_invoice(text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, text, boolean) to service_role;
grant execute on function public.billing_history(uuid) to service_role;
