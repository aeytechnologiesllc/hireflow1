-- "Told today" for the server's own alerts lives where no client can write
-- (the eighth Phase 5 review, 2026-10-25). document-cleanup decided whether
-- it had already told the platform admins by looking for a card with the
-- same title in their bells. Anyone who applied to HireFlow's own job may
-- write a card into the owner's bell ("Related parties can insert
-- notifications"), so an applicant could post "ID papers were not deleted
-- on time" once a day, marked read, and the real alert never came.
--
-- claim_daily_alert(key) records the key for today (UTC) in
-- private.ai_budget_alerts, the table ai_budget_take already uses for the
-- same purpose, and answers true only the first time that day. Only the
-- server (service role) may call it.

create or replace function public.claim_daily_alert(p_alert text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if p_alert is null or length(p_alert) = 0 or length(p_alert) > 200 then
    return false;
  end if;
  insert into private.ai_budget_alerts (day, alert)
  values ((now() at time zone 'utc')::date, p_alert)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.claim_daily_alert(text) from public, anon, authenticated;
grant execute on function public.claim_daily_alert(text) to service_role;
