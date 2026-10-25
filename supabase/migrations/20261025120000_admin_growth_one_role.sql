-- admin_growth counts each new account once (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 2, task 3; second Pass C review). The 20261025080000 version joined
-- every user_roles row, so an account with two roles was counted twice. None
-- has two today (checked live the same day); this keeps it so. Everything
-- else is unchanged.

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
            -- One role per account: a second role row must not count it twice.
            left join lateral (
              select ur.role from public.user_roles ur where ur.user_id = u.id order by ur.role limit 1
            ) r on true
           where u.created_at >= v_since
           group by 1, 2
        ) a
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_growth(integer) from public, anon;
grant execute on function public.admin_growth(integer) to authenticated;
