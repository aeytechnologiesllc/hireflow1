-- One business per account, without locking anyone out (2026-10-11, the
-- review of the day's work).
--
-- accept_team_invitation() refused an account that had posted a job, but an
-- account that signed up as a business and never posted one (easy from the
-- front page's "Start free") could still accept: it kept both roles, the app
-- treated it as the owner of its own empty business, and Help, standing and
-- the menus showed that empty business instead of the team's.
--
-- Now such an account joins as a team member: its empty business goes (the
-- 'employer' role and its unused careers address). Nothing else is lost; it
-- never posted a job. It is still refused when that business has started a
-- team of its own (members or invitations out), or is paused.
--
-- The rest of the function is unchanged from 20261011160000.

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_invite public.team_invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is null then
    raise exception 'Not authenticated';
  end if;

  if p_code is null then
    raise exception 'Invitation not found';
  end if;

  -- Lock the row so two concurrent accepts on the same code can't both
  -- pass the pending check before either has committed.
  select * into v_invite
  from public.team_invitations
  where invite_code = p_code
  for update;

  if v_invite.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_invite.status <> 'pending' then
    -- Idempotent replay: if this same user already accepted this exact
    -- invitation, return success again instead of erroring -- but a
    -- different user (or a second accept of an already-used/declined/
    -- expired invitation) is rejected outright, so a captured/replayed
    -- call can never grant broader access than the first legitimate one.
    select tm.id into v_member_id
    from public.team_members tm
    where tm.invitation_id = v_invite.id
      and tm.user_id = v_user_id;

    if v_member_id is not null then
      return v_invite.inviter_id;
    end if;

    raise exception 'This invitation has already been used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'This invitation has expired';
  end if;

  if lower(trim(v_invite.invitee_email)) is distinct from lower(trim(v_user_email)) then
    raise exception 'This invitation is for a different email address';
  end if;

  -- One business per account: the staff screens show one business, so an
  -- owner joining another team, or one person on two teams, would see two
  -- businesses mixed together (2026-10-11 overview).
  if v_invite.inviter_id = v_user_id
     or exists (select 1 from public.jobs j where j.employer_id = v_user_id) then
    raise exception 'This account runs its own hiring on HireFlow. Join the team with a different email.';
  end if;
  if exists (
    select 1 from public.team_members tm
    where tm.user_id = v_user_id
      and tm.status = 'active'
      and tm.employer_id <> v_invite.inviter_id
  ) then
    raise exception 'This account is already on another hiring team. Join with a different email.';
  end if;

  -- An empty business (signed up as one, never posted a job) joins as a team
  -- member: its business goes, unless it has started a team or is paused.
  if exists (select 1 from public.user_roles where user_id = v_user_id and role = 'employer') then
    if exists (select 1 from public.team_members tm where tm.employer_id = v_user_id and tm.status = 'active')
       or exists (select 1 from public.team_invitations ti where ti.inviter_id = v_user_id and ti.status = 'pending')
       or exists (select 1 from public.business_standing s where s.employer_id = v_user_id and s.status = 'suspended') then
      raise exception 'This account runs its own hiring on HireFlow. Join the team with a different email.';
    end if;
    delete from public.user_roles where user_id = v_user_id and role = 'employer';
    delete from public.business_pages where employer_id = v_user_id;
  end if;

  -- Permissions and assigned_job_ids come from the invitation row we just
  -- locked -- never from client input -- so a forged RPC payload (this
  -- function takes no permission arguments at all) cannot escalate access.
  insert into public.team_members (
    user_id, employer_id, invitation_id, name, email, department,
    permission_level, can_create_jobs, can_delete_jobs, can_message_candidates,
    can_manage_pipeline, can_schedule_interviews, can_send_documents,
    assigned_job_ids, status, onboarding_completed
  ) values (
    v_user_id, v_invite.inviter_id, v_invite.id,
    coalesce(v_invite.invitee_name, ''), v_user_email, v_invite.department,
    v_invite.permission_level, v_invite.can_create_jobs, v_invite.can_delete_jobs,
    v_invite.can_message_candidates, v_invite.can_manage_pipeline, v_invite.can_schedule_interviews,
    v_invite.can_send_documents, v_invite.assigned_job_ids, 'active', false
  )
  on conflict (user_id, employer_id) do update set
    invitation_id = excluded.invitation_id,
    name = excluded.name,
    email = excluded.email,
    department = excluded.department,
    permission_level = excluded.permission_level,
    can_create_jobs = excluded.can_create_jobs,
    can_delete_jobs = excluded.can_delete_jobs,
    can_message_candidates = excluded.can_message_candidates,
    can_manage_pipeline = excluded.can_manage_pipeline,
    can_schedule_interviews = excluded.can_schedule_interviews,
    can_send_documents = excluded.can_send_documents,
    assigned_job_ids = excluded.assigned_job_ids,
    status = 'active',
    revoked_at = null,
    updated_at = now()
  returning id into v_member_id;

  update public.team_invitations
  set status = 'accepted'
  where id = v_invite.id;

  return v_invite.inviter_id;
end;
$$;
