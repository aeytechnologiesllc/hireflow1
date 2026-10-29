-- An application's notes are the applicant's and the server's, never the
-- hiring team's browser (the twentieth security review, finding 1, MEDIUM).
--
-- protect_application_columns and protect_application_staff_columns return
-- early for the job's owner and a teammate who manages the pipeline, so the
-- team's browser could write anything into applications.notes, and only a
-- status or phase move counts as contact. Two applicant screens show what is
-- there: the Improvement Report (useImprovementBlueprint shows
-- notes.improvement_blueprint, and its PDF prints it, on the one action of a
-- turned-down card) and the chat interviewer (the practice's "what to
-- improve" from notes.chatSimulationResult, which it is told to raise). A
-- business could decline someone and then write "To be reconsidered, pay the
-- 1,500 PHP review fee by GCash …" as HireFlow's own report, with nothing
-- recorded, so three such reports never paused it (probes
-- n1_notes_reach_interviewer, n2_blueprint_written_by_business). It also
-- closes the review's LOW 1: the portfolio read policy and applicant-file-url
-- accept a path listed in notes, which the team could list.
--
-- No staff page writes notes: the team's own words go to employer_notes
-- (application_evaluations since 20261025235000), its moves to status and
-- phase. The server's writes (edge functions as the service role,
-- merge_application_notes, the quiz and voice submit functions, every
-- SECURITY DEFINER function, whose statements run as its owner) are not held:
-- the trigger fires only for a browser's own statement. The applicant's own
-- writes stay protect_application_columns' to judge.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.applications_notes_not_the_teams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT DISTINCT FROM OLD.candidate_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An application''s notes are written by the applicant and HireFlow only. Keep your own notes in the notes on their card.'
    USING ERRCODE = 'insufficient_privilege', HINT = 'notes_not_the_teams';
END;
$$;

REVOKE ALL ON FUNCTION public.applications_notes_not_the_teams() FROM PUBLIC, anon, authenticated;

-- A browser's own statement runs as "anon" or "authenticated" (inside the
-- server's SECURITY DEFINER functions it runs as their owner, and an edge
-- function's as service_role).
DROP TRIGGER IF EXISTS applications_notes_not_the_teams ON public.applications;
CREATE TRIGGER applications_notes_not_the_teams
  BEFORE UPDATE OF notes ON public.applications
  FOR EACH ROW
  WHEN (current_user IN ('anon', 'authenticated') AND OLD.notes IS DISTINCT FROM NEW.notes)
  EXECUTE FUNCTION public.applications_notes_not_the_teams();

RESET statement_timeout;
RESET lock_timeout;
