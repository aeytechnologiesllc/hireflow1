# Business trust: keeping scammers out

HireFlow is opening to other businesses (the owner, 2026-10-10: "do it all").
A hiring site that can ask applicants for ID papers is exactly what a scammer
wants: sign up as a "business", post a fake job, collect people's IDs. This is
what stops that. Migration `20261011100000_business_trust.sql`; proof in
`scripts/business_trust.pglite.test.mjs`.

## Standing

**No approval step (the owner, 2026-10-11: "why do I have to approve a
business ... I don't want the headache").** Every business is open from the
moment it signs up (`business_standing.status` defaults to `approved`, and no
row means approved), ID papers included. It is paused (`suspended`) only by an
admin on the Admin page, or by itself when three different people it has been
in touch with report it (migration `20261011190000_open_by_default_report_pause.sql`,
narrowed by `20261025290000_reports_need_contact.sql`; contact counted as it
was made since `20261025670000_contact_kept_when_made.sql`). No law asks a
hiring app to check a business's tax number, so there is no TIN check.

| | Open (approved) | Paused (suspended) |
|---|---|---|
| Post jobs, receive applicants | yes | no: its published jobs are closed |
| Ask for papers, ID papers included | yes | no |

- Pausing (`business_pause()`, used by the admin's button and by the reports)
  closes the business's published jobs (drafts stay drafts), remembers which,
  and tells the business in its bell. Opening it again reopens exactly those
  jobs and closes its open reports, so one more report can't pause it again
  straight away, and the people whose reports were closed count again only
  once the business is in touch with them after that (see Reports, "A reopen
  holds"; an email from the hiring team counts, and a report they add to
  then is worked out again).
- Three reports from three different people the business has been in touch
  with pause it by itself, and every admin is told (see Reports for what
  counts). HireFlow's own account (`platform_admins`) is never paused, by
  reports or by hand.
- The `new` status is still allowed in the table but nothing sets it; the
  ID-paper gate for it (`id_requests_need_approval`) is unreachable.

## A business confirms its email before its first job goes live (2026-10-25)

Supabase confirms nobody's address here (`mailer_autoconfirm` is on so
applicants are never slowed down), so a business could sign up with anyone's
address and put a job live under it. At its first Publish a business gets a
6-digit code at its sign-in address and enters it once
(`20261025100000_business_email_check.sql`, hardened by
`20261025130000_business_email_check_hardening.sql`; proof in
`scripts/business_email_check.pglite.test.mjs`):

- `jobs_publish_needs_email_check` refuses a job going to `published` (a new
  job, or any other status turning into it, closed included) unless
  `business_email_verified(job's business)`: the profile's stamp
  (`email_verified_at`) for the address it confirmed (`email_verified_for`)
  while that is still the sign-in address, or a Google sign-in whose Google
  address is still the sign-in address, or a platform admin. A platform
  admin's own writes (reopening a paused business's jobs) are not refused. HINT `email_not_verified`; the job editor and Ava's publish open
  "Confirm your email" on it (`src/components/business/EmailCheckDialog.tsx`)
  and carry on with the publish once confirmed. Service-role writes pass.
- The code: only a business account (the employer role) gets one; made by the
  database from a strong random source, only its hash kept, 15 minutes, five
  wrong tries, for the address it was sent to only. Limits are in the
  database (per account, per inbox however written, for everyone) and in
  send-notification-email (per IP). See docs/NOTIFICATION-EMAILS.md.
- Nobody stamps themself: an API write to `email_verified_at` or
  `email_verified_for` keeps the old value.
- Changing the sign-in address ends the stamp until the new address is
  confirmed: the business cannot put another job live (or reopen a closed
  one) until it does. Jobs already live stay live; the check is for going
  live. Its AI day stays the full one while it has a job live (a job only
  goes live through the check); with no job live it has the new-business
  day (300) until it confirms (`ai_budget_take`, `20261025250000`).
- The code is mailed to the address the database recorded it for, never to
  an address looked up again, so an address changed in between cannot get a
  code made for another (third Pass C review, 2026-10-25;
  `20261025140000_business_email_check_round3.sql`).
- Known limit: the per-inbox limits (ten an hour, twenty a day) also mean a
  stranger who signs up with "you+tag@" addresses can use up a real
  business's limit for a day; that business is told to message us from Help.
  A domain that takes mail for any address (anything@business.com) gives
  every address its own limit, so one inbox there can get twenty codes an
  hour per network, up to the ceiling. A determined sender with many networks
  could also fill the 300-an-hour ceiling. A bot check on sign-up (Cloudflare Turnstile, Phase 2 task 5,
  waiting on the owner's keys) is the fix for all three.
- Applicants are never asked. Team members cannot confirm the owner's address
  (they are told the owner must). A wrong address at sign-up is not a dead
  end: the screen points to Help.
- The 15 business accounts that existed on 2026-10-25 were stamped (all
  pre-launch accounts; the plan's narrower "active since October" would have
  stamped only the owner's).

## Applications only to open jobs

Until 2026-10-11 the database accepted an application to a closed or draft job
from anyone holding its id (only the deadline was checked).
`applications_only_to_open_jobs` now refuses a new application unless the job
is published and its business is not suspended. Existing applications are
untouched.

## Reports

Anyone signed in can report a job (`report_employer`): asked for money,
suspicious documents, fake job, unsafe, or something else, with a note. Once
the job is gone, a report can name its business instead (since the
nineteenth Phase 5 review, below). One open report per person per job, or
per business when there is no job (a second adds to the first, and is
worked out again like a new one), at most five a day. Every admin is told in their
bell (of an addition, whenever it brings words or a new reason, at most five
times a day for one person). A reporter reads only their own
reports; the reported business never sees who reported it. Three open
reports from different people it has been in touch with pause the business by
itself (see Standing).

What counts as "in touch" (`business_has_contacted`, Phase 7 security audit,
2026-10-25): a message to the reporter from the business or anyone on its
team, a document or a document request on the reporter's application, or an
interview on it (and, since the fifteenth Phase 5 review, a card the
business or its team wrote into their bell; since the sixteenth, an email
the hiring team sent them and a new time, link or notes on their
interview; since the seventeenth, the hiring team moving their application
forward; since the nineteenth, a change of the words they read on a job of
theirs where the public cannot read them, and the business renaming
itself). Only the business can make any of these, so a stranger
cannot manufacture them; Ava never messages, sends papers or books
interviews. Before, three people who had merely applied were enough, and
applying costs nothing (no email confirmation, no bot check yet): three
throwaway accounts could close every job of any business, again after each
reopen. Three reports from people who applied but were never contacted keep
the business open and ring every admin's bell once ("A business was reported
3 times"); every report already rings it. Proof:
`scripts/business_trust.pglite.test.mjs` section 9; guard
`reports-pause-needs-contact`.

**Contact counts as it was made (the fourteenth Phase 5 review, 2026-10-26;
`20261025670000_contact_kept_when_made.sql`).** The check used to read the
contact rows as they stood when the third report came, and a business can
delete every one of them: its messages (through the API), a request nobody
answered (Cancel request), an interview, an unsigned document, the
application (Delete their information) or the whole job. The review's probe
did each, and the three reports paused nothing; after Delete their
information not even the "reported 3 times" bell rang, since a removed
applicant no longer counted as having applied. Now contact is recorded when
it is made, in `private.business_contacts` (business, person, kind, first
time and, since the fifteenth review, last time; one row each). (Deleting
the whole job kept the record, but until the nineteenth review it still
dodged the pause another way: it took the applications and every Report
button with them, and `report_employer` refused a job that no longer
exists, so the people it had asked for money could not report it at all.
A report can name the business since: below.)

| Kind | Written when | The business is |
|---|---|---|
| `applied` | an application is made | the job's owner |
| `message` | a message is sent | each business the receiver applied to whose owner, or anyone on whose team, sent it |
| `message` | a browser writes a card into the bell of someone who applied (since the fifteenth review) | each business whose job they applied to and whose owner, or active teammate on that job, wrote it |
| `message` | the hiring team's email goes to someone who applied (since the sixteenth review; send-notification-email, before it sends), never a decline | the job's owner, who signs it |
| `message` | the hiring team moves an application from a browser to an interview, an offer, a hire or another step (since the seventeenth review), never to rejected | the job's owner |
| `document_request` | papers are asked for | the application's job's owner |
| `document` | a document is sent | the application's job's owner |
| `interview` | an interview is booked, or a browser changes its time, its offered times, its link or its notes (since the sixteenth review) | the application's job's owner |
| `message` | a browser changes the words a job's applicants read (its title, description, requirements, responsibilities, benefits, skills, experience level, location, type, form questions, quiz, or any step's title, description or settings) where the public cannot read them (since the nineteenth review), for each person still waiting on it | the job's owner |
| `message` | a business renames itself from its browser (since the nineteenth review), for each person still waiting on any of its jobs | the business |

- The rows are written by `business_contacts_remember`, an AFTER INSERT
  trigger for each row on `applications`, `messages`, `document_requests`,
  `documents` and `interviews` (and on `notifications`, for a browser's own
  card only, since the fifteenth review; and AFTER UPDATE on `interviews`, for
  a browser's new time, link or notes, since the sixteenth), with its own
  rights, by `business_contacts_remember_email` for the hiring team's
  emails (since the sixteenth: the server's only), and by
  `business_contacts_remember_move` for the hiring team's moves of an
  application (AFTER UPDATE OF status, phase on `applications`, for a
  browser's own move by the job's owner or an active teammate on it, since
  the seventeenth). The business is read
  from the application's job (for a message, a job the receiver applied
  to), never from a column the business writes, so one business cannot make
  another look in touch, and an applicant's own message to a business is no
  contact.
- Nothing a business can delete removes a row. The table is the database
  owner's only (no grant to any API role, the service role included), no
  function deletes from it, and a row goes only when an account it names is
  deleted (`ON DELETE CASCADE`): the person's own Delete Account, or the
  business's, which takes its jobs with it. The Privacy Policy names the note
  and says it goes with the account.
- `business_has_contacted` reads the record (any kind but `applied`), and
  `employer_reports_auto_pause` counts a reporter as having applied from it
  (any kind). So a report from someone the business removed still counts:
  toward the pause if it was in touch with them, toward the "reported 3
  times" bell if it was not. Three people who merely applied still leave a
  business open.
- The migration filled it from the rows there when it ran: applications,
  removal and withdrawal notes, messages, document requests, documents and
  interviews (each with its first time). Contact a business had already
  deleted could not be filled.
- Proof: `scripts/launch_locks_behaviour.pglite.test.mjs` section 22 (the
  review's cases: messages deleted, requests cancelled, interviews deleted,
  applicants removed with or without contact, a document deleted, a
  teammate taken off the team and the job deleted) and section 5; guard
  `contact-counts-as-made`.

**A reopen holds (the fifteenth Phase 5 review, 2026-10-26;
`20261025680000_reports_heard_stay_heard.sql`).** With the record permanent,
nothing let a business or an admin out of a pause: the reopen closes the open
reports, but `report_employer` lets the same person report the same job
again as soon as their report is closed. The review's probes: three people a
business had messaged once ("Please finish the chat test this week") paused
it; an admin looked and reopened it; the same three reported again and
paused it again, after the business had blocked them and deleted their
information too; a teammate's throwaway accounts kept paying off after the
teammate was taken off the team. Now:

- Someone an admin has already heard about this business (a report of theirs
  on it closed by an admin: the reopen and Close on the Admin page both set
  `closed_by`) counts toward neither the pause nor the "reported 3 times"
  bell, until the business is in touch with them again after that close
  (`report_already_heard`, read by `employer_reports_auto_pause`). Their new
  reports are still taken and still ring "A job was reported" for every
  admin, so a real repeat is seen (and, since the sixteenth review, so does
  something new added to an open report; until then an addition rang
  nothing and was never worked out again, below).
- People the business was in touch with who were not heard before still
  pause it: after a reopen, one more report leaves it open, and three new
  ones pause it again. A business that writes to someone again after the
  close (a message, a request, a document, an interview or a bell card)
  makes that person count again; their closed report never counts.
- For that the record keeps each contact's last time too (`last_at`, moved
  forward by the same triggers; `first_at` stays the first). The migration
  filled it from today's rows (the latest of each kind; where the business
  had deleted them, the first time).
- A card the job's owner or an active teammate on that job writes into its
  applicant's bell from a browser, of any type, counts as a `message` (probe
  p3: "Training fee due ... Send 1,500 PHP to GCash ...", typed `system` and
  pushed to their phone, left the business open; the fourteenth security
  review's `contact_bell` did the same with a `status_update` card). The trigger fires only for a
  browser's own insert (`WHEN (current_user = 'authenticated')`), so the
  server's cards (a decision, an interview, a request, written inside
  SECURITY DEFINER functions or by the service role) are never counted.
  Every screen that writes a card to an applicant writes it about a request,
  a document or an interview the team has made, which the record already
  counts, so in the app this changes nothing.
- An interview stays on the application it was booked for: nobody but the
  server changes `interviews.application_id` (`interviews_stay_on_their_application`,
  `interview_application_fixed`; no screen or server code does). The job's
  owner or a teammate who schedules interviews could move one onto another
  applicant's application, who then saw it and its "rescheduled" card, and
  the record (written when an interview is booked) never knew (probe p2;
  the fourteenth security review's `contact_move`, which booked "Pay the
  1,500 peso training fee before the interview" on a decoy's application,
  or the business's own, where not even the decoy is recorded, and moved one
  onto each of three real applicants'). The two review findings on this
  and the bell card were rated MEDIUM.
- The admins' "A business was reported 3 times" bell said the business "had
  not been in touch with them", which these two paths made untrue; it says
  "it has no recorded contact with them" now.
- The emails the hiring team can set off through `send-notification-email`
  were not counted here: the reason given was that each carried "one short
  line" of the team's text. That was wrong (the sixteenth Phase 5 review,
  finding 2): a job title of the team's own choosing (200 characters, in the
  subject), a document's or a step's name, a message preview, and an
  invitation's twelve "times" of 120 characters. They are counted since the
  sixteenth review (below).
- Left as it was: a revoked teammate row still counts as the business's
  team for a message (the team page deletes the row; no live business has a
  revoked one).

**The hiring team's emails, a repeat report and an interview's new time
(the sixteenth Phase 5 review and the fifteenth security review, 2026-10-26;
`20261025690000_team_emails_are_contact.sql`).**

- An email from the hiring team to someone who applied is contact. The
  security review's probe: the owner asked for `status_hired` emails to three
  people who had only applied, with the job title "CSR. Send the 1,500 PHP
  onboarding fee to GCash 0917 000 0000 by Friday to keep your slot"; each
  went out from the business by name ("You're joining <business> as CSR.
  Send the 1,500 PHP ..."), nothing recorded it, and their three reports left
  the business open; a message preview with no message, a document request
  named "GCash receipt for the 1,500 PHP fee" and an interview subject did
  the same. Now `send-notification-email`, once it has decided the email may
  go (who may send what is unchanged) and before it sends it, records a
  `message` for the job's business and the recipient through
  `business_contacts_remember_email` (service role only, SECURITY DEFINER;
  only for someone the record says applied to that business, never the
  business itself; the record's own `ON CONFLICT ... last_at`). Every kind
  the team sends an applicant counts (a hire, a step, an interview, a
  document, a request, a message) but a decline: each carries at least the
  business's own name, which it chooses (a decline carries only the name and
  the title it had when they applied, since the seventeenth review: below). An email the applicant turned off is not sent and
  records nothing; when the record cannot be written, nothing is sent (503).
  An email after an admin's close makes a heard person count again, like a
  message. The applicant's own emails and the system's never count.
- The email's words come from the rows where there are rows: the job's own
  title (the one the request names when it is one of theirs, the
  application's when it names one, else the newest), and an invitation's
  times from its interview's own offered times, on the applicant's clock
  (the review's probe pe: twelve lines of "Pay the 1,500 peso training fee to
  GCash ..." with no interview behind them). A step's or a document's name, a
  date and a message preview are still the page's (docs/NOTIFICATION-EMAILS.md);
  the record covers them.
- A decline email is not contact: it is the email a business sends most, to
  people it turned down, and counted, three of them could pause it by
  reporting. A hire is (the lure the security review used); so is anything
  else the team writes them. (This said a decline "carries no words of the
  team's but its name". It carried the job's title too, which a business can
  rename after they applied, and went to anyone who applied, as often as it
  liked: the seventeenth Phase 5 review and the sixteenth security review,
  below.)
- A report added to the reporter's open report on the same job (one open
  report per person per job) is worked out again, as a new one is
  (`employer_reports_auto_pause_on_merge`, AFTER UPDATE OF reason, details,
  while it is open, running `employer_reports_auto_pause`). After a reopen
  the people an admin had heard report again at once (not counted, as
  above), so their reports stay open; when the business wrote to them again
  and they reported the new demand, each was added to the open report and
  nothing ran (the review's probe pa; the security review's heard2 paused
  only when a fourth person filed a new report; probe pb, three people who
  reported a fake ad before any contact and then were asked for money, the
  same). Now that pauses it. Every admin is told when an addition gives a new
  reason or more words ("A job was reported": "Someone added to their report
  of ..."), at most five times a day for one person, and an addition with
  nothing new tells nobody and adds no blank lines (it used to add two).
  (Until the seventeenth review "more words" was whatever fitted in 1,000
  characters after the old text: a first report that filled the box kept
  none of the addition, and nobody was told. Below.)
  Only a new report rings "reported 3 times": an addition brings nobody new.
  Someone heard and not written to again still counts for nothing.
- A browser's change of an interview's time (`scheduled_at`, or the offered
  times, `employer_windows`), link or notes moves that interview contact's
  last time (`business_contacts_remember_edit`, AFTER UPDATE on interviews,
  `WHEN (current_user = 'authenticated')` and one of them changed). After a
  reopen a business could otherwise move a heard reporter's interview, or
  put a new link or "Bring the 1,500 peso fee" in its notes, and they stayed
  heard (the security review's LOW, probe heard). Only the job's owner or a
  teammate who schedules interviews can change one from a browser; the
  server's changes (reminders, an applicant's answer), a cancellation and a
  change to nothing do not count.
- Left as it is (the security review's other LOW): a teammate, while on the
  team, who messages many throwaway accounts that applied gets one automatic
  pause for every three of them after each reopen, even after being taken off
  the team (messages allow 600 an hour, and accounts are free). Each pause is
  of the business that let the teammate in; an admin looks each time, and
  closing those reports by hand hears them. The fix is a bot check on sign-up
  (Turnstile, waiting on the owner's keys).
- Proof: `scripts/launch_locks_behaviour.pglite.test.mjs` section 25 (the
  emails as send-notification-email records them, the review's probes pa and
  pb, the security review's heard2, the Phase 5 review's weakenings W3
  (applying again counted), W7 (only messages counted) and W13 (a report
  about another business heard someone here), and the interview edits);
  `scripts/notification_access.test.mjs` sections 3b and C; guards
  `team-emails-are-contact`, `repeat-report-worked-out-again` and
  `interview-edit-is-contact`.
- Proof: `scripts/launch_locks_behaviour.pglite.test.mjs` section 24 (the
  review's probes p1, p2, p3 and p5 and its weakenings M1 to M6: HireFlow's
  own account, closed reports, another business's teammate, a reopen that
  closes nothing, an application to another business; the security
  review's `contact_move` and `contact_bell`, and the bell's words); guards
  `reopen-holds`, `bell-card-is-contact`, `interview-stays-on-its-application`
  and `contact-counts-as-made`.

**A decline names the job as they applied, and goes once; the hiring team's
moves are contact; a repeat report keeps its newest words (the seventeenth
Phase 5 review and the sixteenth security review, 2026-10-26;
`20261025700000_decline_names_the_job_as_applied.sql`).**

A decline stays no contact (above: it is the email a business sends most,
to people it turned down). What both reviews showed is that it, and the
server's own cards, carried text the business can change after the person
applied: the job's title (a closed job can be renamed to anything, and
nobody else sees it: the Phase 5 review's probe qj) and the business's own
name. So that text is taken away from them, rather than counting the
decline.

- The hiring team's moves of an application are contact. The Phase 5
  review's probe po: the owner closed its job, renamed it "Chat support
  agent. To accept, pay the 1,500 PHP onboarding kit fee by GCash to 0917
  000 0000 today and send the receipt to recruit.cruz@gmail.com", moved three
  applicants to an offer (as the Advance button does) and one to a hire,
  and renamed it back. Each got "Congratulations! You've received an offer
  for Chat support agent. To accept, pay ..." in their bell, pushed to their
  phone; moving someone to an offer sends no email, so the record held
  "applied" only, and their three reports left the business open. Now a
  browser's move of an application to an interview, an offer or a hire, or to
  another step, records a `message` for the job's business
  (`business_contacts_remember_move`, AFTER UPDATE OF status, phase on
  `applications`, `WHEN (current_user = 'authenticated')` and it is such a
  move), when the writer is the job's owner or an active teammate on that job
  (`is_job_owner` / `is_active_team_member_for_job`). Never a move to
  rejected (a decline), never the applicant's own (their step moves are the
  server's), never the server's own (written inside SECURITY DEFINER
  functions or by the service role), and never a move to review, which tells
  them nothing.
- An application keeps the job's title and the business's name as they were
  when it was made (`applications.applied_job_title`, `applied_company_name`),
  set by the database on every insert whatever was sent
  (`applications_as_applied`, BEFORE INSERT), and kept from every browser
  afterwards, the applicant's and the hiring team's (BEFORE UPDATE,
  `WHEN (current_user IN ('anon', 'authenticated'))`: the old values stay).
  The applications already there were filled from that day's titles and names.
  The server's decision and step cards (a decline, an offer, a hire, a next
  step: `notify_application_status_change`,
  `notify_application_phase_advanced`) name the job, and a decline the
  business, by them. So does the decline email: its subject, heading, first
  line, signature and From name. The cards about an interview still name the
  job's own title: an interview is contact.
- A decline goes only for an application the team has turned down (status
  `rejected`), once. send-notification-email picks the application the
  request names when it is one of the recipient's that the caller is the
  hiring team for and it is turned down, else the newest such; with none it
  refuses (403). Before it sends, after the recipient's settings, it marks
  that application (`decline_email_claim`, service role only: one row in
  `private.decline_emails`, primary key the application, so two requests at
  once are one); a second decline for it sends nothing (200, `already_sent`),
  a mark that cannot be written sends nothing (503), and a decline the mail
  provider refused is unmarked (`decline_email_release`) so the next try can
  send it. The security review's probe P1 (three declines to each of three
  people still under review, from a business renamed "Zulu: pay 1,500 PHP to
  GCash 0917 000 0000 to stay in the pool") is refused; P1b (the job renamed
  instead) and the Phase 5 review's pd (a closed job renamed "CSR
  (reconsideration: send 500 PHP to GCash 0917 000 0000, then message us
  REAPPLY)") send the decline once, naming the job and the business as they
  were when they applied. The declines made before the migration were marked
  as sent (the screens send each right after the move); a mark goes with its
  application. Moving someone back and turning them down again sends no
  second decline.
- A repeat report keeps its newest words. The merge added the new words
  after the old and cut the whole at 1,000 characters, so a first report that
  used the whole box (the applicant pasted the recruiter's messages) kept
  none of the second, the business's new demand ("pay 3,000 PHP more today
  ... New GCash number 0918 111 2222"), and with the same reason no admin was
  told (the Phase 5 review's probe pf). Now the old text is cut from the front
  (`right(…, 1000)`), and every admin is told whenever an addition brings
  words or a new reason, at most five times a day for one person.
- Proof: `scripts/launch_locks_behaviour.pglite.test.mjs` section 26 (probes
  po and pf, each move and each thing that is not one, the cards, the
  columns kept from every browser and filled by the migration, the mark, and
  the review's N3: new offered times alone are contact);
  `scripts/notification_access.test.mjs` section 3c (P1, P1b and pd, once,
  which application, the mark) and C; guards `team-moves-are-contact`,
  `decline-names-the-job-as-applied`, `decline-once-for-a-real-decline` and
  `repeat-report-worked-out-again`.

**What reaches an applicant names the job as they applied (the eighteenth
Phase 5 review and the seventeenth security review, 2026-10-27;
`20261025710000_decline_card_says_team_once.sql`).**

The rule round 17 began: what reaches an applicant about a job they applied
to names the job and the business as they were when they applied
(`applied_job_title`, `applied_company_name`), never as they are now. A
business can rename a closed job, or itself, to a fee ask, and nothing
records that as contact. Round 17 did this for the decline and the server's
cards; two emails and the applicant's own pages were left. (Round 18 did
those, and the rule still did not hold everywhere: the applicant's Messages
page, which every applicant email links to, named each business and role
by today's names, and the step pages, the overview pages' location, type
and steps, and the Improvement Report read the job's words today. The
nineteenth review closed the class: below.)

- The applicant's own emails. "Application received" and "Email me the
  link" go from the business by name and are no contact (the applicant sets
  them off). The Phase 5 review's probe pq_submit_closed: three people had
  the form open, the business closed the job and renamed it "Chat support
  agent. To finish, pay the 500 PHP processing fee by GCash to 0917 000
  0000", and itself; each sent the form (the database takes it), and each
  got "Application Submitted: Chat support agent. To finish, pay ..."; the
  record held "applied" only, so their three reports left it open. The link
  email carried the title uncut (902 characters in probe pr_continue). Both
  now name the application's own title and name, cut to 200 and 120
  characters, and nothing when it has neither (docs/NOTIFICATION-EMAILS.md).
  The Terms say an email counts when the hiring team sends it ("by an email
  its hiring team sends them other than turning them down").
- The applicant's own pages. The decline's card and email send the person
  to their application page, and it, like Your applications, named the job's
  title and the business's name today: the security review's probe s5
  renamed both after the decline ("Chat support agent (reconsideration: send
  500 PHP to GCash 0917 000 0000, then message us REAPPLY)", "Fee Clinic:
  pay 500 PHP to GCash ... to stay in the pool"), and that was the page's
  heading, with the name under it, for the person turned down and for
  someone never turned down alike. Both pages now name the application's own
  (`src/lib/appliedNames.ts`), always, even while the job is still live: one
  rule for the emails, the cards and the pages. They no longer read
  `employer_public_branding`.
- The decline card says "team" once: "The Zulu Support Team has made a
  decision on your application ...", never "The Zulu Support Team team"
  (61 of the 63 decline cards live). The cards already in people's bells are
  left as they are.
- Left, the same class: the job's location, its type (shown as written when
  it is not one of the known kinds) and its steps' titles on those pages are
  still the job's today (no application keeps them), and a business can
  change them on a closed job too. (Closed by the nineteenth review: such a
  change is contact with everyone still waiting on the job, and someone
  turned down or hired sees none of them once nobody else can. Below.)
- Proof: `scripts/notification_access.test.mjs` section 4 (the review's
  probes pq_submit_closed and pr_received, the cut, none on file, "not
  finished yet" from the job's steps, the button never another's
  application), `scripts/continue_link_email.test.mjs` section 4 (probe
  pr_continue), `scripts/launch_locks_behaviour.pglite.test.mjs` section 27
  (the card), `scripts/legal_pages.test.mjs`; guards
  `applicant-emails-name-the-job-as-applied`,
  `applicant-pages-name-the-job-as-applied`, `decline-card-says-team-once`
  and `product-audit-fixes-hold` (now the decision too).

**What a business changes of its applicants' words is contact; a report can
name the business when its job is gone (the nineteenth Phase 5 review and
the eighteenth security review, 2026-10-27;
`20261025720000_text_a_business_changes_is_contact.sql`).**

Rounds 15 to 19 each found one more place where a business shows its
applicants words it can change after they applied, with nothing recorded as
contact. This closes the class rather than the next instance: a business's
browser edit of the words an applicant reads (a job's title, description and
step text, or the business's own name), while those applicants can still read
it and the public cannot, is contact with them. Where the application's own
snapshot covers a page cheaply, the page shows it as well.

- A job's words. The Phase 5 review's probe p1_steps_closed closed a job,
  renamed it "PAY 500 PHP GCASH 0917 000 0000 FIRST - Chat support agent",
  titled its video step "Pay the 500 PHP fee, then record" with a prompt to
  hold the GCash receipt up to the camera, and asked the form's question for
  a GCash reference; the security review's s1_residual set a closed job's
  location to "Remote. To be reconsidered, send the 500 PHP review fee to
  GCash 0917 000 0000 ..." and added a step titled the same. Every step page,
  and the overview pages, showed it; the record held "applied" only. Now a
  browser's change of a job's title, description, requirements,
  responsibilities, benefits, skills, experience level, location, type, form
  questions, quiz or any step's title, description or settings records a
  `message` for everyone still waiting on the job (not turned down or hired)
  (`business_contacts_remember_text`, AFTER UPDATE on jobs, `WHEN
  (current_user = 'authenticated')`, the job's owner or an active teammate on
  it), when:
  - the job is off its public page before or after the change
    (`job_text_public`: published, not kept off the list, its business not
    paused, and its deadline at least a day away); or
  - the words are ones the public page never shows, whatever the job's
    status: a step's settings (its prompt, its scenario) or a question's
    options (`published_jobs_public` carries a step's id, type, title,
    description and required, and a question's id, type, question, required,
    placeholder, time limit and category); or
  - the change was made while the job was public, and the job leaves its
    public page within a day of it (closed, kept off the list, or a deadline
    set inside the day; `private.job_public_text_edits` keeps when each job's
    public words last changed): a fee ask made public for a moment and then
    closed away was no change the public saw.
  Only words count (every string in those columns, before and after): a time
  limit, a passing score, "required" or the same words saved again are not
  contact. Neither is the server's write (Ava's builder through the service
  role, a pause, a reopen).
- Why a change the public page shows, and that stays public for a day, is
  not contact: anyone can read it there, HireFlow's admins included, and
  anyone can report it there; counted, any three throwaway applicants could
  pause any real business that fixes a typo in its live job, what the Phase
  7 audit's "reports need contact" closed. What the public page never shows (a step's
  prompt) was a hole on a live job too: it counts.
- The business's own name. A business's rename of itself from its browser
  (`profiles.company_name`, a changed value) records a `message` for everyone
  still waiting on any of its jobs (`business_contacts_remember_name`). A
  real business renames itself rarely; the cost is that three of its
  applicants could then pause it by reporting, as after any message.
- What the pages show. Where the snapshot covers a page it is shown,
  always: the nine step pages' top line, the step gate and "Continue on your
  computer" (beside "Email me the link") name the application's
  `applied_job_title`; the applicant's Messages page names each business and
  role from their own newest application to it (the Phase 5 review's probe
  p2_messages: after a decline, a closed job renamed "Chat support agent
  (reconsideration: send 500 PHP ..., then message us REAPPLY)" and a
  business renamed "Fee Clinic: pay 500 PHP ... to stay in the pool" were that
  page's row, and every applicant email, the decline included, links there);
  the Improvement Report, a turned-down card's one action, names
  `applied_job_title` in its heading and PDF (a report kept from before is
  named so too). What no application keeps, the job's location, type and
  steps' titles, the overview pages show only for someone still waiting on
  the job (their record covers a change) or while the job is on its public
  page; for someone turned down or hired, once nobody else can see the job,
  none of them, and each step by its kind's own name
  (`src/lib/liveJobText.ts`). The Improvement Report's prompt takes the job's
  description, requirements and skills only while the job is on its public
  page, and its steps only by the kinds HireFlow knows otherwise
  (`_shared/performanceReportJob.ts`).
- A report can name the business. Probe p3_nowhere_to_report: "Fee Desk A"
  messaged three applicants "To keep your place, pay the 1,500 PHP
  onboarding fee by GCash to 0917 000 0000 today" and deleted its job; the
  record held "applied,message" for each, but the deletion took their
  applications and every Report button with them, `report_employer`
  answered `report_job_unknown`, and it posted the same job again at once.
  "Fee Desk B" closed its job and used Delete their information: the
  database still took reports by the job's id, but no screen offered one.
  Now `report_employer` takes a fourth argument, `p_employer`: while the job
  exists the report is the job's and its business's, as before; when it is
  gone (or none is named), a business the reporter has a recorded contact
  with or a message thread with (`report_choices()`, the caller's own list,
  named as they applied when one of their applications to it is still there,
  never by its name today; a teammate's account names its business,
  `report_business_of`). The report keeps `employer_id` and has no job. Every
  rule holds: one open report per person per job, or per business when there
  is no job (a report whose job was deleted since has none, and a new one
  about its business adds to it); the pause count, the heard rule and five a
  day, all by business as before. Report is offered on the applicant's
  Messages chat with a business and on the screens of an application that is
  gone ("We can't find that application", the step gate's "Application not
  found").
- "Not finished yet" only on an auto-mode job. On a manual-mode job only the
  team opens the next step, so the email said "they are waiting for you ...
  please finish them soon" untruly (the Phase 5 review's finding 4); it is the
  plain "Application Submitted" there (`stepsAfterForm` and the form page's
  mark read `processing_mode`).
- Left: the voice interview's page still names the job's title today (voice
  is HireFlow's own account's only, and that account is never paused); the
  step pages still send the job's title and description today to the
  practice and interview functions, which read the job themselves (a change
  of them is contact with everyone still waiting, who are the only people
  those steps reach); the applicant's Documents page names the business and
  the job today beside each paper (each paper is contact itself, recorded
  when it was sent); a business's name on its public pages (its careers
  page, its live jobs) is its name today, for everyone. A chat whose
  teammate the business has taken off its team (the row deleted) names no
  business any more, so its Report is refused; the "can't find that
  application" screens still list the business from the record.
- Proof: `scripts/launch_locks_behaviour.pglite.test.mjs` section 28 (probes
  p1_steps_closed, s1_residual, p2_messages and p3_nowhere_to_report, and
  what is not contact), `scripts/applicant_job_words.test.mjs` (the pages'
  and the report's words), `scripts/notification_access.test.mjs` section 4
  (manual mode); guards `step-pages-name-the-job-as-applied`,
  `job-text-edit-is-contact`, `business-rename-is-contact`,
  `report-names-the-business`, the widened
  `applicant-pages-name-the-job-as-applied` and `product-audit-fixes-hold`.

## Admins

`platform_admins` holds who runs HireFlow (the owner's account,
zack@yahoo.com). `is_platform_admin()` answers only about the caller. The
admin functions (`admin_businesses`, `admin_reports`, `admin_close_report`,
`admin_set_business_status`) refuse everyone else. Nobody reads or writes the
new tables directly from a client.
