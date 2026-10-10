# Request documents

Asking an applicant for an ID, an NBI clearance, proof of address, their TIN or
the email they are paid on, and reading what comes back. Built 2026-10-10.

The owner, that day: "how do I ask them for things like their driver license
or a government ID? And banking information for salary ... and have it
encrypted in some way?"

## IDs are deleted 24 hours after you first open them (2026-10-10)

The owner: "the best thing is we don't save it ... we take it, we pass it to
the employer, and then we delete it within 24 hours." Chosen from a mock-up:
a government ID, NBI clearance or proof of address is deleted **24 hours after
someone on the hiring side first opens it**, or **7 days after it was sent**
if nobody does. Before this, an ID was kept 30 days after approval, and one
never approved was kept for good.

- `document_requests.team_opened_at` (migration
  `20261011130000_id_papers_deleted_after_opening.sql`): set by
  `requested-document-url` the first time the hiring side opens the file, only
  while unset (opening it again never moves the deletion). No client can set
  or clear it; a new file from the applicant starts it over.
- `document-cleanup` runs **every hour** (was daily), so 24 hours means 24.
- The team sees "Deleted in 23 h" and **Download a copy** (a link that saves
  the file). The applicant is told the same rule when they upload, and how
  long is left once it has been seen. The privacy page says it, and that a
  copy the team keeps is theirs to look after.

**Asking from the Documents page.** "Ask for ID or papers" opens the same
request box with its own applicant picker, and an **ID & papers** list shows
everything asked of anyone (the owner: "I still don't know how do I request
... a government ID"). The six AI-written types behind "+ New document" are
gone; "Upload a file to sign" takes a PDF of his own (an NDA, a contract).

**Later the same day:**
- **Live on both sides.** The staff live sync (`useEmployerLiveSync`, wave 5)
  listens to `document_requests` and `documents` on channels of their own: an
  ID sent or a letter signed refreshes the open screens at once (the owner:
  "I sent the ID, it didn't refresh here"). The applicant's Your documents
  listens to `documents` (`useDocumentsLive`); their requests were already live.
- **NBI clearance is not ticked by default** in the Hire box (the owner: "Why
  did I ask for NBI clearance? What is that?"). It is the Philippines' police
  record certificate; it stays on the list to tick.
- **Cancel request** for anything nobody has answered yet (owner only). The
  database now allows deleting a request only while it holds no file and no
  typed answer (migration `20261011140000_cancel_only_unanswered_requests.sql`):
  before, deleting a request with an uploaded ID left the photo in the bucket,
  out of the 24-hour cleanup's sight.

## What each side sees

**The hiring team**, on an applicant's page (`src/cockpit/pages/CandidateDetail.tsx`):

- A **Request documents** button once the applicant is offered or hired.
- A **Documents** section from the interview stage on (earlier only if
  something was already asked): each request, where it stands, **Open** for a
  file, **Approve** / **Ask again** (with a reason) for anything sent. A TIN
  shows only its last four digits. An ID says when it is deleted.
- The dialog (`RequestDocumentsDialog.tsx`): a short Philippines-first list
  (`src/lib/documentRequests.ts`), "Something else", due in 3/5/7 days, a note,
  a preview of what the applicant will be asked, and two presses to send.
  Anything already asked and not yet approved cannot be asked twice.

**The applicant**, on Your documents (`src/pages/MyDocuments.tsx`) and on their
application page: each request with **Upload** (a photo or PDF) or **Type it**
(a TIN, or the email they use on Wise or PayPal), the reason when asked again,
and when their ID will be deleted. They get a bell note and one email.

**No bank account numbers, ever.** The applicant gives the email they use on
Wise or PayPal and is paid there. A test fails if a bank kind is added.

## How it is kept safe

| | |
|---|---|
| Files | Private bucket `requested-documents`, in the applicant's own folder (`<applicant id>/<request id>/…`). |
| Opening a file | Only through the `requested-document-url` function: signed-in caller must be the applicant, the job's owner or an active team member on that job; a five-minute link to that request's own file; every opening is written to `document_request_events`. The old employers' storage rule (a `LIKE` match that could be pointed at another folder) is dropped. |
| Who may change what | `document_requests_guard_insert` / `_update` (migration `20261010150000_document_requests_safe.sql`). A new request is always pending and empty, for the application's applicant, filed under the job's owner. The applicant may only send their file or typed answer and mark it sent, never once approved. The hiring side may only approve or ask again, once something is sent, and never changes what the applicant sent. |
| Deletion | `document-cleanup`, every hour at :17 (pg_cron; daily until 2026-10-10). A government ID, NBI clearance or proof of address loses its file 24 hours after the hiring side first opened it (`team_opened_at`), or 7 days after it was sent if nobody did (the request keeps `file_deleted_at`); anything else in that request's folder goes with it. A file sent again replaces the earlier one at once and starts its own clock. Typed answers are kept. |
| The cleanup's secret | Made inside the database, kept only in Vault (`document_cleanup_secret`), checked by `document_cleanup_secret_matches` (service role only). Not in the repo or any function setting. |

The Privacy Policy says all of this (`src/content/legal.ts`), and
`scripts/legal_pages.test.mjs` fails if the hours, days or kinds drift from the code.

## Tests

- `scripts/document_requests.test.mjs`: the rules, the cleanup function's list
  and days, the function's checks, the applicant's screens.
- `scripts/document_requests.pglite.test.mjs`: a real Postgres with the live
  policies: every forgery above is tried and refused.

## Trying it without a real applicant

- **Offline, nothing sent:** `/applicants/30000000-0000-4000-8000-000000000023?__preview=1&__previewRole=employer&__previewScenario=zulu&__previewRequests=sent`
  (the hiring side), and `/my-documents?__preview=1&__previewRole=candidate&__previewRequests=sent`
  (the applicant's). Emails are kept on `window.__previewEmails`.
- **For real:** make a second account of your own as an applicant, apply to
  your own job, move it to Offer, and send the request to yourself.

## Hiring: the offer letter, then one welcome email (2026-10-10)

The owner, the same day: "there's not a clear indication what will it do when
I do move her ... we're not dual click on hiring her ... when I say hire, she
will actually get a nice congratulations email and it will say things like
documents requested, please log in to your HireFlow to submit those
documentation and sign stuff." Approved from the "Interview to First Day"
mock-up.

| You press | What happens | They get |
|---|---|---|
| **Send offer letter** (the main button once the interview is done; replaces "Move to Offer" on the applicant page and the Dashboard) | The guided offer letter opens; sending it moves them to Offer | "Congratulations, you've been selected! Your offer from {business}" (since 2026-10-10: the email says first that they were chosen, then asks them to sign), a link to read and sign it |
| **Hire** (at Offer) | `HireDialog`: ID, NBI clearance and payment email ticked; due in 3/5/7 days; the welcome email shown as it will read | ONE email, "Welcome to {business}": congratulations, then "Before your first day, please:" with *Sign your offer letter* (only if unsigned) and each document |

- **Never twice.** The button locks before anything is awaited; the hire is a
  conditional update (`status not in (hired, rejected)`), so a second press,
  a second tab or a retry changes nothing and sends nothing
  (`src/cockpit/hooks/useHire.ts`).
- **The list is the database's.** `send-notification-email` reads the
  application's open requests and its newest offer letter
  (`_shared/welcomeTodo.ts`) for `status_hired`, `document_requested` and
  `document_sent`; the request may only name the application, and only one
  that links the sender to that applicant (`_shared/notificationAccess.ts`).
  The dialog's preview uses the same lines (`todoLine` in
  `src/lib/documentRequests.ts`); a test holds the two together.
- After the interview, "Set up interview" becomes "Another interview"; the
  decision card says "Interview done" with the day.
- Offline: `?__previewHiring=done,offer` (the interview held yesterday; an
  unsigned offer letter on the applicant at Offer).
