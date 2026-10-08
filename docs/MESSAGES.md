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
