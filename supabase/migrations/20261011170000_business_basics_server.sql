-- New-business basics, the server half (2026-10-11 overview, step 3).
--
--   1. A suspended business cannot publish a job. Suspending already closes
--      every live job (admin_set_business_status), but nothing stopped the
--      business opening them again; applicants were then refused with a
--      bare "Failed to start application". Only the platform admin (who
--      reopens them on un-pausing) and the server may.
--   2. published_jobs_public never shows a suspended business's job to
--      anyone but that business (belt and braces with 1).
--   3. get_careers_traffic: a business's job views are its own jobs' only
--      (the home business used to be given every /candidate/job/<id> view
--      on the site), and the shared sign-in and job-code pages stop counting
--      for the home business from the day another business has a live job.
--
-- Re-runnable. lock_timeout gives up after 3 seconds rather than queue.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 1. No publishing while suspended ------------------------------------------

CREATE OR REPLACE FUNCTION public.jobs_publish_needs_good_standing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'published'::job_status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published'::job_status THEN
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF public.business_status_of(NEW.employer_id) = 'suspended' THEN
    RAISE EXCEPTION 'Your business is paused, so jobs can''t be published right now. Open Help to message us.'
      USING ERRCODE = 'check_violation', HINT = 'business_suspended';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.jobs_publish_needs_good_standing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jobs_publish_needs_good_standing ON public.jobs;
CREATE TRIGGER jobs_publish_needs_good_standing
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_publish_needs_good_standing();

-- 2. The public view: never a suspended business's job -----------------------
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
  WHERE j.status = 'published'::job_status AND (NOT j.exclude_from_feed OR j.employer_id = auth.uid())
    -- business_standing read directly: a function called in a view runs with
    -- the caller's rights, and business_status_of() is not anyone's to call.
    AND (NOT EXISTS (SELECT 1 FROM public.business_standing s WHERE s.employer_id = j.employer_id AND s.status = 'suspended')
         OR j.employer_id = auth.uid());

-- CREATE OR REPLACE keeps the view's grants; state the read-only posture again
-- so a future replace cannot quietly bring the writes back.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_jobs_public TO anon, authenticated;

-- 3. Visits: a business's own jobs only ----------------------------------------------
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
  v_others_since date;
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

  -- A job's address (/c/<business>/<job>), for the jobs that have one its
  -- root link (/<job>), and its old id addresses (/candidate/job/<id>,
  -- /job/<id>): only the caller's own jobs, never every job on the site.
  select coalesce(array_agg(p), '{}') into v_jobs
  from (
    select '/c/' || bp.slug || '/' || j.slug as p
      from public.jobs j join public.business_pages bp on bp.employer_id = j.employer_id
     where j.employer_id = any (v_owners) and j.slug is not null
    union
    select '/' || j.slug
      from public.jobs j
     where j.employer_id = any (v_owners) and j.slug is not null and j.root_link
    union
    select '/candidate/job/' || j.id::text from public.jobs j where j.employer_id = any (v_owners)
    union
    select '/job/' || j.id::text from public.jobs j where j.employer_id = any (v_owners)
  ) paths;

  -- The sign-in and job-code pages are shared by every business, so they
  -- count for the home business only until another business has a live job;
  -- from that day on it counts the applications it really got, like everyone.
  select min(j.created_at)::date into v_others_since
  from public.jobs j
  where j.status = 'published' and not (j.employer_id = any (v_owners));

  return query
  select d.day::date,
    coalesce(sum(v.view_count) filter (
      where v.path = any (v_careers)
         or (v_home and (v.path = '/careers' or (v.path = '/' and d.day < date '2026-10-10')))
    ), 0)::integer,
    coalesce(sum(v.view_count) filter (
      where v.path = any (v_jobs)
    ), 0)::integer,
    case when v_home and (v_others_since is null or d.day::date < v_others_since) then
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
