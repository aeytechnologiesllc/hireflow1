-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.
-- NOTE: a later migration (20260904110000_free_tier_open.sql) further relaxes
-- limits; this file is kept as-applied for an accurate history.

-- Billing deferred (Stripe is the last thing to wire in). Until then, free/trial
-- employers can create jobs without a paywall. RESTORE real limits when billing
-- is added: trial -> 1, ELSE -> 0.
create or replace function public.job_limit_for_user(target_user_id uuid)
returns integer language sql stable security definer set search_path to 'public'
as $function$
  select case public.subscription_plan_for_limits(target_user_id)
    when 'business' then -1
    when 'enterprise' then -1
    when 'growth' then 3
    when 'trial' then -1
    else -1
  end;
$function$;
