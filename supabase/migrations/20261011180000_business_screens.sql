-- The database half of the new-business screens (the 2026-10-11 mock-ups,
-- approved "all ten, as shown").
--
--   1. Help: a business writes to HireFlow, HireFlow answers. help_messages
--      holds one thread per business; the business reads its own, the
--      platform admin reads every one. Writes only through the functions
--      below, which tell the other side in their bell.
--   2. A new business joining tells every platform admin in the bell, so it
--      can be approved in Admin.
--   3. A business's careers address (business_pages.slug) can change only
--      until its first job goes live (links already shared keep working),
--      must look like an address, and cannot be HireFlow's own words. The
--      line about the business is one line: 140 letters at most.
--
-- Re-runnable. lock_timeout gives up after 3 seconds rather than queue.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 1. Help -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.help_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  from_admin boolean NOT NULL DEFAULT false,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS help_messages_thread ON public.help_messages (employer_id, created_at);
ALTER TABLE public.help_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.help_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.help_messages TO authenticated;
GRANT ALL ON public.help_messages TO service_role;

DROP POLICY IF EXISTS "A business reads its own help thread" ON public.help_messages;
CREATE POLICY "A business reads its own help thread"
  ON public.help_messages FOR SELECT TO authenticated
  USING (employer_id = auth.uid() OR public.is_platform_admin());

-- The business the caller writes for: their own, or the one whose team
-- they are on (one business per account since 20261011160000).
CREATE OR REPLACE FUNCTION public.help_business_of(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p_user AND r.role = 'employer') THEN p_user
    ELSE (SELECT tm.employer_id FROM public.team_members tm WHERE tm.user_id = p_user AND tm.status = 'active' ORDER BY tm.created_at LIMIT 1)
  END;
$$;
REVOKE ALL ON FUNCTION public.help_business_of(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_help_message(p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  biz uuid;
  clean text := btrim(coalesce(p_body, ''));
  today int;
  new_id uuid;
  who text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  biz := public.help_business_of(me);
  IF biz IS NULL THEN
    RAISE EXCEPTION 'not_a_business' USING ERRCODE = 'check_violation';
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
  SELECT coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'A business') INTO who
    FROM public.profiles p WHERE p.user_id = biz;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT a.user_id, 'system', 'New help message',
         left(coalesce(who, 'A business'), 60) || ': ' || left(clean, 90), '/admin?tab=help', false
    FROM public.platform_admins a
   WHERE a.user_id <> biz;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_help_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_help_message(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reply_help(p_employer uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean text := btrim(coalesce(p_body, ''));
  new_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF clean = '' THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_employer) THEN
    RAISE EXCEPTION 'no_such_business' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.help_messages (employer_id, from_admin, author_id, body)
  VALUES (p_employer, true, auth.uid(), left(clean, 4000))
  RETURNING id INTO new_id;
  -- Their messages are read now that they have an answer.
  UPDATE public.help_messages SET read_at = now()
   WHERE employer_id = p_employer AND NOT from_admin AND read_at IS NULL;
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  VALUES (p_employer, 'system', 'HireFlow replied', left(clean, 120), '/help', false);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reply_help(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_help(uuid, text) TO authenticated, service_role;

-- The caller has read the other side's messages.
CREATE OR REPLACE FUNCTION public.mark_help_read(p_employer uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_employer IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    UPDATE public.help_messages SET read_at = now()
     WHERE employer_id = p_employer AND NOT from_admin AND read_at IS NULL;
  ELSE
    UPDATE public.help_messages SET read_at = now()
     WHERE employer_id = auth.uid() AND from_admin AND read_at IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_help_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_help_read(uuid) TO authenticated, service_role;

-- Every thread, newest first, for the Admin page.
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
         coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), u.email::text),
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

-- 2. A new business tells the platform admin ------------------------------------

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
         left(coalesce(who, 'A business'), 80) || ' signed up. Approve it in Admin.', '/admin', false
    FROM public.platform_admins a;
  RETURN NULL;
EXCEPTION WHEN others THEN
  -- Never let an alert stop someone signing up.
  RAISE LOG 'user_roles_new_business_alert: %', SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.user_roles_new_business_alert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_new_business_alert ON public.user_roles;
CREATE TRIGGER user_roles_new_business_alert
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_new_business_alert();

-- 3. The careers address and line -----------------------------------------------

CREATE OR REPLACE FUNCTION public.business_pages_address_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    IF NEW.slug IS NULL OR NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(NEW.slug) NOT BETWEEN 2 AND 50 THEN
      RAISE EXCEPTION 'Use 2 to 50 small letters, numbers and dashes.' USING ERRCODE = 'check_violation', HINT = 'address_format';
    END IF;
    IF NEW.slug IN ('hireflow', 'admin', 'help', 'support', 'staff', 'official', 'careers', 'jobs', 'team', 'api', 'www') THEN
      RAISE EXCEPTION 'That address is kept for HireFlow. Try another.' USING ERRCODE = 'check_violation', HINT = 'address_reserved';
    END IF;
    IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.employer_id = OLD.employer_id AND j.status IN ('published', 'closed')) THEN
      RAISE EXCEPTION 'Your address can''t change once a job has gone live, so the links you shared keep working. Message us in Help if you need it changed.'
        USING ERRCODE = 'check_violation', HINT = 'address_locked';
    END IF;
  END IF;
  IF NEW.about IS DISTINCT FROM OLD.about AND char_length(coalesce(NEW.about, '')) > 140 THEN
    RAISE EXCEPTION 'Keep it to one line: 140 letters at most.' USING ERRCODE = 'check_violation', HINT = 'about_too_long';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_pages_address_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS business_pages_address_rules ON public.business_pages;
CREATE TRIGGER business_pages_address_rules
  BEFORE UPDATE ON public.business_pages
  FOR EACH ROW EXECUTE FUNCTION public.business_pages_address_rules();

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
