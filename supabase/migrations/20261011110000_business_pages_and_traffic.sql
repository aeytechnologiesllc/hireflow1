-- ============================================================================
-- Each business its own careers address, and its own visits (2026-10-11).
-- docs/BUSINESS-TRUST.md, "Each business its own".
-- ============================================================================
-- Opening HireFlow to other businesses (the owner, 2026-10-10: "do it all").
--
--   1. public.business_pages: one row per business, its careers address
--      (hireflownow.com/c/<slug>) and a short "about" line. The owner's own
--      business (Zulu Support Team) is the home business: hireflownow.com/careers
--      stays its page as well. ensure_business_page() makes the row from the
--      business's name the first time it is needed (the caller's own only).
--   2. get_careers_traffic(): until now every business with a live job got the
--      whole site's visits (the careers page "/", every job page, every sign-in).
--      Now a business counts only its own careers page and its own job pages.
--      The sign-in and apply pages are shared by every business, so they
--      cannot be split: the home business (the one that runs HireFlow) keeps
--      the site-wide count, and every other business gets its own
--      applications per day in that column.
--
-- Re-runnable. Nothing else changes.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 1. careers addresses ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_pages (
  employer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60),
  about text CHECK (about IS NULL OR char_length(about) <= 600),
  -- The business that runs HireFlow: /careers is its page too.
  home_alias boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_pages_one_home ON public.business_pages (home_alias) WHERE home_alias;
ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_pages FROM PUBLIC, anon, authenticated;
-- A careers page is public by nature: its address and its "about" line.
GRANT SELECT ON public.business_pages TO anon, authenticated;
GRANT UPDATE (slug, about) ON public.business_pages TO authenticated;
GRANT ALL ON public.business_pages TO service_role;
DROP POLICY IF EXISTS "Anyone reads a careers page" ON public.business_pages;
CREATE POLICY "Anyone reads a careers page" ON public.business_pages FOR SELECT USING (true);
DROP POLICY IF EXISTS "A business edits its own page" ON public.business_pages;
CREATE POLICY "A business edits its own page" ON public.business_pages FOR UPDATE
  USING (employer_id = auth.uid()) WITH CHECK (employer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.business_pages_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  -- Only the service role moves the home address.
  IF auth.role() <> 'service_role' THEN
    NEW.home_alias := OLD.home_alias;
    NEW.employer_id := OLD.employer_id;
  END IF;
  NEW.about := nullif(btrim(regexp_replace(coalesce(NEW.about, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS business_pages_touch ON public.business_pages;
CREATE TRIGGER business_pages_touch BEFORE UPDATE ON public.business_pages
  FOR EACH ROW EXECUTE FUNCTION public.business_pages_touch();

-- "Lucky Star Support!" -> "lucky-star-support"
CREATE OR REPLACE FUNCTION public.slugify_business(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), 50);
$$;

-- The caller's own page: made from their business name the first time.
CREATE OR REPLACE FUNCTION public.ensure_business_page()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  existing text;
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = me AND role = 'employer') THEN
    RAISE EXCEPTION 'not_a_business' USING ERRCODE = 'check_violation';
  END IF;
  SELECT slug INTO existing FROM public.business_pages WHERE employer_id = me;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;
  SELECT public.slugify_business(coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'business'))
    INTO base FROM public.profiles p WHERE p.user_id = me;
  base := coalesce(nullif(base, ''), 'business');
  IF char_length(base) < 2 THEN
    base := base || '-jobs';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.business_pages WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := left(base, 46) || '-' || n;
  END LOOP;
  INSERT INTO public.business_pages (employer_id, slug) VALUES (me, candidate)
  ON CONFLICT (employer_id) DO NOTHING;
  RETURN (SELECT slug FROM public.business_pages WHERE employer_id = me);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_business_page() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_business_page() TO authenticated, service_role;

-- The owner's business: zulu-support-team, and the home of /careers.
INSERT INTO public.business_pages (employer_id, slug, home_alias)
SELECT u.id, 'zulu-support-team', true FROM auth.users u WHERE lower(u.email) = 'zack@yahoo.com'
ON CONFLICT (employer_id) DO UPDATE SET home_alias = true;

-- 2. each business its own visits --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_careers_traffic(p_days integer DEFAULT 14)
RETURNS TABLE(day date, careers_views integer, job_views integer, apply_views integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_since date;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
  v_owners uuid[];
  v_home boolean;
  v_careers text[];
  v_jobs text[];
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- The businesses whose live jobs the caller works on: their own, or the
  -- jobs they are on as a team member.
  select array_agg(distinct j.employer_id), min(j.created_at)::date + 1
    into v_owners, v_since
  from public.jobs j
  where j.status = 'published'
    and (j.employer_id = v_uid or public.is_active_team_member_for_job(j.id, v_uid));

  if v_since is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select coalesce(bool_or(bp.home_alias), false), coalesce(array_agg('/c/' || bp.slug), '{}')
    into v_home, v_careers
  from public.business_pages bp where bp.employer_id = any (v_owners);

  select coalesce(array_agg('/' || j.slug), '{}') into v_jobs
  from public.jobs j where j.employer_id = any (v_owners) and j.slug is not null;

  return query
  select d.day::date,
    coalesce(sum(v.view_count) filter (
      where v.path = any (v_careers)
         or (v_home and (v.path = '/careers' or (v.path = '/' and d.day < date '2026-10-10')))
    ), 0)::integer,
    coalesce(sum(v.view_count) filter (
      where v.path = any (v_jobs)
         or (v_home and (v.path like '/candidate/job/%' or v.path like '/job/%'))
    ), 0)::integer,
    case when v_home then
      coalesce(sum(v.view_count) filter (
        where v.path like '/candidate/apply%' or v.path like '/apply%' or v.path like '/candidate/auth%'
      ), 0)::integer
    else
      (select count(*)::integer from public.applications a join public.jobs j2 on j2.id = a.job_id
        where j2.employer_id = any (v_owners) and a.created_at::date = d.day::date)
    end
  from generate_series(greatest(current_date - (v_days - 1), v_since), current_date, interval '1 day') as d(day)
  left join public.page_view_daily v
    on v.day = d.day::date
   and coalesce(v.referrer_host, '') <> 'staff.hireflownow.com'
  group by d.day
  order by d.day;
end;
$function$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
