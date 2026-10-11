-- Guided tips (the 2026-10-11 "Guided start" mock-up, approved by the owner):
-- which one-time tips a person has put away, so "Got it" holds on every
-- device. One row per tip seen; the row 'all_off' is "No more tips" (Settings
-- turns tips back on by removing it, and the unseen ones show again).
--
-- Only the person themself reads or writes their rows. Nothing here is shown
-- to anyone else, and nothing depends on it but the tips.

CREATE TABLE IF NOT EXISTS public.ui_tips_seen (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tip text NOT NULL CHECK (tip ~ '^[a-z_]{1,40}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tip)
);

ALTER TABLE public.ui_tips_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own tips: read" ON public.ui_tips_seen;
CREATE POLICY "Own tips: read" ON public.ui_tips_seen
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Own tips: put away" ON public.ui_tips_seen;
CREATE POLICY "Own tips: put away" ON public.ui_tips_seen
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own tips: bring back" ON public.ui_tips_seen;
CREATE POLICY "Own tips: bring back" ON public.ui_tips_seen
  FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.ui_tips_seen FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.ui_tips_seen TO authenticated;
