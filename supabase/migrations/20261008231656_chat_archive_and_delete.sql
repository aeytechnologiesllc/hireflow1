-- ============================================================================
-- Archive a chat, and delete one from your own side (2026-10-08).
-- ============================================================================
-- The owner, on his second live hiring day, looking at Messages with a chat
-- from someone he had just declined: "there's no button for me to archive
-- the chat, there's no filters of that either, and delete as well,
-- permanently delete the chat."
--
-- And, while it was being built: "Make sure that applicant cannot delete any
-- messages. They can delete it from their side, but it will still show on my
-- side."
--
-- Both are marks a person puts on THEIR OWN view of a chat. Neither tells the
-- other side anything, and neither removes a row from public.messages:
--
--   Archive: the chat leaves the inbox and sits under "Archived". It comes
--     back by itself when the other person writes again (the page compares
--     archived_at with the newest message that came in), or when it is moved
--     back by hand.
--
--   Delete: every message in the chat up to now stops existing for the
--     person who deleted it, for good: there is no way to set cleared_at
--     back. The other person keeps their own copy of what was said, as in
--     every chat app, so an applicant never loses what a hiring team told
--     them. If they write again, the chat starts over from that message.
--
-- Why delete is enforced here and not left to the page: a chat that was
-- "deleted" but still came back from the API would only be hidden. The
-- RESTRICTIVE policy in section 3 makes the database itself stop returning
-- those rows to that person: the list, the open chat, the unread count and
-- the live feed all agree without each having to remember to filter.
--
-- "The other person keeps their own copy" was not true of the database
-- before this migration: the policy "Users can delete their own messages"
-- let EITHER side of a chat remove any row in it through the API, the other
-- person's messages included, so an applicant could erase what a hiring team
-- had written to them from the team's own Messages. No screen did it, but
-- nothing stopped it. Section 4 replaces that policy with a narrow one.
--
-- Applying it while people are writing to each other: the locks this takes
-- on tables that already exist are the policies' on public.messages
-- (sections 3 and 4) and the foreign keys' on auth.users (section 5, last),
-- each for an instant. lock_timeout makes it give up after 3 seconds rather
-- than queue every message behind it; if it times out, nothing is applied
-- and it is simply run again. Every statement can be re-run.
--
-- What this migration adds, and nothing else:
--
--   1. public.message_thread_state: one row per (person, the other person
--      in the chat): when they archived it, and the moment up to which they
--      deleted it. RLS: each person reads only their own rows. Nobody writes
--      it directly.
--
--   2. set_chat_state(p_contact_id, p_action): SECURITY DEFINER. 'archive',
--      'unarchive' or 'delete', on the caller's own view of their chat with
--      that person. The person is always the caller, never the request. A
--      chat the caller is not in (or a person who does not exist) reads the
--      same: refused.
--
--   3. One RESTRICTIVE select policy on public.messages, for signed-in
--      people: a message at or before the moment its reader deleted that
--      chat is not returned to them. It narrows the policies that let a
--      person read and replaces none of them. anon is not named, so nothing
--      changes for it.
--
--   4. Who may remove a row from public.messages: "Users can delete their
--      own messages" (either side, any row of the chat) is replaced by "Job
--      owners can delete the messages of their own applications". An
--      applicant can no longer remove any message at all; neither can
--      someone on a hiring team; the job's owner can still clear the
--      messages of an application they are deleting (the one place the app
--      ever did it). Deleting an account still takes its messages with it
--      (the foreign keys' cascade, which no policy governs).
--
--      Nothing else on public.messages: no column, no trigger, and the four
--      policies for reading, sending and marking read are as they were.
--
--   5. The foreign keys, last: a deleted account takes its marks with it.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── 1. The marks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_thread_state (
  user_id     uuid NOT NULL,
  contact_id  uuid NOT NULL,
  archived_at timestamptz NULL,
  cleared_at  timestamptz NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id),
  -- A mark against yourself would match every message you ever sent or got.
  CONSTRAINT message_thread_state_not_self CHECK (user_id <> contact_id)
);

CREATE INDEX IF NOT EXISTS message_thread_state_contact_idx
  ON public.message_thread_state (contact_id);

COMMENT ON TABLE public.message_thread_state IS
  'A person''s own marks on a chat (Messages): archived_at, and cleared_at, the moment up to which they deleted it from their side. Readable only by the person whose marks they are; written only through set_chat_state. Never removes a row from public.messages: the other person keeps their copy.';

ALTER TABLE public.message_thread_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.message_thread_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.message_thread_state TO authenticated;
GRANT ALL ON public.message_thread_state TO service_role;

DROP POLICY IF EXISTS "Each person reads their own chat marks" ON public.message_thread_state;
CREATE POLICY "Each person reads their own chat marks"
  ON public.message_thread_state FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── 2. Archive, move back, delete ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_chat_state(p_contact_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_state public.message_thread_state;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_chat_state: not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('archive', 'unarchive', 'delete') THEN
    RAISE EXCEPTION 'set_chat_state: archive, unarchive or delete' USING ERRCODE = '22023';
  END IF;

  -- Only a chat the caller is really in: a message between the two of them,
  -- or (for someone on a hiring team) between their employer and that
  -- person. Nobody, nothing said, and somebody else's chat read the same.
  IF p_contact_id IS NULL OR p_contact_id = v_uid OR NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE (m.sender_id = v_uid AND m.receiver_id = p_contact_id)
        OR (m.sender_id = p_contact_id AND m.receiver_id = v_uid)
        OR EXISTS (
             SELECT 1 FROM public.team_members tm
              WHERE tm.user_id = v_uid AND tm.status = 'active'
                AND tm.employer_id <> p_contact_id
                AND ((m.sender_id = tm.employer_id AND m.receiver_id = p_contact_id)
                  OR (m.sender_id = p_contact_id AND m.receiver_id = tm.employer_id))
           )
  ) THEN
    RAISE EXCEPTION 'set_chat_state: not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.message_thread_state AS s (user_id, contact_id, archived_at, cleared_at, updated_at)
  VALUES (
    v_uid,
    p_contact_id,
    CASE WHEN p_action = 'archive' THEN v_now END,
    CASE WHEN p_action = 'delete' THEN v_now END,
    v_now
  )
  ON CONFLICT (user_id, contact_id) DO UPDATE SET
    -- A deleted chat is not also archived: whatever comes next is new.
    archived_at = CASE p_action WHEN 'archive' THEN v_now WHEN 'unarchive' THEN NULL WHEN 'delete' THEN NULL END,
    -- Only ever forwards. Nothing here, or anywhere, sets it back.
    cleared_at  = CASE WHEN p_action = 'delete' THEN v_now ELSE s.cleared_at END,
    updated_at  = v_now
  RETURNING * INTO v_state;

  RETURN jsonb_build_object(
    'contact_id', v_state.contact_id,
    'archived_at', v_state.archived_at,
    'cleared_at', v_state.cleared_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_chat_state(uuid, text) IS
  'Archive (''archive''), move back (''unarchive'') or delete from the caller''s own side (''delete'') their chat with one person. The marks are the caller''s own; the other person is told nothing and keeps every message. Refused (42501) unless the caller is in that chat: a message between the two, or between the caller''s employer and that person for an active team member. Delete only moves cleared_at forwards.';

REVOKE ALL ON FUNCTION public.set_chat_state(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_state(uuid, text) TO authenticated, service_role;

-- ── 3. A deleted chat stays deleted, for the person who deleted it ─────────
--
-- RESTRICTIVE: it is ANDed with whichever existing policy lets a person read
-- a message, and can only take rows away. TO authenticated: it does not
-- apply to anon (who is let through by no policy anyway), so anon never
-- needs to read message_thread_state.

DROP POLICY IF EXISTS "A chat someone deleted stays deleted for them" ON public.messages;
CREATE POLICY "A chat someone deleted stays deleted for them"
  ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.message_thread_state s
       WHERE s.user_id = (SELECT auth.uid())
         AND s.cleared_at IS NOT NULL
         AND s.cleared_at >= messages.created_at
         AND s.contact_id IN (messages.sender_id, messages.receiver_id)
    )
  );

-- ── 4. Nobody removes the other person's copy ──────────────────────────────
--
-- Before: either side of a chat could DELETE any row in it. After: only the
-- owner of the job an application belongs to, and only that application's
-- messages that they sent or received. An applicant is never that, so an
-- applicant can remove nothing; their own-side delete (section 2) is the
-- only delete they have, and it leaves the hiring team's Messages whole.

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
DROP POLICY IF EXISTS "Job owners can delete the messages of their own applications" ON public.messages;
CREATE POLICY "Job owners can delete the messages of their own applications"
  ON public.messages FOR DELETE TO authenticated
  USING (
    application_id IS NOT NULL
    AND ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id)
    AND EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = messages.application_id
         AND public.is_job_owner(a.job_id, (SELECT auth.uid()))
    )
  );

-- ── 5. The foreign keys, last ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_thread_state_user_id_fkey') THEN
    ALTER TABLE public.message_thread_state
      ADD CONSTRAINT message_thread_state_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_thread_state_contact_id_fkey') THEN
    ALTER TABLE public.message_thread_state
      ADD CONSTRAINT message_thread_state_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;
