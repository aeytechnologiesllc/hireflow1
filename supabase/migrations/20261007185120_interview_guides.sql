-- ============================================================================
-- Interview guides (2026-10-07): the part of an interview guide written for
-- one applicant, kept where only the hiring team can read it.
-- ============================================================================
-- The owner, with 101 applications in and his first interviews ahead: "make a
-- system inside that could generate important questionnaires for the
-- interview ... maybe I just start with why should we hire you ... I'm more
-- concerned about ... constant change ... team leadership."
--
-- A guide is a plan every applicant to the job gets (written by hand, in
-- src/lib/interviewGuide.ts, nothing stored) and a personal part written for
-- one applicant from their own record by the interview-guide edge function:
-- who they are on paper, three or four questions only this person should be
-- asked, and facts to confirm. docs/INTERVIEWS.md, "The interview guide".
--
-- Why a table of its own, and not a key in applications.notes: an applicant
-- can read their own applications row, so anything kept there shows them what
-- they will be asked and what the interviewer is listening for. Nobody but
-- the job's hiring team can read this table, and nobody writes it directly:
-- the edge function does, with the service role, after checking the caller
-- is the job's owner or an active team member scoped to the job.
--
-- Applying it while people are applying: the ONLY locks this takes on tables
-- that already exist are the two foreign keys' (section 2, the last
-- statements), on applications and jobs, for the instant it takes to add a
-- constraint to an empty table, and only on the first run: a re-run finds the
-- constraints and adds nothing. lock_timeout makes it give up after 3 seconds
-- rather than queue every form save and test result behind it; if it times
-- out, nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.interview_guides: one row per application (application_id is
--      the key), with its job (for the row's own access rule), the personal
--      part as JSON, what it was written from (a fingerprint, the prompt's
--      version, the model), and who asked for it and when. RLS: the job's
--      owner and the job's active team members read it; nobody else sees a
--      row. No INSERT, UPDATE or DELETE policy, and no write grant to a
--      client role.
--
--   2. The two foreign keys, last: an application or a job that is deleted
--      takes its guide with it.
--
-- It does not touch public.applications' rows, columns, triggers or
-- policies, and no existing function is changed.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_guides (
  application_id uuid PRIMARY KEY,
  job_id         uuid NOT NULL,
  guide          jsonb NOT NULL CHECK (jsonb_typeof(guide) = 'object'),
  fingerprint    text NULL,
  prompt_version text NULL,
  model          text NULL,
  generated_by   uuid NULL,
  generated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_guides_job_idx
  ON public.interview_guides (job_id);

COMMENT ON TABLE public.interview_guides IS
  'The personal part of an applicant''s interview guide: who they are on paper, the questions only this person should be asked, facts to confirm (src/lib/interviewGuide.ts PersonalGuide). Written by the interview-guide edge function with the service role, from the applicant''s own record. Private to the job''s owner and its active team members; the applicant can never read it, which is why it is not in applications.notes. docs/INTERVIEWS.md.';

ALTER TABLE public.interview_guides ENABLE ROW LEVEL SECURITY;

-- Read only, for the job's own hiring team. There is no write policy and no
-- write grant: the edge function writes with the service role, taking the job
-- from the application itself.
REVOKE ALL ON public.interview_guides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.interview_guides TO authenticated;
GRANT ALL ON public.interview_guides TO service_role;

DROP POLICY IF EXISTS "Hiring team can read their interview guides" ON public.interview_guides;
CREATE POLICY "Hiring team can read their interview guides"
  ON public.interview_guides FOR SELECT TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- ── 2. The foreign keys, last (the only locks on applications and jobs) ────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interview_guides_application_fkey'
       AND conrelid = 'public.interview_guides'::regclass
  ) THEN
    ALTER TABLE public.interview_guides
      ADD CONSTRAINT interview_guides_application_fkey
      FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interview_guides_job_fkey'
       AND conrelid = 'public.interview_guides'::regclass
  ) THEN
    ALTER TABLE public.interview_guides
      ADD CONSTRAINT interview_guides_job_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
