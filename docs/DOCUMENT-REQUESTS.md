# Request documents

Asking an applicant for an ID, an NBI clearance, proof of address, their TIN or
the email they are paid on, and reading what comes back. Built 2026-10-10.

The owner, that day: "how do I ask them for things like their driver license
or a government ID? And banking information for salary ... and have it
encrypted in some way?"

## What each side sees

**The hiring team**, on an applicant's page (`src/cockpit/pages/CandidateDetail.tsx`):

- A **Request documents** button once the applicant is offered or hired.
- A **Documents** section from the interview stage on (earlier only if
  something was already asked): each request, where it stands, **Open** for a
  file, **Approve** / **Ask again** (with a reason) for anything sent. A TIN
  shows only its last four digits. An approved ID says the day it is deleted.
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
| Deletion | `document-cleanup`, daily at 03:17 UTC (pg_cron, migration `20261010150100`). An approved government ID, NBI clearance or proof of address loses its file 30 days after approval (the request keeps `file_deleted_at`); anything else in that request's folder goes with it; an ID asked for again and never re-sent loses its file 30 days after the ask. A file sent again replaces the earlier one at once. Typed answers are kept. |
| The cleanup's secret | Made inside the database, kept only in Vault (`document_cleanup_secret`), checked by `document_cleanup_secret_matches` (service role only). Not in the repo or any function setting. |

The Privacy Policy says all of this (`src/content/legal.ts`), and
`scripts/legal_pages.test.mjs` fails if the days or kinds drift from the code.

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
