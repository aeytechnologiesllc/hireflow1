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
  When it cannot read the requests ("ID papers are not being deleted"), or
  cannot delete an ID file that is due or a file of a deleted request ("ID
  papers were not deleted on time"), the platform admins get one in-app notice
  a day for each; it tries again on every run.
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
- **Filters on the Documents page** (from the approved mock-up;
  `src/cockpit/lib/documentFilters.ts`, `scripts/document_filters.test.mjs`):
  search a name or a document; status with counts (Your turn / Waiting on
  them / Done / Closed: declined, withdrawn, voided and expired unsigned); kind
  (Offer letters / ID & papers / Files to sign); job (when there is more than
  one); order (newest, oldest, due soonest). It opens on "Your turn" while
  something waits on him, else on All.

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
| Opening a file | Only through the `requested-document-url` function: signed-in caller must be the applicant, the job's owner or an active team member on that job; a five-minute link to that request's own file, and only when it is in that request's own folder, `<applicant id>/<request id>/` (since the thirteenth Phase 5 review; it was anywhere in the applicant's folder, which holds every business's papers for them, so one slip in the database's guard would have let a second business's request open the first's copy of an ID); every opening is written to `document_request_events`. The old employers' storage rule (a `LIKE` match that could be pointed at another folder) is dropped. |
| Who may change what | `document_requests_guard_insert` / `_update` (migration `20261010150000_document_requests_safe.sql`). A new request is always pending and empty, for the application's applicant, filed under the job's owner. The applicant may only send their file or typed answer and mark it sent, never once approved. The hiring side may only approve or ask again, once something is sent, and never changes what the applicant sent. Since the twelfth Phase 5 review (`20261025610000`) the applicant links only their own upload for that request: `<their id>/<request id>/<one plain name>`, a file storage holds under exactly that name (it was any plain path in their folder, with no upload, which let one account fill the deleted requests' queue). The thirteenth Phase 5 review found these rules held against their latest definitions only by the link clause: nine one-line weakenings (a business setting when it first opened an ID, when it was sent or asked for, that its file was deleted, which file a request holds or whom it is for; a re-sent ID keeping the old opening; a new request inserted already opened or carrying a file) passed every test. Each now fails `scripts/launch_locks_behaviour.pglite.test.mjs` section 19, which applies every migration. |
| How much a business may ask | At most 50 requests on one application and 300 an hour for a business, its team included (`document_requests_limit`, BEFORE INSERT, `20261025610000`; the business is read from the application's job; the server's own inserts are not counted). Past either the insert is refused (`too_many_requests_on_application`, `too_many_document_requests`) and the request screen says so plainly (`requestLimitMessage` in `src/lib/documentRequests.ts`). The twelfth Phase 5 review: nothing limited it, and 5,000 went in one request. |
| Deletion | `document-cleanup`, every hour at :17 (pg_cron; daily until 2026-10-10). A government ID, NBI clearance or proof of address loses its file 24 hours after the hiring side first opened it (`team_opened_at`), or 7 days after it was sent if nobody did (the request keeps `file_deleted_at`); anything else in that request's folder goes with it. A file sent again replaces the earlier one at once and starts its own clock: the upload dialog deletes the earlier file, and since the thirteenth Phase 5 review (`20261025640000`) the database also queues it in `document_file_trash` when the link is replaced or cleared (where storage holds it, naming the business, at most 50 a day for one applicant), so it goes in the next hourly run even when the browser's delete does not; for a request still open the cleanup deletes only that file, never the folder or the file the request links now. Before, an opened ID sent again whose browser delete failed stayed until the new copy's own deadline. Typed answers are kept. A paper named under "Something else" (an ID named there too) is kept until the application is deleted (⋯ → Delete their information, docs/APPLICANTS-LIST.md section 11) or the account is: once anything is sent, its request cannot be deleted on its own, so the Terms and the request screen never say "until you delete it" (the sixth product review; guard `named-papers-kept-until-the-application-goes`). The request screen warns when a paper named there looks like an ID (`looksLikeAnId` in `src/lib/documentRequests.ts`: "Driver’s license" with a curly apostrophe, "Driving licence", "PhilSys card", "SSS card" and "Postal I.D." too since the eleventh Phase 5 review). A request deleted with its application, job or account leaves a note in `document_file_trash` (`document_requests_trash_file`) and the cleanup deletes its file and folder; since `20261025540000` also when the photo went up but its link was never saved (a dropped connection), if storage holds a file in its folder. On a request still open, the upload dialog now removes such a photo itself when saving its link fails (the thirteenth Phase 5 review), once it has read the request back and seen that it does not link it. Since the twelfth Phase 5 review (`20261025610000`) a deleted request leaves a note only for a file storage holds (its link's file, or anything in its folder; when storage cannot be read, a request with a link is noted as before), each note names the business that asked (`employer_id`), and the cleanup reads both lists fairly: the due papers through `document_requests_due_pick(kinds, opened before, sent before)` and the deleted requests' notes through `document_file_trash_fair_pick()` (service role only; each business's oldest first, businesses in turn by when the pick last took them, which it records in `document_cleanup_served`, then the businesses with the fewest waiting first; 200 a run; a note storage refused waits out a back-off). By business, not by applicant: every request is filed under the job's owner, so a flood is one business's, and applicant accounts cost nothing. The review's proof: one business's 5,000 requests on one throwaway applicant, withdrawn, kept a real ID removed through Delete their information in storage for 26 runs (101 after 20,000); now it goes in the first run, and within two after 300 businesses' 20,000. The admins are told once a day when either list backs up ("Files of deleted requests are backing up", "ID papers are waiting past their time"). Many confirmed businesses can still delay one, about a run for every 200 of them ahead (until Turnstile is set up). |
| The cleanup's secret | Made inside the database, kept only in Vault (`document_cleanup_secret`), checked by `document_cleanup_secret_matches` (service role only). Not in the repo or any function setting. |

The Privacy Policy says all of this (`src/content/legal.ts`), and
`scripts/legal_pages.test.mjs` fails if the hours, days or kinds drift from the code.

**An ID photo a request still open never linked (the thirteenth Phase 5
review, finding 2; closed by the twelfth security round, `20261025630000`).**
Its upload went through while both the link's save and the dialog's own removal
failed (the connection dropped for good, or the page was closed in between),
and the applicant never sent it again. The due papers are read by their link,
so nothing on a timer found it. Now, before it picks, `document_requests_due_pick`
looks at each ID request with no link seven days after it was asked for
(`document_requests_sweep_strays`: in the order they were asked for, 5,000 a
run, from where the last run stopped, each request once) and queues each file
storage holds in its own folder, `<applicant>/<request>/`, in
`document_file_trash`, naming the business, as a file sent again is queued; the
same hourly run deletes that file alone (the request is still open, so never
the folder, nor a file it links by then). When storage cannot be read, nothing
is queued and the request is looked at again next run. Left: a photo uploaded
after its request was looked at, still unlinked, stays until the request, its
application or the account is deleted (the folder is queued then), or until the
paper is sent again and that copy is deleted on its own time. And until
Turnstile is set up, many businesses each asking 300 ID papers an hour that
nobody answers can make the look-up run behind (5,000 a run, in the order they
were asked for), which delays such a photo, never a linked paper.
Also left: past 50 sends again in a day, one applicant's earlier copies wait for
their request's own deadline (as before), and a paper named under "Something
else" is kept until its application goes, by the rule above.

## Tests

- `scripts/document_requests.test.mjs`: the rules, the cleanup function's list
  and days, the function's checks, the applicant's screens, the ID warning.
- `scripts/document_requests.pglite.test.mjs`: a real Postgres with the live
  policies: every forgery above is tried and refused.
- `scripts/document_cleanup.test.mjs` (the eleventh Phase 5 review): the real
  `document-cleanup` against a stand-in database and storage: an ID 24 hours
  after opening, a deleted request's file and folder, the removal queue and
  its backlog alert; since the twelfth Phase 5 review also which papers are
  due (the three ID kinds, 24 hours, 7 days, never marked sent), one
  business's 5,000 due or deleted papers never keeping a real ID out of the
  next run, the back-off and both backlog alerts.
  `scripts/launch_locks_behaviour.pglite.test.mjs`, section 10: a
  withdrawal queues its requests' papers; section 16: the limits, the
  applicant's own upload, and the review's flood (5,000, 20,000, 300
  businesses) against both picks; section 17: a paper named under
  "Something else" goes with its application; section 19 (the thirteenth
  Phase 5 review): what no client may change on a request, a new file
  restarting its clock, a new request starting empty and unopened, and
  another business pointing a request at the first's copy of an ID; section
  20: a paper sent again or taken back queues the earlier file.
  `scripts/document_cleanup.test.mjs` also proves that a due paper or a note
  pointing at another request's file never deletes it, and that a file sent
  again goes alone; `scripts/requested_document_url.test.mjs` runs the real
  `requested-document-url`: a request whose link is another request's file
  is answered "Nothing has been sent", and nothing is signed or recorded.

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
| **Hire** (at Offer) | `HireDialog`: ID, NBI clearance and payment email ticked; due in 3/5/7 days; the welcome email shown as it will read | ONE email, "Welcome to {business}": congratulations, then "Before your first day, please:" with *Sign your offer letter* (only while it is theirs to sign: not signed, not withdrawn, not past its date) and each document |

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
- **A letter past its date is not asked for** (the tenth product review: the
  email said "Sign your offer letter" and the dialog "{First} hasn't signed
  the offer letter yet" for a letter My Documents shows as "Expired", which
  nobody can sign). The email and the dialog decide by one rule,
  `offerLetterWaiting` (in `_shared/welcomeTodo.ts` and
  `src/lib/documentRequests.ts`); the dialog says "The offer letter expired
  before it was signed, so the email doesn't ask for it. You can send a new
  one from Documents." Proof: `scripts/document_requests.test.mjs`, the real
  function both ways in `scripts/notification_access.test.mjs`, guard
  `hire-email-leaves-out-an-expired-offer-letter`.
- **The offer line says what happened to the letter** (the eleventh product
  review: a letter that went out and was declined, or voided after the
  applicant signed, read "No offer letter has gone out", and one the team
  declined on its turn read "{First} signed the offer letter"). The line is
  `hireOfferLine` (`src/lib/documentRequests.ts`), from `offerLetterState`:
  declined by them, declined by the team after they signed, voided after
  they signed, withdrawn before, expired, signed, waiting, or none. Only the
  last says "No offer letter has gone out".
- **"Send a new one from Documents" only where it works.** Offer letter lists
  people already hired (`useOfferPeople`, after those with an offer out and
  before those in review; sending one leaves them Hired), so the step still
  works after the hire; and the dialog, the letter's sheet and the Documents
  line say it only to someone who may send documents (the owner, or a
  teammate with "Send documents"). The same review: after Hire, Offer letter
  listed nobody hired, and the line was shown to teammates who cannot send.
  Guards `hire-dialog-says-what-happened-to-the-letter`,
  `send-a-new-letter-only-where-it-works`.
- After the interview, "Set up interview" becomes "Another interview"; the
  decision card says "Interview done" with the day.
- Offline: `?__previewHiring=done,offer` (the interview held yesterday; an
  unsigned offer letter on the applicant at Offer); `offer,expired` is that
  letter past its date; `offer,declined`, `offer,signed,declined`,
  `offer,voided` and `offer,withdrawn` are the closed ones.
