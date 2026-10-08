-- ============================================================================
-- Notes on an applicant, and "I have looked at this one" (2026-10-08).
-- ============================================================================
-- The owner, going through 124 applicants on his second live hiring day: "is
-- there a way you can cleanly allow me to add some notes ... I like him or he
-- did something really good. That's why I picked him ... just a simple note
-- that I can also access. Also ... sometimes I forget which one I've already
-- clicked on and reviewed ... maybe they change after I've clicked on it
-- once. So that way I know I've clicked on it and viewed their profile."
--
-- Both are private marks of the hiring team's own. They decide nothing and
-- tell the applicant nothing: no status change, no email, no bell.
--
-- Why tables of their own, and not columns on applications: an applicant can
-- read their own applications row, so a column there would show them the
-- team's notes about them. Nobody but the job's hiring team can read a note,
-- and a "viewed" mark is readable only by the person whose mark it is.
--
-- Applying it while people are applying: the ONLY locks this takes on tables
-- that already exist are the foreign keys' (section 5, the last statements),
-- on applications and jobs, for the instant it takes to add a constraint to
-- an empty table, and only on the first run: a re-run finds the constraints
-- and adds nothing. lock_timeout makes it give up after 3 seconds rather
-- than queue every form save and test result behind it; if it times out,
-- nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.applicant_notes: the team's notes on one application, each
--      with its job (for the row's own access rule), who wrote it and when.
--      RLS: the job's owner and its active team members read them; nobody
--      else sees a row, the applicant least of all. Nobody writes it
--      directly.
--
--   2. add_applicant_note(p_application_id, p_body): SECURITY DEFINER, for
--      the job's owner or an active team member on that job. The job is
--      taken from the application and the author from the caller, never from
--      the request. 1 to 2000 characters, at most 200 notes on one
--      application. An application the caller is not on the team for, or
--      that does not exist, reads the same: refused.
--      delete_applicant_note(p_note_id): the note's own author, or the job's
--      owner. Anything else is a quiet "false".
--
--   3. public.applicant_views: one row per (person, application): when that
--      person last opened the applicant's page. RLS: each person reads only
--      their own marks. Nobody writes it directly.
--
--   4. mark_applicant_viewed(p_application_id): SECURITY DEFINER, for the
--      job's owner or an active team member on that job. Sets the caller's
--      own mark to now.
--
--   5. The foreign keys, last: an application or a job that is deleted takes
--      its notes and marks with it.
--
-- It does not touch public.applications' rows, columns, triggers or
-- policies, and no existing function is changed.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. Notes: the table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.applicant_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  job_id         uuid NOT NULL,
  author_id      uuid NULL,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicant_notes_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS applicant_notes_application_idx
  ON public.applicant_notes (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applicant_notes_job_idx
  ON public.applicant_notes (job_id);

COMMENT ON TABLE public.applicant_notes IS
  'The hiring team''s own notes on an application (Notes on the applicant''s page). Private to the job''s owner and its active team members; the applicant can never read them. Written only through add_applicant_note / delete_applicant_note.';

ALTER TABLE public.applicant_notes ENABLE ROW LEVEL SECURITY;

-- Read only, for the job's own hiring team. Writes go through the SECURITY
-- DEFINER functions below, which take the job from the application itself: a
-- direct INSERT would let a signed-in user pair any application with a job
-- they own and read notes back.
REVOKE ALL ON public.applicant_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.applicant_notes TO authenticated;
GRANT ALL ON public.applicant_notes TO service_role;

DROP POLICY IF EXISTS "Hiring team can read their applicant notes" ON public.applicant_notes;
CREATE POLICY "Hiring team can read their applicant notes"
  ON public.applicant_notes FOR SELECT TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- ── 2. Notes: writing one, and taking one away ─────────────────────────────

CREATE OR REPLACE FUNCTION public.add_applicant_note(p_application_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_job   uuid;
  -- Every kind of white space off both ends (btrim alone leaves line breaks,
  -- and a note of nothing but line breaks would be kept).
  v_body  text := regexp_replace(COALESCE(p_body, ''), '^\s+|\s+$', '', 'g');
  v_count integer;
  v_note  public.applicant_notes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_applicant_note: not signed in' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'add_applicant_note: a note is 1 to 2000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT a.job_id INTO v_job FROM public.applications a WHERE a.id = p_application_id;
  -- Not found and not allowed read the same: an application id on someone
  -- else's job says nothing about whether it exists.
  IF v_job IS NULL
     OR NOT (public.is_job_owner(v_job, v_uid) OR public.is_active_team_member_for_job(v_job, v_uid)) THEN
    RAISE EXCEPTION 'add_applicant_note: not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.applicant_notes n WHERE n.application_id = p_application_id;
  IF v_count >= 200 THEN
    RAISE EXCEPTION 'add_applicant_note: at most 200 notes on one applicant' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.applicant_notes (application_id, job_id, author_id, body)
  VALUES (p_application_id, v_job, v_uid, v_body)
  RETURNING * INTO v_note;

  RETURN jsonb_build_object(
    'id', v_note.id,
    'application_id', v_note.application_id,
    'author_id', v_note.author_id,
    'body', v_note.body,
    'created_at', v_note.created_at
  );
END;
$$;

COMMENT ON FUNCTION public.add_applicant_note(uuid, text) IS
  'Adds one of the hiring team''s own notes to an application (1 to 2000 characters, at most 200 on one application). For the job''s owner or an active team member on that job; the job comes from the application and the author from the caller. Refused (42501) for anyone else, and for an application that does not exist. Tells the applicant nothing.';

CREATE OR REPLACE FUNCTION public.delete_applicant_note(p_note_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_note public.applicant_notes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'delete_applicant_note: not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_note FROM public.applicant_notes n WHERE n.id = p_note_id;
  -- Not found and not allowed read the same: a quiet "false".
  IF v_note.id IS NULL THEN
    RETURN false;
  END IF;
  -- The writer may take their own back while they are still on the team;
  -- the job's owner may remove any note on their job.
  IF NOT (
    public.is_job_owner(v_note.job_id, v_uid)
    OR (v_note.author_id = v_uid AND public.is_active_team_member_for_job(v_note.job_id, v_uid))
  ) THEN
    RETURN false;
  END IF;
  DELETE FROM public.applicant_notes WHERE id = p_note_id;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.delete_applicant_note(uuid) IS
  'Removes one applicant note: its own author (while still an active team member on the job) or the job''s owner. Returns false, and removes nothing, for anyone else and for a note that does not exist.';

-- ── 3. "Viewed": the table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.applicant_views (
  viewer_id      uuid NOT NULL,
  application_id uuid NOT NULL,
  job_id         uuid NOT NULL,
  viewed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, application_id)
);

CREATE INDEX IF NOT EXISTS applicant_views_application_idx
  ON public.applicant_views (application_id);
CREATE INDEX IF NOT EXISTS applicant_views_job_idx
  ON public.applicant_views (job_id);

COMMENT ON TABLE public.applicant_views IS
  'When each member of the hiring team last opened an applicant''s page: one row per (person, application). The list shows "Viewed" from it. Each person reads only their own marks; written only through mark_applicant_viewed. The applicant is told nothing.';

ALTER TABLE public.applicant_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.applicant_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.applicant_views TO authenticated;
GRANT ALL ON public.applicant_views TO service_role;

DROP POLICY IF EXISTS "A person reads their own viewed marks" ON public.applicant_views;
CREATE POLICY "A person reads their own viewed marks"
  ON public.applicant_views FOR SELECT TO authenticated
  USING (viewer_id = (SELECT auth.uid()));

-- ── 4. "Viewed": setting the mark ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_applicant_viewed(p_application_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job uuid;
  v_at  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mark_applicant_viewed: not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT a.job_id INTO v_job FROM public.applications a WHERE a.id = p_application_id;
  IF v_job IS NULL
     OR NOT (public.is_job_owner(v_job, v_uid) OR public.is_active_team_member_for_job(v_job, v_uid)) THEN
    RAISE EXCEPTION 'mark_applicant_viewed: not allowed' USING ERRCODE = '42501';
  END IF;

  -- clock_timestamp, not now(): two opens in one transaction are two moments.
  INSERT INTO public.applicant_views (viewer_id, application_id, job_id, viewed_at)
  VALUES (v_uid, p_application_id, v_job, clock_timestamp())
  ON CONFLICT (viewer_id, application_id) DO UPDATE SET viewed_at = EXCLUDED.viewed_at
  RETURNING viewed_at INTO v_at;
  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.mark_applicant_viewed(uuid) IS
  'Records that the caller has just opened this applicant''s page (their own mark only). For the job''s owner or an active team member on that job; refused (42501) for anyone else and for an application that does not exist. Does not touch the application.';

REVOKE ALL ON FUNCTION public.add_applicant_note(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_applicant_note(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_applicant_viewed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_applicant_note(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_applicant_note(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_applicant_viewed(uuid) TO authenticated, service_role;

-- ── 5. The foreign keys, last (the only locks on applications and jobs) ────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicant_notes_application_fkey' AND conrelid = 'public.applicant_notes'::regclass) THEN
    ALTER TABLE public.applicant_notes
      ADD CONSTRAINT applicant_notes_application_fkey
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicant_notes_job_fkey' AND conrelid = 'public.applicant_notes'::regclass) THEN
    ALTER TABLE public.applicant_notes
      ADD CONSTRAINT applicant_notes_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicant_views_application_fkey' AND conrelid = 'public.applicant_views'::regclass) THEN
    ALTER TABLE public.applicant_views
      ADD CONSTRAINT applicant_views_application_fkey
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicant_views_job_fkey' AND conrelid = 'public.applicant_views'::regclass) THEN
    ALTER TABLE public.applicant_views
      ADD CONSTRAINT applicant_views_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
