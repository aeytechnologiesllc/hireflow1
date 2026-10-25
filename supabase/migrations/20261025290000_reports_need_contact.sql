-- Reports pause a business only from people it has been in touch with
-- (Phase 7 security audit, 2026-10-25, finding 1).
--
-- Since 20261011194000 three open reports from three different people who
-- applied to a business paused it by itself: its live jobs closed and it left
-- the listings until an admin reopened it. Applying costs nothing (no email
-- confirmation, no bot check yet), so three throwaway accounts could apply to
-- any business's job, report it, and shut it down; three new accounts could do
-- it again after every reopen. The audit did exactly that on a local copy.
--
-- A scam needs to reach the people it cheats: a message asking for a fee, a
-- request for papers, an interview. So a report now counts toward the pause
-- only when the business has been in touch with the person reporting it:
--   - a message to them from the business or anyone on its team,
--   - a document or a document request on their application, or
--   - an interview on their application.
-- Only the business can make any of these (each table's insert rule names the
-- job's owner or a permitted team member), so a stranger cannot manufacture
-- them. Ava's own moves do not count: she never messages, sends papers or
-- books interviews.
--
-- Three reports from people who applied but were never contacted still reach
-- the admins (every report already rings their bell), now with one more bell
-- when the third arrives: the business stays open and someone looks.
-- HireFlow's own account is still never paused by reports.

CREATE OR REPLACE FUNCTION public.business_has_contacted(p_employer uuid, p_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.messages m
            WHERE m.receiver_id = p_person
              AND m.sender_id IS DISTINCT FROM p_person
              AND (m.sender_id = p_employer
                   OR EXISTS (SELECT 1 FROM public.team_members tm
                               WHERE tm.employer_id = p_employer AND tm.user_id = m.sender_id))
         )
      OR EXISTS (
           SELECT 1 FROM public.applications a
             JOIN public.jobs j ON j.id = a.job_id
            WHERE a.candidate_id = p_person
              AND j.employer_id = p_employer
              AND (EXISTS (SELECT 1 FROM public.document_requests dr WHERE dr.application_id = a.id)
                   OR EXISTS (SELECT 1 FROM public.documents d WHERE d.application_id = a.id)
                   OR EXISTS (SELECT 1 FROM public.interviews i WHERE i.application_id = a.id))
         );
$$;

REVOKE ALL ON FUNCTION public.business_has_contacted(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_has_contacted(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.employer_reports_auto_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  applied int;
  contacted int;
  new_applied boolean;
  who text;
BEGIN
  IF public.business_status_of(NEW.employer_id) = 'suspended' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = NEW.employer_id) THEN
    RETURN NULL;
  END IF;
  -- Different people with an open report, each of whom applied to this
  -- business; and of those, the ones it has been in touch with.
  SELECT count(*), count(*) FILTER (WHERE public.business_has_contacted(NEW.employer_id, people.reporter_id))
    INTO applied, contacted
    FROM (
      SELECT DISTINCT r.reporter_id
        FROM public.employer_reports r
       WHERE r.employer_id = NEW.employer_id
         AND r.status = 'open'
         AND EXISTS (
           SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
            WHERE a.candidate_id = r.reporter_id AND j.employer_id = NEW.employer_id
         )
    ) people;
  SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), '')) INTO who
    FROM public.profiles p WHERE p.user_id = NEW.employer_id;

  IF contacted >= 3 THEN
    PERFORM public.business_pause(NEW.employer_id, 'Paused by itself: 3 people it was in touch with reported it', NULL);
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    SELECT a.user_id, 'system', 'A business was paused',
           left(coalesce(who, 'A business'), 80) || ' was reported by 3 people it had been in touch with, so its jobs are closed. Open Admin to look.', '/admin', false
      FROM public.platform_admins a;
    RETURN NULL;
  END IF;

  -- The third person who applied, without three the business contacted: it
  -- stays open, and the admins are told once (when this report makes three).
  SELECT EXISTS (
    SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
     WHERE a.candidate_id = NEW.reporter_id AND j.employer_id = NEW.employer_id
  ) INTO new_applied;
  IF applied = 3 AND new_applied
     AND NOT EXISTS (
       SELECT 1 FROM public.employer_reports r
        WHERE r.employer_id = NEW.employer_id AND r.status = 'open'
          AND r.reporter_id = NEW.reporter_id AND r.id <> NEW.id
     ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    SELECT a.user_id, 'system', 'A business was reported 3 times',
           left(coalesce(who, 'A business'), 80) || ' was reported by 3 people who applied. It stays open because it had not been in touch with them. Open Admin to look.', '/admin', false
      FROM public.platform_admins a;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.employer_reports_auto_pause() FROM PUBLIC, anon, authenticated;
