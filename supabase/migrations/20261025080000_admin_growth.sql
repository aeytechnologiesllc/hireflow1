-- Where new businesses come from, for the platform admin (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 2, task 3).
--
-- Before the marketing push (YouTube, Quora, directories) the owner could not
-- tell which channel brought anyone: the front page was not counted and an
-- account kept no trace of how its owner arrived. The front page now counts
-- (public/beacon.js), carries its visitor's campaign tags and referring site
-- to the sign-up links (public/carry-source.js), and a new account keeps them
-- as signup_source in its metadata (src/lib/signupSource.ts).
--
-- admin_growth(p_days) answers, for the last p_days days (UTC):
--   front_page:   visits to "/" by source (utm_source, else referring site,
--                 else "direct")
--   signup_page:  visits to the staff site's /auth (sign-up and sign-in share it)
--   accounts:     new accounts by role and source
-- Platform admin only (is_platform_admin(), which asks for the second step
-- once the admin has an authenticator).

create or replace function public.admin_growth(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since date := (now() at time zone 'utc')::date - (v_days - 1);
begin
  if not public.is_platform_admin() then
    raise exception 'admins_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'days', v_days,
    'front_page', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'visits', visits) order by visits desc)
        from (
          select coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') as source,
                 sum(view_count)::integer as visits
            from public.page_view_daily
           where day >= v_since and path = '/'
           group by 1
        ) s
    ), '[]'::jsonb),
    'signup_page', coalesce((
      select sum(view_count)::integer from public.page_view_daily where day >= v_since and path = '/auth'
    ), 0),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('role', role, 'source', source, 'accounts', n) order by n desc)
        from (
          select coalesce(r.role::text, 'none') as role,
                 coalesce(
                   nullif(u.raw_user_meta_data #>> '{signup_source,utm_source}', ''),
                   nullif(u.raw_user_meta_data #>> '{signup_source,ref}', ''),
                   'unknown'
                 ) as source,
                 count(*)::integer as n
            from auth.users u
            left join public.user_roles r on r.user_id = u.id
           where u.created_at >= v_since
           group by 1, 2
        ) a
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_growth(integer) from public, anon;
grant execute on function public.admin_growth(integer) to authenticated;
