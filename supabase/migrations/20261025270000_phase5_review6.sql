-- The AI budget after the sixth Phase 5 review (2026-10-25).
--
-- The new-business day is a day only when it is smaller than the full one:
-- with ai_new_business_daily_call_cap at or above ai_business_daily_call_cap
-- an unconfirmed business simply has the full day, and is never told to
-- confirm for a day it already has; its alert names the one setting that
-- raises it (the new-business cap, now always the smaller).

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
  v_new_business boolean := false;
  v_full_cap integer;
  v_new_cap integer;
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
    v_full_cap := v_business_cap;
    -- Until a business confirms its sign-in email (the same check a first
    -- publish needs, business_email_verified), it gets a smaller day: writing
    -- jobs takes a few dozen calls, and a fresh sign-up cannot take 2,000
    -- from the platform's day. A job saved as "closed" is no test (the fourth
    -- Phase 5 review); a job that is live is (only a confirmed business can
    -- publish one; the fifth).
    v_new_cap := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'ai_new_business_daily_call_cap'), 300);
    -- Only a smaller day is a new-business day: a new-business cap at or above
    -- the full cap changes nothing, and the alert says so (the sixth review).
    if not public.business_email_verified(v_business)
       and not exists (select 1 from public.jobs j where j.employer_id = v_business and j.status = 'published')
       and v_new_cap < v_business_cap then
      v_new_business := true;
      v_business_cap := v_new_cap;
    end if;

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
        case when v_new_business then 'business-new:' else 'business:' end || v_business::text,
        'A business reached its daily AI budget',
        case when v_new_business then
          'Business ' || v_business::text || ' used its ' || v_business_cap || ' AI calls for today (UTC) before confirming its sign-in email or putting a job live. It gets the full day (' || v_full_cap || ') once it does; to allow more before that, raise ai_new_business_daily_call_cap in app_settings.'
        else
          'Business ' || v_business::text || ' used its ' || v_business_cap || ' AI calls for today (UTC). Its applicants are asked to come back later today or tomorrow (the budget starts again at midnight UTC). Raise ai_business_daily_call_cap in app_settings if this is real hiring.'
        end
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

