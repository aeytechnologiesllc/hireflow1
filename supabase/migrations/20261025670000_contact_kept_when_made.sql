-- A report counts toward the automatic pause by the contact the business
-- made, even after the business deletes it (the fourteenth Phase 5 review,
-- 2026-10-26, finding 1).
--
-- The Terms promise: "When three different people the business has been in
-- touch with (by message, a document to sign, a request for papers, or an
-- interview) report it, it pauses by itself." The code read the contact rows
-- as they stood when the third report arrived, and the business can delete
-- every one of them: its own messages on its applications (through the API),
-- a request nobody has answered (Cancel request), an interview, a document
-- nobody has signed, the application itself (Delete their information), or
-- the whole job (its applications go with it). The review's probe (p2): a
-- business that asked three applicants for a "training fee" in Messages and
-- then deleted the messages, cancelled its requests, deleted its interviews,
-- or removed the three with Delete their information, was never paused by
-- their three reports; in the last case the admins' "reported 3 times" bell
-- never rang either, since a removed applicant no longer counted as having
-- applied. There is no business approval (the owner, 2026-10-11), so this
-- pause is the only automatic brake.
--
-- Now contact is recorded when it is made, in private.business_contacts
-- (employer_id, person_id, kind, first_at), one row per business, person and
-- kind:
--   - applied:          an application by the person to one of its jobs;
--   - message:          a message to the person, who applied to it, from the
--                       business or from anyone on its team (the sender is
--                       the job's owner, or in its team_members, as
--                       business_has_contacted read it and as the message
--                       rules allow);
--   - document_request: a request for papers on the person's application;
--   - document:         a document on it;
--   - interview:        an interview on it.
-- An AFTER INSERT trigger on each of those tables writes it
-- (business_contacts_remember, with its own rights, for each row). The
-- business is read from the application's job, never from a column the
-- business writes, so one business cannot make another look in touch. Only
-- the business can make the four kinds of contact (each table's insert rule
-- names the job's owner or a permitted team member), as before.
-- Nothing a business can delete removes a row: the table is the database
-- owner's only (no grant to any API role, the service role included), no
-- function deletes from it, and its rows go only when an account they name
-- is deleted (ON DELETE CASCADE): the person's own Delete Account, or the
-- business's (which takes its jobs, and so anything a report could pause,
-- with it).
--
-- business_has_contacted reads the record (any kind but "applied"), and
-- employer_reports_auto_pause counts a reporter as having applied from it
-- (any kind) rather than from live applications, so a removed applicant's
-- report still counts, toward the pause when the business was in touch with
-- them, and toward the admins' "reported 3 times" bell when it was not. What
-- the Phase 7 audit held is unchanged: three people who merely applied leave
-- a business open (and ring the admins once); three it was in touch with
-- pause it; HireFlow's own account is never paused.
--
-- Filled from today's rows in the same migration: applications (and the
-- removal and withdrawal notes, for applications already gone), messages
-- (to someone with an application, a removal note or a withdrawal note for
-- the business), document requests, documents and interviews, each with the
-- first time. Contact a business deleted before today is gone and cannot be
-- filled.
--
-- Redefined from their latest repo bodies with only this change:
--   business_has_contacted        from 20261025290000_reports_need_contact.sql
--                                 (reads private.business_contacts instead of
--                                 the live rows)
--   employer_reports_auto_pause   from 20261025290000_reports_need_contact.sql
--                                 (the two "applied" checks read
--                                 private.business_contacts instead of live
--                                 applications)
-- The trigger that calls employer_reports_auto_pause is unchanged (it calls
-- it by name). Re-runnable.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.business_contacts (
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('applied', 'message', 'document_request', 'document', 'interview')),
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, person_id, kind)
);
-- The person's own account deletion finds their rows by this.
CREATE INDEX IF NOT EXISTS business_contacts_person_idx ON private.business_contacts (person_id);
REVOKE ALL ON TABLE private.business_contacts FROM PUBLIC, anon, authenticated, service_role;

-- One function for the five triggers; it reads only the row just written and
-- the application, job and team it names.
CREATE OR REPLACE FUNCTION public.business_contacts_remember()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'applications' THEN
    INSERT INTO private.business_contacts (employer_id, person_id, kind)
    SELECT j.employer_id, NEW.candidate_id, 'applied'
      FROM public.jobs j
     WHERE j.id = NEW.job_id AND NEW.candidate_id IS NOT NULL AND j.employer_id IS DISTINCT FROM NEW.candidate_id
    ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL OR NEW.sender_id = NEW.receiver_id THEN
      RETURN NULL;
    END IF;
    -- To someone who applied to the business, from the business itself or
    -- from anyone on its team. An applicant's own message to a business
    -- records nothing: a business applies to no job.
    INSERT INTO private.business_contacts (employer_id, person_id, kind)
    SELECT DISTINCT j.employer_id, NEW.receiver_id, 'message'
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.candidate_id = NEW.receiver_id
       AND (j.employer_id = NEW.sender_id
            OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.employer_id = j.employer_id AND tm.user_id = NEW.sender_id))
    ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME IN ('document_requests', 'documents', 'interviews') THEN
    INSERT INTO private.business_contacts (employer_id, person_id, kind)
    SELECT j.employer_id, a.candidate_id,
           CASE TG_TABLE_NAME WHEN 'document_requests' THEN 'document_request' WHEN 'documents' THEN 'document' ELSE 'interview' END
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.id = NEW.application_id AND j.employer_id IS DISTINCT FROM a.candidate_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.business_contacts_remember() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_contacts_remember ON public.applications;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.business_contacts_remember();
DROP TRIGGER IF EXISTS business_contacts_remember ON public.messages;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.business_contacts_remember();
DROP TRIGGER IF EXISTS business_contacts_remember ON public.document_requests;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.business_contacts_remember();
DROP TRIGGER IF EXISTS business_contacts_remember ON public.documents;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.business_contacts_remember();
DROP TRIGGER IF EXISTS business_contacts_remember ON public.interviews;
CREATE TRIGGER business_contacts_remember
  AFTER INSERT ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.business_contacts_remember();

-- Today's rows, each with its first time. The triggers come first, so a row
-- written while this runs is recorded by its trigger or read here (making a
-- trigger waits for the writes already under way on its table).
WITH applied AS (
  SELECT j.employer_id, a.candidate_id AS person_id, a.created_at AS at
    FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
  UNION ALL
  SELECT r.employer_id, r.candidate_id, r.removed_at
    FROM private.applicant_removals r
  UNION ALL
  SELECT j.employer_id, w.candidate_id, w.withdrawn_at
    FROM private.application_withdrawals w JOIN public.jobs j ON j.id = w.job_id
)
INSERT INTO private.business_contacts (employer_id, person_id, kind, first_at)
SELECT x.employer_id, x.person_id, x.kind, min(x.at)
  FROM (
    SELECT employer_id, person_id, 'applied' AS kind, at FROM applied
    UNION ALL
    -- A message to someone who applied (an application, a removal note or a
    -- withdrawal note), from the business or anyone on its team.
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
 WHERE x.employer_id IS NOT NULL AND x.person_id IS NOT NULL AND x.employer_id <> x.person_id
   -- A removal note outlives the accounts it names; a row needs both.
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.employer_id)
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.person_id)
 GROUP BY x.employer_id, x.person_id, x.kind
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.business_has_contacted(p_employer uuid, p_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Contact as it was made, whatever the business deleted since
  -- (private.business_contacts; the fourteenth Phase 5 review). Applying is
  -- the person's own doing, so it is never contact.
  SELECT EXISTS (
           SELECT 1 FROM private.business_contacts c
            WHERE c.employer_id = p_employer
              AND c.person_id = p_person
              AND c.kind IN ('message', 'document_request', 'document', 'interview')
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
  -- business; and of those, the ones it has been in touch with. "Applied" is
  -- the record of it (private.business_contacts), so an application the
  -- business deleted since still counts (the fourteenth Phase 5 review).
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
    SELECT 1 FROM private.business_contacts c
     WHERE c.employer_id = NEW.employer_id AND c.person_id = NEW.reporter_id
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
