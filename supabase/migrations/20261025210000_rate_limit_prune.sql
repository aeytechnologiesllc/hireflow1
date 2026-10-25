-- The rate-limit table keeps a counter as long as its window lasts, and is
-- emptied of the rest every hour (2026-10-25, the second Phase 5 review).
--
-- prune_rate_limits() deleted rows older than 2 hours, but a limit can now
-- count over a day (200 practice turns per application per day,
-- _shared/rateLimit.ts): run every hour, it would have reset that counter
-- after 02:00 UTC. And nothing ran it, so the table only grew. Now it keeps
-- two days (the longest window is one) and pg_cron runs it every hour.

create or replace function public.prune_rate_limits() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from private_rate_limit where window_start < now() - interval '2 days';
$$;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'prune-rate-limits') then
      perform cron.unschedule('prune-rate-limits');
    end if;
    perform cron.schedule('prune-rate-limits', '41 * * * *', 'select public.prune_rate_limits()');
  end if;
end $$;
