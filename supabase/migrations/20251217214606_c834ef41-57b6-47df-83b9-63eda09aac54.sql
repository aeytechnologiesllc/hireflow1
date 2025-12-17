-- Create function to automatically create notifications on application status change
CREATE OR REPLACE FUNCTION notify_application_status_change()
RETURNS TRIGGER AS $$
DECLARE
  job_title TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_type notification_type;
  notification_link TEXT;
BEGIN
  -- Only process if status actually changed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Get the job title
    SELECT title INTO job_title FROM jobs WHERE id = NEW.job_id;
    
    -- Set notification details based on new status
    CASE NEW.status
      WHEN 'rejected' THEN
        notification_title := 'Application Update';
        notification_message := 'Your application for ' || COALESCE(job_title, 'a position') || ' has been reviewed. Download your feedback report for insights.';
        notification_type := 'status_update';
        notification_link := '/applications/' || NEW.id;
      WHEN 'hired' THEN
        notification_title := 'Congratulations! You''re Hired!';
        notification_message := 'Great news! You''ve been selected for ' || COALESCE(job_title, 'the position') || '. Welcome aboard!';
        notification_type := 'status_update';
        notification_link := '/applications/' || NEW.id;
      WHEN 'interview' THEN
        notification_title := 'Interview Scheduled!';
        notification_message := 'You''ve been invited to interview for ' || COALESCE(job_title, 'a position') || '. Check the details and prepare!';
        notification_type := 'interview';
        notification_link := '/applications/' || NEW.id;
      WHEN 'offered' THEN
        notification_title := 'Offer Extended!';
        notification_message := 'Congratulations! You''ve received an offer for ' || COALESCE(job_title, 'a position') || '.';
        notification_type := 'status_update';
        notification_link := '/applications/' || NEW.id;
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

-- Create trigger on applications table
DROP TRIGGER IF EXISTS on_application_status_change ON applications;
CREATE TRIGGER on_application_status_change
AFTER UPDATE ON applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION notify_application_status_change();