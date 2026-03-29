-- Prevent notification side-effects from aborting the main transaction.
-- If the pg_net/http extension is unavailable or the push call fails,
-- application status changes should still succeed.
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url text := 'https://kcotpxlggfvgclwksmhl.supabase.co';
  request_id bigint;
BEGIN
  BEGIN
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
  EXCEPTION
    WHEN undefined_function THEN
      RAISE LOG 'trigger_push_notification skipped: extensions.http_post is unavailable';
    WHEN OTHERS THEN
      RAISE LOG 'trigger_push_notification skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
