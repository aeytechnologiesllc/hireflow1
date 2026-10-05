-- ============================================================================
-- assessment_record: one server-side record of every test an applicant takes
-- (2026-10-06, wave 2 of the "Candidate 1" fix).
-- ============================================================================
-- The contract every builder follows is docs/ASSESSMENT-RECORD.md. This file
-- is the storage it describes. In short:
--
-- * public.assessment_sessions — one row per application x step x attempt:
--   when it started, when the applicant was last active, whether the tab is
--   hidden right now, how far they got (progress), the form draft, the
--   server-pinned context (chat scenario, typing passage), the full
--   employer-facing grading, and a running integrity summary.
-- * public.assessment_events — append-only: every chat turn (both sides),
--   every quiz question shown and answered (server time), typing snapshots,
--   integrity events (copy/paste, leaving the window and for how long,
--   screenshot keys) and system markers (started, reloaded, submitted, left).
--
-- Why two NEW tables and nothing in applications.notes: a candidate can read
-- their own notes in full ("Candidates can view their own applications"), so
-- grading, answer keys and the integrity record must never go there. Both
-- tables are readable ONLY by the job's owner and active team members scoped
-- to the job; candidates have no policy at all. Candidates write only through
-- the SECURITY DEFINER functions below, which check that the caller is the
-- application's candidate, the application is still open, and the step is
-- one they have reached (the same rule the step gate uses:
-- src/lib/candidateJourney.ts resolveGatedStep + positionFor, mirrored in
-- supabase/functions/_shared/trustedResults.ts hasReachedStep).
--
-- Edge functions (service role) write chat turns, typing snapshots and
-- grading straight into the tables; see the doc for the exact columns.
--
-- Owner alert: record_integrity_events keeps ONE live card per applicant per
-- test in the in-app bell of the job's employer and every active team member
-- scoped to the job (the recipients notify_new_application_submitted uses).
-- The card's title/message carry the running tally, and every new alerting
-- event sets it back to unread and moves it to the top (created_at = now()).
-- notifications.group_key ('integrity:<application_id>:<step_id>') plus a
-- partial unique index make that one card per recipient, never one per event.
-- The application form step records integrity but never alerts: applicants
-- legitimately leave the form (to run a speed test, find their resume).
-- Only server code may write a grouped or 'integrity' card: production lets
-- a candidate insert a notification for the employer of a job they applied
-- to, so a trigger on notifications refuses those two shapes from a browser.
--
-- Retakes: a finished step takes no new answers. The one exception is a step
-- the hiring team handed back (status 'pending' with phase on the step, the
-- rule the phase pages use), and that is decided from a marker only a staff
-- or server write can create (assessment_step_reopens), never from the
-- status alone, which the applicant can set themselves.
--
-- notification_type gets a new value, 'integrity'. ALTER TYPE ... ADD VALUE
-- runs inside a transaction on PostgreSQL 12+ (production is 17.6); the one
-- restriction is that the new value cannot be USED before the transaction
-- commits. Nothing in this file uses it while the migration runs: the only
-- references are string literals inside PL/pgSQL bodies, which are cast when
-- the function first executes, after commit. Clients already fall back to a
-- bell icon for a type they do not know (src/pages/Notifications.tsx).
--
-- Abandonment: there is no pg_cron (enabling it is the owner's call). A
-- session that is 'active' with last_activity_at older than 10 minutes READS
-- as "left" in the staff UI (a lazy rule, see the doc). A heartbeat alone is
-- not activity: the page says when the applicant did something.
-- mark_stale_assessment_sessions() is here for a future cron; a session it
-- marks 'abandoned' comes back to life if the applicant returns. Sessions are
-- closed when their result lands: the form and the quiz by triggers here,
-- the other tests by the edge functions that grade them. A grading claim
-- whose request died (7 minutes untouched) is expired by the next start,
-- heartbeat or sweep (assessment_expire_stale_claim): 'failed', so the page
-- sends the test again, or 'completed' when the result had landed.
--
-- Re-runnable: every statement is IF NOT EXISTS / OR REPLACE / DROP IF
-- EXISTS, so applying it twice is a no-op (the PGlite proof does exactly that:
-- scripts/assessment_record_schema.pglite.test.mjs).
--
-- Error codes the candidate functions raise (PostgREST passes them through
-- as error.code; the message is a stable token, DETAIL says more):
--   42501 not_signed_in / not_your_application / not_your_session
--   HF001 application_closed   (rejected, hired or offered)
--   HF002 unknown_step         (not in this job's journey, the closing
--                               Decision stage, or the wrong step for the call)
--   HF003 step_not_reached
--   HF004 step_finished        (its result is on file, or it is being checked)
--   HF005 session_full         (5,000 events in one session)
--   22023 a malformed argument (events not an array, draft too large, ...)
--   22P05 (raised by Postgres before the function runs) a U+0000 character
--         in a jsonb argument; the page strips it before calling
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Notifications: the 'integrity' type and one card per group.
-- ---------------------------------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'integrity';

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS group_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_group_key_uidx
  ON public.notifications (user_id, group_key)
  WHERE group_key IS NOT NULL;

COMMENT ON COLUMN public.notifications.group_key IS
  'NULL for an ordinary notification. Set for a card that is updated in place instead of repeated: one row per (user_id, group_key). integrity:<application_id>:<step_id> is the live integrity tally for one applicant in one test (written by record_integrity_events). For a grouped card, created_at is the time of its latest update. Server-written only (trigger notifications_grouped_cards_server_only).';

-- Only server code writes a grouped card or an 'integrity' card. Production
-- lets a candidate INSERT a notification for the employer of a job they
-- applied to ("Related parties can insert notifications"), so without this a
-- candidate could plant a fake integrity card ("no issues found"), or take
-- the one live (user_id, group_key) slot before the real card exists.
--
-- current_user is the role running the statement, because this function is
-- NOT security definer: 'anon' or 'authenticated' for a request straight
-- from a browser; the owner inside a SECURITY DEFINER function such as
-- assessment_integrity_alert; 'service_role' for an edge function; the owner
-- for a migration or the SQL editor. A browser may still mark its own card
-- read, or delete it; it may not create one or rewrite one.
CREATE OR REPLACE FUNCTION public.notifications_grouped_cards_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.group_key IS NOT NULL OR NEW.type::text = 'integrity' THEN
      RAISE EXCEPTION 'grouped_card_is_server_only' USING ERRCODE = '42501',
        DETAIL = 'Grouped and integrity notifications are written by the server only.';
    END IF;
  ELSIF (NEW.group_key IS NOT NULL OR OLD.group_key IS NOT NULL
         OR NEW.type::text = 'integrity' OR OLD.type::text = 'integrity')
        AND (NEW.group_key IS DISTINCT FROM OLD.group_key
             OR NEW.type IS DISTINCT FROM OLD.type
             OR NEW.user_id IS DISTINCT FROM OLD.user_id
             OR NEW.title IS DISTINCT FROM OLD.title
             OR NEW.message IS DISTINCT FROM OLD.message
             OR NEW.link IS DISTINCT FROM OLD.link) THEN
    RAISE EXCEPTION 'grouped_card_is_server_only' USING ERRCODE = '42501',
      DETAIL = 'A grouped or integrity notification can be marked read or deleted, not rewritten.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_grouped_cards_server_only ON public.notifications;
CREATE TRIGGER notifications_grouped_cards_server_only
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_grouped_cards_server_only();


-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL,
  candidate_id      uuid NOT NULL,
  step_id           text NOT NULL CHECK (length(step_id) BETWEEN 1 AND 200),
  step_type         text NOT NULL CHECK (step_type IN (
                      'application', 'quiz', 'typing_test', 'chat_simulation', 'chat_interview',
                      'sales_simulation', 'voice_interview', 'video_intro', 'portfolio_upload')),
  attempt           integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN (
                      'active', 'completed', 'abandoned', 'grading', 'failed', 'superseded')),
  end_reason        text CHECK (end_reason IS NULL OR length(end_reason) <= 64),
  started_at        timestamptz NOT NULL DEFAULT now(),
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz,
  hidden_at         timestamptz,
  ended_at          timestamptz,
  progress          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(progress) = 'object'),
  context           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  draft             jsonb,
  grading           jsonb,
  integrity_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(integrity_summary) = 'object'),
  event_seq         integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_sessions_attempt_key UNIQUE (application_id, step_id, attempt)
);

-- One live attempt per application + step.
CREATE UNIQUE INDEX IF NOT EXISTS assessment_sessions_one_live_uidx
  ON public.assessment_sessions (application_id, step_id)
  WHERE status IN ('active', 'grading');
CREATE INDEX IF NOT EXISTS assessment_sessions_job_activity_idx
  ON public.assessment_sessions (job_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS assessment_sessions_active_idx
  ON public.assessment_sessions (last_activity_at)
  WHERE status = 'active';

COMMENT ON TABLE public.assessment_sessions IS
  'One row per application x step x attempt. Staff-readable only (job owner, active team members for the job). Candidates write through start_assessment_session / touch_assessment_session / record_integrity_events / save_application_draft / record_quiz_answer; edge functions (service role) write context, grading and status. Contract: docs/ASSESSMENT-RECORD.md.';
COMMENT ON COLUMN public.assessment_sessions.job_id IS 'Copied from the application by a trigger on insert (never trusted from the writer); the RLS policy reads it.';
COMMENT ON COLUMN public.assessment_sessions.candidate_id IS 'Copied from the application by a trigger on insert.';
COMMENT ON COLUMN public.assessment_sessions.step_type IS 'The journey step type; a legacy video_message step is stored as video_intro.';
COMMENT ON COLUMN public.assessment_sessions.last_activity_at IS 'Last thing the applicant did: a turn, a quiz view or answer, a typing snapshot, a draft save, coming back to the page, or a heartbeat that reports input (p_active). A plain heartbeat is not activity. A session that is active and quiet for 10 minutes reads as "left".';
COMMENT ON COLUMN public.assessment_sessions.hidden_at IS 'Set while the test page is hidden (since when); NULL while it is visible.';
COMMENT ON COLUMN public.assessment_sessions.progress IS 'How far they got. Server-owned keys per step type (answered, total, current_question_id, current_index, candidate_turns, assistant_turns, typed_chars, elapsed_ms, draft_saved_at); the page''s own hint is progress.client (replaced whole on each heartbeat that carries one, at most 4 KB). Returned to the candidate by start_assessment_session, so never put grading here.';
COMMENT ON COLUMN public.assessment_sessions.context IS 'Server-pinned inputs to the test (chat scenario, typing passage, interview context). Never returned to the candidate by these functions.';
COMMENT ON COLUMN public.assessment_sessions.draft IS 'Application form only: the unsent answers, saved by save_application_draft.';
COMMENT ON COLUMN public.assessment_sessions.grading IS 'The full employer-facing grading (and answer keys). Staff-only; never returned to the candidate.';
COMMENT ON COLUMN public.assessment_sessions.integrity_summary IS '{counts:{<kind>:n}, total, away_ms, short_away, dropped, first_event_at, last_event_at}, kept by record_integrity_events.';
COMMENT ON COLUMN public.assessment_sessions.event_seq IS 'The last seq handed to an event of this session (assigned by the events trigger).';

CREATE TABLE IF NOT EXISTS public.assessment_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id     uuid NOT NULL REFERENCES public.assessment_sessions(id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  job_id         uuid NOT NULL,
  seq            integer NOT NULL DEFAULT 0 CHECK (seq >= 1),
  kind           text NOT NULL CHECK (kind IN (
                   'candidate_turn', 'assistant_turn', 'quiz_shown', 'quiz_answer',
                   'typing_snapshot', 'integrity', 'system')),
  content        text CHECK (content IS NULL OR length(content) <= 100000),
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  duration_ms    integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  client_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  client_msg_id  text CHECK (client_msg_id IS NULL OR length(client_msg_id) BETWEEN 1 AND 128),
  CONSTRAINT assessment_events_seq_key UNIQUE (session_id, seq),
  CONSTRAINT assessment_events_client_msg_key UNIQUE (session_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS assessment_events_application_idx
  ON public.assessment_events (application_id, created_at);

COMMENT ON TABLE public.assessment_events IS
  'Append-only events of one assessment session. Staff-readable only. seq, application_id, job_id and created_at are set by a trigger; a repeated client_msg_id inserts nothing. Contract: docs/ASSESSMENT-RECORD.md.';

-- A step the hiring team handed back for a retake. Written only by the
-- assessment_step_reopened trigger on applications, for a staff or server
-- write (never the applicant's own) that lands the row on status 'pending'
-- with phase on a step whose result is on file. assessment_step_access reads
-- it: the step is open again only while this marker is newer than the result
-- on file, so a retake is one retake, and an applicant who sets their own
-- status to 'pending' reopens nothing.
CREATE TABLE IF NOT EXISTS public.assessment_step_reopens (
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  step_id        text NOT NULL CHECK (length(step_id) BETWEEN 1 AND 200),
  job_id         uuid NOT NULL,
  reopened_at    timestamptz NOT NULL DEFAULT now(),
  reopened_by    uuid,
  reopen_count   integer NOT NULL DEFAULT 1 CHECK (reopen_count >= 1),
  PRIMARY KEY (application_id, step_id)
);

COMMENT ON TABLE public.assessment_step_reopens IS
  'The latest staff reopen of a finished step (one row per application + step). Written only by the assessment_step_reopened trigger; staff-readable; read by assessment_step_access. Contract: docs/ASSESSMENT-RECORD.md.';
COMMENT ON COLUMN public.assessment_step_reopens.reopened_by IS 'auth.uid() of the staff member who reopened it; NULL for the service role or the SQL editor.';


-- ---------------------------------------------------------------------------
-- 3. Triggers that keep the denormalised columns honest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assessment_sessions_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id       uuid;
  v_candidate_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- job_id is what the RLS policy reads, so it is never taken from the
    -- writer: a wrong value would show this record to another employer.
    SELECT a.job_id, a.candidate_id
      INTO v_job_id, v_candidate_id
      FROM public.applications a
     WHERE a.id = NEW.application_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'assessment_sessions: application % not found', NEW.application_id
        USING ERRCODE = '23503';
    END IF;
    NEW.job_id := v_job_id;
    NEW.candidate_id := v_candidate_id;
    IF NEW.step_type = 'video_message' THEN
      NEW.step_type := 'video_intro';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSE
    IF NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
       OR NEW.step_id IS DISTINCT FROM OLD.step_id
       OR NEW.step_type IS DISTINCT FROM OLD.step_type
       OR NEW.attempt IS DISTINCT FROM OLD.attempt THEN
      RAISE EXCEPTION 'assessment_sessions: application, job, candidate, step and attempt never change'
        USING ERRCODE = '22023';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_sessions_before_write ON public.assessment_sessions;
CREATE TRIGGER assessment_sessions_before_write
  BEFORE INSERT OR UPDATE ON public.assessment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assessment_sessions_before_write();

-- Every event: lock its session, skip a repeated client_msg_id (idempotent
-- retries), hand out the next seq, copy application_id/job_id from the
-- session, stamp server time, and keep the session's activity and turn
-- counters current. The session row lock serializes every writer of one
-- session, so seq never collides and the duplicate check cannot race.
CREATE OR REPLACE FUNCTION public.assessment_events_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session  public.assessment_sessions%ROWTYPE;
  v_progress jsonb;
  v_seq      integer;
  v_active   boolean;
BEGIN
  SELECT * INTO v_session
    FROM public.assessment_sessions
   WHERE id = NEW.session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assessment_events: session % not found', NEW.session_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.client_msg_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assessment_events e
     WHERE e.session_id = NEW.session_id AND e.client_msg_id = NEW.client_msg_id
  ) THEN
    RETURN NULL;  -- already stored: a retry inserts nothing
  END IF;

  v_progress := v_session.progress;
  IF NEW.kind = 'candidate_turn' THEN
    v_progress := v_progress || jsonb_build_object('candidate_turns',
      CASE WHEN jsonb_typeof(v_progress -> 'candidate_turns') = 'number'
           THEN (v_progress ->> 'candidate_turns')::numeric::integer ELSE 0 END + 1);
  ELSIF NEW.kind = 'assistant_turn' THEN
    v_progress := v_progress || jsonb_build_object('assistant_turns',
      CASE WHEN jsonb_typeof(v_progress -> 'assistant_turns') = 'number'
           THEN (v_progress ->> 'assistant_turns')::numeric::integer ELSE 0 END + 1);
  ELSIF NEW.kind = 'typing_snapshot' THEN
    v_progress := v_progress || jsonb_strip_nulls(jsonb_build_object(
      'typed_chars', length(NEW.detail ->> 'typed_text'),
      'elapsed_ms', CASE WHEN jsonb_typeof(NEW.detail -> 'elapsed_ms') = 'number' THEN NEW.detail -> 'elapsed_ms' END));
  END IF;

  -- What the APPLICANT did counts as activity; the interviewer's reply,
  -- integrity events and system markers do not.
  v_active := NEW.kind IN ('candidate_turn', 'quiz_shown', 'quiz_answer', 'typing_snapshot');

  UPDATE public.assessment_sessions
     SET event_seq = event_seq + 1,
         progress = v_progress,
         last_activity_at = CASE WHEN v_active THEN now() ELSE last_activity_at END,
         hidden_at = CASE WHEN v_active THEN NULL ELSE hidden_at END
   WHERE id = NEW.session_id
  RETURNING event_seq INTO v_seq;

  NEW.seq := v_seq;
  NEW.application_id := v_session.application_id;
  NEW.job_id := v_session.job_id;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_events_before_insert ON public.assessment_events;
CREATE TRIGGER assessment_events_before_insert
  BEFORE INSERT ON public.assessment_events
  FOR EACH ROW EXECUTE FUNCTION public.assessment_events_before_insert();

-- Events are never edited, by any role, the service role included. They go
-- away only with their session (ON DELETE CASCADE from the application) or a
-- deliberate service-role DELETE. A correction is a new event.
CREATE OR REPLACE FUNCTION public.assessment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'assessment_events are append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS assessment_events_append_only ON public.assessment_events;
CREATE TRIGGER assessment_events_append_only
  BEFORE UPDATE ON public.assessment_events
  FOR EACH ROW EXECUTE FUNCTION public.assessment_events_append_only();


-- ---------------------------------------------------------------------------
-- 4. Pure helpers.
-- ---------------------------------------------------------------------------

-- JavaScript truthiness of a jsonb value (journeyProgress.ts stepHasResult
-- uses !!notes.<key>): objects and arrays are truthy, "" / 0 / false / null
-- are not.
CREATE OR REPLACE FUNCTION public.assessment_jsonb_truthy(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE jsonb_typeof(p_value)
    WHEN 'object'  THEN true
    WHEN 'array'   THEN true
    WHEN 'string'  THEN (p_value #>> '{}') <> ''
    WHEN 'number'  THEN (p_value #>> '{}')::numeric <> 0
    WHEN 'boolean' THEN (p_value #>> '{}')::boolean
    ELSE false
  END
$$;

-- applications.notes (text) as an object; {} for anything that is not one.
-- Same NUL-escape repair as merge_application_notes. Never raises.
CREATE OR REPLACE FUNCTION public.assessment_notes_object(p_notes text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed text;
  v_parsed  jsonb;
BEGIN
  v_trimmed := btrim(COALESCE(p_notes, ''), E' \t\r\n');
  IF v_trimmed = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  BEGIN
    v_parsed := v_trimmed::jsonb;
  EXCEPTION WHEN others THEN
    BEGIN
      v_parsed := replace(v_trimmed, E'\\u0000', E'\\ufffd')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '{}'::jsonb;
    END;
  END;
  IF jsonb_typeof(v_parsed) = 'object' THEN
    RETURN v_parsed;
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

-- buildCandidateJourney (src/lib/candidateJourney.ts) in SQL: the application,
-- the quiz when the job has quiz questions, every configured workflow step in
-- its configured order (skipping entries without an id or type, and any
-- application/quiz entry), then the closing Decision stage. Returns
-- [{index, id, type, title}]. The title is the job's own step title (staff
-- read it; candidate screens sanitise titles themselves), else the same
-- fallback names the client uses.
CREATE OR REPLACE FUNCTION public.assessment_journey(p_workflow_steps jsonb, p_has_quiz boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH configured AS (
    SELECT s.elem, s.ord
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_workflow_steps) = 'array' THEN p_workflow_steps ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS s(elem, ord)
     WHERE jsonb_typeof(s.elem) = 'object'
       AND COALESCE(s.elem ->> 'id', '') <> ''
       AND COALESCE(s.elem ->> 'type', '') <> ''
       AND s.elem ->> 'type' NOT IN ('application', 'quiz')
  ),
  all_steps AS (
    SELECT 0 AS grp, 0::bigint AS ord, 'application'::text AS id, 'application'::text AS type, NULL::text AS title
    UNION ALL
    SELECT 1, 0, 'quiz', 'quiz', NULL WHERE COALESCE(p_has_quiz, false)
    UNION ALL
    SELECT 2, c.ord, c.elem ->> 'id', c.elem ->> 'type', NULLIF(btrim(c.elem ->> 'title'), '') FROM configured c
    UNION ALL
    SELECT 3, 0, 'decision', 'decision', NULL
  ),
  numbered AS (
    SELECT a.*, row_number() OVER (ORDER BY a.grp, a.ord) - 1 AS idx FROM all_steps a
  )
  SELECT jsonb_agg(jsonb_build_object(
           'index', n.idx,
           'id', n.id,
           'type', n.type,
           'title', COALESCE(n.title, CASE n.type
             WHEN 'application' THEN 'Application'
             WHEN 'quiz' THEN 'Skills check'
             WHEN 'typing_test' THEN 'Typing test'
             WHEN 'video_intro' THEN 'Video intro'
             WHEN 'video_message' THEN 'Video intro'
             WHEN 'chat_simulation' THEN 'Chat simulation'
             WHEN 'chat_interview' THEN 'Chat interview'
             WHEN 'sales_simulation' THEN 'Sales simulation'
             WHEN 'voice_interview' THEN 'Voice interview'
             WHEN 'portfolio_upload' THEN 'Portfolio'
             WHEN 'decision' THEN 'Decision'
             ELSE n.type END))
         ORDER BY n.idx)
    FROM numbered n
$$;

-- "1m 12s", "45s", "1h 5m" — for the owner's bell card.
CREATE OR REPLACE FUNCTION public.assessment_duration_text(p_ms bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_ms IS NULL OR p_ms < 1000 THEN 'under 1s'
    WHEN p_ms < 60000 THEN (p_ms / 1000)::text || 's'
    WHEN p_ms < 3600000 THEN (p_ms / 60000)::text || 'm'
      || CASE WHEN (p_ms % 60000) / 1000 > 0 THEN ' ' || ((p_ms % 60000) / 1000)::text || 's' ELSE '' END
    ELSE (p_ms / 3600000)::text || 'h'
      || CASE WHEN (p_ms % 3600000) / 60000 > 0 THEN ' ' || ((p_ms % 3600000) / 60000)::text || 'm' ELSE '' END
  END
$$;


-- ---------------------------------------------------------------------------
-- 5. The access rule (one place): may this caller record for this step?
-- ---------------------------------------------------------------------------

-- Whether a step is finished, in one place. Never raises.
--   application   — the form is submitted (status is no longer in_progress).
--   quiz          — notes[step].completedAt or notes.quizResult exists: the
--                   same test submit_quiz_attempt uses to refuse a second
--                   submit (it has no reopen carve-out, so neither has this;
--                   a quiz retake is staff clearing those keys).
--   other steps   — their result key holds a value (journeyProgress.ts
--                   stepHasResult), UNLESS the step was reopened for a retake:
--                   status 'pending' with phase = this step (the rule every
--                   phase page uses, ChatInterviewPhase.tsx existingResult)
--                   AND a staff reopen marker (assessment_step_reopens) newer
--                   than the result on file. The result's time is the later
--                   of notes._trusted[step].completedAt (server-written,
--                   candidates cannot change it) and the step's last
--                   completed attempt; a legacy result with neither counts
--                   as older than any marker. The status alone never
--                   reopens a step: the applicant can set it themselves.
-- Returns {result_on_file, reopened, finished}. Also read by the sweep and
-- the reopen trigger, so every place answers "is it finished" the same way.
CREATE OR REPLACE FUNCTION public.assessment_step_completion(
  p_application_id uuid,
  p_step_id text,
  p_step_type text,
  p_app_status text,
  p_phase text,
  p_notes jsonb,
  p_voice_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notes       jsonb := CASE WHEN jsonb_typeof(p_notes) = 'object' THEN p_notes ELSE '{}'::jsonb END;
  v_type        text := CASE WHEN p_step_type = 'video_message' THEN 'video_intro' ELSE p_step_type END;
  v_on_file     boolean;
  v_reopened_at timestamptz;
  v_marker_text text;
  v_result_at   timestamptz;
  v_ended_at    timestamptz;
  v_reopened    boolean := false;
BEGIN
  v_on_file := CASE v_type
    WHEN 'application' THEN p_app_status IS DISTINCT FROM 'in_progress'
    WHEN 'quiz' THEN (v_notes -> p_step_id ->> 'completedAt') IS NOT NULL OR (v_notes -> 'quizResult') IS NOT NULL
    WHEN 'typing_test' THEN public.assessment_jsonb_truthy(v_notes -> 'typingTestResult')
    WHEN 'chat_simulation' THEN public.assessment_jsonb_truthy(v_notes -> 'chatSimulationResult')
    WHEN 'chat_interview' THEN public.assessment_jsonb_truthy(v_notes -> 'chatInterviewResult')
    WHEN 'sales_simulation' THEN public.assessment_jsonb_truthy(v_notes -> 'salesSimulationResult')
    WHEN 'portfolio_upload' THEN public.assessment_jsonb_truthy(v_notes -> 'portfolioResult')
    WHEN 'video_intro' THEN public.assessment_jsonb_truthy(v_notes -> 'videoIntroUrl')
                         OR public.assessment_jsonb_truthy(v_notes -> p_step_id -> 'videoUrl')
                         OR public.assessment_jsonb_truthy(v_notes -> p_step_id -> 'completed')
    WHEN 'voice_interview' THEN public.assessment_jsonb_truthy(p_voice_result)
    ELSE public.assessment_jsonb_truthy(v_notes -> p_step_id)
  END;
  v_on_file := COALESCE(v_on_file, false);

  IF v_on_file
     AND v_type NOT IN ('application', 'quiz')
     AND p_app_status = 'pending'
     AND p_phase = p_step_id THEN
    SELECT r.reopened_at INTO v_reopened_at
      FROM public.assessment_step_reopens r
     WHERE r.application_id = p_application_id AND r.step_id = p_step_id;
    IF v_reopened_at IS NOT NULL THEN
      v_marker_text := v_notes -> '_trusted' -> p_step_id ->> 'completedAt';
      IF v_marker_text IS NOT NULL AND pg_input_is_valid(v_marker_text, 'timestamptz') THEN
        v_result_at := v_marker_text::timestamptz;
      END IF;
      SELECT max(s.ended_at) INTO v_ended_at
        FROM public.assessment_sessions s
       WHERE s.application_id = p_application_id AND s.step_id = p_step_id AND s.status = 'completed';
      v_result_at := GREATEST(v_result_at, v_ended_at);  -- GREATEST skips NULLs
      v_reopened := v_result_at IS NULL OR v_reopened_at > v_result_at;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'result_on_file', v_on_file,
    'reopened', v_reopened,
    'finished', v_on_file AND NOT v_reopened);
END;
$$;

-- Raises unless the caller is the application's candidate, the application is
-- not rejected/hired/offered, the step is a real (non-Decision) step of this
-- job's journey with an assessment record, and the candidate has REACHED it:
-- the index of their own position (positionFor: phase as a step id or type,
-- else Decision for a post-workflow status, else the first step) is at or
-- past the step's index — the exact rule hasReachedStep applies.
--
-- 'offered' is refused as well as rejected/hired (the brief named the latter
-- two): an applicant with an offer is past every test, and advanceAfterStep
-- excludes the same three statuses.
--
-- Returns, without raising, whether the step is FINISHED and whether it was
-- reopened for a retake (assessment_step_completion above).
CREATE OR REPLACE FUNCTION public.assessment_step_access(p_application_id uuid, p_step_id text, p_caller uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app      record;
  v_job      record;
  v_has_quiz boolean;
  v_steps    jsonb;
  v_step     jsonb;
  v_type     text;
  v_target   integer;
  v_actual   integer;
  v_done     jsonb;
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '42501', DETAIL = 'Only the signed-in applicant can record a test.';
  END IF;
  IF p_step_id IS NULL OR length(p_step_id) = 0 OR length(p_step_id) > 200 THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002', DETAIL = 'No usable step id was given.';
  END IF;

  SELECT a.id, a.job_id, a.candidate_id, a.status::text AS status, a.phase, a.notes, a.voice_interview_result
    INTO v_app
    FROM public.applications a
   WHERE a.id = p_application_id;

  -- One answer for "no such application" and "not yours": never confirm that
  -- someone else's application exists.
  IF NOT FOUND OR v_app.candidate_id IS DISTINCT FROM p_caller THEN
    RAISE EXCEPTION 'not_your_application' USING ERRCODE = '42501';
  END IF;

  IF v_app.status IN ('rejected', 'hired', 'offered') THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'HF001',
      DETAIL = format('This application is %s.', v_app.status);
  END IF;

  SELECT j.id, j.workflow_steps, j.quiz_questions, j.application_questions
    INTO v_job
    FROM public.jobs j
   WHERE j.id = v_app.job_id;

  v_has_quiz := CASE WHEN jsonb_typeof(v_job.quiz_questions) = 'array'
                     THEN jsonb_array_length(v_job.quiz_questions) > 0 ELSE false END;
  v_steps := public.assessment_journey(v_job.workflow_steps, v_has_quiz);

  SELECT s INTO v_step
    FROM jsonb_array_elements(v_steps) AS s
   WHERE s ->> 'id' = p_step_id
   ORDER BY (s ->> 'index')::integer
   LIMIT 1;

  IF v_step IS NULL OR v_step ->> 'type' = 'decision' THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002',
      DETAIL = format('Step %s is not a step of this job.', p_step_id);
  END IF;

  v_type := CASE WHEN v_step ->> 'type' = 'video_message' THEN 'video_intro' ELSE v_step ->> 'type' END;
  IF v_type NOT IN ('application', 'quiz', 'typing_test', 'chat_simulation', 'chat_interview',
                    'sales_simulation', 'voice_interview', 'video_intro', 'portfolio_upload') THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002',
      DETAIL = format('Step type %s keeps no assessment record.', v_type);
  END IF;

  -- hasReachedStep: resolveGatedStep's index against positionFor's.
  v_target := (v_step ->> 'index')::integer;
  SELECT min((s ->> 'index')::integer) INTO v_actual
    FROM jsonb_array_elements(v_steps) AS s
   WHERE COALESCE(v_app.phase, '') <> ''
     AND (s ->> 'id' = v_app.phase OR s ->> 'type' = v_app.phase);
  IF v_actual IS NULL AND v_app.status IN ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected') THEN
    v_actual := jsonb_array_length(v_steps) - 1;  -- the closing Decision stage
  END IF;
  v_actual := COALESCE(v_actual, 0);
  IF v_actual < v_target THEN
    RAISE EXCEPTION 'step_not_reached' USING ERRCODE = 'HF003',
      DETAIL = format('The applicant has not reached step %s yet.', p_step_id);
  END IF;

  v_done := public.assessment_step_completion(
    v_app.id, p_step_id, v_type, v_app.status, v_app.phase,
    public.assessment_notes_object(v_app.notes), v_app.voice_interview_result);

  RETURN jsonb_build_object(
    'application_id', v_app.id,
    'job_id', v_app.job_id,
    'candidate_id', v_app.candidate_id,
    'step_id', p_step_id,
    'step_type', v_type,
    'step_title', v_step ->> 'title',
    'step_index', v_target,
    'application_status', v_app.status,
    'phase', v_app.phase,
    'finished', COALESCE((v_done ->> 'finished')::boolean, false),
    'reopened', COALESCE((v_done ->> 'reopened')::boolean, false)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Session plumbing shared by every writer.
-- ---------------------------------------------------------------------------

-- A grading claim whose request died. The attempt is 'grading' (one request
-- claimed it, 5.1.4) but nothing has written to it for 7 minutes: longer than
-- any edge function runs (400 s), so that request was killed (wall clock,
-- memory, a restart) before it could complete the attempt or mark it failed.
-- Left alone it would read "being checked" for ever, and nothing else ever
-- moves it: the page waits on 'grading', touch and start report it, the sweep
-- only looks at 'active' rows. So the next start/open, heartbeat or sweep
-- that sees it decides what it really is, under the step's lock:
--   * the step is finished (the result landed before the request died):
--     'completed', end_reason result_recorded (the self-heal in 2.3);
--   * otherwise the result is still owed: 'failed', grading
--     {last_error: 'claim_expired', failed_at}. The page's "owed" path sends
--     it once more and the server claims it from 'failed' (gateGrading).
-- A claim younger than 7 minutes is never touched: its request may still
-- complete it. 7 minutes is the server's own stale-claim limit
-- (STALE_GRADING_MS). Returns the attempt's status afterwards (NULL when
-- there is no such attempt).
CREATE OR REPLACE FUNCTION public.assessment_expire_stale_claim(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session  public.assessment_sessions%ROWTYPE;
  v_app      record;
  v_finished boolean;
  v_status   text;
BEGIN
  SELECT * INTO v_session FROM public.assessment_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_session.status <> 'grading' OR v_session.updated_at >= now() - interval '7 minutes' THEN
    RETURN v_session.status;
  END IF;

  -- The lock every writer of this step takes (re-entrant inside one
  -- transaction): no attempt is opened or revived while this one is decided.
  PERFORM pg_advisory_xact_lock(hashtextextended('assessment_session:' || v_session.application_id::text || ':' || v_session.step_id, 0));

  SELECT a.status::text AS status, a.phase, a.notes, a.voice_interview_result
    INTO v_app
    FROM public.applications a
   WHERE a.id = v_session.application_id;
  v_finished := COALESCE((public.assessment_step_completion(
    v_session.application_id, v_session.step_id, v_session.step_type, v_app.status, v_app.phase,
    public.assessment_notes_object(v_app.notes), v_app.voice_interview_result) ->> 'finished')::boolean, false);

  -- The WHERE re-checks status and age: whatever happened between the first
  -- read and the lock (the request finally completing it, a takeover) wins.
  IF v_finished THEN
    UPDATE public.assessment_sessions
       SET status = 'completed', ended_at = COALESCE(ended_at, now()),
           end_reason = COALESCE(end_reason, 'result_recorded'), hidden_at = NULL
     WHERE id = p_session_id AND status = 'grading' AND updated_at < now() - interval '7 minutes';
  ELSE
    UPDATE public.assessment_sessions
       SET status = 'failed',
           grading = jsonb_build_object('last_error', 'claim_expired', 'failed_at', now())
     WHERE id = p_session_id AND status = 'grading' AND updated_at < now() - interval '7 minutes';
  END IF;

  SELECT s.status INTO v_status FROM public.assessment_sessions s WHERE s.id = p_session_id;
  RETURN v_status;
END;
$$;

-- Find or make the session a write belongs to (under a per application+step
-- advisory lock, so two tabs never create two attempts):
--   * a live one (active/grading) is used as it is, except a grading claim
--     older than 7 minutes (its request died): that one is 'failed' first
--     (assessment_expire_stale_claim) and handled as failed below;
--   * a 'failed' one (its grading crashed; the server still owes the result)
--     is used as it is, unless staff reopened the step;
--   * an 'abandoned' one (marked left by the sweep) comes back to life, with
--     a 'came_back' marker that says how long they were gone;
--   * otherwise (none yet, or the last one completed/superseded) a new
--     attempt starts, with a 'started' marker.
-- Callers have already checked access and that the step is not finished, but
-- on an earlier snapshot, outside the lock: a form sent while a draft save
-- was in flight would otherwise open a second form attempt that nothing ever
-- closes. So before reviving or opening an attempt the access rule runs
-- again under the lock, and a step that is finished by now raises HF004
-- step_finished (which every caller already treats as "done").
CREATE OR REPLACE FUNCTION public.assessment_session_for_write(p_access jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app_id  uuid := (p_access ->> 'application_id')::uuid;
  v_step_id text := p_access ->> 'step_id';
  v_latest  public.assessment_sessions%ROWTYPE;
  v_found   boolean;
  v_id      uuid;
  v_attempt integer;
  v_now     jsonb;
BEGIN
  IF v_app_id IS NULL OR v_step_id IS NULL THEN
    RAISE EXCEPTION 'assessment_session_for_write: an access record is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('assessment_session:' || v_app_id::text || ':' || v_step_id, 0));

  SELECT * INTO v_latest
    FROM public.assessment_sessions s
   WHERE s.application_id = v_app_id AND s.step_id = v_step_id
   ORDER BY s.attempt DESC
   LIMIT 1;
  v_found := FOUND;

  -- A grading claim older than 7 minutes belongs to a request that died:
  -- it is 'failed' now (the result is still owed, and the page sends it
  -- again), or 'completed' if the result landed (assessment_expire_stale_claim).
  -- 'failed' then takes the path below like any other failed attempt.
  IF v_found AND v_latest.status = 'grading' THEN
    v_latest.status := public.assessment_expire_stale_claim(v_latest.id);
  END IF;

  IF v_found AND v_latest.status IN ('active', 'grading') THEN
    RETURN jsonb_build_object('session_id', v_latest.id, 'how', 'existing');
  END IF;

  -- Everything below revives an attempt, reuses one whose grading failed, or
  -- opens a new one: decide again, now that no other writer for this step
  -- can run. A new statement takes a new snapshot, so this sees whatever
  -- committed before the lock was granted.
  v_now := public.assessment_step_access(v_app_id, v_step_id, (p_access ->> 'candidate_id')::uuid);
  IF (v_now ->> 'finished')::boolean THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'The result is on file.';
  END IF;

  IF v_found THEN
    IF v_latest.status = 'failed' AND NOT COALESCE((v_now ->> 'reopened')::boolean, false) THEN
      RETURN jsonb_build_object('session_id', v_latest.id, 'how', 'existing');
    END IF;

    IF v_latest.status = 'abandoned' THEN
      UPDATE public.assessment_sessions
         SET status = 'active', end_reason = NULL, ended_at = NULL,
             last_activity_at = now(), last_heartbeat_at = now(), hidden_at = NULL
       WHERE id = v_latest.id;
      INSERT INTO public.assessment_events (session_id, kind, detail)
      VALUES (v_latest.id, 'system', jsonb_build_object(
        'what', 'came_back',
        'away_ms', GREATEST(0, floor(extract(epoch FROM (now() - v_latest.last_activity_at)) * 1000))::bigint));
      RETURN jsonb_build_object('session_id', v_latest.id, 'how', 'revived');
    END IF;

    IF v_latest.status = 'failed' THEN
      UPDATE public.assessment_sessions
         SET status = 'superseded', end_reason = COALESCE(end_reason, 'superseded'), ended_at = COALESCE(ended_at, now())
       WHERE id = v_latest.id;
    END IF;
  END IF;

  v_attempt := CASE WHEN v_found THEN v_latest.attempt + 1 ELSE 1 END;

  INSERT INTO public.assessment_sessions (application_id, job_id, candidate_id, step_id, step_type, attempt)
  VALUES (v_app_id, (v_now ->> 'job_id')::uuid, (v_now ->> 'candidate_id')::uuid,
          v_step_id, v_now ->> 'step_type', v_attempt)
  RETURNING id INTO v_id;

  INSERT INTO public.assessment_events (session_id, kind, detail)
  VALUES (v_id, 'system', jsonb_build_object('what', 'started', 'attempt', v_attempt));

  RETURN jsonb_build_object('session_id', v_id, 'how', 'created');
END;
$$;

-- What start/open hand back: never grading, never context.
CREATE OR REPLACE FUNCTION public.assessment_session_payload(p_session_id uuid, p_with_turns boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'session_id', s.id,
    'step_id', s.step_id,
    'step_type', s.step_type,
    'attempt', s.attempt,
    'status', s.status,
    'started_at', s.started_at,
    'last_activity_at', s.last_activity_at,
    'ended_at', s.ended_at,
    'progress', s.progress,
    'integrity', jsonb_build_object(
      'total', COALESCE((s.integrity_summary ->> 'total')::integer, 0),
      'away_count', COALESCE((s.integrity_summary -> 'counts' ->> 'tab_hidden')::integer, 0)
                  + COALESCE((s.integrity_summary -> 'counts' ->> 'window_blur')::integer, 0)),
    'turns', CASE WHEN p_with_turns THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'seq', e.seq, 'kind', e.kind, 'content', e.content,
                 'client_msg_id', e.client_msg_id, 'created_at', e.created_at) ORDER BY e.seq)
          FROM public.assessment_events e
         WHERE e.session_id = s.id AND e.kind IN ('candidate_turn', 'assistant_turn')
      ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'draft', CASE WHEN s.step_type = 'application' THEN s.draft END,
    'quiz', CASE WHEN s.step_type = 'quiz' AND p_with_turns THEN jsonb_build_object(
        'answers', COALESCE((
          SELECT jsonb_object_agg(x.qid, x.answer)
            FROM (SELECT DISTINCT ON (e.detail ->> 'question_id')
                         e.detail ->> 'question_id' AS qid, e.detail -> 'answer' AS answer
                    FROM public.assessment_events e
                   WHERE e.session_id = s.id AND e.kind = 'quiz_answer' AND e.detail ? 'question_id'
                   ORDER BY e.detail ->> 'question_id', e.seq DESC) x
        ), '{}'::jsonb),
        'shown_at', COALESCE((
          SELECT jsonb_object_agg(x.qid, x.shown_at)
            FROM (SELECT e.detail ->> 'question_id' AS qid, min(e.created_at) AS shown_at
                    FROM public.assessment_events e
                   WHERE e.session_id = s.id AND e.kind = 'quiz_shown' AND e.detail ? 'question_id'
                   GROUP BY 1) x
        ), '{}'::jsonb)) END,
    'server_now', now())
  FROM public.assessment_sessions s
  WHERE s.id = p_session_id
$$;


-- ---------------------------------------------------------------------------
-- 7. Opening (and resuming) a test.
-- ---------------------------------------------------------------------------

-- Service-role form: the edge functions verify the caller's JWT themselves
-- (as recordStepResult does) and pass the user id. The candidate calls
-- start_assessment_session below, which is this with auth.uid().
CREATE OR REPLACE FUNCTION public.open_assessment_session(p_application_id uuid, p_step_id text, p_candidate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access jsonb;
  v_write  jsonb;
  v_id     uuid;
  v_seq    integer;
BEGIN
  v_access := public.assessment_step_access(p_application_id, p_step_id, p_candidate_id);

  IF (v_access ->> 'finished')::boolean THEN
    -- The result is on file. A session still marked active (a result
    -- recorded by a path that does not close its session yet) is closed
    -- here, so the record never says "in progress" for a finished test.
    -- So is one stuck in 'grading' or 'failed' for more than 7 minutes: the
    -- result landed but the request that held the claim died before it
    -- completed the attempt (no edge function runs that long, and nothing
    -- re-grades a finished step). A younger 'grading' row is left alone: its
    -- request may be about to complete it with the full grading. 7 minutes is
    -- the server's own stale-claim limit (STALE_GRADING_MS).
    PERFORM pg_advisory_xact_lock(hashtextextended('assessment_session:' || p_application_id::text || ':' || p_step_id, 0));
    UPDATE public.assessment_sessions
       SET status = 'completed', ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, 'result_recorded')
     WHERE application_id = p_application_id AND step_id = p_step_id
       AND (status = 'active'
            OR (status IN ('grading', 'failed') AND updated_at < now() - interval '7 minutes'));
    SELECT s.id INTO v_id
      FROM public.assessment_sessions s
     WHERE s.application_id = p_application_id AND s.step_id = p_step_id
     ORDER BY s.attempt DESC
     LIMIT 1;
    RETURN CASE
             WHEN v_id IS NULL THEN jsonb_build_object(
               'session_id', NULL, 'step_id', p_step_id, 'step_type', v_access ->> 'step_type',
               'attempt', NULL, 'status', NULL, 'started_at', NULL, 'last_activity_at', NULL, 'ended_at', NULL,
               'progress', '{}'::jsonb, 'integrity', jsonb_build_object('total', 0, 'away_count', 0),
               'turns', '[]'::jsonb, 'draft', NULL, 'quiz', NULL, 'server_now', now())
             ELSE public.assessment_session_payload(v_id, false)
           END
           || jsonb_build_object('finished', true, 'resumed', false);
  END IF;

  v_write := public.assessment_session_for_write(v_access);
  v_id := (v_write ->> 'session_id')::uuid;

  IF v_write ->> 'how' = 'existing' THEN
    -- Opened again while live: a reload, a second tab or another device.
    UPDATE public.assessment_sessions
       SET last_activity_at = now(), last_heartbeat_at = now(), hidden_at = NULL
     WHERE id = v_id AND status = 'active'
    RETURNING event_seq INTO v_seq;
    IF v_seq IS NOT NULL AND v_seq < 5000 THEN
      INSERT INTO public.assessment_events (session_id, kind, detail)
      VALUES (v_id, 'system', jsonb_build_object('what', 'reloaded'));
    END IF;
  END IF;

  RETURN public.assessment_session_payload(v_id, true)
         || jsonb_build_object('finished', false, 'resumed', v_write ->> 'how' <> 'created');
END;
$$;

CREATE OR REPLACE FUNCTION public.start_assessment_session(p_application_id uuid, p_step_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.open_assessment_session(p_application_id, p_step_id, auth.uid());
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. Heartbeat.
-- ---------------------------------------------------------------------------
-- p_hidden true  = the page was hidden (hidden_at keeps the first moment);
-- p_hidden false = visible again (hidden_at cleared, counts as activity);
-- p_hidden null  = a plain heartbeat: last_heartbeat_at only.
-- p_active true  = the applicant did something on the page since the last
--                  beat (typed, picked, scrolled, clicked): counts as
--                  activity. A heartbeat alone never does, so an applicant
--                  who walks away from a visible tab still reads as "left"
--                  after 10 quiet minutes.
-- p_progress is the page's own hint and REPLACES progress.client (the page
-- sends its whole hint each time), so it stays at most 4 KB; it can never
-- overwrite a server-owned progress key.
-- A session that is no longer active is left alone and its status returned,
-- so the page can tell the server has ended the test. The one exception: a
-- grading claim older than 7 minutes (its request died) is expired first
-- (assessment_expire_stale_claim), so the page reads 'failed' and sends the
-- test again instead of waiting on "being checked" for ever.
DROP FUNCTION IF EXISTS public.touch_assessment_session(uuid, boolean, jsonb);
CREATE OR REPLACE FUNCTION public.touch_assessment_session(
  p_session_id uuid,
  p_hidden boolean DEFAULT NULL,
  p_progress jsonb DEFAULT NULL,
  p_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_session    public.assessment_sessions%ROWTYPE;
  v_app_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '42501';
  END IF;
  IF p_progress IS NOT NULL AND (jsonb_typeof(p_progress) <> 'object' OR octet_length(p_progress::text) > 4096) THEN
    RAISE EXCEPTION 'progress_must_be_a_small_object' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_session FROM public.assessment_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND OR v_session.candidate_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_your_session' USING ERRCODE = '42501';
  END IF;

  SELECT a.status::text INTO v_app_status FROM public.applications a WHERE a.id = v_session.application_id;
  IF v_app_status IN ('rejected', 'hired', 'offered') THEN
    RETURN jsonb_build_object('session_id', v_session.id, 'updated', false, 'status', v_session.status,
                              'reason', 'application_closed', 'server_now', now());
  END IF;
  IF v_session.status = 'grading' THEN
    -- A page waiting on "being checked" learns, within one beat, that the
    -- request holding the claim died: 'failed' (it sends the test again), or
    -- 'completed' if the result landed first.
    v_session.status := public.assessment_expire_stale_claim(v_session.id);
  END IF;
  IF v_session.status <> 'active' THEN
    RETURN jsonb_build_object('session_id', v_session.id, 'updated', false, 'status', v_session.status,
                              'server_now', now());
  END IF;

  UPDATE public.assessment_sessions
     SET last_heartbeat_at = now(),
         hidden_at = CASE WHEN p_hidden IS TRUE THEN COALESCE(hidden_at, now())
                          WHEN p_hidden IS FALSE THEN NULL
                          ELSE hidden_at END,
         last_activity_at = CASE WHEN p_hidden IS FALSE OR p_active IS TRUE THEN now()
                                 ELSE last_activity_at END,
         progress = CASE WHEN p_progress IS NULL THEN progress
                         ELSE progress || jsonb_build_object('client', p_progress) END
   WHERE id = v_session.id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'updated', true,
    'status', v_session.status,
    'hidden', v_session.hidden_at IS NOT NULL,
    'last_activity_at', v_session.last_activity_at,
    'server_now', now());
END;
$$;


-- ---------------------------------------------------------------------------
-- 9. The owner's live integrity card.
-- ---------------------------------------------------------------------------
-- Rebuilds the tally for one session from its integrity_summary and upserts
-- ONE card per recipient (group_key integrity:<application>:<step>): the job's
-- employer plus every active team member scoped to the job, exactly the
-- recipients notify_new_application_submitted uses. Every call sets the card
-- unread and moves it to the top. Returns how many cards were written; the
-- application form step writes none.
--
-- Away episodes under one second (focus flickers, an OS notification) are on
-- the record but not in the card's count, and never ping on their own.
CREATE OR REPLACE FUNCTION public.assessment_integrity_alert(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session    record;
  v_job        record;
  v_counts     jsonb;
  v_name       text;
  v_step_title text;
  v_parts      text[] := ARRAY[]::text[];
  v_away       integer;
  v_away_ms    bigint;
  v_n          integer;
  v_title      text;
  v_message    text;
  v_link       text;
  v_group      text;
  v_uid        uuid;
  v_written    integer := 0;
BEGIN
  SELECT s.id, s.application_id, s.job_id, s.candidate_id, s.step_id, s.step_type, s.integrity_summary
    INTO v_session
    FROM public.assessment_sessions s
   WHERE s.id = p_session_id;
  IF NOT FOUND OR v_session.step_type = 'application' THEN
    RETURN 0;
  END IF;

  SELECT j.id, j.employer_id, j.workflow_steps, j.quiz_questions
    INTO v_job
    FROM public.jobs j
   WHERE j.id = v_session.job_id;
  IF v_job.employer_id IS NULL THEN
    RETURN 0;
  END IF;

  v_counts := COALESCE(v_session.integrity_summary -> 'counts', '{}'::jsonb);

  v_away := COALESCE((v_counts ->> 'tab_hidden')::integer, 0)
          + COALESCE((v_counts ->> 'window_blur')::integer, 0)
          - COALESCE((v_session.integrity_summary ->> 'short_away')::integer, 0);
  v_away_ms := COALESCE((v_session.integrity_summary ->> 'away_ms')::bigint, 0);
  IF v_away > 0 THEN
    v_parts := v_parts || ('left the window ' || v_away::text || CASE WHEN v_away = 1 THEN ' time' ELSE ' times' END
      || CASE WHEN v_away_ms >= 1000 THEN ' (' || public.assessment_duration_text(v_away_ms) || ' away)' ELSE '' END);
  END IF;

  v_n := COALESCE((v_counts ->> 'paste')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('paste attempt x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'bulk_insert')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('pasted-in text x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'copy')::integer, 0) + COALESCE((v_counts ->> 'cut')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('copy attempt x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'screenshot_key')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('screenshot attempt x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'screenshot_suspected')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('possible screenshot x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'devtools')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('developer tools opened x' || v_n::text); END IF;
  v_n := COALESCE((v_counts ->> 'page_closed')::integer, 0);
  IF v_n > 0 THEN v_parts := v_parts || ('closed the test page x' || v_n::text); END IF;

  IF cardinality(v_parts) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.email), ''))
    INTO v_name
    FROM public.profiles p
   WHERE p.user_id = v_session.candidate_id;
  v_name := COALESCE(v_name, 'A candidate');

  SELECT s ->> 'title' INTO v_step_title
    FROM jsonb_array_elements(public.assessment_journey(
           v_job.workflow_steps,
           CASE WHEN jsonb_typeof(v_job.quiz_questions) = 'array' THEN jsonb_array_length(v_job.quiz_questions) > 0 ELSE false END
         )) AS s
   WHERE s ->> 'id' = v_session.step_id
   LIMIT 1;
  v_step_title := COALESCE(v_step_title, 'a test');

  v_title := 'Integrity — ' || v_name;
  v_message := 'During ' || v_step_title || ': ' || array_to_string(v_parts, ', ');
  v_link := '/applicants/' || v_session.application_id::text;
  v_group := 'integrity:' || v_session.application_id::text || ':' || v_session.step_id;

  FOR v_uid IN
    SELECT v_job.employer_id
    UNION
    SELECT tm.user_id
      FROM public.team_members tm
     WHERE tm.employer_id = v_job.employer_id
       AND tm.status = 'active'
       AND tm.user_id <> v_job.employer_id
       AND (array_length(tm.assigned_job_ids, 1) IS NULL OR v_job.id = ANY (tm.assigned_job_ids))
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, link, is_read, group_key)
    VALUES (v_uid, 'integrity', v_title, v_message, v_link, false, v_group)
    ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL
    DO UPDATE SET type = EXCLUDED.type,
                  title = EXCLUDED.title,
                  message = EXCLUDED.message,
                  link = EXCLUDED.link,
                  is_read = false,
                  created_at = now();
    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$$;


-- ---------------------------------------------------------------------------
-- 10. Integrity events from the test page.
-- ---------------------------------------------------------------------------
-- p_events: [{kind, client_at, duration_ms, detail, id}] (see the doc).
--   kind        copy | cut | paste | right_click | tab_hidden | window_blur |
--               screenshot_key | screenshot_suspected | devtools | page_closed |
--               bulk_insert | other   (anything else is kept as 'other' with
--               detail.reported_kind)
--   id          optional client id; a retried event with the same id is
--               stored once (client_msg_id).
-- At most 100 events per call and 500 per session are stored; the rest are
-- counted in integrity_summary.dropped. Server time is created_at.
-- client_at is kept only if it is a real time within [the attempt's start
-- minus a day, now plus 10 minutes]; anything else (unparsable, 'infinity',
-- 'epoch', a far-off clock) is stored as NULL with the page's text in
-- detail.client_at_raw, so one bad clock cannot skew the staff timeline.
-- The keys the server writes into detail (kind, duration_ms, reported_kind,
-- after_end, client_at_raw) are removed from the page's detail first: the
-- server's always win, even where the server's value is "none".
-- Events that arrive within two minutes after a session ended (a flush from a
-- closing tab) are kept with detail.after_end = true; later ones are refused.
CREATE OR REPLACE FUNCTION public.record_integrity_events(p_application_id uuid, p_step_id text, p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_per_call     constant integer := 100;
  c_per_session  constant integer := 500;
  c_short_ms     constant integer := 1000;
  c_alert_kinds  constant text[] := ARRAY['copy', 'cut', 'paste', 'bulk_insert', 'tab_hidden', 'window_blur',
                                          'screenshot_key', 'screenshot_suspected', 'devtools', 'page_closed'];
  c_known_kinds  constant text[] := ARRAY['copy', 'cut', 'paste', 'right_click', 'tab_hidden', 'window_blur',
                                          'screenshot_key', 'screenshot_suspected', 'devtools', 'page_closed',
                                          'bulk_insert', 'other'];
  v_access    jsonb;
  v_session   public.assessment_sessions%ROWTYPE;
  v_after_end boolean := false;
  v_summary   jsonb;
  v_counts    jsonb;
  v_total     integer;
  v_away_ms   bigint;
  v_short     integer;
  v_dropped   integer := 0;
  v_dupes     integer := 0;
  v_inserted  integer := 0;
  v_alert     boolean := false;
  v_ev        jsonb;
  v_pos       bigint;
  v_reported  text;
  v_kind      text;
  v_client_at timestamptz;
  v_client_raw text;
  v_duration  integer;
  v_detail    jsonb;
  v_msg_id    text;
  v_new_id    bigint;
  v_alerted   integer := 0;
  v_sid       uuid;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'events_must_be_an_array' USING ERRCODE = '22023';
  END IF;

  v_access := public.assessment_step_access(p_application_id, p_step_id, auth.uid());

  SELECT * INTO v_session
    FROM public.assessment_sessions s
   WHERE s.application_id = p_application_id AND s.step_id = p_step_id AND s.status IN ('active', 'grading')
   LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_session
      FROM public.assessment_sessions s
     WHERE s.application_id = p_application_id AND s.step_id = p_step_id
     ORDER BY s.attempt DESC
     LIMIT 1;
    IF FOUND AND v_session.ended_at IS NOT NULL AND v_session.ended_at > now() - interval '2 minutes' THEN
      v_after_end := true;
    ELSIF (v_access ->> 'finished')::boolean THEN
      RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'This test has already been sent.';
    ELSE
      -- Into a variable first: a volatile call inside WHERE could run per row.
      v_sid := (public.assessment_session_for_write(v_access) ->> 'session_id')::uuid;
      SELECT * INTO v_session FROM public.assessment_sessions s WHERE s.id = v_sid;
    END IF;
  END IF;

  -- Lock the session: two calls for one session never lose each other's counts.
  SELECT * INTO v_session FROM public.assessment_sessions WHERE id = v_session.id FOR UPDATE;

  v_summary := v_session.integrity_summary;
  v_counts := CASE WHEN jsonb_typeof(v_summary -> 'counts') = 'object' THEN v_summary -> 'counts' ELSE '{}'::jsonb END;
  v_total := COALESCE((v_summary ->> 'total')::integer, 0);
  v_away_ms := COALESCE((v_summary ->> 'away_ms')::bigint, 0);
  v_short := COALESCE((v_summary ->> 'short_away')::integer, 0);

  FOR v_ev, v_pos IN SELECT e.value, e.ordinality FROM jsonb_array_elements(p_events) WITH ORDINALITY AS e LOOP
    IF v_pos > c_per_call
       OR v_total + v_inserted >= c_per_session
       OR v_session.event_seq + v_inserted >= 5000
       OR jsonb_typeof(v_ev) <> 'object' THEN
      v_dropped := v_dropped + 1;
      CONTINUE;
    END IF;

    v_reported := lower(btrim(COALESCE(v_ev ->> 'kind', '')));
    v_kind := CASE WHEN v_reported = ANY (c_known_kinds) THEN v_reported ELSE 'other' END;
    v_client_at := CASE WHEN pg_input_is_valid(v_ev ->> 'client_at', 'timestamptz')
                        THEN (v_ev ->> 'client_at')::timestamptz END;
    v_client_raw := NULL;
    IF v_client_at IS NOT NULL
       AND (v_client_at < v_session.started_at - interval '1 day' OR v_client_at > now() + interval '10 minutes') THEN
      v_client_at := NULL;
    END IF;
    IF v_client_at IS NULL AND NULLIF(btrim(COALESCE(v_ev ->> 'client_at', '')), '') IS NOT NULL THEN
      v_client_raw := left(v_ev ->> 'client_at', 64);
    END IF;
    v_duration := CASE WHEN jsonb_typeof(v_ev -> 'duration_ms') = 'number'
                       THEN LEAST(GREATEST(round((v_ev ->> 'duration_ms')::numeric), 0), 86400000)::integer END;
    v_detail := CASE
                  WHEN jsonb_typeof(v_ev -> 'detail') <> 'object' OR v_ev -> 'detail' IS NULL THEN '{}'::jsonb
                  WHEN octet_length((v_ev -> 'detail')::text) > 2000 THEN jsonb_build_object('truncated', true)
                  ELSE v_ev -> 'detail'
                END;
    v_detail := (v_detail - 'kind' - 'duration_ms' - 'reported_kind' - 'after_end' - 'client_at_raw')
      || jsonb_strip_nulls(jsonb_build_object(
           'kind', v_kind,
           'duration_ms', v_duration,
           'reported_kind', CASE WHEN v_kind = 'other' AND v_reported NOT IN ('', 'other') THEN left(v_reported, 40) END,
           'after_end', CASE WHEN v_after_end THEN true END,
           'client_at_raw', v_client_raw));
    v_msg_id := NULLIF(left(btrim(COALESCE(v_ev ->> 'id', '')), 128), '');

    v_new_id := NULL;
    INSERT INTO public.assessment_events (session_id, kind, detail, duration_ms, client_at, client_msg_id)
    VALUES (v_session.id, 'integrity', v_detail, v_duration, v_client_at, v_msg_id)
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;

    v_inserted := v_inserted + 1;
    v_counts := v_counts || jsonb_build_object(v_kind, COALESCE((v_counts ->> v_kind)::integer, 0) + 1);
    IF v_kind IN ('tab_hidden', 'window_blur') THEN
      v_away_ms := v_away_ms + COALESCE(v_duration, 0);
      IF v_duration IS NOT NULL AND v_duration < c_short_ms THEN
        v_short := v_short + 1;
      ELSE
        v_alert := true;
      END IF;
    ELSIF v_kind = ANY (c_alert_kinds) THEN
      v_alert := true;
    END IF;
  END LOOP;

  UPDATE public.assessment_sessions
     SET integrity_summary = jsonb_strip_nulls(jsonb_build_object(
           'counts', v_counts,
           'total', v_total + v_inserted,
           'away_ms', v_away_ms,
           'short_away', v_short,
           'dropped', COALESCE((v_summary ->> 'dropped')::integer, 0) + v_dropped,
           'first_event_at', COALESCE(v_summary -> 'first_event_at', CASE WHEN v_inserted > 0 THEN to_jsonb(now()) END),
           'last_event_at', CASE WHEN v_inserted > 0 THEN to_jsonb(now()) ELSE v_summary -> 'last_event_at' END))
   WHERE id = v_session.id;

  -- The alert never costs the record: a failure here is logged, not raised.
  IF v_alert AND v_session.step_type <> 'application' THEN
    BEGIN
      v_alerted := public.assessment_integrity_alert(v_session.id);
    EXCEPTION WHEN others THEN
      RAISE LOG 'record_integrity_events: alert skipped for session %: %', v_session.id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'accepted', v_inserted,
    'duplicates', v_dupes,
    'dropped', v_dropped,
    'total', v_total + v_inserted,
    'alerted', v_alerted > 0,
    'server_now', now());
END;
$$;


-- ---------------------------------------------------------------------------
-- 11. The application form draft.
-- ---------------------------------------------------------------------------
-- p_answers: an object keyed by the job's application question id; values
-- are what the form holds (a string, or a list for pick-several). Keys that
-- start with "_" carry the form's own extra state and are not counted.
-- Only while the form is not yet submitted (status in_progress).
CREATE OR REPLACE FUNCTION public.save_application_draft(p_application_id uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access    jsonb;
  v_id        uuid;
  v_status    text;
  v_questions jsonb;
  v_total     integer;
  v_answered  integer;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers_must_be_an_object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_answers::text) > 65536 THEN
    RAISE EXCEPTION 'draft_too_large' USING ERRCODE = '22023', DETAIL = 'A draft may be at most 64 KB.';
  END IF;

  v_access := public.assessment_step_access(p_application_id, 'application', auth.uid());
  IF (v_access ->> 'finished')::boolean THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'The application has already been sent.';
  END IF;

  v_id := (public.assessment_session_for_write(v_access) ->> 'session_id')::uuid;
  SELECT s.status INTO v_status FROM public.assessment_sessions s WHERE s.id = v_id FOR UPDATE;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004';
  END IF;

  SELECT CASE WHEN jsonb_typeof(j.application_questions) = 'array' THEN j.application_questions ELSE '[]'::jsonb END
    INTO v_questions
    FROM public.jobs j
   WHERE j.id = (v_access ->> 'job_id')::uuid;
  v_questions := COALESCE(v_questions, '[]'::jsonb);
  v_total := jsonb_array_length(v_questions);

  SELECT count(*)::integer INTO v_answered
    FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS q(elem, ord),
         LATERAL (SELECT p_answers -> COALESCE(q.elem ->> 'id', '__idx_' || (q.ord - 1)::text) AS v) a
   WHERE CASE jsonb_typeof(a.v)
           WHEN 'string'  THEN btrim(a.v #>> '{}') <> ''
           WHEN 'array'   THEN jsonb_array_length(a.v) > 0
           WHEN 'object'  THEN a.v <> '{}'::jsonb
           WHEN 'number'  THEN true
           WHEN 'boolean' THEN (a.v #>> '{}')::boolean
           ELSE false
         END;

  UPDATE public.assessment_sessions
     SET draft = p_answers,
         progress = progress || jsonb_build_object('answered', v_answered, 'total', v_total, 'draft_saved_at', now()),
         last_activity_at = now(),
         hidden_at = NULL
   WHERE id = v_id;

  RETURN jsonb_build_object('session_id', v_id, 'answered', v_answered, 'total', v_total, 'saved_at', now());
END;
$$;


-- ---------------------------------------------------------------------------
-- 12. Quiz: question shown / answer given, on the server's clock.
-- ---------------------------------------------------------------------------
-- p_answer NULL (or JSON null) = "this question is on screen now" (recorded
-- once per question per attempt). Otherwise the answer is recorded with the
-- seconds since the question was first shown (server time; else the page's
-- p_shown_at if it lies inside the attempt; else the previous answer or the
-- attempt's start), and detail.timing_source says which. Correctness is never
-- computed, stored or returned here: the answer keys stay server-only
-- (job_quiz_keys, submit_quiz_attempt). p_shown_at is stored (client_at,
-- detail.client_shown_at) only within the same window as integrity
-- client_at; otherwise its text goes to detail.client_shown_at_raw.
CREATE OR REPLACE FUNCTION public.record_quiz_answer(
  p_application_id uuid,
  p_question_id text,
  p_answer jsonb,
  p_shown_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access    jsonb;
  v_is_shown  boolean;
  v_questions jsonb;
  v_index     integer;
  v_total     integer;
  v_session   public.assessment_sessions%ROWTYPE;
  v_shown     timestamptz;
  v_source    text;
  v_ms        bigint;
  v_changed   boolean;
  v_answered  integer;
  v_sid       uuid;
  v_client    timestamptz;
  v_client_raw text;
BEGIN
  IF p_question_id IS NULL OR length(p_question_id) = 0 OR length(p_question_id) > 120 THEN
    RAISE EXCEPTION 'unknown_question' USING ERRCODE = '22023';
  END IF;
  v_is_shown := p_answer IS NULL OR jsonb_typeof(p_answer) = 'null';
  IF NOT v_is_shown AND octet_length(p_answer::text) > 4096 THEN
    RAISE EXCEPTION 'answer_too_large' USING ERRCODE = '22023';
  END IF;

  v_access := public.assessment_step_access(p_application_id, 'quiz', auth.uid());
  IF v_access ->> 'step_type' <> 'quiz' THEN
    RAISE EXCEPTION 'unknown_step' USING ERRCODE = 'HF002';
  END IF;
  IF (v_access ->> 'finished')::boolean THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'This quiz has already been sent.';
  END IF;

  SELECT CASE WHEN jsonb_typeof(j.quiz_questions) = 'array' THEN j.quiz_questions ELSE '[]'::jsonb END
    INTO v_questions
    FROM public.jobs j
   WHERE j.id = (v_access ->> 'job_id')::uuid;
  v_questions := COALESCE(v_questions, '[]'::jsonb);
  v_total := jsonb_array_length(v_questions);

  -- Same question ids submit_quiz_attempt uses (id, else __idx_<n>).
  SELECT (q.ord - 1)::integer INTO v_index
    FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS q(elem, ord)
   WHERE COALESCE(q.elem ->> 'id', '__idx_' || (q.ord - 1)::text) = p_question_id
   ORDER BY q.ord
   LIMIT 1;
  IF v_index IS NULL THEN
    RAISE EXCEPTION 'unknown_question' USING ERRCODE = '22023',
      DETAIL = format('%s is not a question of this quiz.', p_question_id);
  END IF;

  v_sid := (public.assessment_session_for_write(v_access) ->> 'session_id')::uuid;
  SELECT * INTO v_session FROM public.assessment_sessions s WHERE s.id = v_sid FOR UPDATE;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'step_finished' USING ERRCODE = 'HF004', DETAIL = 'This quiz is being checked.';
  END IF;
  IF v_session.event_seq >= 5000 THEN
    RAISE EXCEPTION 'session_full' USING ERRCODE = 'HF005';
  END IF;

  -- The page's own clock: kept only when it is a plausible time.
  IF p_shown_at IS NOT NULL
     AND p_shown_at >= v_session.started_at - interval '1 day'
     AND p_shown_at <= now() + interval '10 minutes' THEN
    v_client := p_shown_at;
  ELSIF p_shown_at IS NOT NULL THEN
    v_client_raw := left(p_shown_at::text, 64);
  END IF;

  IF v_is_shown THEN
    INSERT INTO public.assessment_events (session_id, kind, detail, client_at, client_msg_id)
    VALUES (v_session.id, 'quiz_shown',
            jsonb_strip_nulls(jsonb_build_object('question_id', p_question_id, 'question_index', v_index,
                                                 'client_shown_at', v_client,
                                                 'client_shown_at_raw', v_client_raw)),
            v_client, 'shown:' || p_question_id);
    SELECT min(e.created_at) INTO v_shown
      FROM public.assessment_events e
     WHERE e.session_id = v_session.id AND e.kind = 'quiz_shown' AND e.detail ->> 'question_id' = p_question_id;
    UPDATE public.assessment_sessions
       SET progress = progress || jsonb_build_object('total', v_total, 'current_question_id', p_question_id,
                                                     'current_index', v_index)
     WHERE id = v_session.id;
    RETURN jsonb_build_object('session_id', v_session.id, 'recorded', 'shown', 'question_index', v_index,
                              'shown_at', v_shown, 'server_now', now());
  END IF;

  SELECT min(e.created_at) INTO v_shown
    FROM public.assessment_events e
   WHERE e.session_id = v_session.id AND e.kind = 'quiz_shown' AND e.detail ->> 'question_id' = p_question_id;
  IF v_shown IS NOT NULL THEN
    v_source := 'server';
  ELSIF p_shown_at IS NOT NULL AND p_shown_at >= v_session.started_at AND p_shown_at <= now() THEN
    v_shown := p_shown_at;
    v_source := 'client';
  ELSE
    SELECT max(e.created_at) INTO v_shown
      FROM public.assessment_events e
     WHERE e.session_id = v_session.id AND e.kind = 'quiz_answer';
    IF v_shown IS NOT NULL THEN
      v_source := 'previous_answer';
    ELSE
      v_shown := v_session.started_at;
      v_source := 'attempt_start';
    END IF;
  END IF;

  v_ms := LEAST(GREATEST(0, floor(extract(epoch FROM (now() - v_shown)) * 1000)), 86400000)::bigint;
  v_changed := EXISTS (
    SELECT 1 FROM public.assessment_events e
     WHERE e.session_id = v_session.id AND e.kind = 'quiz_answer' AND e.detail ->> 'question_id' = p_question_id);

  INSERT INTO public.assessment_events (session_id, kind, detail, duration_ms)
  VALUES (v_session.id, 'quiz_answer',
          jsonb_build_object('question_id', p_question_id, 'question_index', v_index, 'answer', p_answer,
                             'seconds_on_question', round(v_ms / 1000.0, 1), 'shown_at', v_shown,
                             'timing_source', v_source, 'changed', v_changed)
          || jsonb_strip_nulls(jsonb_build_object('client_shown_at', v_client,
                                                  'client_shown_at_raw', v_client_raw)),
          v_ms::integer);

  SELECT count(DISTINCT e.detail ->> 'question_id')::integer INTO v_answered
    FROM public.assessment_events e
   WHERE e.session_id = v_session.id AND e.kind = 'quiz_answer';

  UPDATE public.assessment_sessions
     SET progress = progress || jsonb_build_object('answered', v_answered, 'total', v_total,
                                                   'current_question_id', p_question_id, 'current_index', v_index)
   WHERE id = v_session.id;

  RETURN jsonb_build_object('session_id', v_session.id, 'recorded', 'answer', 'answered', v_answered,
                            'total', v_total, 'seconds_on_question', round(v_ms / 1000.0, 1),
                            'server_now', now());
END;
$$;


-- ---------------------------------------------------------------------------
-- 13. Triggers on the application row: the form and the quiz are sent (their
--     sessions close), and a step is handed back for a retake.
-- ---------------------------------------------------------------------------
-- The browser sends the form itself (status in_progress -> pending), so this
-- trigger closes the form's session. It never blocks the submission: any
-- failure is logged and the update goes through.
CREATE OR REPLACE FUNCTION public.assessment_application_form_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  BEGIN
    WITH done AS (
      UPDATE public.assessment_sessions s
         SET status = 'completed', ended_at = now(), end_reason = 'submitted',
             last_activity_at = now(), hidden_at = NULL
       WHERE s.application_id = NEW.id AND s.step_id = 'application' AND s.status IN ('active', 'abandoned')
      RETURNING s.id
    )
    SELECT array_agg(id) INTO v_ids FROM done;

    IF v_ids IS NOT NULL THEN
      INSERT INTO public.assessment_events (session_id, kind, detail)
      SELECT unnest(v_ids), 'system', jsonb_build_object('what', 'submitted');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE LOG 'assessment_application_form_submitted skipped for application %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_application_form_submitted ON public.applications;
CREATE TRIGGER assessment_application_form_submitted
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  WHEN (OLD.status = 'in_progress' AND NEW.status IS DISTINCT FROM 'in_progress')
  EXECUTE FUNCTION public.assessment_application_form_submitted();

-- The quiz is sent: its session is complete. submit_quiz_attempt grades and
-- writes notes.quiz / notes.quizResult itself (no edge function closes the
-- quiz session), so this trigger does, the moment the result lands: status
-- completed, end_reason submitted, a 'submitted' marker. Only live or left
-- quiz attempts are touched, and it never blocks the write that fired it.
-- (The quiz's grading is not copied into the session in this release; the
-- staff record reads the quiz result from notes and the keys from
-- get_job_quiz_keys.)
CREATE OR REPLACE FUNCTION public.assessment_quiz_result_landed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notes jsonb;
  v_ids   uuid[];
BEGIN
  BEGIN
    -- Cheap first: most notes writes are not the quiz, and most applications
    -- have no open quiz attempt.
    IF NOT EXISTS (
      SELECT 1 FROM public.assessment_sessions s
       WHERE s.application_id = NEW.id AND s.step_id = 'quiz' AND s.status IN ('active', 'abandoned')
    ) THEN
      RETURN NEW;
    END IF;
    v_notes := public.assessment_notes_object(NEW.notes);
    IF (v_notes -> 'quiz' ->> 'completedAt') IS NULL AND (v_notes -> 'quizResult') IS NULL THEN
      RETURN NEW;
    END IF;

    WITH done AS (
      UPDATE public.assessment_sessions s
         SET status = 'completed', ended_at = now(), end_reason = 'submitted',
             last_activity_at = now(), hidden_at = NULL
       WHERE s.application_id = NEW.id AND s.step_id = 'quiz' AND s.status IN ('active', 'abandoned')
      RETURNING s.id
    )
    SELECT array_agg(id) INTO v_ids FROM done;

    IF v_ids IS NOT NULL THEN
      INSERT INTO public.assessment_events (session_id, kind, detail)
      SELECT unnest(v_ids), 'system', jsonb_build_object('what', 'submitted');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE LOG 'assessment_quiz_result_landed skipped for application %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_quiz_result_landed ON public.applications;
CREATE TRIGGER assessment_quiz_result_landed
  AFTER UPDATE OF notes ON public.applications
  FOR EACH ROW
  WHEN (OLD.notes IS DISTINCT FROM NEW.notes)
  EXECUTE FUNCTION public.assessment_quiz_result_landed();

-- A step handed back for a retake: the marker assessment_step_access reads.
-- Fires on a write that CHANGES phase or status and leaves the row on
-- status 'pending' with phase = a step (by id) whose result is on file. The
-- applicant's own write never counts (they can set their own status, and
-- phase is server-only for them); a staff member's (Ava's
-- move_applicant_to_phase, a future reopen button), the service role's or
-- the SQL editor's does. It records the marker, and closes an attempt of
-- that step still open on the old result, so the retake starts fresh. It
-- never blocks the write that fired it.
CREATE OR REPLACE FUNCTION public.assessment_step_reopened()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_by    uuid;
  v_job   record;
  v_step  jsonb;
  v_type  text;
  v_done  jsonb;
BEGIN
  BEGIN
    v_by := auth.uid();
    IF v_by IS NOT DISTINCT FROM NEW.candidate_id AND auth.role() IS DISTINCT FROM 'service_role' THEN
      RETURN NEW;
    END IF;

    SELECT j.workflow_steps, j.quiz_questions INTO v_job FROM public.jobs j WHERE j.id = NEW.job_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    SELECT s INTO v_step
      FROM jsonb_array_elements(public.assessment_journey(
             v_job.workflow_steps,
             CASE WHEN jsonb_typeof(v_job.quiz_questions) = 'array' THEN jsonb_array_length(v_job.quiz_questions) > 0 ELSE false END
           )) AS s
     WHERE s ->> 'id' = NEW.phase
     ORDER BY (s ->> 'index')::integer
     LIMIT 1;
    v_type := CASE WHEN v_step ->> 'type' = 'video_message' THEN 'video_intro' ELSE v_step ->> 'type' END;
    IF v_type IS NULL OR v_type IN ('application', 'quiz', 'decision') THEN
      RETURN NEW;
    END IF;

    v_done := public.assessment_step_completion(
      NEW.id, NEW.phase, v_type, NEW.status::text, NEW.phase,
      public.assessment_notes_object(NEW.notes), NEW.voice_interview_result);
    IF NOT COALESCE((v_done ->> 'result_on_file')::boolean, false) THEN
      RETURN NEW;  -- nothing to reopen: they are simply on this step
    END IF;

    INSERT INTO public.assessment_step_reopens (application_id, step_id, job_id, reopened_at, reopened_by, reopen_count)
    VALUES (NEW.id, NEW.phase, NEW.job_id, now(), v_by, 1)
    ON CONFLICT (application_id, step_id) DO UPDATE
      SET reopened_at = now(),
          reopened_by = EXCLUDED.reopened_by,
          job_id = EXCLUDED.job_id,
          reopen_count = public.assessment_step_reopens.reopen_count + 1;

    -- An attempt still open for this step belongs to the result on file.
    -- Its end is its last activity, which is before the reopen.
    UPDATE public.assessment_sessions s
       SET status = 'completed',
           end_reason = COALESCE(s.end_reason, 'result_recorded'),
           ended_at = COALESCE(s.ended_at, s.last_activity_at),
           hidden_at = NULL
     WHERE s.application_id = NEW.id AND s.step_id = NEW.phase AND s.status IN ('active', 'abandoned');
  EXCEPTION WHEN others THEN
    RAISE LOG 'assessment_step_reopened skipped for application %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_step_reopened ON public.applications;
CREATE TRIGGER assessment_step_reopened
  AFTER UPDATE OF phase, status ON public.applications
  FOR EACH ROW
  WHEN (NEW.status = 'pending' AND NEW.phase IS NOT NULL
        AND (OLD.phase IS DISTINCT FROM NEW.phase OR OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION public.assessment_step_reopened();


-- ---------------------------------------------------------------------------
-- 14. For a future cron: mark long-quiet sessions as left.
-- ---------------------------------------------------------------------------
-- Not scheduled (pg_cron is not installed; enabling it is the owner's call).
-- The staff UI already reads a session quiet for 10 minutes as "left"; this
-- only makes it stick, after p_idle_minutes (default 30, at least 10). A
-- session it marks comes back to life if the applicant returns.
-- A quiet session whose step is FINISHED (its result is on file, recorded by
-- a path that did not close the session) is not "left": it is completed
-- with end_reason result_recorded, as start_assessment_session would.
-- A grading claim older than 7 minutes (its request died) is expired as
-- start and the heartbeat expire it (assessment_expire_stale_claim): failed,
-- or completed when the result landed.
-- Returns how many sessions it changed (all three kinds).
CREATE OR REPLACE FUNCTION public.mark_stale_assessment_sessions(p_idle_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_left    uuid[];
  v_done    uuid[];
  v_claim   uuid;
  v_expired integer := 0;
BEGIN
  FOR v_claim IN
    SELECT s.id FROM public.assessment_sessions s
     WHERE s.status = 'grading' AND s.updated_at < now() - interval '7 minutes'
  LOOP
    IF public.assessment_expire_stale_claim(v_claim) IS DISTINCT FROM 'grading' THEN
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  WITH stale AS (
    SELECT s.id,
           COALESCE((public.assessment_step_completion(
             s.application_id, s.step_id, s.step_type, a.status::text, a.phase,
             public.assessment_notes_object(a.notes), a.voice_interview_result) ->> 'finished')::boolean, false) AS finished
      FROM public.assessment_sessions s
      JOIN public.applications a ON a.id = s.application_id
     WHERE s.status = 'active'
       AND s.last_activity_at < now() - make_interval(mins => GREATEST(COALESCE(p_idle_minutes, 30), 10))
  ),
  done AS (
    UPDATE public.assessment_sessions s
       SET status = 'completed', end_reason = 'result_recorded',
           ended_at = COALESCE(s.ended_at, s.last_activity_at), hidden_at = NULL
      FROM stale
     WHERE s.id = stale.id AND stale.finished AND s.status = 'active'
    RETURNING s.id
  ),
  gone AS (
    UPDATE public.assessment_sessions s
       SET status = 'abandoned', end_reason = 'left', ended_at = s.last_activity_at
      FROM stale
     WHERE s.id = stale.id AND NOT stale.finished AND s.status = 'active'
    RETURNING s.id
  )
  SELECT (SELECT array_agg(id) FROM done), (SELECT array_agg(id) FROM gone)
    INTO v_done, v_left;

  IF v_left IS NOT NULL THEN
    INSERT INTO public.assessment_events (session_id, kind, detail)
    SELECT unnest(v_left), 'system', jsonb_build_object('what', 'marked_left');
  END IF;

  RETURN COALESCE(cardinality(v_left), 0) + COALESCE(cardinality(v_done), 0) + v_expired;
END;
$$;


-- ---------------------------------------------------------------------------
-- 15. Privileges and RLS: staff read, nobody else; candidates write only
--     through the functions above.
-- ---------------------------------------------------------------------------
ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_step_reopens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.assessment_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.assessment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.assessment_step_reopens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assessment_sessions TO authenticated;
GRANT SELECT ON TABLE public.assessment_events TO authenticated;
GRANT SELECT ON TABLE public.assessment_step_reopens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_step_reopens TO service_role;
REVOKE ALL ON SEQUENCE public.assessment_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assessment_events_id_seq TO service_role;

DROP POLICY IF EXISTS "Job owners and team members can read assessment sessions" ON public.assessment_sessions;
CREATE POLICY "Job owners and team members can read assessment sessions"
  ON public.assessment_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Job owners and team members can read assessment events" ON public.assessment_events;
CREATE POLICY "Job owners and team members can read assessment events"
  ON public.assessment_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Job owners and team members can read step reopens" ON public.assessment_step_reopens;
CREATE POLICY "Job owners and team members can read step reopens"
  ON public.assessment_step_reopens
  FOR SELECT
  TO authenticated
  USING (
    public.is_job_owner(job_id, (SELECT auth.uid()))
    OR public.is_active_team_member_for_job(job_id, (SELECT auth.uid()))
  );

-- The applicant's own functions.
REVOKE ALL ON FUNCTION public.start_assessment_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_assessment_session(uuid, boolean, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_integrity_events(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_application_draft(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_quiz_answer(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_assessment_session(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_assessment_session(uuid, boolean, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_integrity_events(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_application_draft(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quiz_answer(uuid, text, jsonb, timestamptz) TO authenticated, service_role;

-- Server-only.
REVOKE ALL ON FUNCTION public.open_assessment_session(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_stale_assessment_sessions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_integrity_alert(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_step_access(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_step_completion(uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_session_for_write(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_expire_stale_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_session_payload(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_journey(jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_notes_object(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_jsonb_truthy(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_duration_text(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_assessment_session(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_stale_assessment_sessions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_integrity_alert(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_step_access(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_step_completion(uuid, text, text, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_session_for_write(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_expire_stale_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_session_payload(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_journey(jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_notes_object(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_jsonb_truthy(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assessment_duration_text(bigint) TO service_role;

-- Trigger functions are never called directly.
REVOKE ALL ON FUNCTION public.assessment_sessions_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_events_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_events_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_application_form_submitted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_quiz_result_landed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assessment_step_reopened() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifications_grouped_cards_server_only() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.start_assessment_session(uuid, text) IS
  'Applicant only. Opens or resumes their session for a step they have reached: {session_id, status, attempt, started_at, progress, integrity, turns[candidate/assistant only], draft (form), quiz (answers, shown_at), finished, resumed, server_now}. Never returns grading or context. docs/ASSESSMENT-RECORD.md.';
COMMENT ON FUNCTION public.touch_assessment_session(uuid, boolean, jsonb, boolean) IS
  'Applicant only. Heartbeat: last_heartbeat_at; hidden_at (p_hidden); activity only when visible again (p_hidden false) or the page reports input since the last beat (p_active true); p_progress replaces progress.client. Returns the session status (updated=false when it is no longer active).';
COMMENT ON FUNCTION public.record_integrity_events(uuid, text, jsonb) IS
  'Applicant only. Stores copy/paste, leaving-the-window (with duration), screenshot and similar events with server time, keeps integrity_summary, and updates one live bell card per recipient (none for the application form). 100 per call, 500 per session.';
COMMENT ON FUNCTION public.save_application_draft(uuid, jsonb) IS
  'Applicant only, while the form is unsent. Stores the draft answers on the application session and its progress {answered, total}.';
COMMENT ON FUNCTION public.record_quiz_answer(uuid, text, jsonb, timestamptz) IS
  'Applicant only. p_answer NULL records the question as shown; otherwise records the answer with seconds on the question (server clock). Never computes or returns correctness.';
COMMENT ON FUNCTION public.open_assessment_session(uuid, text, uuid) IS
  'Service role only: start_assessment_session for a user id the edge function has already verified from the JWT.';
COMMENT ON FUNCTION public.mark_stale_assessment_sessions(integer) IS
  'Service role only, for a future cron: marks active sessions quiet for p_idle_minutes (default 30, min 10) as abandoned/left, or completed/result_recorded when their step is already finished, and expires grading claims older than 7 minutes (assessment_expire_stale_claim). Returns how many it changed.';
COMMENT ON FUNCTION public.assessment_expire_stale_claim(uuid) IS
  'Internal: a grading claim untouched for 7 minutes (its request died) becomes failed {last_error: claim_expired}, so the next submit grades it, or completed/result_recorded when the step is finished. Younger claims are left alone. Called by start/open, the heartbeat and the sweep. Returns the status afterwards.';
COMMENT ON FUNCTION public.assessment_step_completion(uuid, text, text, text, text, jsonb, jsonb) IS
  'Internal: {result_on_file, reopened, finished} for one step. A step is reopened only by a staff marker (assessment_step_reopens) newer than its result.';
COMMENT ON FUNCTION public.assessment_integrity_alert(uuid) IS
  'Service role only (record_integrity_events calls it): rewrites the live integrity bell card for one session.';


-- ---------------------------------------------------------------------------
-- 16. Realtime: staff screens follow sessions live (events are fetched on
--     demand when a session row changes).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'assessment_sessions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assessment_sessions;
  END IF;
END;
$$;
