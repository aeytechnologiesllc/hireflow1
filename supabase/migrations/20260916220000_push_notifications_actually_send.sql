-- Phone push notifications never sent (2026-09-16).
--
-- trigger_push_notification() called extensions.http_post(). This project has
-- pg_net, whose function is net.http_post(); extensions.http_post does not
-- exist, so every call hit the fail-open undefined_function handler and was
-- skipped. Even with the right function name, send-push-notification required
-- an INTERNAL_FUNCTION_SECRET header the trigger never sent, and verify_jwt was
-- on with no JWT to send.
--
-- New contract: the trigger sends only the new row's id. send-push-notification
-- loads the row with the service role and pushes that row's own content to that
-- row's own user, claiming push_sent_at first so each notification pushes at
-- most once. No secret needs to live in the database, and a forged call cannot
-- push attacker-chosen text to anyone.
--
-- Still fail-open: a push problem must never block creating a notification.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  supabase_url text := coalesce(
    nullif(current_setting('app.settings.supabase_url', true), ''),
    'https://yqklrkpptnhubsnijqze.supabase.co'
  );
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      RAISE LOG 'trigger_push_notification skipped: pg_net (net.http_post) is unavailable';
    WHEN OTHERS THEN
      RAISE LOG 'trigger_push_notification skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
