-- A daily AI budget per business, under the platform-wide one (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 5, task 4). Billing is off, so nothing may be a
-- paywall; this is a guard on cost, not a price.
--
-- Every OpenAI call already takes one unit from today's platform-wide budget
-- (20261025020000_ai_daily_budget.sql). A call made for a business's job (an
-- applicant's chat practice, interview or scoring, or the business writing a
-- job) now also takes one from THAT business's own budget for the day:
-- app_settings 'ai_business_daily_call_cap', 2,000 calls (about a hundred
-- applicants a day at twenty calls each; the busiest real day so far, the
-- owner's own run, was 107). Past it, the call is refused as "AI unavailable"
-- (budget_reached), which every page already handles by keeping the test
-- open and asking to try again later. One business cannot use up the day for
-- everyone. Platform admins are never counted against a business budget.
--
-- p_business is a job's employer_id, or the account that asked (a business
-- owner, or a team member, who is counted against the business they work
-- for). Unknown: the platform budget only, as before. Fails open like the
-- rest: a missing setting means the default.
--
-- The owner hears about it in the app (a "system" notification, which also
-- reaches their phone when push is on): once a day when the platform budget
-- passes 80% and when it is used up, and once a day for each business that
-- reaches its own budget. Days are counted in UTC.

create table if not exists private.ai_business_daily_usage (
  business_id uuid not null,
  day date not null,
  calls integer not null default 0,
  refused integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, day)
);

revoke all on table private.ai_business_daily_usage from public, anon, authenticated;

-- One row per alert per day, so each is sent once.
create table if not exists private.ai_budget_alerts (
  day date not null,
  alert text not null,
  sent_at timestamptz not null default now(),
  primary key (day, alert)
);

revoke all on table private.ai_budget_alerts from public, anon, authenticated;

insert into public.app_settings (key, value)
values ('ai_business_daily_call_cap', '2000'::jsonb)
on conflict (key) do nothing;

-- Tell every platform admin, once per alert per day.
create or replace function private.ai_budget_alert(p_alert text, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_admin record;
begin
  insert into private.ai_budget_alerts (day, alert)
  values ((now() at time zone 'utc')::date, p_alert)
  on conflict do nothing;
  if not found then
    return;
  end if;
  for v_admin in select a.user_id from public.platform_admins a loop
    insert into public.notifications (user_id, type, title, message, is_read)
    values (v_admin.user_id, 'system', left(p_title, 120), left(p_message, 500), false);
  end loop;
exception
  when others then
    raise log 'ai_budget_alert % skipped: %', p_alert, sqlerrm;
end;
$$;

revoke all on function private.ai_budget_alert(text, text, text) from public, anon, authenticated;

drop function if exists public.ai_budget_take(integer);

-- Takes p_calls units from the business's budget (when there is one) and
-- from today's platform-wide budget. True when the call may go ahead.
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
        'Business ' || v_business::text || ' used its ' || v_business_cap || ' AI calls for today (UTC). Its applicants are asked to come back later until tomorrow. Raise ai_business_daily_call_cap in app_settings if this is real hiring.'
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
    perform private.ai_budget_alert(
      'platform:100',
      'The daily AI budget is used up',
      'All ' || v_cap || ' AI calls for today (UTC) are used. New tests wait until tomorrow. Raise ai_daily_call_cap in app_settings to allow more.'
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
