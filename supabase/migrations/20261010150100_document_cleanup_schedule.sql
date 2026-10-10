-- ============================================================================
-- Delete identity papers 30 days after they are approved (2026-10-10).
-- ============================================================================
-- docs/DOCUMENT-REQUESTS.md. Runs the document-cleanup edge function once a
-- day from the database's own scheduler (pg_cron), through pg_net, the same
-- way as interview-reminders (*_interview_reminders_schedule.sql).
--
-- The function deletes the file of every approved government ID, NBI
-- clearance and proof of address whose approval is more than 30 days old,
-- marks the request file_deleted_at, and records it in
-- document_request_events; with it goes anything else left in that request's
-- folder. An ID the team asked for again, and never re-sent, loses its file
-- 30 days after they asked. Typed answers and other files are kept.
--
-- The secret that guards it is made here, inside the database, on the first
-- run, and kept only in Vault ('document_cleanup_secret'). The job sends it;
-- the function asks the database whether it matches
-- (document_cleanup_secret_matches, service role only). It is never in this
-- file, the repo or a function setting. Re-runnable.
--
-- To stop it: SELECT cron.unschedule('document-cleanup');
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'document_cleanup_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'document_cleanup_secret',
      'Sent by the document-cleanup pg_cron job; checked by public.document_cleanup_secret_matches'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_cleanup_secret_matches(p_given text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    length(p_given) >= 32
      AND p_given = (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'document_cleanup_secret' LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.document_cleanup_secret_matches(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_cleanup_secret_matches(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_cleanup_secret_matches(text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'document-cleanup',
  '17 3 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/document-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'document_cleanup_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

NOTIFY pgrst, 'reload schema';
