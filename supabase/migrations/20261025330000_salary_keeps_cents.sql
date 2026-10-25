-- Pay keeps its cents (Phase 7 product audit, 2026-10-25).
--
-- jobs.salary_min / salary_max were integers, so "$18.50/hr" was stored and
-- shown as 19. They become numeric(12,2). published_jobs_public reads both
-- columns, and Postgres cannot change the type of a column a view reads, so
-- the view is dropped and made again from its own live definition (read back
-- with pg_get_viewdef, unchanged), with the same grants, in the same
-- transaction: no visitor ever sees it missing. No function reads either
-- column. Safe to run twice; skips what a partial test schema lacks.

DO $$
DECLARE
  def text;
BEGIN
  IF to_regclass('public.jobs') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.published_jobs_public') IS NOT NULL THEN
    def := pg_get_viewdef('public.published_jobs_public'::regclass, true);
    DROP VIEW public.published_jobs_public;
  END IF;
  ALTER TABLE public.jobs
    ALTER COLUMN salary_min TYPE numeric(12,2),
    ALTER COLUMN salary_max TYPE numeric(12,2);
  IF def IS NOT NULL THEN
    EXECUTE 'CREATE VIEW public.published_jobs_public AS ' || def;
    REVOKE ALL ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.published_jobs_public TO anon, authenticated;
    GRANT ALL ON public.published_jobs_public TO service_role;
  END IF;
END $$;
