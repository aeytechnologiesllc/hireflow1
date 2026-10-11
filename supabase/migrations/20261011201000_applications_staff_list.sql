-- The staff lists' applications, without the notes' heavy server-only parts
-- (2026-10-11, the performance check).
--
-- The dashboard and the Applicants list downloaded every application with
-- its whole `notes`: for the owner's 154 applications, 4.2 MB of the 9.2 MB
-- the dashboard fetched on every open (the rest was a full job repeated per
-- row, now attached on the phone instead). Three parts of `notes` are written
-- by the scorer for itself and read by no staff screen:
--   avaScorecard      a second copy of the ai_scorecard column (1.1 MB)
--   avaAnalysisMeta   the scorer's own bookkeeping, evidenceFingerprint
--                     included (0.9 MB)
--   improvement_blueprint  the applicant's own improvement plan, read only on
--                     the applicant's side (0.3 MB)
-- This view is applications exactly, with those three keys left out of
-- `notes`. It runs with the caller's rights (security_invoker), so the
-- applications rules decide every row as before; it is read-only.
--
-- A column added to public.applications must be added here too (the staff
-- lists select from this view): scripts/staff_list_view.test.mjs checks the
-- two match.

CREATE OR REPLACE FUNCTION public.staff_list_notes(p_notes text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_notes IS NULL THEN NULL
    WHEN p_notes ~ '^\s*\{' AND pg_input_is_valid(p_notes, 'jsonb')
      THEN (p_notes::jsonb - 'avaScorecard' - 'avaAnalysisMeta' - 'improvement_blueprint')::text
    ELSE p_notes
  END
$$;

REVOKE ALL ON FUNCTION public.staff_list_notes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_list_notes(text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.applications_staff_list
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.job_id,
  a.candidate_id,
  a.status,
  a.cover_letter,
  a.resume_url,
  a.ai_analysis,
  a.ai_score,
  public.staff_list_notes(a.notes) AS notes,
  a.phase,
  a.phase_ai_analysis,
  a.created_at,
  a.updated_at,
  a.employer_notes,
  a.voice_interview_result,
  a.voice_interview_language,
  a.voice_interview_duration,
  a.voice_interview_recording_url,
  a.voice_interview_language_rule,
  a.voice_interview_video_enabled,
  a.voice_interview_transcript,
  a.rejected_by,
  a.rejected_by_type,
  a.resume_score,
  a.source,
  a.external_provider,
  a.external_application_id,
  a.ai_scorecard
FROM public.applications a;

REVOKE ALL ON public.applications_staff_list FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.applications_staff_list FROM authenticated;
GRANT SELECT ON public.applications_staff_list TO authenticated, service_role;
