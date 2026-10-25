-- A platform-wide daily ceiling on AI calls (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 1, task 3).
--
-- Every OpenAI call the edge functions make goes through
-- supabase/functions/_shared/openai.ts (callOpenAIChat), the streaming helper
-- and generate-flow. Each now takes one unit from today's budget first. Past
-- the ceiling the call is refused as "AI unavailable" (the reason
-- budget_reached), which every page already handles with "a short delay on
-- our side, try again", so a flood of calls from anywhere (an abused public
-- endpoint, a loop in a page, a bot) stops at a known cost instead of an
-- open invoice. The limiter fails open, like the per-caller one: a broken
-- counter never stops a real applicant.
--
-- The ceiling is a setting, not code: app_settings key 'ai_daily_call_cap'
-- (a number). 10,000 calls a day is about four times the busiest real day so
-- far (the October 2026 hiring run: 107 applications in a day, roughly
-- twenty AI calls each). Days are counted in UTC.

create schema if not exists private;

create table if not exists private.ai_daily_usage (
  day date primary key,
  calls integer not null default 0,
  refused integer not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on table private.ai_daily_usage from public, anon, authenticated;

insert into public.app_settings (key, value)
values ('ai_daily_call_cap', '10000'::jsonb)
on conflict (key) do nothing;

-- Takes p_calls units from today's budget. True when the call may go ahead.
create or replace function public.ai_budget_take(p_calls integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cap integer;
  v_calls integer;
  v_take integer := greatest(1, least(coalesce(p_calls, 1), 100));
begin
  select coalesce((value #>> '{}')::integer, 10000)
    into v_cap
    from public.app_settings
   where key = 'ai_daily_call_cap';
  v_cap := coalesce(v_cap, 10000);

  insert into private.ai_daily_usage as u (day, calls)
  values ((now() at time zone 'utc')::date, v_take)
  on conflict (day) do update
    set calls = u.calls + excluded.calls,
        updated_at = now()
  returning u.calls into v_calls;

  if v_calls > v_cap then
    update private.ai_daily_usage
       set refused = refused + 1
     where day = (now() at time zone 'utc')::date;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.ai_budget_take(integer) from public, anon, authenticated;
grant execute on function public.ai_budget_take(integer) to service_role;

-- The owner can read today's count from the admin screens later (Phase 5);
-- for now: select * from private.ai_daily_usage order by day desc;
