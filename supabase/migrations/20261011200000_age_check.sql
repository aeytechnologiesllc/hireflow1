-- "Are you 18 or older?" (2026-10-11).
--
-- Every application now starts with that question (src/lib/ageCheck.ts). It
-- replaces the date of birth the owner first asked for: the Philippine
-- Anti-Age Discrimination in Employment Act (RA 10911, Section 5(a)) makes it
-- unlawful to require age or birth date during the application process, and
-- most applicants are in the Philippines.
--
-- The form never sends an application that answered "No". This makes that
-- true whoever writes the row: an application whose answers say "No" cannot
-- leave "in_progress" for any status but "rejected". (An applicant can still
-- remove their own unsent application, which is what the form's "Close this
-- application" does.) Applications from before the question have no answer
-- and are untouched.

CREATE OR REPLACE FUNCTION public.application_says_under_18(p_notes text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  parsed jsonb;
BEGIN
  IF p_notes IS NULL OR p_notes !~ '^\s*\{' THEN
    RETURN false;
  END IF;
  BEGIN
    parsed := p_notes::jsonb;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF jsonb_typeof(parsed -> 'applicationAnswers') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM jsonb_array_elements(parsed -> 'applicationAnswers') AS a(entry)
     WHERE jsonb_typeof(a.entry) = 'object'
       AND a.entry ->> 'questionId' = 'age_18_plus'
       AND lower(btrim(coalesce(a.entry ->> 'answer', ''))) = 'no'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.application_says_under_18(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_says_under_18(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.applications_refuse_under_18()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status::text = 'in_progress'
     AND NEW.status::text NOT IN ('in_progress', 'rejected')
     AND public.application_says_under_18(NEW.notes) THEN
    RAISE EXCEPTION 'under_18'
      USING ERRCODE = 'check_violation',
            DETAIL = 'This job is open to people 18 and over.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_refuse_under_18() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_refuse_under_18 ON public.applications;
CREATE TRIGGER applications_refuse_under_18
  BEFORE UPDATE OF status, notes ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_refuse_under_18();
