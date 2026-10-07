-- ============================================================================
-- Remove and block (2026-10-07): take a spam or unwanted applicant off the
-- list, without telling them, and stop them applying to this employer again.
-- ============================================================================
-- The owner, with a live job taking applications as fast as people can type:
-- "give me a nicer, easier way to drop down to delete some of these
-- applicants. And that will just block them too." Pass is the polite way out
-- (it emails the candidate); this is the other one: silent, and it sticks.
--
-- Applying it while people are applying: the ONLY lock this takes on
-- public.applications is the trigger's creation (section 6, the last
-- statement), and only on the first run: a re-run finds the trigger and
-- creates nothing. lock_timeout makes it give up after 3 seconds rather than
-- queue every form save, submit and test result behind it; if it times out,
-- nothing is applied and it is simply run again.
--
-- What this migration adds, and nothing else:
--
--   1. public.blocked_applicants: one row per (employer, person), keyed by the
--      candidate's user id, with the email they signed up with (lower case),
--      its alias-free form (email_key: Gmail's dots and any +tag ignored, so
--      maria.santos+jobs@googlemail.com is mariasantos@gmail.com), and the
--      first phone they typed on any of their applications to this employer
--      (digits only). `reason` is the staff member's own note (only staff
--      see it). RLS: the employer and its active team members read their own
--      rows (a team member limited to some jobs sees the people who applied
--      to those jobs, and the blocks they made). Nobody writes the table
--      directly: block_applicant(s) and unblock_applicant are the only
--      writers, and they work out the email and phone themselves. anon:
--      nothing.
--
--   2. block_applicant(p_application_id, p_reason) — SECURITY DEFINER, for the
--      job's owner or an active team member who may manage that job's
--      pipeline (the same people the applications UPDATE policy lets decide):
--        * marks the application 'rejected' (rejected_by = the caller,
--          rejected_by_type 'user' for the owner, 'team_member' otherwise),
--          and the same person's other OPEN applications (in_progress,
--          pending, reviewing) to this employer's jobs the caller may also
--          decide on: a blocked person must not keep taking tests on a second
--          job. Interview, offered and hired applications on other jobs are
--          left alone;
--        * stamps notes.blocked = {at, by} on each through
--          merge_application_notes (the one atomic notes path);
--        * writes the block row (or refreshes it: a second block keeps the
--          first email/phone/reason when the new one has none);
--        * tells the candidate NOTHING. The rejection EMAIL is sent by the
--          staff browser (useUpdateApplication in src/hooks/useApplications.ts
--          calls notifyStatusRejected after its own status write); this
--          function never goes through that path. The in-app notification and
--          its push are written by notify_application_status_change() (AFTER
--          UPDATE OF status): it returns early while this function's
--          transaction-local flag hireflow.in_block_applicant is 'on'
--          (section 5). The flag is switched off again before returning.
--        * a form attempt the block cuts short is closed as 'blocked', not
--          'submitted' (assessment_application_form_submitted, section 5):
--          they never sent it.
--      block_applicants(p_application_ids, p_reason) does the same for up to
--      200 applications in one transaction; an application the caller may not
--      decide on is skipped (listed under "skipped"), never an error for the
--      whole batch.
--
--   3. unblock_applicant(p_candidate_id) removes the caller's employer's block
--      on that person and returns how many rows went (0 when there was none or
--      the caller may not). Their applications STAY rejected: unblocking only
--      lets them apply again.
--
--   4. A BEFORE INSERT trigger on applications refuses a new application to a
--      job whose employer has blocked that ACCOUNT or its EMAIL (auth.users or
--      profiles, compared by email_key), with "We can't take an application
--      from this account." (P0001, HINT applicant_blocked), which
--      JobDetails.tsx shows as is.
--      A PHONE never refuses anyone. A phone is typed by the applicant and
--      unchecked: a household or shared number, or one someone else typed,
--      would turn a real person away with no recourse. And a new account has
--      no phone at the moment it applies (it is typed into the form
--      afterwards), so a refusal could only ever reach accounts that had
--      applied before. Instead the staff list FLAGS anyone whose form phone
--      is a blocked person's ("Blocked phone", src/cockpit/lib/
--      blockedApplicants.ts), and the hiring team decides.
--      The guard is built so it cannot disturb anyone applying right now:
--        * an employer with no blocks at all costs one index probe and returns;
--        * the account and email checks are index probes;
--        * any unexpected error inside the check is logged and the application
--          goes through (fail open): only a positive match refuses.
--      The candidate's applications INSERT is the only way an application is
--      started (JobDetails.tsx handleStartApplication; no edge function or RPC
--      inserts one).
--
--   5. Two live trigger functions restated (pg_get_functiondef, production,
--      2026-10-07), each changed only under hireflow.in_block_applicant:
--        * notify_application_status_change(): an early return (no bell, no
--          push for a block);
--        * assessment_application_form_submitted(): end_reason 'blocked' and
--          event {what: 'blocked'} instead of 'submitted'.
--      A candidate cannot set that flag (it is a transaction-local setting
--      only SQL running in the transaction can write; PostgREST exposes no way
--      to), and if they somehow could, all it would do is skip a notification
--      about their own application, or word their own form's close.
--      RE-COPY BOTH from production before applying if either has changed.
--
--   6. The trigger itself, last, created only when it does not exist yet.
--
-- protect_application_columns still runs on every write here: the caller is
-- the job's owner or a pipeline team member, which it already lets through.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── Small readers ──────────────────────────────────────────────────────────

-- An email as the block compares it: lower case, trimmed, any +tag dropped
-- (every provider that has tags delivers them to the same inbox), and for
-- Gmail the dots in the name dropped and googlemail.com read as gmail.com
-- (Gmail ignores both). NULL when it is not an address.
CREATE OR REPLACE FUNCTION public.applicant_email_key(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email  text := lower(btrim(COALESCE(p_email, '')));
  v_local  text;
  v_domain text;
BEGIN
  IF v_email !~ '^[^@]+@[^@]+$' THEN
    RETURN NULL;
  END IF;
  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);
  v_local := split_part(v_local, '+', 1);
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  END IF;
  IF v_local = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_local || '@' || v_domain;
END;
$$;

-- A phone as the block stores it: digits only, 7 to 15 of them, else NULL.
CREATE OR REPLACE FUNCTION public.applicant_phone_key(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g')) BETWEEN 7 AND 15
      THEN regexp_replace(p_phone, '[^0-9]', '', 'g')
    ELSE NULL
  END
$$;

-- The phone the applicant typed on the form (notes.applicationAnswers): the
-- first answer to a phone-type question, else a free-text question that asks
-- for a phone, WhatsApp or mobile number (the profile's own rule,
-- contactFacts in src/cockpit/lib/applicantProfile.ts). Digits only, or NULL.
CREATE OR REPLACE FUNCTION public.applicant_phone_from_notes(p_notes text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_answers jsonb;
  v_phone   text;
BEGIN
  v_answers := public.assessment_notes_object(p_notes) -> 'applicationAnswers';
  IF v_answers IS NULL OR jsonb_typeof(v_answers) <> 'array' THEN
    RETURN NULL;
  END IF;

  SELECT public.applicant_phone_key(a ->> 'answer') INTO v_phone
    FROM jsonb_array_elements(v_answers) WITH ORDINALITY AS t(a, n)
   WHERE jsonb_typeof(a) = 'object'
     AND lower(COALESCE(a ->> 'type', '')) IN ('tel', 'phone', 'telephone', 'mobile')
     AND public.applicant_phone_key(a ->> 'answer') IS NOT NULL
   ORDER BY n
   LIMIT 1;
  IF v_phone IS NOT NULL THEN
    RETURN v_phone;
  END IF;

  SELECT public.applicant_phone_key(a ->> 'answer') INTO v_phone
    FROM jsonb_array_elements(v_answers) WITH ORDINALITY AS t(a, n)
   WHERE jsonb_typeof(a) = 'object'
     AND lower(COALESCE(a ->> 'type', 'text')) = 'text'
     AND COALESCE(a ->> 'question', '') ~* '(phone|whats ?app|mobile)'
     AND public.applicant_phone_key(a ->> 'answer') IS NOT NULL
   ORDER BY n
   LIMIT 1;
  RETURN v_phone;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blocked_applicants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id  uuid NOT NULL,
  candidate_id uuid NOT NULL,
  email        text NULL,
  email_key    text GENERATED ALWAYS AS (public.applicant_email_key(email)) STORED,
  phone        text NULL,
  reason       text NULL,
  blocked_by   uuid NOT NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_applicants_one_per_person UNIQUE (employer_id, candidate_id),
  CONSTRAINT blocked_applicants_email_lower CHECK (email IS NULL OR (email <> '' AND email = lower(btrim(email)))),
  CONSTRAINT blocked_applicants_email_length CHECK (email IS NULL OR char_length(email) <= 320),
  CONSTRAINT blocked_applicants_phone_digits CHECK (phone IS NULL OR phone ~ '^[0-9]{7,15}$'),
  CONSTRAINT blocked_applicants_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX IF NOT EXISTS blocked_applicants_employer_email_key_idx
  ON public.blocked_applicants (employer_id, email_key) WHERE email_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS blocked_applicants_candidate_idx
  ON public.blocked_applicants (candidate_id);

COMMENT ON TABLE public.blocked_applicants IS
  'People an employer removed and blocked (Remove and block on the Applicants list). Keyed by the candidate''s user id, with their email (lower case; email_key ignores Gmail dots and +tags) so a new application from the same account or email is refused (applications_refuse_blocked), and their form phone (digits), which the staff list flags and never refuses. Written only by block_applicant(s), removed only by unblock_applicant.';

-- ── Who may see and change an employer's blocks ────────────────────────────
-- Both answer only about the CALLER (auth.uid()), never about a user id
-- passed in, the same posture as is_job_owner / is_active_team_member_for_job.

-- Read one block: the employer; an active team member on every job; a team
-- member limited to some jobs, for a person who applied to one of them or a
-- block they made themselves.
CREATE OR REPLACE FUNCTION public.can_view_applicant_block(p_employer_id uuid, p_candidate_id uuid, p_blocked_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_employer_id IS NOT NULL
    AND (
      p_employer_id = auth.uid()
      OR EXISTS (
        SELECT 1
          FROM public.team_members tm
         WHERE tm.employer_id = p_employer_id
           AND tm.user_id = auth.uid()
           AND tm.status = 'active'
           AND (
             array_length(tm.assigned_job_ids, 1) IS NULL
             OR p_blocked_by = auth.uid()
             OR EXISTS (
               SELECT 1
                 FROM public.applications a
                 JOIN public.jobs j ON j.id = a.job_id
                WHERE a.candidate_id = p_candidate_id
                  AND j.employer_id = p_employer_id
                  AND j.id = ANY (tm.assigned_job_ids)
             )
           )
      )
    )
$$;

-- Remove one (unblock_applicant): as above, and a team member must also be
-- allowed to manage the pipeline (the permission that lets them pass on
-- someone).
CREATE OR REPLACE FUNCTION public.can_manage_applicant_block(p_employer_id uuid, p_candidate_id uuid, p_blocked_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_employer_id IS NOT NULL
    AND (
      p_employer_id = auth.uid()
      OR (
        public.can_view_applicant_block(p_employer_id, p_candidate_id, p_blocked_by)
        AND EXISTS (
          SELECT 1
            FROM public.team_members tm
           WHERE tm.employer_id = p_employer_id
             AND tm.user_id = auth.uid()
             AND tm.status = 'active'
             AND tm.can_manage_pipeline = true
        )
      )
    )
$$;

ALTER TABLE public.blocked_applicants ENABLE ROW LEVEL SECURITY;

-- Read only, for signed-in staff. Writes go through the SECURITY DEFINER
-- functions below, which derive the email and phone themselves: a direct
-- INSERT would let any signed-in user (a candidate included) write rows of
-- any size, and let a team member limited to one job block anyone across
-- the employer by typing in their email.
REVOKE ALL ON public.blocked_applicants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blocked_applicants TO authenticated;
GRANT ALL ON public.blocked_applicants TO service_role;

DROP POLICY IF EXISTS "Employer staff can see their blocked applicants" ON public.blocked_applicants;
CREATE POLICY "Employer staff can see their blocked applicants"
  ON public.blocked_applicants FOR SELECT TO authenticated
  USING (public.can_view_applicant_block(employer_id, candidate_id, blocked_by));

DROP POLICY IF EXISTS "Employer staff can block applicants" ON public.blocked_applicants;
DROP POLICY IF EXISTS "Employer staff can unblock applicants" ON public.blocked_applicants;

-- ── 2. block_applicant / block_applicants ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.block_applicant(p_application_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_app      record;
  v_other    record;
  v_owner    boolean;
  v_email    text;
  v_phone    text;
  v_reason   text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
  v_stamp    jsonb;
  v_rejected uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'block_applicant: not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT a.id, a.job_id, a.candidate_id, a.notes, j.employer_id
    INTO v_app
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = p_application_id;

  -- Not found and not allowed read the same: an application id on someone
  -- else's job says nothing about whether it exists.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'block_applicant: not an applicant on your jobs' USING ERRCODE = '42501';
  END IF;
  v_owner := public.is_job_owner(v_app.job_id, v_uid);
  IF NOT v_owner AND NOT public.is_active_team_member_for_job(v_app.job_id, v_uid, true) THEN
    RAISE EXCEPTION 'block_applicant: not an applicant on your jobs' USING ERRCODE = '42501';
  END IF;

  -- Who they are: the email they signed up with; the phone from their form,
  -- this application's first, else the first they typed on any of their
  -- applications to this employer (someone blocked before reaching this
  -- job's form may have typed it on another), else their profile's.
  SELECT NULLIF(lower(btrim(u.email)), '') INTO v_email FROM auth.users u WHERE u.id = v_app.candidate_id;
  IF v_email IS NULL THEN
    SELECT NULLIF(lower(btrim(p.email)), '') INTO v_email FROM public.profiles p WHERE p.user_id = v_app.candidate_id;
  END IF;
  IF char_length(v_email) > 320 THEN
    v_email := NULL;
  END IF;
  SELECT x.phone INTO v_phone
    FROM (
      SELECT public.applicant_phone_from_notes(a.notes) AS phone, (a.id = v_app.id) AS this_one, a.created_at, a.id
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
       WHERE a.candidate_id = v_app.candidate_id
         AND j.employer_id = v_app.employer_id
    ) x
   WHERE x.phone IS NOT NULL
   ORDER BY x.this_one DESC, x.created_at, x.id
   LIMIT 1;
  IF v_phone IS NULL THEN
    SELECT public.applicant_phone_key(p.phone) INTO v_phone FROM public.profiles p WHERE p.user_id = v_app.candidate_id;
  END IF;

  INSERT INTO public.blocked_applicants AS b (employer_id, candidate_id, email, phone, reason, blocked_by)
  VALUES (v_app.employer_id, v_app.candidate_id, v_email, v_phone, v_reason, v_uid)
  ON CONFLICT (employer_id, candidate_id) DO UPDATE
     SET email      = COALESCE(EXCLUDED.email, b.email),
         phone      = COALESCE(EXCLUDED.phone, b.phone),
         reason     = COALESCE(EXCLUDED.reason, b.reason),
         blocked_by = EXCLUDED.blocked_by;

  -- Off the list, silently: this application, and their other open ones to
  -- this employer that the caller may decide on.
  PERFORM set_config('hireflow.in_block_applicant', 'on', true);
  v_stamp := jsonb_build_object('blocked', jsonb_build_object('at', to_jsonb(now()), 'by', to_jsonb(v_uid)));

  FOR v_other IN
    SELECT a.id, a.job_id, a.status::text AS status
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.candidate_id = v_app.candidate_id
       AND j.employer_id = v_app.employer_id
       AND (a.id = v_app.id OR a.status::text IN ('in_progress', 'pending', 'reviewing'))
     ORDER BY a.created_at, a.id
       FOR UPDATE OF a
  LOOP
    IF v_other.id <> v_app.id
       AND NOT (public.is_job_owner(v_other.job_id, v_uid) OR public.is_active_team_member_for_job(v_other.job_id, v_uid, true)) THEN
      CONTINUE;
    END IF;

    IF v_other.status <> 'rejected' THEN
      UPDATE public.applications
         SET status = 'rejected',
             rejected_by = v_uid,
             rejected_by_type = CASE WHEN v_owner THEN 'user' ELSE 'team_member' END
       WHERE id = v_other.id;
    END IF;

    PERFORM public.merge_application_notes(v_other.id, v_stamp);
    v_rejected := v_rejected || v_other.id;
  END LOOP;

  PERFORM set_config('hireflow.in_block_applicant', '', true);

  RETURN jsonb_build_object(
    'candidateId', v_app.candidate_id,
    'applicationIds', to_jsonb(v_rejected),
    'email', v_email IS NOT NULL,
    'phone', v_phone IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.block_applicants(p_application_ids uuid[], p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id      uuid;
  v_ids     uuid[];
  v_done    uuid[] := ARRAY[]::uuid[];
  v_skipped uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'block_applicants: not signed in' USING ERRCODE = '42501';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_application_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL ORDER BY x);
  IF cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'block_applicants: at most 200 at a time' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.block_applicant(v_id, p_reason);
      v_done := v_done || v_id;
    EXCEPTION WHEN insufficient_privilege THEN
      v_skipped := v_skipped || v_id;
    END;
  END LOOP;

  RETURN jsonb_build_object('blocked', to_jsonb(v_done), 'skipped', to_jsonb(v_skipped));
END;
$$;

-- ── 3. unblock_applicant ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unblock_applicant(p_candidate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unblock_applicant: not signed in' USING ERRCODE = '42501';
  END IF;

  -- Only the block. Their applications stay rejected.
  DELETE FROM public.blocked_applicants b
   WHERE b.candidate_id = p_candidate_id
     AND public.can_manage_applicant_block(b.employer_id, b.candidate_id, b.blocked_by);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 4. The guard on a new application ──────────────────────────────────────

-- Account or email only (see the header: a phone is flagged, never refused).
CREATE OR REPLACE FUNCTION public.applicant_is_blocked(p_employer_id uuid, p_candidate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys text[];
BEGIN
  IF p_employer_id IS NULL OR p_candidate_id IS NULL THEN
    RETURN false;
  END IF;

  -- Most employers have blocked nobody: one index probe, and done.
  IF NOT EXISTS (SELECT 1 FROM public.blocked_applicants b WHERE b.employer_id = p_employer_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocked_applicants b WHERE b.employer_id = p_employer_id AND b.candidate_id = p_candidate_id) THEN
    RETURN true;
  END IF;

  v_keys := ARRAY(
    SELECT DISTINCT k FROM (
      SELECT public.applicant_email_key(u.email) AS k FROM auth.users u WHERE u.id = p_candidate_id
      UNION ALL
      SELECT public.applicant_email_key(p.email) FROM public.profiles p WHERE p.user_id = p_candidate_id
    ) s
    WHERE k IS NOT NULL
  );
  IF cardinality(v_keys) > 0 AND EXISTS (
    SELECT 1 FROM public.blocked_applicants b WHERE b.employer_id = p_employer_id AND b.email_key = ANY (v_keys)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.applications_refuse_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employer uuid;
  v_blocked  boolean := false;
BEGIN
  -- Fail open: only a positive match refuses. Anything unexpected in the
  -- check is logged and the application goes through, so this guard can
  -- never stop a real applicant because of a bug.
  BEGIN
    SELECT j.employer_id INTO v_employer FROM public.jobs j WHERE j.id = NEW.job_id;
    v_blocked := COALESCE(public.applicant_is_blocked(v_employer, NEW.candidate_id), false);
  EXCEPTION WHEN others THEN
    RAISE LOG 'applications_refuse_blocked: check skipped for candidate %: %', NEW.candidate_id, SQLERRM;
    v_blocked := false;
  END;

  IF v_blocked THEN
    RAISE EXCEPTION 'We can''t take an application from this account.'
      USING ERRCODE = 'P0001', HINT = 'applicant_blocked';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. The live trigger functions a block passes through ──────────────────

-- No bell, no push for a block.
-- The live body (production, 2026-10-07), unchanged but for the first IF.
CREATE OR REPLACE FUNCTION public.notify_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  job_title TEXT;
  company_name TEXT;
  team_label TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type notification_type;
  notification_link TEXT;
BEGIN
  -- Remove and block (block_applicant) tells the candidate nothing.
  IF COALESCE(current_setting('hireflow.in_block_applicant', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only process if status actually changed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Job title and the employer's company name (for the decision copy)
    SELECT j.title, p.company_name
      INTO job_title, company_name
      FROM jobs j
      LEFT JOIN profiles p ON p.user_id = j.employer_id
     WHERE j.id = NEW.job_id;

    team_label := CASE
      WHEN NULLIF(TRIM(company_name), '') IS NOT NULL THEN 'The ' || TRIM(company_name) || ' team'
      ELSE 'The hiring team'
    END;

    -- Candidate links go through candidate sign-in with the destination as a
    -- redirect. A UUID needs no encoding beyond the slashes.
    notification_link := '/candidate/auth?redirect=' || replace('/applications/' || NEW.id::text, '/', '%2F');

    -- Set notification details based on new status
    CASE NEW.status
      WHEN 'rejected' THEN
        notification_title := 'Application update';
        notification_message := team_label || ' has made a decision on your application'
          || CASE WHEN job_title IS NOT NULL THEN ' for ' || job_title ELSE '' END || '.';
        notification_type := 'status_update';
      WHEN 'hired' THEN
        notification_title := 'Congratulations! You''re hired';
        notification_message := 'Great news! You''ve been selected for ' || COALESCE(job_title, 'the position') || '. Welcome aboard!';
        notification_type := 'status_update';
      WHEN 'offered' THEN
        notification_title := 'Offer extended';
        notification_message := 'Congratulations! You''ve received an offer for ' || COALESCE(job_title, 'a position') || '.';
        notification_type := 'status_update';
      ELSE
        -- Don't create notification for other status changes. 'interview'
        -- falls in here now too -- see section 4's header comment: moment
        -- 2's on_interview_insert_notify trigger (section 2 above) already
        -- notified the candidate, for the same scheduling action, with more
        -- accurate copy than this trigger can produce from the status alone.
        RETURN NEW;
    END CASE;

    -- Insert the notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      is_read
    ) VALUES (
      NEW.candidate_id,
      notification_type,
      notification_title,
      notification_message,
      notification_link,
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- A form attempt the block cuts short (in_progress -> rejected) is closed as
-- 'blocked', not 'submitted': they never sent it. The live body (production,
-- 2026-10-07), unchanged but for the two words chosen under the flag.
CREATE OR REPLACE FUNCTION public.assessment_application_form_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids uuid[];
  v_why text := CASE
    WHEN COALESCE(current_setting('hireflow.in_block_applicant', true), '') = 'on' THEN 'blocked'
    ELSE 'submitted'
  END;
BEGIN
  BEGIN
    WITH done AS (
      UPDATE public.assessment_sessions s
         SET status = 'completed', ended_at = now(), end_reason = v_why,
             last_activity_at = now(), hidden_at = NULL
       WHERE s.application_id = NEW.id AND s.step_id = 'application' AND s.status IN ('active', 'abandoned')
      RETURNING s.id
    )
    SELECT array_agg(id) INTO v_ids FROM done;

    IF v_ids IS NOT NULL THEN
      INSERT INTO public.assessment_events (session_id, kind, detail)
      SELECT unnest(v_ids), 'system', jsonb_build_object('what', v_why);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE LOG 'assessment_application_form_submitted skipped for application %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default, so each is revoked by name.

REVOKE ALL ON FUNCTION public.block_applicant(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_applicants(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unblock_applicant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_applicant(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.block_applicants(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unblock_applicant(uuid) TO authenticated, service_role;

-- The SELECT policy calls this as the signed-in user; unblock_applicant
-- calls the other from inside its own SECURITY DEFINER body.
REVOKE ALL ON FUNCTION public.can_view_applicant_block(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_applicant_block(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_applicant_block(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_applicant_block(uuid, uuid, uuid) TO service_role;

-- Server-only: the guard and its readers. (applicant_email_key is IMMUTABLE
-- and runs inside the table's generated column as the table's writer.)
REVOKE ALL ON FUNCTION public.applicant_is_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.applications_refuse_blocked() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.applicant_email_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.applicant_phone_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.applicant_phone_from_notes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_is_blocked(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.applicant_email_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.applicant_phone_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.applicant_phone_from_notes(text) TO service_role;

COMMENT ON FUNCTION public.block_applicant(uuid, text) IS
  'Remove and block: the job''s owner or a pipeline team member marks the application rejected (and the same person''s other open applications to this employer they may decide on), stamps notes.blocked = {at, by}, and blocks the account and email from applying to this employer again (their form phone is kept for the staff list''s flag). Sends nothing to the candidate.';
COMMENT ON FUNCTION public.block_applicants(uuid[], text) IS
  'block_applicant for up to 200 applications in one transaction; ones the caller may not decide on are returned under "skipped".';
COMMENT ON FUNCTION public.unblock_applicant(uuid) IS
  'Removes the caller''s employer''s block on a person. Their applications stay rejected. Returns the number of block rows removed.';

-- ── 6. The guard's trigger: last, and only once ────────────────────────────
-- CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on public.applications
-- until this migration commits; dropping and re-creating it would take an
-- ACCESS EXCLUSIVE one, which queues even reads. So it is the last
-- statement, and a re-run (the function above is replaced in place) does not
-- touch the table at all.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.applications'::regclass
       AND tgname = 'applications_refuse_blocked'
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER applications_refuse_blocked
      BEFORE INSERT ON public.applications
      FOR EACH ROW EXECUTE FUNCTION public.applications_refuse_blocked();
  END IF;
END;
$$;

RESET statement_timeout;
RESET lock_timeout;
