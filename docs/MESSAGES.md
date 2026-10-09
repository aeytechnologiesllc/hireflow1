# Messages

One page, `src/cockpit/pages/Messages.tsx`, for both sides: the hiring team
writing to an applicant, and an applicant writing to the team. The threads
are read and written through `src/hooks/useMessages.ts`.

## What a message does

- It is stored on the application, so the conversation sits beside the
  applicant's tests and the team's notes.
- The other side is told in the app (their bell), and **by email**: "New
  message regarding your application" from the hiring address, with the
  first 100 characters and a button to read the rest
  (`send-notification-email`, `new_message`). Not sent if they turned those
  emails off. The box says so under it, in one line.
- That email is why the app is the place to answer an applicant: the owner
  cannot reply from the hiring address in his own mail (2026-10-08), and both
  interview emails now send questions here (docs/INTERVIEWS.md).

## Ready-made replies (2026-10-09)

The owner, looking at a declined applicant asking when they would hear back:
"without using AI so we don't burn credits, is it possible to allow employers
to draft a message to answer basic questions like that ... she's already
been declined maybe."

- **No AI, no request, no cost.** A few replies written once, by hand
  (`src/cockpit/lib/quickReplies.ts`), chosen by where the applicant stands:
  declined ("Tell them the decision"), finished and waiting ("Still
  reviewing"), tests still to do ("Steps still to do"), invited ("About the
  interview"), and always "Got your message".
- **A tap fills the message box and sends nothing.** The buttons sit above
  the box while it is empty and go away once there are words in it; the reply
  can be changed before Send, which is the ordinary Send.
- The decision is told in the decline note's own words
  (`src/lib/declineNote.ts`), so someone told twice is told the same thing:
  no reason, a door left open. No reply promises a date; what is true for
  everyone is "everyone who finishes every step gets a yes or no by email".
- Only the hiring team sees them. An applicant's Messages has none.

Proof: `scripts/quick_replies.test.mjs`.

## On a phone (2026-10-09)

The owner, on his Android phone: "the biggest bug on the phone, the
messaging tab. You can't scroll, doesn't work."

- **Why.** On a wide screen the chat card has a fixed height and the messages
  scroll inside it. On a phone the card is as tall as the conversation and the
  page scrolls. The message area wore `.ck-scroll`, which told the browser
  "hold a swipe to yourself" (`overscroll-behavior-y: contain`). Since Chrome
  144 a box holds swipes even when it has nothing of its own to scroll, so a
  finger that started on a message, most of the screen, moved nothing. The
  same component is the applicant's Messages, so they had it too.
- **The fix is in the class, not the page**: `.ck-scroll` no longer holds
  swipes. Only the shell's own `<main>` and a dialog's body do
  (`cockpit.css`). `.scroll-perf` (the sign-in pages, "New job") had the same
  cause and the same fix. The rule, the list of the few places allowed to hold
  swipes, and what else the sweep found are in
  `scripts/guards/no-scroll-traps.mjs`.
- **After a send, the page follows the end of the chat** for a few seconds, so
  the line just sent does not push the reply box down under the tab bar. Only
  after a send: a message arriving while you read further up moves nothing.
- **A chat stays on its newest message while the page settles.** The first
  paint is in the stand-in font; when the real one arrives the lines wrap
  again and the chat gets taller, which left the newest message cut off under
  the reply box on a computer (a picture loading late does the same). For
  2.5 seconds after a chat is drawn its end is followed, unless the reader has
  already scrolled.
- **The reply box has 16px text on a phone** (14.5px from tablet width up): an
  iPhone zooms the whole page in when you tap a field with smaller text. The
  note box and the applicant search follow the same rule.

Still true, and not changed here: on a phone a chat opens at its **oldest**
message and the reply box is at the end of the page, after every message.
That wants its own design (a list, then a full-screen chat), shown to the
owner first.

Proof: the "On a phone" block of `scripts/messages_composer.test.mjs`, and the
guard above. In the preview, a chat taller than a phone screen:
`/messages?__preview=1&__previewRole=employer&__previewScenario=zulu&__previewChats=long`.

## The message box (2026-10-08)

The owner pasted a twelve-line reply and could see three lines of it: the
box stopped at four lines and scrolled inside. His words: "this doesn't feel
good when I paste a message in the chat, wherever my message is being
displayed looks kind of small ... make it more modern."

- **One rounded box** holds the words, a one-line hint and Send. It lights up
  as a whole when the cursor is in it (`.ck-composer`, `cockpit.css`).
- **It is as tall as what is in it**: one line when empty, growing with every
  line typed or pasted, up to about half the window (under a third on a
  phone, so Send stays above the keyboard and the tab bar), then it scrolls.
  Measured after every change to the words, however they got there: typing,
  a paste, a send, another thread.
- **Enter sends, Shift+Enter is a new line** (said under the box on a
  computer). A failed send leaves the words in the box.
- **Bubbles** are a size up (14.5px), rounder, and keep line breaks.
- The header reads "final score 78/100", not "sealed 78".

Proof: `scripts/messages_composer.test.mjs`. In the preview:
`/messages?candidate=<id>&__preview=1` (the stand-in client reads a thread's
two-direction filter since this change; before it, the preview could not open
a thread at all).

## Declined, archive and delete (2026-10-08)

The owner, looking at a chat with someone he had just declined: "at least on
the messages should show ... it doesn't show that he has been declined here
... there's no button for me to archive the chat, there's no filters of that
either, and delete as well, permanently delete the chat." He wanted the chat
itself left open ("I might want to see it").

All three are on the hiring team's side only. An applicant's Messages has
none of them.

- **Where the applicant stands.** A chat shows the applicants list's own
  chip once the application is decided: Interview, Offer, Hired or Declined
  (`chatStatusChip`, `src/cockpit/lib/chatMarks.ts`). It is on the row in the
  list and beside the name on the open chat. Nothing about the message box
  depends on it: a declined applicant can still be read and written to.
- **Archive.** A button on the open chat. The chat leaves the inbox and sits
  under the **Archived** filter; All, Needs you and Caught up are the inbox
  and do not count it. It comes back by itself when the other person writes
  again (the page compares `archived_at` with the newest message that came
  in), so an archived applicant who writes is never missed. "Move to inbox"
  brings it back by hand; the toast after archiving offers Undo.
- **Delete.** A button on the open chat, then a confirm that says what goes
  and what stays. Every message in the chat up to that moment is gone from
  the deleter's Messages for good: there is no undo, and nothing anywhere can
  set it back. **The other person keeps their own copy**, as in every chat
  app, so an applicant never loses what the team told them, and their
  application is not touched. If they write again, a new chat starts from
  that message.

How it is kept (`supabase/migrations/*_chat_archive_and_delete.sql`):

- `public.message_thread_state`: one row per (person, the other person in
  the chat) with `archived_at` and `cleared_at`. Each person reads only their
  own rows; nobody writes the table directly.
- `set_chat_state(p_contact_id, p_action)`: `archive`, `unarchive` or
  `delete`, on the caller's own view of a chat they are really in. `delete`
  only ever moves `cleared_at` forwards.
- One RESTRICTIVE select policy on `public.messages`: a message at or before
  the moment its reader deleted that chat is not returned to them. So the
  database does the hiding, not the page: the list, the open chat, the
  unread count and the live feed all agree. It narrows the policies that let
  a person read and replaces none of them; no row ever leaves
  `public.messages` because of it.
- The marks are each person's own. With a hiring team of several, one
  person archiving or deleting a chat changes only their own Messages.

**Nobody removes the other person's copy.** The owner, while this was being
built: "Make sure that applicant cannot delete any messages. They can delete
it from their side, but it will still show on my side." Before this change
that was not true of the database: the policy "Users can delete their own
messages" let either side of a chat remove any row in it through the API,
the other person's messages included (no screen did it). The same migration
replaces it with "Job owners can delete the messages of their own
applications": an applicant can remove no message at all, neither can
someone on a hiring team, and the job's owner can still clear the messages
of an application they are deleting (`useDeleteApplication`, the one place
the app ever did it). The unused `useDeleteConversation` hook, which removed
a whole chat for both sides, is gone. An applicant's Messages has no delete
button today; `set_chat_state` already lets a person delete their own side
only, so one can be added without touching the database.

Proof: `scripts/chat_marks.test.mjs` (the rules, the words, the wiring) and
`scripts/chat_archive_delete.pglite.test.mjs` (a real Postgres with the live
messages policies: who may, that a deleted chat stops coming back in every
way it could be asked for, that the other person still reads all of it, and
that an applicant can remove no message by any route). In the preview: `/messages?__preview=1&__previewScenario=zulu&__previewChats=some`
starts with four chats: one declined, one invited to interview and unread,
one caught up, one already archived.
