-- The daily AI budget, after the Phase 5 review (2026-10-25; first version
-- 20261025160000_ai_business_budget.sql).
--
-- A call the PLATFORM budget refused was still counted against the
-- business's own budget: during a platform-wide refusal, applicants'
-- retries pushed their businesses toward their own cap and set off a
-- misleading "a business reached its daily AI budget" alert. Now a call
-- refused by the platform budget gives the business its unit back, so a
-- business's count is only the calls that went ahead (plus, as before, the
-- one refused by its own cap, which never reaches the platform count).
-- Everything else is unchanged.

create or replace function public.ai_budget_take(p_calls integer default 1, p_business uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_take integer := greatest(1, least(coalesce(p_calls, 1), 100));
  v_cap integer;
  v_calls integer;
  v_business uuid;
  v_business_cap integer;
  v_business_calls integer;
begin
  -- The business: the account itself, or the business it is an active team member of.
  if p_business is not null then
    select coalesce(
      (select tm.employer_id from public.team_members tm where tm.user_id = p_business and tm.status = 'active' limit 1),
      p_business
    ) into v_business;
    if exists (select 1 from public.platform_admins a where a.user_id = v_business) then
      v_business := null;
    end if;
  end if;

  if v_business is not null then
    select coalesce((value #>> '{}')::integer, 2000)
      into v_business_cap
      from public.app_settings
     where key = 'ai_business_daily_call_cap';
    v_business_cap := coalesce(v_business_cap, 2000);

    insert into private.ai_business_daily_usage as u (business_id, day, calls)
    values (v_business, v_today, v_take)
    on conflict (business_id, day) do update
      set calls = u.calls + excluded.calls,
          updated_at = now()
    returning u.calls into v_business_calls;

    if v_business_calls > v_business_cap then
      update private.ai_business_daily_usage
         set refused = refused + 1
       where business_id = v_business and day = v_today;
      perform private.ai_budget_alert(
        'business:' || v_business::text,
        'A business reached its daily AI budget',
        'Business ' || v_business::text || ' used its ' || v_business_cap || ' AI calls for today (UTC). Its applicants are asked to come back in a few hours, until midnight UTC. Raise ai_business_daily_call_cap in app_settings if this is real hiring.'
      );
      return false;
    end if;
  end if;

  select coalesce((value #>> '{}')::integer, 10000)
    into v_cap
    from public.app_settings
   where key = 'ai_daily_call_cap';
  v_cap := coalesce(v_cap, 10000);

  insert into private.ai_daily_usage as u (day, calls)
  values (v_today, v_take)
  on conflict (day) do update
    set calls = u.calls + excluded.calls,
        updated_at = now()
  returning u.calls into v_calls;

  if v_calls > v_cap then
    update private.ai_daily_usage
       set refused = refused + 1
     where day = v_today;
    -- The platform said no: the business gets its unit back.
    if v_business is not null then
      update private.ai_business_daily_usage
         set calls = greatest(0, calls - v_take),
             updated_at = now()
       where business_id = v_business and day = v_today;
    end if;
    perform private.ai_budget_alert(
      'platform:100',
      'The daily AI budget is used up',
      'All ' || v_cap || ' AI calls for today (UTC) are used. New tests wait until midnight UTC. Raise ai_daily_call_cap in app_settings to allow more.'
    );
    return false;
  end if;
  if v_calls * 5 >= v_cap * 4 then
    perform private.ai_budget_alert(
      'platform:80',
      '80% of today''s AI budget is used',
      v_calls || ' of ' || v_cap || ' AI calls for today (UTC) are used.'
    );
  end if;
  return true;
end;
$$;

revoke all on function public.ai_budget_take(integer, uuid) from public, anon, authenticated;
grant execute on function public.ai_budget_take(integer, uuid) to service_role;
