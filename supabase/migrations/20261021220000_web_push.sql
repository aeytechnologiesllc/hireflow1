-- Phone notifications that need no outside account (2026-10-21).
--
-- Until now push worked only inside a native wrapper through OneSignal, whose
-- keys were never set, so nothing was ever delivered. A phone with HireFlow on
-- its Home Screen (and Chrome on Android, and desktop browsers) can be reached
-- through the browser's own push service (Web Push). That needs two things in
-- the database:
--
--   1. Somewhere to keep each browser's subscription: push_subscriptions gets
--      the address (endpoint) and the two keys the browser hands out. The old
--      OneSignal rows keep working: they have a player_id and no endpoint.
--   2. HireFlow's own sender key pair (VAPID). Nobody creates or pastes a key:
--      the first call to the push-public-key function generates the pair and
--      stores it in push_vapid_keys, which only the service role can touch.
--
-- Safe to run more than once, and on the live schema: every step checks first.

-- ── 1. push_subscriptions: web rows ─────────────────────────────────────────

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint        text,
  ADD COLUMN IF NOT EXISTS p256dh          text,
  ADD COLUMN IF NOT EXISTS auth            text,
  ADD COLUMN IF NOT EXISTS user_agent      text,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

-- A web row has no OneSignal player id. (A no-op if the column is already
-- nullable on the live table.)
ALTER TABLE public.push_subscriptions ALTER COLUMN player_id DROP NOT NULL;

-- One row per browser subscription. A plain unique index, not a partial one
-- (WHERE endpoint IS NOT NULL): the app saves with "ON CONFLICT (endpoint)",
-- which PostgREST cannot aim at a partial index. Rows without an endpoint (the
-- OneSignal ones) are not in conflict with each other: NULLs are distinct.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

-- A row that has an endpoint is a real browser subscription: https, a sane
-- length, and both keys. (The server also refuses to call any address that is
-- not a browser push service; see supabase/functions/_shared/webPushCrypto.ts.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'push_subscriptions_web_shape'
       AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_web_shape CHECK (
        endpoint IS NULL OR (
          endpoint LIKE 'https://%'
          AND length(endpoint) <= 2048
          AND p256dh IS NOT NULL AND length(p256dh) BETWEEN 80 AND 100
          AND auth   IS NOT NULL AND length(auth)   BETWEEN 20 AND 30
        )
      );
  END IF;
END $$;

-- The existing row-level policies stay exactly as they are (own rows only: see
-- 20260312192140_*.sql), so a person can still read, insert, update and delete
-- their own subscriptions and nobody else's.

-- Saving this device's subscription. A direct upsert on the endpoint would be
-- refused with a row-level-security error whenever the same browser was last
-- used by someone else (an owner and an applicant account on one phone): the
-- endpoint row still belongs to the earlier account. A device belongs to
-- whoever is signed in on it now, so this moves it. It acts only for the
-- caller (auth.uid()), never for a user id passed in, and keeps a person to
-- their ten newest devices.
CREATE OR REPLACE FUNCTION public.save_web_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, platform, endpoint, p256dh, auth, user_agent, updated_at)
  VALUES (caller, 'web', p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), now())
  ON CONFLICT (endpoint) DO UPDATE
     SET user_id    = EXCLUDED.user_id,
         platform   = 'web',
         p256dh     = EXCLUDED.p256dh,
         auth       = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = now();

  DELETE FROM public.push_subscriptions s
   WHERE s.user_id = caller
     AND s.endpoint IS NOT NULL
     AND s.id NOT IN (
       SELECT k.id
         FROM public.push_subscriptions k
        WHERE k.user_id = caller AND k.endpoint IS NOT NULL
        ORDER BY k.updated_at DESC, k.id
        LIMIT 10
     );
END;
$$;

REVOKE ALL ON FUNCTION public.save_web_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_web_push_subscription(text, text, text, text) TO authenticated, service_role;

-- ── 2. push_vapid_keys: HireFlow's sender key pair ──────────────────────────

CREATE TABLE IF NOT EXISTS public.push_vapid_keys (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key  text  NOT NULL,
  private_jwk jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Row-level security on and no policy: no browser, signed in or not, can read
-- or write it. Only the service role (the edge functions) can; it bypasses RLS.
ALTER TABLE public.push_vapid_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_vapid_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_vapid_keys TO service_role;

COMMENT ON TABLE public.push_vapid_keys IS
  'HireFlow''s Web Push sender key pair (one row, id = 1). Created by the push-public-key edge function on first use. Service role only: row-level security is on with no policy, and anon/authenticated have no grants.';
