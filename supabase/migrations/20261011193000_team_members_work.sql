-- Team members, working end to end (2026-10-11, the final gap check).
--
-- 1. Teammates: unlimited while billing is off. team_member_limit_for_user
--    gave every trial account 1 and an account with no subscription row 0,
--    so the second invite failed with a raw "row-level security" message
--    (the app promised 3). Nothing may sit behind a paywall while billing is
--    off (CLAUDE.md); when billing ships, the plans decide again.
-- 2. The team welcome showed on every sign-in: the app marked it done with
--    an UPDATE only the owner may make, so nothing changed.
--    mark_team_welcome_done() marks the caller's own.
-- 3. An applicant who replies to a team member who has since left (or may no
--    longer message applicants) used to be refused; nobody could read that
--    thread. Their message now goes to the business's owner instead.
-- 4. The bell an applicant gets names the business that wrote, whoever on
--    its team sent it (it named the team member's own profile, or an old
--    business name of theirs).
-- 5. The team members' rule for voice-interview recordings compared the
--    team member's display name to the file's folder, so it never matched.
--    It now reads the file's own folder (voice is off; this only makes the
--    rule true).

-- 1 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.team_member_limit_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select case
    -- Billing off: no plan limits at all.
    when coalesce((select s.value = 'true'::jsonb from public.app_settings s where s.key = 'billing_enabled'), false) = false then -1
    when private.has_subscription_bypass_for_user(target_user_id) then -1
    when exists (
      select 1
      from public.subscriptions s
      where s.user_id = target_user_id
        and s.status = 'trialing'
        and (s.trial_end is null or s.trial_end > now())
    ) then 1
    when exists (
      select 1
      from public.subscriptions s
      where s.user_id = target_user_id
        and s.status = 'active'
        and s.plan_type in ('business', 'enterprise')
    ) then -1
    else 0
  end;
$$;

-- 2 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_team_welcome_done()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.team_members
     SET onboarding_completed = true, updated_at = now()
   WHERE user_id = auth.uid() AND status = 'active' AND onboarding_completed IS DISTINCT FROM true;
$$;

REVOKE ALL ON FUNCTION public.mark_team_welcome_done() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_welcome_done() TO authenticated;

-- 3 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.messages_route_to_current_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  applicant uuid;
  owner uuid;
  job uuid;
BEGIN
  IF NEW.application_id IS NULL OR auth.uid() IS NULL OR NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT a.candidate_id, j.employer_id, j.id INTO applicant, owner, job
    FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = NEW.application_id;
  -- Only an applicant's own message, to someone other than the owner.
  IF applicant IS DISTINCT FROM NEW.sender_id OR owner IS NULL OR NEW.receiver_id = owner THEN
    RETURN NEW;
  END IF;
  -- Someone on the team who may still answer: as written.
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
     WHERE tm.user_id = NEW.receiver_id AND tm.employer_id = owner AND tm.status = 'active'
       AND tm.can_message_candidates = true
       AND (array_length(tm.assigned_job_ids, 1) IS NULL OR job = ANY (tm.assigned_job_ids))
  ) THEN
    RETURN NEW;
  END IF;
  -- Someone who was on this team: the owner gets it instead.
  IF EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = NEW.receiver_id AND tm.employer_id = owner) THEN
    NEW.receiver_id := owner;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.messages_route_to_current_team() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_route_to_current_team ON public.messages;
CREATE TRIGGER messages_route_to_current_team
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_route_to_current_team();

-- 4 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  receiver_is_candidate boolean;
  sender_name text;
  notif_link text;
  notif_body text;
begin
  -- Nothing to announce for a note to yourself.
  if new.receiver_id is null or new.receiver_id = new.sender_id then
    return new;
  end if;

  begin
    -- Employer-side if any employer-side role is present; the app resolves
    -- multi-role accounts the same way (employer > team_member > candidate).
    receiver_is_candidate :=
      exists (
        select 1 from public.user_roles r
        where r.user_id = new.receiver_id and r.role = 'candidate'
      )
      and not exists (
        select 1 from public.user_roles r
        where r.user_id = new.receiver_id and r.role in ('employer', 'team_member')
      );

    -- Name the sender the way the receiver knows them: a candidate hears from
    -- the business that wrote (the job's owner, whoever on its team sent it),
    -- an employer hears from the person.
    if receiver_is_candidate and new.application_id is not null then
      select coalesce(nullif(btrim(op.company_name), ''), nullif(btrim(op.full_name), ''))
        into sender_name
        from public.applications a
        join public.jobs j on j.id = a.job_id
        join public.profiles op on op.user_id = j.employer_id
       where a.id = new.application_id
       limit 1;
    end if;
    if sender_name is null then
      select case
               when receiver_is_candidate
                 then coalesce(nullif(p.company_name, ''), nullif(p.full_name, ''))
               else coalesce(nullif(p.full_name, ''), nullif(p.company_name, ''))
             end
        into sender_name
        from public.profiles p
       where p.user_id = new.sender_id
       limit 1;
    end if;
    sender_name := coalesce(sender_name, 'Someone');

    notif_link := case
      when receiver_is_candidate then '/messages?employer=' || new.sender_id::text
      else '/messages?candidate=' || new.sender_id::text
    end;

    -- The first line of the message is the preview; a file-only message says
    -- what was attached instead of an empty line.
    notif_body := nullif(left(btrim(coalesce(new.content, '')), 140), '');
    if notif_body is null then
      notif_body := case
        when nullif(new.file_name, '') is not null then 'Sent a file: ' || new.file_name
        else 'Sent you a message.'
      end;
    end if;

    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (
      new.receiver_id,
      'message',
      'New message from ' || sender_name,
      notif_body,
      notif_link,
      false
    );
  exception
    when others then
      raise log 'notify_new_message skipped for message %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- 5 ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view interview recordings" ON storage.objects;
CREATE POLICY "Team members can view interview recordings" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'voice-interview-recordings'
    AND EXISTS (
      SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON a.job_id = j.id
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
       WHERE (a.id)::text = (storage.foldername(objects.name))[1]
         AND tm.user_id = auth.uid()
         AND tm.status = 'active'
         AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
    )
  );
