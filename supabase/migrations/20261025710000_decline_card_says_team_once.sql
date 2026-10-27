-- The decline card says "team" once (the eighteenth Phase 5 review,
-- 2026-10-27, finding 3).
--
-- The server's decline card built its signer as 'The ' || name || ' team',
-- so a business whose name already ends in "Team" read "The Zulu Support
-- Team team has made a decision on your application ...". The decline email
-- has long dropped the second "team" (/\bteam$/i, send-notification-email);
-- the card did not. Live, 61 of the 63 "Application update" cards say
-- "team team", and every application's applied_company_name ends in "Team",
-- so every future decline card on them would too. Now the card uses the
-- email's rule: a name that ends in the word "team" (any capitals) is not
-- given another.
--
-- Only new cards change. The cards already in people's bells are left as
-- they are: they are real users' notifications, and this rewrites none.
--
-- Redefined from its latest repo body with only this change:
--   notify_application_status_change   from 20261025700000_decline_names_the_job_as_applied.sql
--                                      (md5(prosrc) 9cab84a7490bdeb8c446fb5f6173f7d9;
--                                      team_label: no second "team")
-- The trigger that runs it is unchanged (it calls it by name). Re-runnable.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

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
    -- The job's title and the employer's company name as they were when the
    -- person applied (applications_as_applied): a business can rename a
    -- closed job, or itself, to anything after that, and nobody else sees it
    -- (the seventeenth Phase 5 review, probe po).
    job_title := NEW.applied_job_title;
    company_name := NEW.applied_company_name;

    -- "The Zulu Support Team", never "The Zulu Support Team team": a name
    -- that already ends in the word "team" gets no second one, the decline
    -- email's own rule (/\bteam$/i; the eighteenth Phase 5 review, finding 3).
    team_label := CASE
      WHEN NULLIF(TRIM(company_name), '') IS NULL THEN 'The hiring team'
      WHEN TRIM(company_name) ~* '\yteam$' THEN 'The ' || TRIM(company_name)
      ELSE 'The ' || TRIM(company_name) || ' team'
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

RESET statement_timeout;
RESET lock_timeout;
