-- Phase 7 growth audit, round 4 (2026-10-25). Unchanged from
-- 20261025390000_admin_growth_channels.sql except that every source is named
-- through growth_source_name.

-- Admin → Growth names a referring site once (the fourth growth review):
-- Facebook arrived as l.facebook.com, m.facebook.com, lm.facebook.com and
-- www.facebook.com, and as the tag "facebook", Google's Android app as its
-- package name, and the owner had to add them up. growth_source_name gives
-- the usual channels one name each (facebook, youtube, google...); any other
-- site is its host without "www." or "m.", and HireFlow's own tags
-- (open_jobs, flyer...) pass through.

create or replace function public.growth_source_name(p_source text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when s is null or s = '' then null
    when s in ('facebook', 'fb') or s ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$' then 'facebook'
    when s in ('instagram', 'ig') or s ~ '(^|\.)instagram\.com$' then 'instagram'
    when s = 'linkedin' or s ~ '(^|\.)(linkedin\.com|lnkd\.in)$' then 'linkedin'
    when s in ('x', 'twitter') or s ~ '(^|\.)(twitter\.com|x\.com|t\.co)$' then 'x'
    when s in ('youtube', 'yt') or s ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'youtube'
    when s = 'tiktok' or s ~ '(^|\.)tiktok\.com$' then 'tiktok'
    when s = 'google' or s ~ '(^|\.)google\.[a-z.]+$' or s like 'com.google.android.%' then 'google'
    when s = 'bing' or s ~ '(^|\.)bing\.com$' then 'bing'
    when s = 'quora' or s ~ '(^|\.)quora\.com$' then 'quora'
    when s = 'reddit' or s ~ '(^|\.)reddit\.com$' then 'reddit'
    else regexp_replace(s, '^(www|m|l|lm|mobile|web)\.', '')
  end
  from (select lower(trim(p_source)) as s) x
$$;

grant execute on function public.growth_source_name(text) to authenticated, service_role;

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
      coalesce(public.growth_source_name(nullif(v.utm_source, '')), public.growth_source_name(nullif(v.referrer_host, '')), 'direct') as source,
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
          select coalesce(public.growth_source_name(nullif(utm_source, '')), public.growth_source_name(nullif(referrer_host, '')), 'direct') as source,
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
                   public.growth_source_name(nullif(u.raw_user_meta_data #>> '{signup_source,utm_source}', '')),
                   public.growth_source_name(nullif(u.raw_user_meta_data #>> '{signup_source,ref}', '')),
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
                   public.growth_source_name(nullif(u.raw_user_meta_data #>> '{signup_source,utm_source}', '')),
                   public.growth_source_name(nullif(u.raw_user_meta_data #>> '{signup_source,ref}', '')),
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
