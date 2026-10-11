-- The final gap check (2026-10-11): what the five reviewers proved, on the
-- database side.
--
-- 1. Turning someone down cancels their booked interview. reject() and
--    "Remove and block" only changed applications.status, so a declined
--    applicant still got "your interview is tomorrow" reminders and could
--    still accept the time. Now any change to 'rejected' cancels that
--    application's interviews that are still to come. (Cancelling sends no
--    notice of its own; the decline already tells them.)
-- 2. Deleting an account no longer fails for anyone who sent or received a
--    document: documents.sender_id / recipient_id and
--    document_templates.employer_id pointed at auth.users with NO ACTION, so
--    delete-account's first step (removing the login) was refused. A sent
--    document keeps living with its application (the business's record), with
--    the sender unknown; a document's recipient is cleared the same way (the
--    application's own deletion removes it with the applicant's data); a
--    business's templates go with it.
-- 3. Three reports pause a business only when they come from three different
--    people who applied to that business (any three signed-in accounts could
--    pause anyone; job ids are public).
-- 4. A business can't call itself HireFlow, or take a name another business
--    already uses: applicant emails are signed with it.
--    business_name_taken() lets the sign-up screen say so before submitting.
-- 5. A team member who may create jobs but is limited to some jobs could
--    never create one: saving reads the new job back, and they could only
--    read jobs on their list. Jobs now record who created them; a team member
--    reads the jobs they created, and a new one joins their list.

-- 1 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.applications_rejected_cancel_interviews()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.interviews
     SET status = 'cancelled'
   WHERE application_id = NEW.id
     AND status = 'scheduled'
     AND scheduled_at > now() - interval '2 hours';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_rejected_cancel_interviews() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_rejected_cancel_interviews ON public.applications;
CREATE TRIGGER applications_rejected_cancel_interviews
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  WHEN (NEW.status::text = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.applications_rejected_cancel_interviews();

-- 2 ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_sender_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_recipient_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.document_templates DROP CONSTRAINT IF EXISTS document_templates_employer_id_fkey;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employer_reports_auto_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  people int;
  who text;
BEGIN
  IF public.business_status_of(NEW.employer_id) = 'suspended' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = NEW.employer_id) THEN
    RETURN NULL;
  END IF;
  -- Three different people, each of whom applied to this business.
  SELECT count(DISTINCT r.reporter_id) INTO people
    FROM public.employer_reports r
   WHERE r.employer_id = NEW.employer_id
     AND r.status = 'open'
     AND EXISTS (
       SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
        WHERE a.candidate_id = r.reporter_id AND j.employer_id = NEW.employer_id
     );
  IF people < 3 THEN
    RETURN NULL;
  END IF;
  PERFORM public.business_pause(NEW.employer_id, 'Paused by itself: 3 people reported it', NULL);
  SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), '')) INTO who
    FROM public.profiles p WHERE p.user_id = NEW.employer_id;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'A business was paused',
         left(coalesce(who, 'A business'), 80) || ' was reported by 3 people, so its jobs are closed. Open Admin to look.', '/admin', false
    FROM public.platform_admins a;
  RETURN NULL;
END;
$$;

-- 4 ──────────────────────────────────────────────────────────────────────
-- A name, compared the way people read it: case, spaces and punctuation aside.
CREATE OR REPLACE FUNCTION public.business_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g');
$$;

-- Whether a business name is kept (HireFlow) or already used by another business.
CREATE OR REPLACE FUNCTION public.business_name_taken(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.business_name_key(p_name) <> '' AND (
    public.business_name_key(p_name) LIKE 'hireflow%'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
        JOIN public.user_roles r ON r.user_id = p.user_id AND r.role = 'employer'
       WHERE public.business_name_key(p.company_name) = public.business_name_key(p_name)
         AND p.user_id IS DISTINCT FROM auth.uid()
    )
  );
$$;

REVOKE ALL ON FUNCTION public.business_name_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_name_taken(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.profiles_business_name_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF nullif(btrim(coalesce(NEW.company_name, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.business_name_key(NEW.company_name) = public.business_name_key(OLD.company_name) THEN
    RETURN NEW;
  END IF;
  IF public.business_name_key(NEW.company_name) LIKE 'hireflow%' THEN
    RAISE EXCEPTION 'That name is kept for HireFlow. Use your own business name.' USING ERRCODE = 'check_violation', HINT = 'business_name_reserved';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.user_id AND r.role = 'employer'
     WHERE public.business_name_key(p.company_name) = public.business_name_key(NEW.company_name)
       AND p.user_id <> NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Another business on HireFlow already uses that name. Add something to tell yours apart.' USING ERRCODE = 'check_violation', HINT = 'business_name_taken';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_business_name_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_business_name_rules ON public.profiles;
CREATE TRIGGER profiles_business_name_rules
  BEFORE INSERT OR UPDATE OF company_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_business_name_rules();

-- 5 ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION public.jobs_record_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Who made it, from the session (never the request); the system's own
  -- inserts leave it as given.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_record_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jobs_record_creator ON public.jobs;
CREATE TRIGGER jobs_record_creator
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_record_creator();

-- A new job joins the list of the team member who made it (when they have one).
CREATE OR REPLACE FUNCTION public.jobs_join_creators_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL OR NEW.created_by = NEW.employer_id THEN
    RETURN NULL;
  END IF;
  UPDATE public.team_members tm
     SET assigned_job_ids = array_append(tm.assigned_job_ids, NEW.id), updated_at = now()
   WHERE tm.user_id = NEW.created_by
     AND tm.employer_id = NEW.employer_id
     AND tm.status = 'active'
     AND array_length(tm.assigned_job_ids, 1) IS NOT NULL
     AND NOT (NEW.id = ANY (tm.assigned_job_ids));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_join_creators_list() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jobs_join_creators_list ON public.jobs;
CREATE TRIGGER jobs_join_creators_list
  AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_join_creators_list();

DROP POLICY IF EXISTS "Team members can view jobs they created" ON public.jobs;
CREATE POLICY "Team members can view jobs they created" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
       WHERE tm.user_id = auth.uid() AND tm.employer_id = jobs.employer_id AND tm.status = 'active'
    )
  );
