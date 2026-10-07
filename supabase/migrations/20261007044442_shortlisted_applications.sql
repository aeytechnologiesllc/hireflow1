-- ============================================================================
-- Shortlist (2026-10-07): the hiring team's own pick-list for a job.
-- ============================================================================
-- The owner, on his first live hiring day, 62 applicants in: "I need you to
-- also add a feature where I can add them as favorites. Maybe do a short list
-- for this particular job. Not favorite, but short list, I guess."
--
-- A shortlist entry is a private mark on ONE application, so on one job: the
-- same person applying to two jobs can be on one job's shortlist and not the
-- other's. It decides nothing and tells the applicant nothing: no status
-- change, no email, no bell. It is not the pipeline stage the product used to
-- call "Shortlist" (status 'reviewing', which every applicant reaches by
-- sending the form); that label is now "In review" on the staff screens.
--
-- Why a table of its own, and not a column on applications: an applicant can
-- read their own applications row, so a column there would tell them they
-- were shortlisted. Nobody but the job's hiring team can read this table.
--
-- Applying it while people are applying: the ONLY locks this takes on tables
-- that already exist are the two foreign keys' (section 4, the last
-- statements), on applications and jobs, for the instant it takes to add a
-- constraint to an empty table, and only on the first run: a re-run finds the
-- constraints and adds nothing. lock_timeout makes it give up after 3 seconds
-- rather than queue every form save and test result behind it; if it times
-- out, nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.shortlisted_applications: one row per shortlisted application
--      (application_id is the key), with its job (for the row's own access
--      rule), who added it and when. RLS: the job's owner and the job's
--      active team members read it; nobody else sees a row. Nobody writes it
--      directly.
--
--   2. set_applications_shortlisted(p_application_ids, p_shortlisted):
--      SECURITY DEFINER, for the job's owner or an active team member who may
--      manage that job's pipeline (the people who may decide on the
--      applicant). Adds or removes up to 200 applications in one call; an
--      application the caller may not decide on (or that does not exist: the
--      two read the same) is listed under "skipped", never an error for the
--      whole call. Adding one that is already on, or removing one that is
--      not, is a quiet success. Returns {"done": [...], "skipped": [...]}.
--
--   3. Grants.
--
--   4. The two foreign keys, last: an application or a job that is deleted
--      takes its shortlist rows with it.
--
-- It does not touch public.applications' rows, columns, triggers or
-- policies, and no existing function is changed.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shortlisted_applications (
  application_id uuid PRIMARY KEY,
  job_id         uuid NOT NULL,
  added_by       uuid NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shortlisted_applications_job_idx
  ON public.shortlisted_applications (job_id);

COMMENT ON TABLE public.shortlisted_applications IS
  'The hiring team''s shortlist: one row per application they marked (Shortlist on the Applicants list and the applicant''s profile). Private to the job''s owner and its active team members; the applicant is never told and cannot read it. It changes no status and sends nothing. Written only by set_applications_shortlisted.';

ALTER TABLE public.shortlisted_applications ENABLE ROW LEVEL SECURITY;

-- Read only, for the job's own hiring team. Writes go through the SECURITY
-- DEFINER function below, which takes the job from the application itself: a
-- direct INSERT would let a signed-in user pair any application with a job
-- they own and read it back.
REVOKE ALL ON public.shortlisted_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shortlisted_applications TO authenticated;
GRANT ALL ON public.shortlisted_applications TO service_role;

DROP POLICY IF EXISTS "Hiring team can see their shortlist" ON public.shortlisted_applications;
CREATE POLICY "Hiring team can see their shortlist"
  ON public.shortlisted_applications FOR SELECT TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- ── 2. set_applications_shortlisted ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_applications_shortlisted(p_application_ids uuid[], p_shortlisted boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_ids     uuid[];
  v_id      uuid;
  v_job     uuid;
  v_done    uuid[] := ARRAY[]::uuid[];
  v_skipped uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_applications_shortlisted: not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_shortlisted IS NULL THEN
    RAISE EXCEPTION 'set_applications_shortlisted: on or off is required' USING ERRCODE = '22004';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(COALESCE(p_application_ids, ARRAY[]::uuid[])) AS t(x)
   WHERE x IS NOT NULL;
  IF COALESCE(array_length(v_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'set_applications_shortlisted: at most 200 at a time' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_job := NULL;
    SELECT a.job_id INTO v_job FROM public.applications a WHERE a.id = v_id;
    -- Not found and not allowed read the same: an application id on someone
    -- else's job says nothing about whether it exists.
    IF v_job IS NULL
       OR NOT (public.is_job_owner(v_job, v_uid) OR public.is_active_team_member_for_job(v_job, v_uid, true)) THEN
      v_skipped := v_skipped || v_id;
      CONTINUE;
    END IF;

    IF p_shortlisted THEN
      INSERT INTO public.shortlisted_applications (application_id, job_id, added_by)
      VALUES (v_id, v_job, v_uid)
      ON CONFLICT (application_id) DO NOTHING;
    ELSE
      DELETE FROM public.shortlisted_applications WHERE application_id = v_id;
    END IF;
    v_done := v_done || v_id;
  END LOOP;

  RETURN jsonb_build_object('done', to_jsonb(v_done), 'skipped', to_jsonb(v_skipped));
END;
$$;

COMMENT ON FUNCTION public.set_applications_shortlisted(uuid[], boolean) IS
  'Adds (true) or removes (false) up to 200 applications on the hiring team''s shortlist. For the job''s owner or an active team member who may manage its pipeline; any other application is returned under "skipped". Tells the applicant nothing and changes no status.';

-- ── 3. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.set_applications_shortlisted(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_applications_shortlisted(uuid[], boolean) TO authenticated, service_role;

-- ── 4. The foreign keys, last (the only locks on applications and jobs) ────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shortlisted_applications_application_fkey'
       AND conrelid = 'public.shortlisted_applications'::regclass
  ) THEN
    ALTER TABLE public.shortlisted_applications
      ADD CONSTRAINT shortlisted_applications_application_fkey
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shortlisted_applications_job_fkey'
       AND conrelid = 'public.shortlisted_applications'::regclass
  ) THEN
    ALTER TABLE public.shortlisted_applications
      ADD CONSTRAINT shortlisted_applications_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
