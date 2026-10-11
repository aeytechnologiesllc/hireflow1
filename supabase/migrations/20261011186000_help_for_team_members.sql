-- Help, for a business's team members too (2026-10-11, the review of the
-- day's work).
--
-- Team members read and write their business's Help thread
-- (20261011181000_business_screens_team), but two things still only knew
-- the owner:
--   1. mark_help_read() with no business marked answers read only where the
--      thread was the caller's own (employer_id = auth.uid()), so a team
--      member's Help kept showing HireFlow's answers as new.
--   2. admin_reply_help() rang the bell for the owner only, so the team
--      member who asked never heard back.
-- Both now follow help_business_of(): the caller's business, whether they own
-- it or are on its team. Everything else is unchanged.

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
    -- The caller's business: their own, or the one whose team they are on.
    UPDATE public.help_messages SET read_at = now()
     WHERE employer_id = coalesce(public.help_business_of(auth.uid()), auth.uid()) AND from_admin AND read_at IS NULL;
  END IF;
END;
$$;

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
  -- The bell: the owner, and anyone still on the team who wrote in this thread.
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT who, 'system', 'HireFlow replied', left(clean, 120), '/help', false
    FROM (
      SELECT p_employer AS who
      UNION
      SELECT m.author_id
        FROM public.help_messages m
        JOIN public.team_members tm ON tm.user_id = m.author_id AND tm.employer_id = p_employer AND tm.status = 'active'
       WHERE m.employer_id = p_employer AND NOT m.from_admin
    ) people;
  RETURN new_id;
END;
$$;
