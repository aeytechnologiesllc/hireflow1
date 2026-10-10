-- ============================================================================
-- Opening HireFlow to other businesses, safely (2026-10-11). docs/BUSINESS-TRUST.md.
-- ============================================================================
-- The owner, 2026-10-10, on opening HireFlow to other businesses: "do it
-- all". The risk that comes with it: anyone could sign up as a "business",
-- post a fake job and use Request documents to collect people's IDs. This
-- adds, and changes nothing else:
--
--   1. public.platform_admins + is_platform_admin(): who runs HireFlow (the
--      owner's account). Answers only about the caller.
--   2. public.business_standing: each business is new, approved or
--      suspended (no row = new). Only an admin changes it, through
--      admin_set_business_status(). A suspended business's published jobs
--      are closed (and reopened when it is reinstated), and it can ask
--      nobody for anything.
--   3. ID papers (government ID, NBI clearance, proof of address) can be
--      asked for only by an approved business, or one that has paid
--      (business_has_paid(), false until billing ships and redefines it).
--   4. New applications only to a published job of a business that is not
--      suspended. Until now a direct insert could apply to a closed or draft
--      job; existing applications are untouched.
--   5. public.employer_reports + report_employer(): an applicant (or anyone
--      signed in) reports a job: asked for money, suspicious documents, fake
--      job, unsafe, other. Rate-limited, one open report per person per job;
--      every admin is told in their bell.
--   6. admin_businesses(), admin_reports(), admin_close_report(): the
--      owner's admin page. Each refuses anyone who is not an admin.
--
-- The owner's own account (Zulu Support Team) is made an admin and an
-- approved business, so nothing he does today changes. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 1. who runs HireFlow -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- 2. each business's standing --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_standing (
  employer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'suspended')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  -- The jobs a suspension closed, reopened on reinstatement.
  reopen_job_ids uuid[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.business_standing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_standing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_standing TO authenticated;
GRANT ALL ON public.business_standing TO service_role;
DROP POLICY IF EXISTS "A business reads its own standing" ON public.business_standing;
CREATE POLICY "A business reads its own standing"
  ON public.business_standing FOR SELECT
  USING (employer_id = auth.uid() OR public.is_platform_admin());

-- For triggers and other definer code only: never callable from a client.
CREATE OR REPLACE FUNCTION public.business_status_of(p_employer uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT s.status FROM public.business_standing s WHERE s.employer_id = p_employer), 'new');
$$;
REVOKE ALL ON FUNCTION public.business_status_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_status_of(uuid) TO service_role;

-- Billing redefines this when it ships (a paid job or plan counts as trust).
CREATE OR REPLACE FUNCTION public.business_has_paid(p_employer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT false;
$$;
REVOKE ALL ON FUNCTION public.business_has_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_has_paid(uuid) TO service_role;

-- What the business itself may ask: its own standing, in one word, and
-- whether it may ask for ID papers. Answers only about the caller.
CREATE OR REPLACE FUNCTION public.my_business_standing()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'status', public.business_status_of(auth.uid()),
    'can_request_ids', public.business_status_of(auth.uid()) = 'approved' OR public.business_has_paid(auth.uid()),
    'is_admin', public.is_platform_admin()
  ) END;
$$;
REVOKE ALL ON FUNCTION public.my_business_standing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_business_standing() TO authenticated, service_role;

-- 3. ID papers only from a trusted business; nothing from a suspended one ------------
CREATE OR REPLACE FUNCTION public.document_requests_trust_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  standing text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- employer_id is the job's owner by now (document_requests_guard_insert runs first, by name).
  standing := public.business_status_of(NEW.employer_id);
  IF standing = 'suspended' THEN
    RAISE EXCEPTION 'business_suspended' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.document_type IN ('government_id', 'nbi_clearance', 'proof_of_address')
     AND standing <> 'approved' AND NOT public.business_has_paid(NEW.employer_id) THEN
    RAISE EXCEPTION 'id_requests_need_approval' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requests_trust_gate ON public.document_requests;
-- "document_requests_trust_gate" sorts after "document_requests_guard_insert",
-- so it reads the employer the guard has already set.
CREATE TRIGGER document_requests_trust_gate
  BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_trust_gate();

-- 4. applications only to an open job of a business in good standing ---------------
CREATE OR REPLACE FUNCTION public.applications_only_to_open_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job_status_now text;
  owner uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT j.status::text, j.employer_id INTO job_status_now, owner FROM public.jobs j WHERE j.id = NEW.job_id;
  IF job_status_now IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'job_not_open' USING ERRCODE = 'check_violation';
  END IF;
  IF public.business_status_of(owner) = 'suspended' THEN
    RAISE EXCEPTION 'job_not_open' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_only_to_open_jobs ON public.applications;
CREATE TRIGGER applications_only_to_open_jobs
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_only_to_open_jobs();

-- 5. reports ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('asked_for_money', 'suspicious_documents', 'fake_job', 'unsafe', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid
);
CREATE INDEX IF NOT EXISTS employer_reports_employer_idx ON public.employer_reports (employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_reports_reporter_idx ON public.employer_reports (reporter_id, created_at DESC);
ALTER TABLE public.employer_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employer_reports TO authenticated;
GRANT ALL ON public.employer_reports TO service_role;
DROP POLICY IF EXISTS "A reporter reads their own reports" ON public.employer_reports;
CREATE POLICY "A reporter reads their own reports"
  ON public.employer_reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.report_employer(p_job_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  owner uuid;
  job_title text;
  existing uuid;
  recent int;
  new_id uuid;
  clean text := nullif(btrim(regexp_replace(coalesce(p_details, ''), '[[:cntrl:]]+', ' ', 'g')), '');
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason NOT IN ('asked_for_money', 'suspicious_documents', 'fake_job', 'unsafe', 'other') THEN
    RAISE EXCEPTION 'report_reason_unknown' USING ERRCODE = 'check_violation';
  END IF;
  SELECT j.employer_id, j.title INTO owner, job_title FROM public.jobs j WHERE j.id = p_job_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'report_job_unknown' USING ERRCODE = 'check_violation';
  END IF;
  IF owner = me THEN
    RAISE EXCEPTION 'report_own_job' USING ERRCODE = 'check_violation';
  END IF;
  -- One open report per person per job: a second one adds to the first.
  SELECT r.id INTO existing FROM public.employer_reports r
   WHERE r.reporter_id = me AND r.job_id = p_job_id AND r.status = 'open' LIMIT 1;
  IF existing IS NOT NULL THEN
    UPDATE public.employer_reports
       SET reason = p_reason,
           details = left(coalesce(details || E'\n\n', '') || coalesce(clean, ''), 1000)
     WHERE id = existing;
    RETURN existing;
  END IF;
  SELECT count(*) INTO recent FROM public.employer_reports r WHERE r.reporter_id = me AND r.created_at > now() - interval '1 day';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'report_too_many' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.employer_reports (employer_id, job_id, reporter_id, reason, details)
  VALUES (owner, p_job_id, me, p_reason, left(clean, 1000))
  RETURNING id INTO new_id;
  -- Every admin is told in their bell.
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'A job was reported',
         'Someone reported "' || left(coalesce(job_title, 'a job'), 80) || '". Open Admin to look.', '/admin', false
    FROM public.platform_admins a;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.report_employer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_employer(uuid, text, text) TO authenticated, service_role;

-- 6. the admin page ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_businesses()
RETURNS TABLE (
  employer_id uuid,
  email text,
  company_name text,
  full_name text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  status text,
  status_reason text,
  jobs_live int,
  jobs_total int,
  applicants int,
  open_reports int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'admins_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT u.id,
         u.email::text,
         p.company_name,
         p.full_name,
         u.created_at,
         u.last_sign_in_at,
         public.business_status_of(u.id),
         s.reason,
         (SELECT count(*)::int FROM public.jobs j WHERE j.employer_id = u.id AND j.status = 'published'),
         (SELECT count(*)::int FROM public.jobs j WHERE j.employer_id = u.id),
         (SELECT count(*)::int FROM public.applications a JOIN public.jobs j ON j.id = a.job_id WHERE j.employer_id = u.id),
         (SELECT count(*)::int FROM public.employer_reports r WHERE r.employer_id = u.id AND r.status = 'open')
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.user_id = u.id
    LEFT JOIN public.business_standing s ON s.employer_id = u.id
   WHERE ur.role = 'employer'
   ORDER BY u.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_businesses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_businesses() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_business_status(p_employer uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  was text;
  closed_ids uuid[];
  reopen uuid[];
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'admins_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('new', 'approved', 'suspended') THEN
    RAISE EXCEPTION 'status_unknown' USING ERRCODE = 'check_violation';
  END IF;
  IF p_employer = auth.uid() AND p_status = 'suspended' THEN
    RAISE EXCEPTION 'cannot_suspend_yourself' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_employer AND role = 'employer') THEN
    RAISE EXCEPTION 'not_a_business' USING ERRCODE = 'check_violation';
  END IF;
  was := public.business_status_of(p_employer);

  INSERT INTO public.business_standing (employer_id) VALUES (p_employer) ON CONFLICT (employer_id) DO NOTHING;

  IF p_status = 'suspended' AND was <> 'suspended' THEN
    -- Close every published job, and remember which, to reopen them later.
    WITH closed AS (
      UPDATE public.jobs SET status = 'closed' WHERE employer_id = p_employer AND status = 'published' RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}') INTO closed_ids FROM closed;
    UPDATE public.business_standing
       SET status = 'suspended', changed_at = now(), changed_by = auth.uid(),
           reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500), reopen_job_ids = closed_ids
     WHERE employer_id = p_employer;
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    VALUES (p_employer, 'system', 'Your account is paused',
            'Your jobs are closed while we look at a report. Open Help to message us.', '/help', false);
  ELSIF was = 'suspended' AND p_status <> 'suspended' THEN
    SELECT s.reopen_job_ids INTO reopen FROM public.business_standing s WHERE s.employer_id = p_employer;
    UPDATE public.jobs SET status = 'published' WHERE employer_id = p_employer AND id = ANY (coalesce(reopen, '{}')) AND status = 'closed';
    UPDATE public.business_standing
       SET status = p_status, changed_at = now(), changed_by = auth.uid(), reason = NULL, reopen_job_ids = '{}'
     WHERE employer_id = p_employer;
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    VALUES (p_employer, 'system', 'Your account is open again', 'Your jobs are open again. Thank you for your patience.', '/dashboard', false);
  ELSE
    UPDATE public.business_standing
       SET status = p_status, changed_at = now(), changed_by = auth.uid(),
           reason = CASE WHEN p_status = 'approved' THEN NULL ELSE left(nullif(btrim(coalesce(p_reason, '')), ''), 500) END
     WHERE employer_id = p_employer;
    IF p_status = 'approved' AND was = 'new' THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
      VALUES (p_employer, 'system', 'Your business is approved', 'You can now ask applicants for ID papers when you hire.', '/dashboard', false);
    END IF;
  END IF;
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_business_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_business_status(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reports()
RETURNS TABLE (
  id uuid,
  employer_id uuid,
  company_name text,
  job_id uuid,
  job_title text,
  reporter_name text,
  reason text,
  details text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'admins_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT r.id, r.employer_id, bp.company_name, r.job_id, j.title, rp.full_name, r.reason, r.details, r.status, r.created_at
    FROM public.employer_reports r
    LEFT JOIN public.profiles bp ON bp.user_id = r.employer_id
    LEFT JOIN public.jobs j ON j.id = r.job_id
    LEFT JOIN public.profiles rp ON rp.user_id = r.reporter_id
   ORDER BY (r.status = 'open') DESC, r.created_at DESC
   LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_close_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'admins_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.employer_reports SET status = 'closed', closed_at = now(), closed_by = auth.uid()
   WHERE id = p_report_id AND status = 'open';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_close_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_close_report(uuid) TO authenticated, service_role;

-- 7. the owner's own account: admin, and approved ---------------------------------------
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'zack@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.business_standing (employer_id, status, reason)
SELECT id, 'approved', NULL FROM auth.users WHERE lower(email) = 'zack@yahoo.com'
ON CONFLICT (employer_id) DO UPDATE SET status = 'approved';

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
