-- Push notifications have been firing at the WRONG PROJECT since they were built.
--
-- trigger_push_notification() hardcoded https://kcotpxlggfvgclwksmhl.supabase.co —
-- the stale project ref that also appeared in the repo's CLAUDE.md. The live project
-- is yqklrkpptnhubsnijqze. Because the trigger deliberately swallows every error
-- (fail-open, so a failed push can never block an insert), this failed SILENTLY on
-- every notification ever created: nobody has ever received a push.
--
-- Now resolved at runtime so the mistake cannot recur. Still fail-open by design.
create or replace function public.trigger_push_notification()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
DECLARE
  supabase_url text;
  request_id bigint;
BEGIN
  supabase_url := coalesce(
    nullif(current_setting('app.settings.supabase_url', true), ''),
    'https://yqklrkpptnhubsnijqze.supabase.co'
  );
  BEGIN
    SELECT extensions.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      body := jsonb_build_object(
        'user_id', NEW.user_id, 'title', NEW.title, 'message', NEW.message,
        'url', COALESCE(NEW.link, ''), 'notification_type', NEW.type::text
      )::text,
      headers := jsonb_build_object('Content-Type', 'application/json')::jsonb
    ) INTO request_id;
  EXCEPTION
    WHEN undefined_function THEN
      RAISE LOG 'trigger_push_notification skipped: extensions.http_post is unavailable';
    WHEN OTHERS THEN
      RAISE LOG 'trigger_push_notification skipped: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;

comment on function public.trigger_push_notification() is
  'Fail-open push dispatch. URL resolved at runtime — never hardcode a project ref here; '
  'it was previously pointed at a stale project and silently dropped every notification.';
