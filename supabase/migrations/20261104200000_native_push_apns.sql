-- The HireFlow iPhone app's notifications, straight from Apple (2026-11-04).
--
-- The owner: build HireFlow as a real iPhone app the FairFix way, no
-- OneSignal. The app (ios/, Capacitor, loading the staff site) asks iOS for a
-- push address (an APNs device token: hex) and saves it here through
-- save_native_push_token; send-push-notification sends to Apple with the
-- project's own key (_shared/apns.ts, APNS_* secrets) beside the browser rows.
-- docs/PUSH-NOTIFICATIONS.md, "The iPhone app".
--
-- Safe to run more than once: every step checks first.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS apns_token       text,
  ADD COLUMN IF NOT EXISTS apns_environment text;

-- One row per phone, like a browser's endpoint: a plain unique index, so the
-- save below can ON CONFLICT on it. Rows with no token do not conflict.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_apns_token_key
  ON public.push_subscriptions (apns_token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'push_subscriptions_apns_shape'
       AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_apns_shape CHECK (
        (apns_token IS NULL OR apns_token ~ '^[0-9a-f]{64,200}$')
        AND (apns_environment IS NULL OR apns_environment IN ('production', 'sandbox'))
      );
  END IF;
END $$;

-- Saving this phone's push address for whoever is signed in on it now (a
-- phone used by an owner and then a teammate moves to the teammate). Acts only
-- for the caller, never for a user id passed in; a person keeps their ten
-- newest phones.
CREATE OR REPLACE FUNCTION public.save_native_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
  token  text := lower(btrim(coalesce(p_token, '')));
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '28000';
  END IF;
  IF token !~ '^[0-9a-f]{64,200}$' THEN
    RAISE EXCEPTION 'not_a_push_token' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, platform, apns_token, updated_at)
  VALUES (caller, 'ios', token, now())
  ON CONFLICT (apns_token) DO UPDATE
     SET user_id    = EXCLUDED.user_id,
         platform   = 'ios',
         updated_at = now();

  DELETE FROM public.push_subscriptions s
   WHERE s.user_id = caller
     AND s.apns_token IS NOT NULL
     AND s.id NOT IN (
       SELECT k.id
         FROM public.push_subscriptions k
        WHERE k.user_id = caller AND k.apns_token IS NOT NULL
        ORDER BY k.updated_at DESC, k.id
        LIMIT 10
     );
END;
$$;

-- Signing out on the phone: its address stops receiving this person's
-- notifications. Only the caller's own row.
CREATE OR REPLACE FUNCTION public.remove_native_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.push_subscriptions
   WHERE user_id = caller AND apns_token = lower(btrim(coalesce(p_token, '')));
END;
$$;

REVOKE ALL ON FUNCTION public.save_native_push_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_native_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_native_push_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_native_push_token(text) TO authenticated;
