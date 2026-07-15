-- Public job pages should expose only the fields candidates and crawlers need.
-- The raw jobs table can contain internal scoring config and quiz answer keys.

CREATE OR REPLACE VIEW public.published_jobs_public AS
SELECT
  j.id,
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
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', q ->> 'id',
            'type', q ->> 'type',
            'question', q ->> 'question',
            'required', q -> 'required',
            'placeholder', q ->> 'placeholder',
            'time_limit_seconds', q -> 'time_limit_seconds',
            'category', q ->> 'category'
          )
        )
      )
      FROM jsonb_array_elements(COALESCE(j.application_questions, '[]'::jsonb)) q
    ),
    '[]'::jsonb
  ) AS application_questions,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', q ->> 'id',
            'type', q ->> 'type',
            'question', q ->> 'question',
            'options', q -> 'options',
            'time_limit_seconds', q -> 'time_limit_seconds',
            'category', q ->> 'category'
          )
        )
      )
      FROM jsonb_array_elements(COALESCE(j.quiz_questions, '[]'::jsonb)) q
    ),
    '[]'::jsonb
  ) AS quiz_questions,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', s ->> 'id',
            'type', s ->> 'type',
            'title', s ->> 'title',
            'description', s ->> 'description',
            'required', s -> 'required'
          )
        )
      )
      FROM jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) s
    ),
    '[]'::jsonb
  ) AS workflow_steps
FROM public.jobs j
WHERE j.status = 'published';

GRANT SELECT ON public.published_jobs_public TO anon, authenticated;

DROP POLICY IF EXISTS "Published jobs are viewable by everyone" ON public.jobs;

DROP POLICY IF EXISTS "Candidates can view jobs they applied to" ON public.jobs;
CREATE POLICY "Candidates can view jobs they applied to"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.job_id = jobs.id
      AND a.candidate_id = auth.uid()
  )
);
