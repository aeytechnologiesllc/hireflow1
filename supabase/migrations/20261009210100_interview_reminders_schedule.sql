-- ============================================================================
-- Interview reminders, part 2 (2026-10-09): look every five minutes.
-- ============================================================================
-- Runs the interview-reminders edge function every five minutes from the
-- database's own scheduler (pg_cron), through pg_net. docs/INTERVIEWS.md,
-- "Reminders"; part 1 is *_interview_reminder_columns.sql.
--
-- The function answers only a caller holding INTERVIEW_REMINDERS_SECRET (an
-- edge function secret). The scheduler reads the same value from Vault, under
-- the name 'interview_reminders_secret', when each look runs. The value is
-- never in this file or in the repo: it is set once, by hand, in both places
-- (docs/INTERVIEWS.md says how). Until it is, every look is refused with 401
-- and nothing is sent.
--
-- The function needs no JWT (verify_jwt = false in supabase/config.toml):
-- pg_net has none to send, and the secret is checked by the function itself.
--
-- Re-runnable: scheduling a job under a name that exists replaces it.
-- To stop the reminders: SELECT cron.unschedule('interview-reminders');
-- ============================================================================

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
