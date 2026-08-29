-- Scheduling v2: the employer proposes a SET of windows, the candidate picks,
-- and confirmed interviews get an in-app video room. All additive/nullable —
-- existing single-slot interviews keep working untouched.
--
-- Semantics:
--   employer_windows   jsonb  [{ "start": iso, "durationMinutes": n }, ...] — the offered set
--   meeting_provider   text   'daily' for in-app rooms; null = legacy external meeting_link
--   meeting_room_url   text   the provider room URL (created lazily at first join)
--   meeting_room_name  text   provider room name (idempotency key: hf-<interview id>)
-- candidate_response gains the value 'awaiting_pick' (plain text column, no CHECK).
--
-- Applied to yqklrkpptnhubsnijqze via MCP on 2026-08-29; this file records it.
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS employer_windows jsonb,
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_room_url text,
  ADD COLUMN IF NOT EXISTS meeting_room_name text;
