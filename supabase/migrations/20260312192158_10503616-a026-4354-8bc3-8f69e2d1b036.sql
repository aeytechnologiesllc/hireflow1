-- Create trigger function to send push notification on notifications insert
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url text := 'https://yvczrgulhswbxsfnyqan.supabase.co';
  request_id bigint;
BEGIN
  -- Call the edge function via pg_net
  SELECT extensions.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'url', COALESCE(NEW.link, ''),
      'notification_type', NEW.type::text
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )::jsonb
  ) INTO request_id;

  RETURN NEW;
END;
$function$;

-- Create the trigger on notifications table
CREATE TRIGGER on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_notification();