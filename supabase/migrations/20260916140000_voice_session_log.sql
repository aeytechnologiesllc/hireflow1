-- Voice minutes could be drained by the caller alone.
--
-- deduct-voice-minutes only ever checked that the client-supplied
-- `sessionDurationMinutes` was a positive number — no upper bound, no
-- server-side cross-check against anything real. A candidate is the caller
-- on their own interview (useAvaVoice.ts computes sessionDurationMinutes
-- client-side and POSTs it), so posting `sessionDurationMinutes: 999999`
-- against their own applicationId drained the employer's voice_credits in
-- one call, and the existing candidate-identity check (caller must be the
-- application's candidate_id) did nothing to stop it — that check proves
-- WHO is deducting, never HOW MUCH.
--
-- Fixed by recording each session server-side the instant ava-voice-session
-- actually mints a real (billed) OpenAI Realtime session, then having
-- deduct-voice-minutes charge against that row instead of trusting the
-- client number outright:
--
--   - `started_at` is this table's own `now()` default — a server clock, not
--     anything the client can set.
--   - `time_limit_minutes` is computed server-side at mint time (see
--     supabase/functions/_shared/voiceSessionCharge.ts) from the
--     application's own `voice_interview_duration` column for interview
--     mode (never the client-supplied `duration` request field, which only
--     ever drove the interview prompt's own pacing language) or a flat
--     ceiling for assistant mode, plus a small buffer.
--   - `hard_cap_minutes` is an absolute ceiling independent of all of the
--     above.
--   - `ended_at`/`minutes_charged` start NULL and are set together, exactly
--     once, by an atomic `UPDATE ... WHERE ended_at IS NULL RETURNING *` in
--     deduct-voice-minutes — a second charge attempt for the same session
--     matches zero rows and deducts nothing, so retries, double-invokes
--     from both the end_interview tool-call path and the disconnect()
--     cleanup path, or a replayed request, can never charge twice.
--
-- deduct-voice-minutes then charges
-- min(client-reported minutes, wall-clock elapsed minutes since started_at,
-- time_limit_minutes, hard_cap_minutes) — the client number is now only ever
-- a ceiling candidate among several, never the sole input.
--
-- Server-only, same shape as quiz_attempt_ledger
-- (20260915110000_quiz_answer_keys_server_side.sql): RLS enabled, zero
-- policies for any role, including authenticated and anon. With RLS on and
-- no matching policy, any direct client SELECT/INSERT/UPDATE/DELETE gets
-- zero rows / a denied write. The only writers are ava-voice-session (which
-- inserts the row right after a real OpenAI session is minted) and
-- deduct-voice-minutes (which performs the one settling UPDATE) — both use
-- the service-role admin client already, which bypasses RLS the same way it
-- does for job_quiz_keys/quiz_attempt_ledger.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS. Safe
-- to run once against the live database as it stands today, and safe to
-- re-run.

CREATE TABLE IF NOT EXISTS public.voice_session_log (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id     uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  employer_id        uuid NOT NULL,
  caller_user_id     uuid NOT NULL,
  mode               text NOT NULL CHECK (mode IN ('interview', 'assistant')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  minutes_charged    integer,
  time_limit_minutes integer NOT NULL CHECK (time_limit_minutes > 0),
  hard_cap_minutes   integer NOT NULL DEFAULT 60 CHECK (hard_cap_minutes > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- ended_at and minutes_charged are only ever set together, by the one
  -- settling UPDATE below — never independently.
  CONSTRAINT voice_session_log_settled_together
    CHECK ((ended_at IS NULL) = (minutes_charged IS NULL)),
  CONSTRAINT voice_session_log_minutes_charged_nonnegative
    CHECK (minutes_charged IS NULL OR minutes_charged >= 0)
);

CREATE INDEX IF NOT EXISTS voice_session_log_employer_id_idx
  ON public.voice_session_log (employer_id);

CREATE INDEX IF NOT EXISTS voice_session_log_application_id_idx
  ON public.voice_session_log (application_id)
  WHERE application_id IS NOT NULL;

ALTER TABLE public.voice_session_log ENABLE ROW LEVEL SECURITY;

-- Deliberately zero policies, for every role, including `authenticated` and
-- `anon` — this table is server-only, exactly like job_quiz_keys and
-- quiz_attempt_ledger above it. Nothing here grants service_role anything:
-- service_role bypasses RLS entirely, which is how ava-voice-session and
-- deduct-voice-minutes read and write this table.
