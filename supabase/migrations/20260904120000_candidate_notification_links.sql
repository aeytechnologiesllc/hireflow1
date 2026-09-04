-- ============================================================================
-- Candidate notification links and decision copy
-- ============================================================================
-- notify_application_status_change() (20251217214606_*.sql) writes the in-app
-- notification a candidate gets when their application is rejected, hired,
-- moved to interview, or offered. trigger_push_notification() forwards
-- notifications.link to send-push-notification as the push's deep link, so a
-- candidate tapping the push opens that URL cold, in a browser that may be
-- signed out.
--
-- Two problems with what it wrote:
--
--   1. link = '/applications/<id>'. Signed out, that route bounces to the
--      EMPLOYER login page. Every candidate-facing link now goes through
--      /candidate/auth?redirect=<encoded path>; CandidateAuth honours a safe
--      `redirect` param and routes an already-signed-in candidate straight
--      through, so in-app clicks are unaffected.
--
--   2. The rejection copy promised "Download your feedback report for
--      insights." There is no feedback report to download (the paid
--      Improvement Blueprint is hidden until billing is configured), and the
--      sentence implied a machine had judged them. It now says only what
--      happened: the employer's team made a decision.
--
-- Behaviour otherwise unchanged: same statuses, same notification types,
-- same SECURITY DEFINER trigger on applications.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_application_status_change()
RETURNS TRIGGER AS $$
DECLARE
  job_title TEXT;
  company_name TEXT;
  team_label TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type notification_type;
  notification_link TEXT;
BEGIN
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
      WHEN 'interview' THEN
        notification_title := 'Interview scheduled';
        notification_message := 'You''ve been invited to interview for ' || COALESCE(job_title, 'a position') || '. Check the details and prepare!';
        notification_type := 'interview';
      WHEN 'offered' THEN
        notification_title := 'Offer extended';
        notification_message := 'Congratulations! You''ve received an offer for ' || COALESCE(job_title, 'a position') || '.';
        notification_type := 'status_update';
      ELSE
        -- Don't create notification for other status changes
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The trigger itself is unchanged; re-stated so this migration is complete on
-- its own if the original is ever squashed away.
DROP TRIGGER IF EXISTS on_application_status_change ON applications;
CREATE TRIGGER on_application_status_change
AFTER UPDATE ON applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_application_status_change();
