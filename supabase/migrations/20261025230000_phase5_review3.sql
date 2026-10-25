-- The third Phase 5 review (2026-10-25).
--
-- 1. admin_reply_help: the bell rings again for the owner AND every active
--    team member who wrote in the thread (20261011186000), which
--    20261025220000 lost by starting from the October-11 owner-only version.
--    An applicant's own thread still links to Contact us (/contact).
-- 2. admin_help_threads: a thread from an account with no business reads
--    "(applicant)" only when it is one, else "(account)".
-- 3. ai_budget_take: a business that has never had a job past draft gets a
--    smaller day (app_settings ai_new_business_daily_call_cap, 300) than one
--    that hires (2,000): any new sign-up is a business, and with email
--    confirmation off a handful of fresh accounts could otherwise use up the
--    platform's day. The owner's alert says what applicants are told now.

insert into public.app_settings (key, value)
values ('ai_new_business_daily_call_cap', '300'::jsonb)
on conflict (key) do nothing;

create or replace function public.ai_budget_take(p_calls integer default 1, p_business uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_take integer := greatest(1, least(coalesce(p_calls, 1), 100));
  v_cap integer;
  v_calls integer;
  v_business uuid;
  v_business_cap integer;
  v_business_calls integer;
begin
  -- The business: the account itself, or the business it is an active team member of.
  if p_business is not null then
    select coalesce(
      (select tm.employer_id from public.team_members tm where tm.user_id = p_business and tm.status = 'active' limit 1),
      p_business
    ) into v_business;
    if exists (select 1 from public.platform_admins a where a.user_id = v_business) then
      v_business := null;
    end if;
  end if;

  if v_business is not null then
    select coalesce((value #>> '{}')::integer, 2000)
      into v_business_cap
      from public.app_settings
     where key = 'ai_business_daily_call_cap';
    v_business_cap := coalesce(v_business_cap, 2000);
    -- A business that has never had a job past draft gets a smaller day
    -- (writing jobs takes a few dozen calls): a fresh sign-up cannot take
    -- 2,000 calls from the platform's day (the third Phase 5 review).
    if not exists (select 1 from public.jobs j where j.employer_id = v_business and j.status <> 'draft') then
      v_business_cap := least(v_business_cap, coalesce(
        (select (value #>> '{}')::integer from public.app_settings where key = 'ai_new_business_daily_call_cap'), 300));
    end if;

    insert into private.ai_business_daily_usage as u (business_id, day, calls)
    values (v_business, v_today, v_take)
    on conflict (business_id, day) do update
      set calls = u.calls + excluded.calls,
          updated_at = now()
    returning u.calls into v_business_calls;

    if v_business_calls > v_business_cap then
      update private.ai_business_daily_usage
         set refused = refused + 1
       where business_id = v_business and day = v_today;
      perform private.ai_budget_alert(
        'business:' || v_business::text,
        'A business reached its daily AI budget',
        'Business ' || v_business::text || ' used its ' || v_business_cap || ' AI calls for today (UTC). Its applicants are asked to come back later today or tomorrow (the budget starts again at midnight UTC). Raise ai_business_daily_call_cap in app_settings if this is real hiring.'
      );
      return false;
    end if;
  end if;

  select coalesce((value #>> '{}')::integer, 10000)
    into v_cap
    from public.app_settings
   where key = 'ai_daily_call_cap';
  v_cap := coalesce(v_cap, 10000);

  insert into private.ai_daily_usage as u (day, calls)
  values (v_today, v_take)
  on conflict (day) do update
    set calls = u.calls + excluded.calls,
        updated_at = now()
  returning u.calls into v_calls;

  if v_calls > v_cap then
    update private.ai_daily_usage
       set refused = refused + 1
     where day = v_today;
    -- The platform said no: the business gets its unit back.
    if v_business is not null then
      update private.ai_business_daily_usage
         set calls = greatest(0, calls - v_take),
             updated_at = now()
       where business_id = v_business and day = v_today;
    end if;
    perform private.ai_budget_alert(
      'platform:100',
      'The daily AI budget is used up',
      'All ' || v_cap || ' AI calls for today (UTC) are used. New tests wait until midnight UTC. Raise ai_daily_call_cap in app_settings to allow more.'
    );
    return false;
  end if;
  if v_calls * 5 >= v_cap * 4 then
    perform private.ai_budget_alert(
      'platform:80',
      '80% of today''s AI budget is used',
      v_calls || ' of ' || v_cap || ' AI calls for today (UTC) are used.'
    );
  end if;
  return true;
end;
$$;

revoke all on function public.ai_budget_take(integer, uuid) from public, anon, authenticated;
grant execute on function public.ai_budget_take(integer, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.admin_reply_help(p_employer uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean text := btrim(coalesce(p_body, ''));
  new_id uuid;
  v_link text;
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
  -- A business's answer opens Help; an applicant's own thread opens Contact us.
  v_link := CASE WHEN public.help_business_of(p_employer) IS NULL THEN '/contact' ELSE '/help' END;
  -- The bell: the owner, and anyone still on the team who wrote in this thread.
  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  SELECT who, 'system', 'HireFlow replied', left(clean, 120), v_link, false
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
REVOKE ALL ON FUNCTION public.admin_reply_help(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_help(uuid, text) TO authenticated, service_role;

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
             THEN coalesce(nullif(btrim(p.full_name), ''), u.email::text)
                  || CASE WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = t.employer_id AND r.role = 'candidate') THEN ' (applicant)' ELSE ' (account)' END
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
