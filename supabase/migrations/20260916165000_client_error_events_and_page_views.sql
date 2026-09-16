-- ============================================================================
-- CI/observability safety nets, part 2: crash alerts + visitor counts.
-- ============================================================================
-- Two new server-only tables, written exclusively by their edge functions
-- (client-errors, page-views — both use the service-role admin client, which
-- bypasses RLS the same way voice_session_log / quiz_attempt_ledger do, per
-- 20260916140000_voice_session_log.sql and 20260915110000_*.sql). Both tables
-- get RLS enabled with a single SELECT policy gated on
-- has_role(auth.uid(), 'developer') and nothing else — no INSERT/UPDATE/
-- DELETE policy for any client role, so a direct PostgREST call from a
-- browser can neither write nor read these, only the two edge functions'
-- service-role client can.
--
-- 1. client_error_events — one row per FINGERPRINT (grouped error), not one
--    row per occurrence, so a screen that throws on every keystroke can't
--    grow this table unbounded; record_client_error_event() below is the
--    only writer and does the upsert + increment atomically.
--
-- 2. page_view_daily — one row per (day, path, referrer_host, utm_*,
--    device_class) with a running view_count, so a whole day of traffic for
--    one page is one row, not one per visit; record_page_view() below does
--    the same atomic upsert + increment.
--
-- Developer alerts (the "push/in-app notification ... first time a new
-- fingerprint appears or when a group spikes" requirement) are handled
-- inside record_client_error_event() itself, not a separate AFTER INSERT
-- trigger — recomputing "is this new / did this spike" from a trigger fired
-- by the same row's own UPDATE would either recurse (the trigger writing
-- last_notified_* back onto the row that fired it) or need a second
-- guarded UPDATE; doing it inline in the one PL/pgSQL function that already
-- holds the row's old and new state (via the RETURNING ... INTO below) is
-- simpler and race-free (SELECT ... FOR UPDATE / the upsert's own row lock
-- serializes concurrent occurrences of the same fingerprint). It inserts
-- directly into public.notifications exactly like every other trigger in
-- this codebase (notify_new_application_submitted() etc.) — SECURITY
-- DEFINER, wrapped in its own BEGIN/EXCEPTION so a failed notification can
-- never fail the error-recording write, and every INSERT into notifications
-- already fires trigger_push_notification() (20260826221000_*.sql) for push,
-- with no extra wiring needed here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. client_error_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_error_events (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint         text NOT NULL UNIQUE,
  message             text NOT NULL,
  stack               text,
  route               text NOT NULL DEFAULT '/',
  release             text,
  browser_family      text,
  user_role           text,
  -- The only PII this table ever carries, and only when the reporting
  -- browser was signed in: the id of the LAST signed-in user this
  -- fingerprint was seen for (not every occurrence's user — this table is
  -- one row per fingerprint). ON DELETE SET NULL so a deleted account never
  -- blocks the delete-account flow and never leaves an orphaned FK.
  last_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurrence_count    integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_notified_at    timestamptz,
  last_notified_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS client_error_events_last_seen_idx
  ON public.client_error_events (last_seen_at DESC);

ALTER TABLE public.client_error_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers can view client error events" ON public.client_error_events;
CREATE POLICY "Developers can view client error events"
  ON public.client_error_events FOR SELECT
  USING (public.has_role(auth.uid(), 'developer'));

-- ----------------------------------------------------------------------------
-- 2. page_view_daily
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_view_daily (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day            date NOT NULL,
  path           text NOT NULL,
  referrer_host  text NOT NULL DEFAULT '',
  utm_source     text NOT NULL DEFAULT '',
  utm_medium     text NOT NULL DEFAULT '',
  utm_campaign   text NOT NULL DEFAULT '',
  device_class   text NOT NULL DEFAULT 'desktop' CHECK (device_class IN ('mobile', 'tablet', 'desktop')),
  view_count     integer NOT NULL DEFAULT 1 CHECK (view_count > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, path, referrer_host, utm_source, utm_medium, utm_campaign, device_class)
);

CREATE INDEX IF NOT EXISTS page_view_daily_day_idx ON public.page_view_daily (day DESC);
CREATE INDEX IF NOT EXISTS page_view_daily_day_path_idx ON public.page_view_daily (day DESC, path);

ALTER TABLE public.page_view_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers can view page view counts" ON public.page_view_daily;
CREATE POLICY "Developers can view page view counts"
  ON public.page_view_daily FOR SELECT
  USING (public.has_role(auth.uid(), 'developer'));

-- ----------------------------------------------------------------------------
-- 3. record_client_error_event(): the one writer for client_error_events.
-- ----------------------------------------------------------------------------
-- Spike throttling: a fingerprint's FIRST occurrence always notifies. After
-- that, it notifies again only once it has accumulated 25 more occurrences
-- than the last time it notified, AND at least an hour has passed since —
-- both conditions, so a burst of 25 in one second still only pages once,
-- and a slow trickle that never re-crosses the count threshold stays quiet.
CREATE OR REPLACE FUNCTION public.record_client_error_event(
  p_fingerprint    text,
  p_message        text,
  p_stack          text,
  p_route          text,
  p_release        text,
  p_browser_family text,
  p_user_role      text,
  p_user_id        uuid
)
RETURNS TABLE (out_id uuid, out_is_new boolean, out_occurrence_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_is_new boolean;
  v_occurrence_count integer;
  v_last_notified_count integer;
  v_last_notified_at timestamptz;
  v_should_notify boolean := false;
  v_developer RECORD;
  v_title text;
  v_message text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'record_client_error_event: service_role only';
  END IF;

  INSERT INTO public.client_error_events AS e
    (fingerprint, message, stack, route, release, browser_family, user_role, last_user_id)
  VALUES
    (p_fingerprint, p_message, p_stack, COALESCE(p_route, '/'), p_release, p_browser_family, p_user_role, p_user_id)
  ON CONFLICT (fingerprint) DO UPDATE SET
    message          = EXCLUDED.message,
    stack            = EXCLUDED.stack,
    route            = EXCLUDED.route,
    release          = EXCLUDED.release,
    browser_family   = EXCLUDED.browser_family,
    user_role        = EXCLUDED.user_role,
    last_user_id     = EXCLUDED.last_user_id,
    occurrence_count = e.occurrence_count + 1,
    last_seen_at     = now()
  RETURNING e.id, e.occurrence_count, e.last_notified_count, e.last_notified_at
    INTO v_id, v_occurrence_count, v_last_notified_count, v_last_notified_at;

  -- occurrence_count can only be exactly 1 on the row the INSERT branch just
  -- created — the ON CONFLICT UPDATE branch always increments it — so this
  -- is a reliable "is this fingerprint brand new" signal with no separate
  -- lookup needed.
  v_is_new := v_occurrence_count = 1;

  v_should_notify := v_is_new
    OR (
      v_occurrence_count - v_last_notified_count >= 25
      AND (v_last_notified_at IS NULL OR v_last_notified_at < now() - interval '1 hour')
    );

  IF v_should_notify THEN
    BEGIN
      v_title := CASE WHEN v_is_new THEN 'New error' ELSE 'Error spike' END;
      v_message := CASE
        WHEN v_is_new THEN COALESCE(p_message, 'An error occurred') || ' (' || COALESCE(p_route, '/') || ')'
        ELSE COALESCE(p_message, 'An error') || ' has happened ' || v_occurrence_count || ' times ('
          || COALESCE(p_route, '/') || ')'
      END;

      FOR v_developer IN
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'developer'
      LOOP
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (v_developer.user_id, 'system', v_title, LEFT(v_message, 500), '/developer/errors', false);
      END LOOP;

      UPDATE public.client_error_events
         SET last_notified_at = now(), last_notified_count = v_occurrence_count
       WHERE id = v_id;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'record_client_error_event: notify skipped for %: %', p_fingerprint, SQLERRM;
    END;
  END IF;

  RETURN QUERY SELECT v_id, v_is_new, v_occurrence_count;
END;
$$;

COMMENT ON FUNCTION public.record_client_error_event(text, text, text, text, text, text, text, uuid) IS
  'Server-only (service_role). Atomic upsert-by-fingerprint for client_error_events, '
  'plus fail-open developer notifications on a brand-new fingerprint or a >=25-occurrence '
  'spike throttled to once per hour. Called by supabase/functions/client-errors.';

REVOKE ALL ON FUNCTION public.record_client_error_event(text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_error_event(text, text, text, text, text, text, text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. record_page_view(): the one writer for page_view_daily.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_page_view(
  p_day           date,
  p_path          text,
  p_referrer_host text,
  p_utm_source    text,
  p_utm_medium    text,
  p_utm_campaign  text,
  p_device_class  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'record_page_view: service_role only';
  END IF;

  INSERT INTO public.page_view_daily AS v
    (day, path, referrer_host, utm_source, utm_medium, utm_campaign, device_class, view_count)
  VALUES
    (
      p_day,
      p_path,
      COALESCE(p_referrer_host, ''),
      COALESCE(p_utm_source, ''),
      COALESCE(p_utm_medium, ''),
      COALESCE(p_utm_campaign, ''),
      COALESCE(NULLIF(p_device_class, ''), 'desktop'),
      1
    )
  ON CONFLICT (day, path, referrer_host, utm_source, utm_medium, utm_campaign, device_class)
  DO UPDATE SET view_count = v.view_count + 1, updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.record_page_view(date, text, text, text, text, text, text) IS
  'Server-only (service_role). Atomic upsert-by-dimensions for page_view_daily. '
  'Called by supabase/functions/page-views.';

REVOKE ALL ON FUNCTION public.record_page_view(date, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_page_view(date, text, text, text, text, text, text) TO service_role;
