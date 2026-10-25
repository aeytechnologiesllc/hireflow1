-- Admin → Growth shows every public way in, and campaigns by name (Phase 7
-- growth audit, round 2, 2026-10-25). admin_growth counted only the front
-- page ("/") by source, and never read utm_campaign or utm_medium, though the
-- page's own tip said a tagged campaign "shows here by name". The blog, Open
-- jobs and job pages could be read only by the developer role, which no
-- account has.
--
-- Added, alongside what was there (the keys the page already reads are
-- unchanged):
--   pages      visits to each kind of public page: the front page, the blog,
--              Open jobs, a job's own page (/job/…, /c/<business>/<job>, or
--              a short link that is a job's slug), a business's careers page
--              (/c/<business>, /careers) and the apply-with-a-code page, each
--              with its top five sources;
--   campaigns  visits to those pages that carried a medium or a campaign, by
--              source, medium and campaign;
--   account_campaigns  new accounts whose sign-up carried a campaign, by
--              role, source and campaign.
-- Visits from the staff host (the hiring team's own clicks) are left out, as
-- the careers page's counts already do.

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

  return (
  with public_visits as (
    select
      case
        when v.path = '/' then 'front_page'
        when v.path = '/blog' or v.path like '/blog/%' then 'blog'
        when v.path = '/open-jobs' then 'open_jobs'
        when v.path like '/job/%' or v.path like '/candidate/job/%' or v.path ~ '^/c/[^/]+/[^/]+$' then 'job_page'
        when v.path ~ '^/c/[^/]+$' or v.path = '/careers' then 'careers_page'
        when v.path = '/apply' or v.path like '/apply/%' then 'apply_with_code'
        when v.path ~ '^/[^/]+$' and exists (select 1 from public.jobs j where j.slug = substr(v.path, 2)) then 'job_page'
      end as kind,
      coalesce(nullif(v.utm_source, ''), nullif(v.referrer_host, ''), 'direct') as source,
      coalesce(v.utm_medium, '') as medium,
      coalesce(v.utm_campaign, '') as campaign,
      v.view_count as visits
    from public.page_view_daily v
    where v.day >= v_since
      and coalesce(v.referrer_host, '') <> 'staff.hireflownow.com'
  ), kinds as (
    select * from public_visits where kind is not null
  )
  select jsonb_build_object(
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
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'visits', visits, 'sources', sources) order by visits desc)
        from (
          select kind,
                 sum(visits)::integer as visits,
                 (select jsonb_agg(jsonb_build_object('source', t.source, 'visits', t.visits) order by t.visits desc)
                    from (
                      select k2.source, sum(k2.visits)::integer as visits
                        from kinds k2
                       where k2.kind = k.kind
                       group by k2.source
                       order by 2 desc
                       limit 5
                    ) t) as sources
            from kinds k
           group by kind
        ) p
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'medium', medium, 'campaign', campaign, 'visits', visits) order by visits desc)
        from (
          select source, medium, campaign, sum(visits)::integer as visits
            from kinds
           where medium <> '' or campaign <> ''
           group by 1, 2, 3
           order by 4 desc
           limit 30
        ) c
    ), '[]'::jsonb),
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
    ), '[]'::jsonb),
    'account_campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('role', role, 'source', source, 'campaign', campaign, 'accounts', n) order by n desc)
        from (
          select coalesce(r.role::text, 'none') as role,
                 coalesce(
                   nullif(u.raw_user_meta_data #>> '{signup_source,utm_source}', ''),
                   nullif(u.raw_user_meta_data #>> '{signup_source,ref}', ''),
                   'unknown'
                 ) as source,
                 u.raw_user_meta_data #>> '{signup_source,utm_campaign}' as campaign,
                 count(*)::integer as n
            from auth.users u
            left join lateral (
              select ur.role from public.user_roles ur where ur.user_id = u.id order by ur.role limit 1
            ) r on true
           where u.created_at >= v_since
             and nullif(u.raw_user_meta_data #>> '{signup_source,utm_campaign}', '') is not null
           group by 1, 2, 3
        ) a
    ), '[]'::jsonb)
  )
  );
end;
$$;

revoke all on function public.admin_growth(integer) from public, anon;
grant execute on function public.admin_growth(integer) to authenticated;
