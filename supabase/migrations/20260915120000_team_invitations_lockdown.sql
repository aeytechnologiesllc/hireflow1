-- RED: anyone signed in could make themselves a team member of ANY business,
-- and every pending invitation (invite_code + invitee_email + permissions)
-- was readable by anyone, signed in or not.
--
-- Root causes, both on tables that predate this migration:
--   1. team_members INSERT policy "Users can join via invitation" only
--      checked `auth.uid() = user_id` -- nothing tied the row to a real
--      invitation or to the employer_id being claimed. Any authenticated
--      client could insert { user_id: self, employer_id: <anyone>,
--      status: 'active' (default), can_*: true (default) } directly.
--   2. team_invitations SELECT policy "Anyone can view invitations by code"
--      was `USING (invite_code IS NOT NULL)` -- a per-row filter, not an
--      equality check against a queried code. `select * from
--      team_invitations` (no filter needed) returned every pending
--      invitation across every employer: invite codes, invitee emails,
--      names, departments and permission grants.
--   3. A third, related hole in the same flow: team_invitations UPDATE
--      policy "Invitees can accept their invitations" was
--      `USING (status = 'pending') WITH CHECK (status = 'accepted')` with
--      no invitee-identity check at all and no column allowlist -- any
--      authenticated user could flip ANY pending invitation (not just
--      their own) to accepted, and rewrite its other columns while doing
--      so, as long as the final status was 'accepted'.
--
-- Fix: acceptance moves entirely server-side behind two SECURITY DEFINER
-- RPCs that JoinTeam.tsx now calls instead of querying/writing the tables
-- directly:
--   - get_team_invitation_by_code(p_code) returns only the display fields
--     JoinTeam needs, and only for an exact, pending, unexpired code.
--   - accept_team_invitation(p_code) re-checks pending+unexpired, requires
--     the signed-in user's real (server-side, auth.users) email to match
--     the invitee email case-insensitively, and copies permissions /
--     assigned_job_ids FROM THE INVITATION ROW -- never from client input.
-- The client-satisfiable team_members INSERT policy and both
-- client-satisfiable team_invitations read/update-by-code policies are
-- dropped. Employer-owned reads/writes (their own invitations, their own
-- team_members rows) are untouched.

-- ---------------------------------------------------------------------
-- 1. Drop the three client-satisfiable holes.
-- ---------------------------------------------------------------------

drop policy if exists "Anyone can view invitations by code" on public.team_invitations;
drop policy if exists "Invitees can accept their invitations" on public.team_invitations;
drop policy if exists "Users can join via invitation" on public.team_members;

-- ---------------------------------------------------------------------
-- 2. get_team_invitation_by_code -- read-only, code-gated, minimal fields.
--    Callable signed-out (the invite link is opened before sign-up/sign-in),
--    so anon needs EXECUTE too. It can only ever return the one row whose
--    invite_code exactly matches p_code, and only while that row is still
--    pending and unexpired -- never a listing, never another employer's row.
-- ---------------------------------------------------------------------

create or replace function public.get_team_invitation_by_code(p_code text)
returns table (
  company_name text,
  inviter_name text,
  invitee_email text,
  invitee_name text,
  department text,
  permission_level text,
  can_create_jobs boolean,
  can_delete_jobs boolean,
  can_message_candidates boolean,
  can_manage_pipeline boolean,
  can_schedule_interviews boolean,
  can_send_documents boolean,
  assigned_job_ids uuid[],
  status public.invitation_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.company_name,
    p.full_name,
    ti.invitee_email,
    ti.invitee_name,
    ti.department,
    ti.permission_level,
    ti.can_create_jobs,
    ti.can_delete_jobs,
    ti.can_message_candidates,
    ti.can_manage_pipeline,
    ti.can_schedule_interviews,
    ti.can_send_documents,
    ti.assigned_job_ids,
    ti.status,
    ti.expires_at
  from public.team_invitations ti
  left join public.profiles p on p.user_id = ti.inviter_id
  where p_code is not null
    and ti.invite_code = p_code
    and ti.status = 'pending'
    and ti.expires_at > now();
$$;

revoke all on function public.get_team_invitation_by_code(text) from public;
grant execute on function public.get_team_invitation_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. accept_team_invitation -- the only path left into team_members via
--    an invitation. authenticated only (never anon: you must be signed in
--    as the invitee's own account first).
-- ---------------------------------------------------------------------

create or replace function public.accept_team_invitation(p_code text)
returns uuid -- employer_id of the team just joined
language plpgsql
security definer
set search_path = public, auth
as $$
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

revoke all on function public.accept_team_invitation(text) from public;
grant execute on function public.accept_team_invitation(text) to authenticated;
revoke execute on function public.accept_team_invitation(text) from anon;
