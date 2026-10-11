-- Close the gaps the 2026-10-11 overview found before other businesses join.
-- Every item below was confirmed against the live database first.
--
--   1. An applicant could set their own score, status, phase or step results
--      in the INSERT that creates the application: protect_application_columns
--      only runs on UPDATE. Now every non-service insert starts clean.
--   2. Any business could put a document into another business's applicant's
--      Documents: the second branch of the documents INSERT policies only
--      checked sender_id. A document tied to an application now needs the
--      sender to be on that application's job; one with no application can
--      name no recipient.
--   3. A business could watch every video an applicant recorded, including
--      intros made for other businesses ("Employers can view candidate
--      videos" matched the applicant's whole folder). Now each file must
--      belong to an application on the viewer's job.
--   4. A business could read any resume by pointing resume_url on one of its
--      own applications at that file. The file must now sit in that
--      applicant's own folder, and team access follows assigned jobs. The
--      older URL-matching duplicate is dropped.
--   5. A business could add any account to its team without asking it
--      (direct INSERT on team_members). Members join only through
--      accept_team_invitation now, and a member row's person and business
--      can no longer be changed by an update.
--   6. One account on two businesses' teams, or a business owner joining
--      another team, mixes businesses on the screens. accept_team_invitation
--      refuses both, with words that say why.
--   7. Two helpers had no fixed search_path (security advisor).
--   8. The 'blueprint_paid' switch that could put an applicant's own report
--      behind a payment is removed: applicants never pay on HireFlow.

-- 1. Applications start clean -----------------------------------------------

CREATE OR REPLACE FUNCTION public.applications_insert_starts_clean()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Only what the applicant may say about themselves at the start survives:
  -- the job, themselves (RLS pins candidate_id), a cover letter and a
  -- resume path. Everything the server or the hiring team decides starts
  -- empty, the same columns protect_application_columns guards on UPDATE.
  NEW.status := 'in_progress';
  NEW.phase := 'application';
  NEW.notes := NULL;
  NEW.ai_analysis := NULL;
  NEW.ai_score := NULL;
  NEW.ai_scorecard := NULL;
  NEW.phase_ai_analysis := NULL;
  NEW.resume_score := NULL;
  NEW.employer_notes := NULL;
  NEW.voice_interview_result := NULL;
  NEW.voice_interview_transcript := NULL;
  NEW.voice_interview_recording_url := NULL;
  NEW.rejected_by := NULL;
  NEW.rejected_by_type := NULL;
  NEW.source := 'hireflow';
  NEW.external_provider := NULL;
  NEW.external_application_id := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_insert_starts_clean() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_insert_starts_clean ON public.applications;
CREATE TRIGGER applications_insert_starts_clean
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_insert_starts_clean();

-- 2. Documents only for your own applicants ---------------------------------

DROP POLICY IF EXISTS "Employers can create documents" ON public.documents;
CREATE POLICY "Employers can create documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.can_create_document_workflows_for_user(auth.uid())
    AND (
      (
        application_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = documents.application_id
            AND j.employer_id = auth.uid()
            AND (documents.recipient_id IS NULL OR documents.recipient_id = a.candidate_id)
        )
      )
      OR (
        application_id IS NULL
        AND recipient_id IS NULL
        AND sender_id = auth.uid()
        AND public.has_role(auth.uid(), 'employer'::public.app_role)
      )
    )
  );

DROP POLICY IF EXISTS "Team members can create documents if permitted" ON public.documents;
CREATE POLICY "Team members can create documents if permitted"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    (
      application_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
        WHERE a.id = documents.application_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND tm.can_send_documents = true
          AND public.can_create_document_workflows_for_user(j.employer_id)
          AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
          AND (documents.recipient_id IS NULL OR documents.recipient_id = a.candidate_id)
      )
    )
    OR (
      application_id IS NULL
      AND recipient_id IS NULL
      AND sender_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND tm.can_send_documents = true
          AND public.can_create_document_workflows_for_user(tm.employer_id)
      )
    )
  );

-- 3. Videos: only the ones made for your job --------------------------------

DROP POLICY IF EXISTS "Employers can view candidate videos" ON storage.objects;
CREATE POLICY "Employers can view candidate videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.candidate_id::text = (storage.foldername(objects.name))[1]
        -- VideoIntroPhase names every file <candidate>/<application>-<step>-<time>.
        AND storage.filename(objects.name) LIKE a.id::text || '-%'
        AND (
          public.is_job_owner(a.job_id, auth.uid())
          OR public.is_active_team_member_for_job(a.job_id, auth.uid())
        )
    )
  );

-- 4. Resumes: the applicant's own file, on your job --------------------------

DROP POLICY IF EXISTS "Employers read applicant resumes" ON storage.objects;
DROP POLICY IF EXISTS "Employers can view submitted resumes" ON storage.objects;
CREATE POLICY "Employers can view submitted resumes"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.resume_url = objects.name
        -- resume_url is the applicant's to write and the hiring team's to
        -- edit: the file itself must be in that applicant's own folder.
        AND (storage.foldername(objects.name))[1] = a.candidate_id::text
        AND (
          public.is_job_owner(a.job_id, auth.uid())
          OR public.is_active_team_member_for_job(a.job_id, auth.uid())
        )
    )
  );

-- 5. Team members join only by accepting an invitation ----------------------

DROP POLICY IF EXISTS "Employers can create team members" ON public.team_members;

CREATE OR REPLACE FUNCTION public.team_members_pin_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
    RAISE EXCEPTION 'A team member''s account and business cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_pin_identity ON public.team_members;
CREATE TRIGGER team_members_pin_identity
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_members_pin_identity();

-- 6. One business per account -----------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$;

-- 7. Fixed search_path on two helpers ----------------------------------------

ALTER FUNCTION public.business_pages_touch() SET search_path = public, pg_temp;
ALTER FUNCTION public.slugify_business(text) SET search_path = public, pg_temp;

-- 8. Applicants never pay ----------------------------------------------------

DELETE FROM public.app_settings WHERE key = 'blueprint_paid';
