-- ============================================================================
-- Job links per business: hireflownow.com/c/<business>/<job> (2026-10-10).
-- docs/SHORT-JOB-LINKS.md, "Per business".
-- ============================================================================
-- The owner, opening HireFlow to other businesses: "they're going to be
-- multiple people posting multiple jobs. So do we go back to the job code
-- style of it or unique link?" Chosen: the business's name, then the job's.
-- And: "once I click on the link and they don't have an account and they're
-- creating the account, will they be able to redirect to that same job, no
-- collision?"
--
-- Until now a job's name was unique across the WHOLE site
-- (hireflownow.com/<slug>): the first business to say "team-lead" kept it,
-- and anyone could take a name that looked like another business's.
--
--   1. jobs.slug is unique within a business (jobs_slug_per_business). Two
--      businesses may both have "team-lead"; /c/<business>/<job> names exactly
--      one job, because business_pages.slug is unique too.
--   2. jobs.root_link: the jobs whose root link (hireflownow.com/<slug>) was
--      already handed out keep it, and only they ever have one
--      (jobs_root_link_unique). No client can give a job a root link, so a new
--      business can never take hireflownow.com/<something>. A renamed job
--      loses its root link (the editor already warns that the old link stops).
--   3. Every business with a job has a careers address: business_page_for()
--      makes one from the business's name (as ensure_business_page() does for
--      the caller), on every new job, and now for every business that has one.
--   4. published_jobs_public gains business_slug and root_link, at the END
--      (CREATE OR REPLACE VIEW keeps the columns before them as they are).
--   5. get_careers_traffic() counts a job's visits at its new address and at
--      its root link, if it has one.
--
-- Re-runnable. lock_timeout gives up after 3 seconds rather than queue.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 2. root links: only the ones already handed out ----------------------------------------
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS root_link boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  -- Once: the jobs that had a name before this migration had a root link.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'jobs_root_link_unique') THEN
    UPDATE public.jobs SET root_link = true WHERE slug IS NOT NULL;
  END IF;
END;
$$;

-- 1. a job's name is unique within its business -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS jobs_slug_per_business ON public.jobs (employer_id, slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_root_link_unique ON public.jobs (slug) WHERE root_link;
DROP INDEX IF EXISTS public.jobs_slug_unique;
COMMENT ON COLUMN public.jobs.slug IS 'The job''s name in its link: hireflownow.com/c/<business>/<slug>. Unique within the business; NULL = no short link (the job is reached by id).';
COMMENT ON COLUMN public.jobs.root_link IS 'True only for jobs whose root link hireflownow.com/<slug> was handed out before 2026-10-10; set by migration, never by a client.';

CREATE OR REPLACE FUNCTION public.jobs_root_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.root_link := false;
  ELSE
    -- Kept only while the name is the one the root link was handed out for.
    NEW.root_link := OLD.root_link AND NEW.slug IS NOT DISTINCT FROM OLD.slug;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jobs_root_link_guard ON public.jobs;
CREATE TRIGGER jobs_root_link_guard
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_root_link_guard();

-- 3. every business with a job has a careers address ---------------------------------------
-- The given business's address, made from its name the first time. Not for
-- clients (it would let anyone make a page for anyone); the trigger below and
-- ensure_business_page() call it.
CREATE OR REPLACE FUNCTION public.business_page_for(p_employer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing text;
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF p_employer IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT slug INTO existing FROM public.business_pages WHERE employer_id = p_employer;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_employer) THEN
    RETURN NULL;
  END IF;
  SELECT public.slugify_business(coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'business'))
    INTO base FROM public.profiles p WHERE p.user_id = p_employer;
  base := coalesce(nullif(base, ''), 'business');
  IF char_length(base) < 2 THEN
    base := base || '-jobs';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.business_pages WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := left(base, 46) || '-' || n;
  END LOOP;
  INSERT INTO public.business_pages (employer_id, slug) VALUES (p_employer, candidate)
  ON CONFLICT (employer_id) DO NOTHING;
  RETURN (SELECT slug FROM public.business_pages WHERE employer_id = p_employer);
END;
$$;
REVOKE ALL ON FUNCTION public.business_page_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_page_for(uuid) TO service_role;

-- The caller's own page, as before, through the same maker.
CREATE OR REPLACE FUNCTION public.ensure_business_page()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = me AND role = 'employer') THEN
    RAISE EXCEPTION 'not_a_business' USING ERRCODE = 'check_violation';
  END IF;
  RETURN public.business_page_for(me);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_business_page() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_business_page() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jobs_business_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.business_page_for(NEW.employer_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.jobs_business_page() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS jobs_business_page ON public.jobs;
CREATE TRIGGER jobs_business_page
  AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_business_page();

-- Every business that already has a job.
SELECT public.business_page_for(e.employer_id)
  FROM (SELECT DISTINCT employer_id FROM public.jobs WHERE employer_id IS NOT NULL) e;

-- 4. the public view: the business's address and the root link --------------------------------
CREATE OR REPLACE VIEW public.published_jobs_public AS
SELECT j.id,
    j.employer_id,
    j.title,
    j.description,
    j.responsibilities,
    j.requirements,
    j.location,
    j.job_type,
    j.experience_level,
    j.department,
    j.skills_required,
    j.salary_min,
    j.salary_max,
    j.salary_currency,
    j.salary_period,
    j.created_at,
    j.application_deadline,
    j.job_code,
    j.location_city,
    j.location_region,
    j.location_country,
    j.location_country_code,
    j.latitude,
    j.longitude,
    j.is_remote,
    j.locations,
    j.require_resume,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'required', (q.value -> 'required'::text), 'placeholder', (q.value ->> 'placeholder'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.application_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS application_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'options', (q.value -> 'options'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.quiz_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS quiz_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (s.value ->> 'id'::text), 'type', (s.value ->> 'type'::text), 'title', (s.value ->> 'title'::text), 'description', (s.value ->> 'description'::text), 'required', (s.value -> 'required'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) s(value)), '[]'::jsonb) AS workflow_steps,
    j.exclude_from_feed,
    j.benefits,
    j.slug,
    ( SELECT bp.slug FROM public.business_pages bp WHERE bp.employer_id = j.employer_id) AS business_slug,
    j.root_link
   FROM public.jobs j
  WHERE j.status = 'published'::job_status AND (NOT j.exclude_from_feed OR j.employer_id = auth.uid());

-- CREATE OR REPLACE keeps the view's grants; state the read-only posture again
-- so a future replace cannot quietly bring the writes back.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_jobs_public TO anon, authenticated;

-- 5. a job's visits at its new address too -----------------------------------------------------
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

  -- A job's address (/c/<business>/<job>) and, for the jobs that have one,
  -- its root link (/<job>).
  select coalesce(array_agg(p), '{}') into v_jobs
  from (
    select '/c/' || bp.slug || '/' || j.slug as p
      from public.jobs j join public.business_pages bp on bp.employer_id = j.employer_id
     where j.employer_id = any (v_owners) and j.slug is not null
    union
    select '/' || j.slug
      from public.jobs j
     where j.employer_id = any (v_owners) and j.slug is not null and j.root_link
  ) paths;

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
