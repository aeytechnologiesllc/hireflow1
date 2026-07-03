-- Keep the versioned schema aligned with the live Google-for-Jobs fields used by
-- the Ava and manual job publishing flows. These already exist in production; the
-- migration is intentionally no-op safe for environments that are caught up.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_region text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_country_code text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS is_remote boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS locations jsonb,
  ADD COLUMN IF NOT EXISTS salary_period text;

CREATE INDEX IF NOT EXISTS idx_jobs_published_deadline_updated
  ON public.jobs (status, application_deadline, updated_at DESC)
  WHERE status = 'published';
