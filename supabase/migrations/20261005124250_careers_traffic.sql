-- Careers traffic for the hiring team (2026-10-05).
--
-- page_view_daily holds the site's cookieless daily view counts per path (job
-- ids redacted to <redacted>), readable only by developers. The hiring team
-- needs "is anyone looking?" before the first application lands, so this
-- returns the candidate-facing slice of it per day: the careers page ("/"),
-- the job pages, and the apply / sign-up pages.
--
-- * Visits that came from the staff site (the team previewing its own role)
--   are left out.
-- * Counting starts the day after the caller's first live role was created:
--   launch day (2026-10-04) was dominated by our own test traffic.
-- * Only someone with a live role (its owner or an active team member on it)
--   may call it; everyone else gets NOT_AUTHORIZED.
create or replace function public.get_careers_traffic(p_days integer default 14)
returns table(day date, careers_views integer, job_views integer, apply_views integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_since date;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select min(j.created_at)::date + 1 into v_since
  from public.jobs j
  where j.status = 'published'
    and (j.employer_id = v_uid or public.is_active_team_member_for_job(j.id, v_uid));

  if v_since is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
  select d.day::date,
    coalesce(sum(v.view_count) filter (where v.path = '/'), 0)::integer,
    coalesce(sum(v.view_count) filter (where v.path like '/candidate/job/%' or v.path like '/job/%'), 0)::integer,
    coalesce(sum(v.view_count) filter (
      where v.path like '/candidate/apply%' or v.path like '/apply%' or v.path like '/candidate/auth%'
    ), 0)::integer
  from generate_series(greatest(current_date - (v_days - 1), v_since), current_date, interval '1 day') as d(day)
  left join public.page_view_daily v
    on v.day = d.day::date
   and coalesce(v.referrer_host, '') <> 'staff.hireflownow.com'
  group by d.day
  order by d.day;
end;
$$;

revoke all on function public.get_careers_traffic(integer) from public, anon;
grant execute on function public.get_careers_traffic(integer) to authenticated;
