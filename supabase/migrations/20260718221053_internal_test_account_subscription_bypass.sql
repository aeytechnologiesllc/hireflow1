-- Internal test accounts can bypass subscription limits without pretending to
-- have a paid Stripe subscription. The flag lives in Auth app metadata, which
-- only trusted admin/service-role code can change.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.has_subscription_bypass_for_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select lower(coalesce(u.raw_app_meta_data ->> 'subscription_bypass', 'false')) = 'true'
      from auth.users u
      where u.id = target_user_id
    ),
    false
  );
$$;

revoke all on function private.has_subscription_bypass_for_user(uuid)
from public, anon, authenticated;

create or replace function public.current_user_has_subscription_bypass()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_subscription_bypass_for_user((select auth.uid()));
$$;

revoke all on function public.current_user_has_subscription_bypass()
from public, anon;
grant execute on function public.current_user_has_subscription_bypass()
to authenticated;

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

  if sub_record.status = 'trialing'
     and (sub_record.trial_end is null or sub_record.trial_end > now()) then
    return 'trial';
  end if;

  return 'none';
end;
$$;

create or replace function public.team_member_limit_for_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when private.has_subscription_bypass_for_user(target_user_id) then -1
    when exists (
      select 1
      from public.subscriptions s
      where s.user_id = target_user_id
        and s.status = 'trialing'
        and (s.trial_end is null or s.trial_end > now())
    ) then 1
    when exists (
      select 1
      from public.subscriptions s
      where s.user_id = target_user_id
        and s.status = 'active'
        and s.plan_type in ('business', 'enterprise')
    ) then -1
    else 0
  end;
$$;

comment on function public.current_user_has_subscription_bypass() is
  'Returns whether the signed-in account has an admin-managed subscription bypass.';
