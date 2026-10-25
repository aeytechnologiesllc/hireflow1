-- Removing an applicant and Contact us, after the second Phase 5 review
-- (2026-10-25; earlier versions 20261025180000 and 20261025200000).
--
-- 1. remove_applicant: once no application of the person is left with the
--    business, their block there goes too (email, phone, the team's reason).
--    Before, deleting a blocked applicant's only application left the block
--    stored with nothing that could show it or lift it again.
-- 2. admin_reply_help: an applicant's answer links to Contact us (/contact),
--    a business's to Help (/help). /help is staff-only on the staff host, so
--    an applicant's link there would have sent them to the business sign-in.
-- 3. send_help_message: a thread from an account with no business is marked
--    "(applicant)" only when it is one, else "(account)".

create or replace function public.remove_applicant(p_application uuid, p_actor uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_app record;
  v_documents jsonb;
  v_other_refs text;
begin
  if p_application is null or p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select a.id, a.candidate_id, a.resume_url, a.notes, j.id as job_id, j.employer_id
    into v_app
    from public.applications a
    join public.jobs j on j.id = a.job_id
   where a.id = p_application
     for update of a;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not (
    p_actor = v_app.employer_id
    or exists (
      select 1 from public.team_members tm
       where tm.user_id = p_actor
         and tm.employer_id = v_app.employer_id
         and tm.status = 'active'
         and tm.can_manage_pipeline is true
         and (array_length(tm.assigned_job_ids, 1) is null or v_app.job_id = any (tm.assigned_job_ids))
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id)), '[]'::jsonb)
    into v_documents
    from public.documents d
   where d.application_id = p_application;

  -- What the same person still uses elsewhere: their profile's resume and
  -- portfolio, and their OTHER applications. A file used by any of them is
  -- theirs to keep.
  select coalesce(string_agg(coalesce(o.resume_url, '') || ' ' || coalesce(o.notes, ''), ' '), '')
         || ' ' || coalesce((select coalesce(p.resume_url, '') || ' ' || coalesce(p.portfolio_url, '') from public.profiles p where p.user_id = v_app.candidate_id), '')
    into v_other_refs
    from public.applications o
   where o.candidate_id = v_app.candidate_id
     and o.id <> p_application;

  insert into private.applicant_removals (application_id, job_id, employer_id, candidate_id, removed_by, reason)
  values (p_application, v_app.job_id, v_app.employer_id, v_app.candidate_id, p_actor, left(nullif(trim(p_reason), ''), 500));

  -- The hiring team's notifications about this applicant (owner and team).
  delete from public.notifications n
   where (n.link = '/applicants/' || p_application::text or n.link like '/applicants/' || p_application::text || '?%')
     and (
       n.user_id = v_app.employer_id
       or n.user_id in (select tm.user_id from public.team_members tm where tm.employer_id = v_app.employer_id)
     );

  delete from public.applications where id = p_application;

  -- Their block with this business goes too once no application of theirs is
  -- left there: it holds their email, phone and the team's reason, and with
  -- no application nothing could show it or lift it again (the second
  -- Phase 5 review). Its other applications still show it.
  if not exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
     where a.candidate_id = v_app.candidate_id and j.employer_id = v_app.employer_id
  ) then
    delete from public.blocked_applicants b
     where b.employer_id = v_app.employer_id and b.candidate_id = v_app.candidate_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'application_id', p_application,
    'candidate_id', v_app.candidate_id,
    'documents', v_documents,
    'resume_url', v_app.resume_url,
    'notes', v_app.notes,
    'other_refs', coalesce(v_other_refs, '')
  );
end;
$$;

revoke all on function public.remove_applicant(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_applicant(uuid, uuid, text) to service_role;

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
    -- An applicant, or another account with no business (a teammate who left).
    SELECT coalesce(nullif(btrim(p.full_name), ''), 'Someone')
           || CASE WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = biz AND r.role = 'candidate') THEN ' (applicant)' ELSE ' (account)' END
      INTO who
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
  VALUES (
    p_employer, 'system', 'HireFlow replied', left(clean, 120),
    CASE WHEN public.help_business_of(p_employer) IS NULL THEN '/contact' ELSE '/help' END,
    false
  );
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reply_help(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_help(uuid, text) TO authenticated, service_role;
