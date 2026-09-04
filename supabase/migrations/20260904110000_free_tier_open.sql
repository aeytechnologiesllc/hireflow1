-- 2026-09-04: HireFlow is free while billing is off. A trial never lapses,
-- never caps jobs or applicants, and starts with two hours of Ava voice time.
-- (job_limit_for_user was already -1 for trial in production but not in the
-- repo; this records the real state so the repo and the database agree.)

create or replace function public.subscription_plan_for_limits(target_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  sub_record public.subscriptions%rowtype;
begin
  if private.has_subscription_bypass_for_user(target_user_id) then
    return 'business';
  end if;

  select *
  into sub_record
  from public.subscriptions
  where user_id = target_user_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if not found then
    return 'trial';
  end if;

  if sub_record.status = 'active' then
    return coalesce(sub_record.plan_type, 'growth');
  end if;

  -- Billing is off: a trial account stays a trial account. It used to fall to
  -- 'none' seven days in, which zeroed every limit and paywalled the app.
  if coalesce(sub_record.plan_type, 'trial') = 'trial'
     or sub_record.status in ('trialing', 'expired') then
    return 'trial';
  end if;

  return 'none';
end;
$$;

create or replace function public.job_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select case public.subscription_plan_for_limits(target_user_id)
    when 'business' then -1
    when 'enterprise' then -1
    when 'growth' then 3
    when 'trial' then -1
    else -1
  end;
$$;

create or replace function public.document_workflow_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select case public.subscription_plan_for_limits(target_user_id)
    when 'business' then -1
    when 'enterprise' then -1
    when 'growth' then 20
    when 'trial' then -1
    else 0
  end;
$$;

-- Existing trial accounts: stop the clock.
update public.subscriptions
set trial_end = null, status = 'trialing', updated_at = now()
where plan_type = 'trial' and status in ('trialing', 'expired');

-- ...and top every trial owner up to 120 minutes of voice time, good for a year.
insert into public.voice_credits (user_id, source, minutes_granted, minutes_remaining, expires_at, status)
select s.user_id, 'subscription',
       120 - coalesce(v.remaining, 0), 120 - coalesce(v.remaining, 0),
       now() + interval '1 year', 'active'
from public.subscriptions s
left join (
  select user_id, sum(minutes_remaining) as remaining
  from public.voice_credits
  where status = 'active' and expires_at > now()
  group by user_id
) v on v.user_id = s.user_id
where s.plan_type = 'trial' and coalesce(v.remaining, 0) < 120;
