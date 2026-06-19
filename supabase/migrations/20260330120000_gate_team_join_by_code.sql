-- P0-8 — Team-takeover chain remediation.
--
-- Three live policies combined to let ANY authenticated user bind themselves
-- to ANY employer's team with full permissions:
--   1. "Anyone can view invitations by code" SELECT on team_invitations
--      (USING (invite_code IS NOT NULL) == USING(true)) leaked every
--      invitee_email + code.
--   2. "Users can join via invitation" INSERT on team_members
--      (WITH CHECK (auth.uid() = user_id)) let the caller fully control
--      employer_id, can_* flags, assigned_job_ids and status.
--   3. "Invitees can accept their invitations" UPDATE on team_invitations
--      (any pending -> accepted, no email check).
--
-- Remediation: drop the broad client-facing INSERT/SELECT policies and route
-- the entire join through a single SECURITY DEFINER RPC that verifies the
-- caller's *server-confirmed* email against the invitation and copies all
-- privileged columns FROM the invitation row (never from client input),
-- atomically.

-- ---------------------------------------------------------------------------
-- 1. Drop the dangerous client-facing policies.
-- ---------------------------------------------------------------------------

-- Open read of all invitations (leaks invitee emails + codes cross-tenant).
DROP POLICY IF EXISTS "Anyone can view invitations by code" ON public.team_invitations;

-- Self-insert into team_members with caller-controlled employer_id/permissions.
DROP POLICY IF EXISTS "Users can join via invitation" ON public.team_members;

-- The broad invitee-side accept policy is now redundant: acceptance happens
-- inside join_team_by_code (SECURITY DEFINER). Removing it closes the
-- "mark any pending invitation accepted" hole. Inviters keep their own
-- "Inviters can update their invitations" policy (auth.uid() = inviter_id),
-- so legitimate inviter-side edits/cancellations are unaffected.
DROP POLICY IF EXISTS "Invitees can accept their invitations" ON public.team_invitations;

-- ---------------------------------------------------------------------------
-- 2. Read-side replacement: a definer function that returns ONLY the data the
--    JoinTeam preview needs, scoped to a single code. It never returns any
--    other tenant's invitee email — the email is returned only when it matches
--    the caller's verified email (so the page can prefill it safely).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_team_invitation_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  inviter_id uuid,
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
  status text,
  expires_at timestamptz,
  inviter_full_name text,
  inviter_company_name text,
  email_matches boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.team_invitations%ROWTYPE;
  v_caller_email text;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_inv
  FROM public.team_invitations ti
  WHERE ti.invite_code = p_code;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Server-confirmed email of the caller (null if unauthenticated/unverified).
  SELECT lower(u.email) INTO v_caller_email
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL;

  RETURN QUERY
  SELECT
    v_inv.id,
    v_inv.inviter_id,
    -- Only reveal the target email when it is the caller's own verified email.
    CASE
      WHEN v_caller_email IS NOT NULL
       AND lower(v_inv.invitee_email) = v_caller_email
      THEN v_inv.invitee_email
      ELSE NULL
    END AS invitee_email,
    v_inv.invitee_name,
    v_inv.department,
    v_inv.permission_level,
    v_inv.can_create_jobs,
    v_inv.can_delete_jobs,
    v_inv.can_message_candidates,
    v_inv.can_manage_pipeline,
    v_inv.can_schedule_interviews,
    v_inv.can_send_documents,
    v_inv.assigned_job_ids,
    v_inv.status::text,
    v_inv.expires_at,
    p.full_name,
    p.company_name,
    (v_caller_email IS NOT NULL
       AND lower(v_inv.invitee_email) = v_caller_email) AS email_matches
  FROM public.profiles p
  WHERE p.user_id = v_inv.inviter_id;

  -- Inviter may have no profile row; still return the invitation preview.
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      v_inv.id,
      v_inv.inviter_id,
      CASE
        WHEN v_caller_email IS NOT NULL
         AND lower(v_inv.invitee_email) = v_caller_email
        THEN v_inv.invitee_email
        ELSE NULL
      END,
      v_inv.invitee_name,
      v_inv.department,
      v_inv.permission_level,
      v_inv.can_create_jobs,
      v_inv.can_delete_jobs,
      v_inv.can_message_candidates,
      v_inv.can_manage_pipeline,
      v_inv.can_schedule_interviews,
      v_inv.can_send_documents,
      v_inv.assigned_job_ids,
      v_inv.status::text,
      v_inv.expires_at,
      NULL::text,
      NULL::text,
      (v_caller_email IS NOT NULL
         AND lower(v_inv.invitee_email) = v_caller_email);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Write-side replacement: the gated join. All privileged columns are copied
--    FROM the invitation row; client input is limited to the opaque code.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_team_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_inv public.team_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Invalid invitation code'
      USING ERRCODE = '22023';
  END IF;

  -- Server-confirmed email; spoofing the JWT email claim does not help because
  -- we read straight from auth.users.
  SELECT lower(u.email) INTO v_caller_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL;

  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'A verified email is required to join a team'
      USING ERRCODE = '28000';
  END IF;

  -- Lock the invitation row to make the lookup + accept atomic and prevent a
  -- concurrent double-accept.
  SELECT * INTO v_inv
  FROM public.team_invitations ti
  WHERE ti.invite_code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- The invitation must still be open.
  IF v_inv.status <> 'pending'::public.invitation_status THEN
    RAISE EXCEPTION 'This invitation has already been used'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation has expired'
      USING ERRCODE = 'P0001';
  END IF;

  -- The caller's verified email MUST match the invited email. invitee_email is
  -- NOT NULL on team_invitations, so there is no "unrestricted" invite path.
  IF lower(v_inv.invitee_email) <> v_caller_email THEN
    RAISE EXCEPTION 'This invitation is for a different email address'
      USING ERRCODE = '42501';
  END IF;

  -- Insert the membership. Every privileged column is taken from the
  -- invitation row, never from client input. employer_id = the inviter.
  -- If the user is already a member of this employer, surface a friendly error.
  BEGIN
    INSERT INTO public.team_members (
      user_id,
      employer_id,
      invitation_id,
      name,
      email,
      department,
      permission_level,
      can_create_jobs,
      can_delete_jobs,
      can_message_candidates,
      can_manage_pipeline,
      can_schedule_interviews,
      can_send_documents,
      assigned_job_ids,
      status,
      onboarding_completed
    )
    VALUES (
      v_uid,
      v_inv.inviter_id,
      v_inv.id,
      COALESCE(v_inv.invitee_name, ''),
      v_inv.invitee_email,
      v_inv.department,
      v_inv.permission_level,
      v_inv.can_create_jobs,
      v_inv.can_delete_jobs,
      v_inv.can_message_candidates,
      v_inv.can_manage_pipeline,
      v_inv.can_schedule_interviews,
      v_inv.can_send_documents,
      COALESCE(v_inv.assigned_job_ids, '{}'::uuid[]),
      'active',
      false
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'You are already a member of this team'
        USING ERRCODE = '23505';
  END;

  -- Mark the invitation accepted (same transaction).
  UPDATE public.team_invitations
  SET status = 'accepted'::public.invitation_status
  WHERE id = v_inv.id;

  -- Ensure the team_member role exists for this user (idempotent).
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'team_member'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'employer_id', v_inv.inviter_id,
    'invitation_id', v_inv.id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants: only authenticated users may call these; revoke the default
--    PUBLIC execute grant.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_team_invitation_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_team_by_code(text) FROM PUBLIC;

-- Allow the preview to render for signed-out users as well (it returns no
-- private email for them); allow anon so the JoinTeam page can show the
-- invitation before the user authenticates.
GRANT EXECUTE ON FUNCTION public.get_team_invitation_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_team_by_code(text) TO authenticated;
