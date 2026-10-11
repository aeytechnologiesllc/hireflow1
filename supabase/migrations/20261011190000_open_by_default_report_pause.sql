-- Every business open from sign-up; reports pause a business on their own
-- (the owner, 2026-10-11: "why do I have to approve a business ... I don't
-- want the headache"; he chose "Reports pause them").
--
-- 1. No approval step. A business is 'approved' the moment it signs up, so
--    everything works at once, ID papers included. The 'new' status stays
--    allowed in the table but nothing sets it any more; the one or two
--    businesses still 'new' become 'approved' here.
-- 2. Three reports from three different people pause a business by itself:
--    its live jobs close (and come back when it is reopened), it is told,
--    and the admins are told. Nothing needs doing unless that happens.
--    HireFlow's own account (platform_admins) is never paused this way, as it
--    can never be paused by hand either.
-- 3. Reopening a paused business closes its open reports (someone has
--    looked), so one more report can't pause it again straight away.
-- 4. The new-business bell no longer says "Approve it in Admin".
--
-- The pause itself moved into business_pause(), used by both the admin's
-- button (admin_set_business_status) and the reports; the rest of
-- admin_set_business_status is unchanged from 20261011100000.

ALTER TABLE public.business_standing ALTER COLUMN status SET DEFAULT 'approved';
UPDATE public.business_standing SET status = 'approved', changed_at = now() WHERE status = 'new';

CREATE OR REPLACE FUNCTION public.business_status_of(p_employer uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT s.status FROM public.business_standing s WHERE s.employer_id = p_employer), 'approved');
$$;

-- Pause a business: close its live jobs (remembering which, to reopen them),
-- mark it paused with the reason, and tell it. Does nothing if already paused.
CREATE OR REPLACE FUNCTION public.business_pause(p_employer uuid, p_reason text, p_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  closed_ids uuid[];
BEGIN
  INSERT INTO public.business_standing (employer_id) VALUES (p_employer) ON CONFLICT (employer_id) DO NOTHING;
  IF (SELECT s.status FROM public.business_standing s WHERE s.employer_id = p_employer) = 'suspended' THEN
    RETURN;
  END IF;
  -- Close every published job, and remember which, to reopen them later.
  WITH closed AS (
    UPDATE public.jobs SET status = 'closed' WHERE employer_id = p_employer AND status = 'published' RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO closed_ids FROM closed;
  UPDATE public.business_standing
     SET status = 'suspended', changed_at = now(), changed_by = p_by,
         reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500), reopen_job_ids = closed_ids
   WHERE employer_id = p_employer;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  VALUES (p_employer, 'system', 'Your account is paused',
          'Your jobs are closed while we look at a report. Open Help to message us.', '/help', false);
END;
$$;

REVOKE ALL ON FUNCTION public.business_pause(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_pause(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_business_status(p_employer uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  was text;
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
    PERFORM public.business_pause(p_employer, p_reason, auth.uid());
  ELSIF was = 'suspended' AND p_status <> 'suspended' THEN
    SELECT s.reopen_job_ids INTO reopen FROM public.business_standing s WHERE s.employer_id = p_employer;
    UPDATE public.jobs SET status = 'published' WHERE employer_id = p_employer AND id = ANY (coalesce(reopen, '{}')) AND status = 'closed';
    UPDATE public.business_standing
       SET status = p_status, changed_at = now(), changed_by = auth.uid(), reason = NULL, reopen_job_ids = '{}'
     WHERE employer_id = p_employer;
    -- You looked: the reports that paused it are done with, so one more can't
    -- pause it again straight away.
    UPDATE public.employer_reports SET status = 'closed', closed_at = now(), closed_by = auth.uid()
     WHERE employer_id = p_employer AND status = 'open';
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

-- Three different people reporting a business pause it by itself.
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
  SELECT count(DISTINCT r.reporter_id) INTO people
    FROM public.employer_reports r
   WHERE r.employer_id = NEW.employer_id AND r.status = 'open';
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

REVOKE ALL ON FUNCTION public.employer_reports_auto_pause() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employer_reports_auto_pause ON public.employer_reports;
CREATE TRIGGER employer_reports_auto_pause
  AFTER INSERT ON public.employer_reports
  FOR EACH ROW EXECUTE FUNCTION public.employer_reports_auto_pause();

-- The new-business bell: news, not a task.
CREATE OR REPLACE FUNCTION public.user_roles_new_business_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  who text;
BEGIN
  IF NEW.role::text <> 'employer' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = NEW.user_id) THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), u.email::text) INTO who
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
   WHERE u.id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'A new business joined',
         left(coalesce(who, 'A business'), 80) || ' signed up on HireFlow.', '/admin', false
    FROM public.platform_admins a;
  RETURN NULL;
EXCEPTION WHEN others THEN
  -- Never let an alert stop someone signing up.
  RAISE LOG 'user_roles_new_business_alert: %', SQLERRM;
  RETURN NULL;
END;
$$;
