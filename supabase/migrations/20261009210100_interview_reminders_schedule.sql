-- ============================================================================
-- Interview reminders, part 2 (2026-10-09): look every five minutes.
-- ============================================================================
-- Runs the interview-reminders edge function every five minutes from the
-- database's own scheduler (pg_cron), through pg_net. docs/INTERVIEWS.md,
-- "Reminders"; part 1 is *_interview_reminder_columns.sql.
--
-- The secret that guards the function is made HERE, inside the database, on
-- the first run (32 random bytes, hex), and kept only in Vault under the name
-- 'interview_reminders_secret'. It is never in this file, the repo, a
-- function setting, or anyone's screen. The job reads it from Vault when each
-- look runs and sends it in the x-reminders-secret header; the function asks
-- the database whether it matches through interview_reminders_secret_matches,
-- which only the service role may call. A re-run keeps the secret it has.
--
-- The function needs no JWT (verify_jwt = false in supabase/config.toml):
-- pg_net has none to send.
--
-- What this migration adds, and nothing else:
--   1. the Vault secret, if there is none yet;
--   2. public.interview_reminders_secret_matches(p_given text): true only for
--      the Vault value, at least 32 characters. EXECUTE for service_role
--      only;
--   3. pg_cron, and its job 'interview-reminders' every five minutes
--      (scheduling under a name that exists replaces it).
--
-- To stop the reminders: SELECT cron.unschedule('interview-reminders');
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'interview_reminders_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'interview_reminders_secret',
      'Sent by the interview-reminders pg_cron job; checked by public.interview_reminders_secret_matches'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.interview_reminders_secret_matches(p_given text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    length(p_given) >= 32
      AND p_given = (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'interview_reminders_secret' LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.interview_reminders_secret_matches(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.interview_reminders_secret_matches(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.interview_reminders_secret_matches(text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'interview-reminders',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/interview-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminders-secret', coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'interview_reminders_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

NOTIFY pgrst, 'reload schema';
