-- An admin's reopen holds, a bell card is contact, and an interview stays on
-- its application (the fifteenth Phase 5 review, 2026-10-26, findings 1, 2
-- and 4; the fourteenth security review, finding 1, rated the interview and
-- the bell card MEDIUM).
--
-- 1. (MEDIUM) Round 14 made the record of contact permanent
--    (private.business_contacts, 20261025670000), so nothing a business does
--    takes it back. But an admin's reopen closes the open reports "so one
--    more can't pause it again straight away" (admin_set_business_status,
--    20261011190000), and report_employer lets the same person report the
--    same job again as soon as their old report is closed. The review's
--    probes p1 and p5: three people a business messaged once paused it; an
--    admin looked and reopened it; the same three reported again and paused
--    it again, after the business had blocked them and deleted their
--    information too, and a teammate taken off the team left three
--    throwaway accounts that could keep their old business closed for good.
--    Before round 14, Block and Delete their information were the
--    business's way out; after it, neither the business nor the admin had
--    one. Now a person an admin has already heard (a report of theirs on
--    this business closed by an admin: closed_by is set by the reopen and by
--    Close on the Admin page alike) counts toward neither the pause nor the
--    "reported 3 times" bell, until the business is in touch with them again
--    after that close (public.report_already_heard). Their reports are still
--    taken and still ring "A job was reported" for every admin, so a real
--    repeat is still seen; people the business contacted who were not heard
--    before still pause it; and a business that writes to a person again
--    after the close (a new message, a request, a document, an interview, a
--    bell card) makes that person count again. For that the record keeps
--    each contact's last time too (last_at, moved forward by the triggers;
--    first_at stays the first time).
-- 2. (LOW) The record is written AFTER INSERT, and the job's owner or a
--    teammate who may schedule interviews could move an interview onto
--    another application (update interviews set application_id = …: the
--    update policies have no WITH CHECK of their own and no trigger fixed
--    the column). The applicant saw the interview and its "rescheduled"
--    card, and the record never knew (probe p2). No screen and no server
--    code changes an interview's application; now nobody but the server
--    can (interview_application_fixed), as for an application's job
--    (applications_stay_on_their_job, 20261025570000) and a document's
--    application (protect_document_columns).
-- 3. (LOW) "Related parties can insert notifications" lets the job's owner
--    or team write a card into its applicant's bell, pushed to their phone
--    (probe p3: "Training fee due ... Send 1,500 PHP to GCash ..."), and the
--    record did not count it. A card a browser writes into the bell of
--    someone who applied to the business, from the job's owner or an active
--    teammate on that job (the policy's own branch (a), as
--    notifications_client_limits works it out), is now recorded as a
--    "message". Only a browser's own card: the trigger fires only when the
--    statement runs as "authenticated" (its WHEN), so the server's cards
--    (a status change, an interview, a request, written by SECURITY
--    DEFINER functions or the service role) are never counted; every app
--    screen that writes one sends the row it reports too. The message
--    email of send-notification-email is not counted (docs/BUSINESS-TRUST.md
--    says why).
-- 4. The admins' "reported 3 times" bell said the business "had not been in
--    touch with them", which a moved interview or a bell card made untrue
--    (the fourteenth security review, finding 1). It says what is known: the
--    business "has no recorded contact with them".
--
-- Redefined from their latest repo bodies with only this change:
--   business_contacts_remember    from 20261025670000_contact_kept_when_made.sql
--                                 (md5(prosrc) b6ee302c8de5a6ead48271622c6a62b5;
--                                 each insert keeps the last time, and a
--                                 branch for a browser's card)
--   employer_reports_auto_pause   from 20261025670000_contact_kept_when_made.sql
--                                 (md5(prosrc) 10beced3973848f0985eea5b57061e75;
--                                 a person already heard is left out of both
--                                 counts and of "this report makes three";
--                                 the "reported 3 times" bell's wording)
-- New: private.business_contacts.last_at, public.report_already_heard,
-- the business_contacts_remember trigger on notifications,
-- public.interviews_stay_on_their_application and its trigger. The other
-- four business_contacts_remember triggers are unchanged (they call it by
-- name), and so is the trigger that calls employer_reports_auto_pause.
-- Re-runnable.

-- The record's last time of each contact. Filled from today's rows, each
-- with its latest time (what a business deleted before today keeps its
-- first time), then made by the default like first_at.
ALTER TABLE private.business_contacts ADD COLUMN IF NOT EXISTS last_at timestamptz;

WITH applied AS (
  SELECT j.employer_id, a.candidate_id AS person_id, a.created_at AS at
    FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
  UNION ALL
  SELECT r.employer_id, r.candidate_id, r.removed_at
    FROM private.applicant_removals r
  UNION ALL
  SELECT j.employer_id, w.candidate_id, w.withdrawn_at
    FROM private.application_withdrawals w JOIN public.jobs j ON j.id = w.job_id
),
latest AS MATERIALIZED (
  SELECT x.employer_id, x.person_id, x.kind, max(x.at) AS at
    FROM (
      SELECT employer_id, person_id, 'applied' AS kind, at FROM applied
      UNION ALL
      SELECT p.employer_id, m.receiver_id, 'message', m.created_at
        FROM public.messages m
        JOIN (SELECT DISTINCT employer_id, person_id FROM applied) p ON p.person_id = m.receiver_id
       WHERE m.sender_id IS DISTINCT FROM m.receiver_id
         AND (m.sender_id = p.employer_id
              OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.employer_id = p.employer_id AND tm.user_id = m.sender_id))
      UNION ALL
      SELECT j.employer_id, a.candidate_id, 'document_request', dr.created_at
        FROM public.document_requests dr JOIN public.applications a ON a.id = dr.application_id JOIN public.jobs j ON j.id = a.job_id
      UNION ALL
      SELECT j.employer_id, a.candidate_id, 'document', d.created_at
        FROM public.documents d JOIN public.applications a ON a.id = d.application_id JOIN public.jobs j ON j.id = a.job_id
      UNION ALL
      SELECT j.employer_id, a.candidate_id, 'interview', i.created_at
        FROM public.interviews i JOIN public.applications a ON a.id = i.application_id JOIN public.jobs j ON j.id = a.job_id
    ) x
   GROUP BY x.employer_id, x.person_id, x.kind
)
UPDATE private.business_contacts c
   SET last_at = greatest(c.first_at, coalesce((SELECT l.at FROM latest l WHERE l.employer_id = c.employer_id AND l.person_id = c.person_id AND l.kind = c.kind), c.first_at))
 WHERE c.last_at IS NULL;

ALTER TABLE private.business_contacts ALTER COLUMN last_at SET DEFAULT now();
ALTER TABLE private.business_contacts ALTER COLUMN last_at SET NOT NULL;

-- One function for the six triggers; it reads only the row just written and
-- the application, job and team it names. Each contact keeps its first time
-- and moves its last time forward.
CREATE OR REPLACE FUNCTION public.business_contacts_remember()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'applications' THEN
    INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
    SELECT j.employer_id, NEW.candidate_id, 'applied'
      FROM public.jobs j
     WHERE j.id = NEW.job_id AND NEW.candidate_id IS NOT NULL AND j.employer_id IS DISTINCT FROM NEW.candidate_id
    ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  ELSIF TG_TABLE_NAME = 'messages' THEN
    IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL OR NEW.sender_id = NEW.receiver_id THEN
      RETURN NULL;
    END IF;
    -- To someone who applied to the business, from the business itself or
    -- from anyone on its team. An applicant's own message to a business
    -- records nothing: a business applies to no job.
    INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
    SELECT DISTINCT j.employer_id, NEW.receiver_id, 'message'
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.candidate_id = NEW.receiver_id
       AND (j.employer_id = NEW.sender_id
            OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.employer_id = j.employer_id AND tm.user_id = NEW.sender_id))
    ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  ELSIF TG_TABLE_NAME = 'notifications' THEN
    -- A card a browser wrote into someone else's bell (the trigger's WHEN:
    -- the statement runs as "authenticated", so never the server's own
    -- cards), from the owner of a job the person applied to or an active
    -- teammate on that job, as the insert rule allows it: a message from
    -- the business (the fifteenth Phase 5 review).
    INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
    SELECT DISTINCT j.employer_id, NEW.user_id, 'message'
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.candidate_id = NEW.user_id
       AND j.employer_id IS DISTINCT FROM NEW.user_id
       AND (public.is_job_owner(a.job_id, auth.uid()) OR public.is_active_team_member_for_job(a.job_id, auth.uid()))
    ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  ELSIF TG_TABLE_NAME IN ('document_requests', 'documents', 'interviews') THEN
    INSERT INTO private.business_contacts AS c (employer_id, person_id, kind)
    SELECT j.employer_id, a.candidate_id,
           CASE TG_TABLE_NAME WHEN 'document_requests' THEN 'document_request' WHEN 'documents' THEN 'document' ELSE 'interview' END
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.id = NEW.application_id AND j.employer_id IS DISTINCT FROM a.candidate_id
    ON CONFLICT (employer_id, person_id, kind) DO UPDATE SET last_at = greatest(c.last_at, EXCLUDED.last_at);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember() FROM PUBLIC, anon, authenticated;

-- A browser's own card only: inside the server's SECURITY DEFINER functions
-- the statement runs as their owner, and an edge function's as service_role.
DROP TRIGGER IF EXISTS business_contacts_remember ON public.notifications;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (current_user = 'authenticated')
  EXECUTE FUNCTION public.business_contacts_remember();

-- An interview stays on the application it was booked for.
CREATE OR REPLACE FUNCTION public.interviews_stay_on_their_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.application_id IS DISTINCT FROM OLD.application_id
     AND coalesce(auth.role(), '') <> 'service_role'
     AND (coalesce(auth.role(), '') <> '' OR current_user IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'interview_application_fixed'
      USING ERRCODE = 'check_violation',
            DETAIL = 'An interview stays on the application it was booked for. Book a new one instead.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.interviews_stay_on_their_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS interviews_stay_on_their_application ON public.interviews;
CREATE TRIGGER interviews_stay_on_their_application
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.interviews_stay_on_their_application();

-- Has an admin already heard this person about this business, with no
-- contact since? A report of theirs on it closed by an admin (the reopen, or
-- Close on the Admin page: both set closed_by), and nothing in the record
-- from the business to them (any kind but "applied") after that close.
CREATE OR REPLACE FUNCTION public.report_already_heard(p_employer uuid, p_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.employer_reports done
            WHERE done.employer_id = p_employer
              AND done.reporter_id = p_person
              AND done.status = 'closed'
              AND done.closed_by IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM private.business_contacts since
                 WHERE since.employer_id = p_employer
                   AND since.person_id = p_person
                   AND since.kind IN ('message', 'document_request', 'document', 'interview')
                   AND since.last_at > done.closed_at
              )
         );
$$;

REVOKE ALL ON FUNCTION public.report_already_heard(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_already_heard(uuid, uuid) TO service_role;

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
  -- business; and of those, the ones it has been in touch with. "Applied" is
  -- the record of it (private.business_contacts), so an application the
  -- business deleted since still counts (the fourteenth Phase 5 review).
  -- Someone an admin already heard about it counts again only once the
  -- business is in touch with them after that (report_already_heard; the
  -- fifteenth Phase 5 review): the same three could pause it again after
  -- every reopen, for good.
  SELECT count(*), count(*) FILTER (WHERE public.business_has_contacted(NEW.employer_id, people.reporter_id))
    INTO applied, contacted
    FROM (
      SELECT DISTINCT r.reporter_id
        FROM public.employer_reports r
       WHERE r.employer_id = NEW.employer_id
         AND r.status = 'open'
         AND EXISTS (
           SELECT 1 FROM private.business_contacts c
            WHERE c.employer_id = NEW.employer_id AND c.person_id = r.reporter_id
         )
         AND NOT public.report_already_heard(NEW.employer_id, r.reporter_id)
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
  -- stays open, and the admins are told once (when this report makes three;
  -- a report from someone already heard makes nothing).
  SELECT EXISTS (
    SELECT 1 FROM private.business_contacts c
     WHERE c.employer_id = NEW.employer_id AND c.person_id = NEW.reporter_id
  ) AND NOT public.report_already_heard(NEW.employer_id, NEW.reporter_id) INTO new_applied;
  IF applied = 3 AND new_applied
     AND NOT EXISTS (
       SELECT 1 FROM public.employer_reports r
        WHERE r.employer_id = NEW.employer_id AND r.status = 'open'
          AND r.reporter_id = NEW.reporter_id AND r.id <> NEW.id
     ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
    SELECT a.user_id, 'system', 'A business was reported 3 times',
           left(coalesce(who, 'A business'), 80) || ' was reported by 3 people who applied. It stays open because it has no recorded contact with them. Open Admin to look.', '/admin', false
      FROM public.platform_admins a;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.employer_reports_auto_pause() FROM PUBLIC, anon, authenticated;
