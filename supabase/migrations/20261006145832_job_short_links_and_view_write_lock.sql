-- Short job links (hireflownow.com/<slug>) and a write lock on the two public views.
--
-- 1. THE HOLE. published_jobs_public and employer_public_branding are plain
--    (security definer, owner postgres) views over one table each, so Postgres
--    treats them as auto-updatable, and Supabase's default grants gave anon and
--    authenticated INSERT/UPDATE/DELETE on them. Writing through a definer view
--    runs as its owner and skips RLS: measured 2026-10-06 in a rolled-back
--    transaction as anon, an UPDATE through published_jobs_public touched the
--    live job, and one through employer_public_branding touched all 11 rows.
--    Anyone holding the public key could have rewritten a job post (its apply
--    link included) or a company's name. Nothing in the app writes through
--    either view; they exist only to be READ by logged-out visitors. So every
--    write privilege is revoked, from PUBLIC too, and SELECT stays.
--
-- 2. THE SHORT LINK. jobs.slug is the job's public path on the candidates'
--    site: hireflownow.com/team-lead instead of
--    hireflownow.com/candidate/apply?code=JOB-C84E85 (owner, 2026-10-06: the
--    long link confuses applicants). Lowercase letters, digits and hyphens,
--    3-40 characters, unique across every job because it is a URL. Words the
--    site already uses as paths are refused by the job editor (the route list
--    lives in the app, which owns it). The public view gains the column, at
--    the END, as CREATE OR REPLACE VIEW requires.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.employer_public_branding FROM PUBLIC, anon, authenticated;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_slug_format;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
CREATE UNIQUE INDEX IF NOT EXISTS jobs_slug_unique ON public.jobs (slug) WHERE slug IS NOT NULL;
COMMENT ON COLUMN public.jobs.slug IS 'The job''s short public path on the candidates'' site: hireflownow.com/<slug>. Unique; NULL = no short link (the job is reached by id or code).';

CREATE OR REPLACE VIEW public.published_jobs_public AS
SELECT id,
    employer_id,
    title,
    description,
    responsibilities,
    requirements,
    location,
    job_type,
    experience_level,
    department,
    skills_required,
    salary_min,
    salary_max,
    salary_currency,
    salary_period,
    created_at,
    application_deadline,
    job_code,
    location_city,
    location_region,
    location_country,
    location_country_code,
    latitude,
    longitude,
    is_remote,
    locations,
    require_resume,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'required', (q.value -> 'required'::text), 'placeholder', (q.value ->> 'placeholder'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.application_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS application_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'options', (q.value -> 'options'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.quiz_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS quiz_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (s.value ->> 'id'::text), 'type', (s.value ->> 'type'::text), 'title', (s.value ->> 'title'::text), 'description', (s.value ->> 'description'::text), 'required', (s.value -> 'required'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) s(value)), '[]'::jsonb) AS workflow_steps,
    exclude_from_feed,
    benefits,
    j.slug
   FROM jobs j
  WHERE ((status = 'published'::job_status) AND ((NOT exclude_from_feed) OR (employer_id = auth.uid())));

-- CREATE OR REPLACE keeps the view's grants; state the read-only posture again
-- so a future replace cannot quietly bring the writes back.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_jobs_public TO anon, authenticated;
