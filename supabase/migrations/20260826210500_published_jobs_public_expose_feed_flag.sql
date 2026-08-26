-- Expose the feed gate on the public view so /jobs.xml can honour it.
create or replace view public.published_jobs_public as
 SELECT id, employer_id, title, description, responsibilities, requirements, location,
    job_type, experience_level, department, skills_required, salary_min, salary_max,
    salary_currency, salary_period, created_at, application_deadline, job_code,
    location_city, location_region, location_country, location_country_code,
    latitude, longitude, is_remote, locations, require_resume,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', q.value ->> 'id'::text, 'type', q.value ->> 'type'::text, 'question', q.value ->> 'question'::text, 'required', q.value -> 'required'::text, 'placeholder', q.value ->> 'placeholder'::text, 'time_limit_seconds', q.value -> 'time_limit_seconds'::text, 'category', q.value ->> 'category'::text))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.application_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS application_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', q.value ->> 'id'::text, 'type', q.value ->> 'type'::text, 'question', q.value ->> 'question'::text, 'options', q.value -> 'options'::text, 'time_limit_seconds', q.value -> 'time_limit_seconds'::text, 'category', q.value ->> 'category'::text))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.quiz_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS quiz_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.value ->> 'id'::text, 'type', s.value ->> 'type'::text, 'title', s.value ->> 'title'::text, 'description', s.value ->> 'description'::text, 'required', s.value -> 'required'::text))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) s(value)), '[]'::jsonb) AS workflow_steps,
    j.exclude_from_feed
   FROM jobs j
  WHERE status = 'published'::job_status;
