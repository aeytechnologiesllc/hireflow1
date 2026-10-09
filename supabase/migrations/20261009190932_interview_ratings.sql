-- ============================================================================
-- Interview ratings (2026-10-09): what the interviewer thought of each answer
-- on a live call, kept with the interview guide.
-- ============================================================================
-- The owner, after his first live interviews, reading from the guide: "give
-- me a button that I could rate all of these answers from 1 to 10. Here in
-- the interview guide, that way I don't need a separate piece of paper or
-- something, and I could probably write extra notes here as well."
--
-- Until now the guide said "marks are not stored: they are for the owner's
-- own notes", and he was writing on paper. This keeps them: for each question
-- a score from 1 to 10 and a note, plus one note on the whole call
-- (src/lib/interviewGuide.ts, GuideRatings; docs/INTERVIEWS.md).
--
-- They are the hiring team's own. They decide nothing and tell the applicant
-- nothing: no status change, no email, no bell.
--
-- Why a table of its own, and not a key in applications.notes: an applicant
-- can read their own applications row, so anything kept there would show them
-- how each answer was rated. Nobody but the job's hiring team can read this
-- table, and nobody writes it directly.
--
-- Applying it while people are applying: the ONLY locks this takes on tables
-- that already exist are the two foreign keys' (section 3, the last
-- statements), on applications and jobs, for the instant it takes to add a
-- constraint to an empty table, and only on the first run: a re-run finds the
-- constraints and adds nothing. lock_timeout makes it give up after 3 seconds
-- rather than queue every form save and test result behind it; if it times
-- out, nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.interview_ratings: one row per (application, person who rated):
--      the job (for the row's own access rule), the ratings as JSON keyed by
--      question ({ "<key>": { "score": 1-10 or null, "note": text,
--      "question": the question as it was asked } }), a note on the whole
--      call, and when. RLS: the job's owner and its active team members read
--      it; nobody else sees a row, the applicant least of all. No INSERT,
--      UPDATE or DELETE policy, and no write grant to a client role.
--
--   2. save_interview_ratings(p_application_id, p_answers, p_overall_note):
--      SECURITY DEFINER, for the job's owner or an active team member on
--      that job. The job is taken from the application and the rater from
--      the caller, never from the request. It replaces the caller's OWN row
--      with what was sent, after reading every entry: a known-looking key, a
--      whole-number score from 1 to 10 or none, a note of at most 2000
--      characters, the question in at most 400, at most 40 entries; an entry
--      with neither a score nor a note is dropped. Anything else is refused
--      whole. An application the caller is not on the team for, or that does
--      not exist, reads the same: refused.
--
--   3. The two foreign keys, last: an application or a job that is deleted
--      takes its ratings with it.
--
-- It does not touch public.applications' rows, columns, triggers or
-- policies, and no existing function is changed.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_ratings (
  application_id uuid NOT NULL,
  rated_by       uuid NOT NULL,
  job_id         uuid NOT NULL,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_note   text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, rated_by),
  CONSTRAINT interview_ratings_answers_object CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT interview_ratings_overall_length CHECK (char_length(overall_note) <= 4000)
);

CREATE INDEX IF NOT EXISTS interview_ratings_job_idx
  ON public.interview_ratings (job_id);

COMMENT ON TABLE public.interview_ratings IS
  'How one member of the hiring team rated an applicant''s answers on a live interview: a score from 1 to 10 and a note per question of the interview guide, and a note on the whole call (src/lib/interviewGuide.ts GuideRatings). Private to the job''s owner and its active team members; the applicant can never read it. Written only through save_interview_ratings.';

ALTER TABLE public.interview_ratings ENABLE ROW LEVEL SECURITY;

-- Read only, for the job's own hiring team. Writes go through the SECURITY
-- DEFINER function below, which takes the job from the application itself: a
-- direct INSERT would let a signed-in user pair any application with a job
-- they own and read ratings back.
REVOKE ALL ON public.interview_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.interview_ratings TO authenticated;
GRANT ALL ON public.interview_ratings TO service_role;

DROP POLICY IF EXISTS "Hiring team can read their interview ratings" ON public.interview_ratings;
CREATE POLICY "Hiring team can read their interview ratings"
  ON public.interview_ratings FOR SELECT TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- ── 2. Saving them ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_interview_ratings(p_application_id uuid, p_answers jsonb, p_overall_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_job      uuid;
  v_overall  text := COALESCE(p_overall_note, '');
  v_clean    jsonb := '{}'::jsonb;
  v_key      text;
  v_val      jsonb;
  v_score    numeric;
  v_note     text;
  v_question text;
  v_count    integer := 0;
  v_row      public.interview_ratings;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_interview_ratings: not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'save_interview_ratings: the ratings must be an object' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_overall) > 4000 THEN
    RAISE EXCEPTION 'save_interview_ratings: the overall note is at most 4000 characters' USING ERRCODE = '22023';
  END IF;
  -- Before anything is read entry by entry: 40 entries of 2400 characters
  -- are well under this.
  IF octet_length(p_answers::text) > 400000 THEN
    RAISE EXCEPTION 'save_interview_ratings: too much to save' USING ERRCODE = '22023';
  END IF;

  SELECT a.job_id INTO v_job FROM public.applications a WHERE a.id = p_application_id;
  -- Not found and not allowed read the same: an application id on someone
  -- else's job says nothing about whether it exists.
  IF v_job IS NULL
     OR NOT (public.is_job_owner(v_job, v_uid) OR public.is_active_team_member_for_job(v_job, v_uid)) THEN
    RAISE EXCEPTION 'save_interview_ratings: not allowed' USING ERRCODE = '42501';
  END IF;

  FOR v_key, v_val IN SELECT e.key, e.value FROM jsonb_each(p_answers) AS e LOOP
    IF v_key !~ '^[a-z0-9_:.-]{1,80}$' OR jsonb_typeof(v_val) <> 'object' THEN
      RAISE EXCEPTION 'save_interview_ratings: an entry is not a rating' USING ERRCODE = '22023';
    END IF;

    IF NOT (v_val ? 'score') OR jsonb_typeof(v_val -> 'score') = 'null' THEN
      v_score := NULL;
    ELSIF jsonb_typeof(v_val -> 'score') <> 'number' THEN
      RAISE EXCEPTION 'save_interview_ratings: a score is a whole number from 1 to 10' USING ERRCODE = '22023';
    ELSE
      v_score := (v_val ->> 'score')::numeric;
      IF v_score <> trunc(v_score) OR v_score < 1 OR v_score > 10 THEN
        RAISE EXCEPTION 'save_interview_ratings: a score is a whole number from 1 to 10' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF (v_val ? 'note' AND jsonb_typeof(v_val -> 'note') NOT IN ('string', 'null'))
       OR (v_val ? 'question' AND jsonb_typeof(v_val -> 'question') NOT IN ('string', 'null')) THEN
      RAISE EXCEPTION 'save_interview_ratings: a note and a question are text' USING ERRCODE = '22023';
    END IF;
    v_note := COALESCE(v_val ->> 'note', '');
    v_question := COALESCE(v_val ->> 'question', '');
    IF char_length(v_note) > 2000 OR char_length(v_question) > 400 THEN
      RAISE EXCEPTION 'save_interview_ratings: a note is at most 2000 characters' USING ERRCODE = '22023';
    END IF;

    -- Neither a score nor a note: nothing to keep (a rating that was cleared).
    IF v_score IS NULL AND v_note !~ '\S' THEN
      CONTINUE;
    END IF;

    v_count := v_count + 1;
    IF v_count > 40 THEN
      RAISE EXCEPTION 'save_interview_ratings: at most 40 ratings on one interview' USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean || jsonb_build_object(
      v_key,
      jsonb_build_object('score', v_score::integer, 'note', v_note, 'question', v_question)
    );
  END LOOP;

  INSERT INTO public.interview_ratings (application_id, rated_by, job_id, answers, overall_note)
  VALUES (p_application_id, v_uid, v_job, v_clean, v_overall)
  ON CONFLICT (application_id, rated_by) DO UPDATE
    SET answers = EXCLUDED.answers,
        overall_note = EXCLUDED.overall_note,
        job_id = EXCLUDED.job_id,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'application_id', v_row.application_id,
    'answers', v_row.answers,
    'overall_note', v_row.overall_note,
    'updated_at', v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.save_interview_ratings(uuid, jsonb, text) IS
  'Replaces the caller''s own interview ratings for one application: a score from 1 to 10 and a note per question of the interview guide, and a note on the whole call. For the job''s owner or an active team member on that job; the job comes from the application and the rater from the caller, never from the request. Every entry is read and bounded; anything malformed is refused whole.';

REVOKE ALL ON FUNCTION public.save_interview_ratings(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_interview_ratings(uuid, jsonb, text) TO authenticated, service_role;

-- ── 3. The foreign keys, last (the only locks on applications and jobs) ────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interview_ratings_application_fkey'
       AND conrelid = 'public.interview_ratings'::regclass
  ) THEN
    ALTER TABLE public.interview_ratings
      ADD CONSTRAINT interview_ratings_application_fkey
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interview_ratings_job_fkey'
       AND conrelid = 'public.interview_ratings'::regclass
  ) THEN
    ALTER TABLE public.interview_ratings
      ADD CONSTRAINT interview_ratings_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
