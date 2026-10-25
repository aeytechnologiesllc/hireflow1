-- Applicants can write to HireFlow too (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 5, the review): the Privacy Policy tells an applicant to ask "us"
-- (Southern Digital Technologies LLC) for a copy of their information, a
-- correction or a deletion, and until now the only way it named reached the
-- hiring business, not the company. Help (help_messages, 20261011180000) was
-- a business's thread with the platform admin; an applicant now has one of
-- their own, keyed to their account, read by them and the platform admin
-- only (the existing read policy: employer_id = auth.uid()).
--
-- send_help_message: a business owner or team member writes in their
-- business's thread, as before; anyone else signed in (an applicant) writes
-- in their own. Same limits (1-4000 characters, 20 a day). The platform
-- admin's bell says which kind of account wrote.
-- admin_help_threads: an applicant's thread is marked "(applicant)".

CREATE OR REPLACE FUNCTION public.send_help_message(p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  biz uuid;
  is_business boolean;
  clean text := btrim(coalesce(p_body, ''));
  today int;
  new_id uuid;
  who text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  biz := public.help_business_of(me);
  is_business := biz IS NOT NULL;
  -- An applicant (no business): their own thread.
  IF biz IS NULL THEN
    biz := me;
  END IF;
  IF clean = '' THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO today FROM public.help_messages m
   WHERE m.employer_id = biz AND NOT m.from_admin AND m.created_at > now() - interval '1 day';
  IF today >= 20 THEN
    RAISE EXCEPTION 'help_too_many' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.help_messages (employer_id, from_admin, author_id, body)
  VALUES (biz, false, me, left(clean, 4000))
  RETURNING id INTO new_id;
  IF is_business THEN
    SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'A business') INTO who
      FROM public.profiles p WHERE p.user_id = biz;
  ELSE
    SELECT coalesce(nullif(btrim(p.full_name), ''), 'An applicant') || ' (applicant)' INTO who
      FROM public.profiles p WHERE p.user_id = biz;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'New help message',
         left(coalesce(who, CASE WHEN is_business THEN 'A business' ELSE 'An applicant' END), 72) || ': ' || left(clean, 90), '/admin?tab=help', false
    FROM public.platform_admins a
   WHERE a.user_id <> biz;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_help_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_help_message(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_help_threads()
RETURNS TABLE (employer_id uuid, company_name text, email text, last_body text, last_at timestamptz, last_from_admin boolean, unread integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.employer_id,
         CASE
           WHEN public.help_business_of(t.employer_id) IS NULL
             THEN coalesce(nullif(btrim(p.full_name), ''), u.email::text) || ' (applicant)'
           ELSE coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), u.email::text)
         END,
         u.email::text,
         last.body,
         last.created_at,
         last.from_admin,
         (SELECT count(*)::int FROM public.help_messages m WHERE m.employer_id = t.employer_id AND NOT m.from_admin AND m.read_at IS NULL)
    FROM (SELECT DISTINCT m.employer_id FROM public.help_messages m) t
    JOIN auth.users u ON u.id = t.employer_id
    LEFT JOIN public.profiles p ON p.user_id = t.employer_id
    CROSS JOIN LATERAL (
      SELECT m.body, m.created_at, m.from_admin FROM public.help_messages m
       WHERE m.employer_id = t.employer_id ORDER BY m.created_at DESC LIMIT 1
    ) last
   ORDER BY last.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_help_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_help_threads() TO authenticated, service_role;
