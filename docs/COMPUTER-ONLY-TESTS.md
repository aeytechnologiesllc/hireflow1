# Phone for the start, computer for the tests

Owner, 2026-10-06, approved: *"love it, let's build it that way."* The rule:

| part of the application | phone or tablet | computer |
| --- | --- | --- |
| the job page, Apply, sign up, the application form | yes | yes |
| the skills check | yes | yes |
| **the computer and connection check, and every step after it** (typing test, chat practice, written interview, and any later step a job adds) | **no** | yes |

Why: most applicants find the post on their phone, so the start must work
there or they are lost. But the job is done on a computer, and a typing score
or a chat practice taken on a phone says nothing about how they will work.
This declines nobody: it puts the tests that matter on the machine they will
use.

## The rule, precisely

- "Phone or tablet" is the connection check's own device reading
  (`deviceKindOf` in `src/lib/connectionTest.ts`): Windows and ChromeOS count
  as computers unless they report mobile; touch plus a short side under 768px
  otherwise. ONE function decides it, everywhere. Two cases are decided in
  full before the short-side rule, because a phone or tablet on the "desktop
  site" (the default on Android tablets of 10 inches or more, and on iPads)
  reports a computer's system:
  - **Linux with touch** is a computer only when its main pointer is a mouse
    or a trackpad (`(pointer: fine)` or `(hover: hover)`) AND it is not an
    ARM device (`navigator.platform` "Linux aarch64" / "armv8l" / "armv81",
    or the high-entropy `architecture` "arm"): a touch laptop. An Android
    tablet on Chrome's default desktop site (Linux, mobile: false, 1280×800,
    a finger) is a tablet; with a trackpad keyboard cover it is still a
    tablet, by its ARM processor, wherever the browser reports one. Anything
    else is a phone (short side under 768) or a tablet.
  - **macOS with touch** is an iPad, or an iPhone on "Request Desktop
    Website" (no Mac has a touch screen): a phone when the short side is
    under 600 (every iPhone is 440 or less, every iPad 744 or more), else a
    tablet, with or without a trackpad.
- The gate applies to the job's **first `equipment_check` step and every step
  after it** in the journey. A job with no connection check gates its first
  typing test, chat practice, sales practice, written or voice interview, and
  everything after it (the same "tests that matter" set).
- On a gated step, a phone or tablet sees ONE screen instead of the test:
  "Continue on your computer". It says, in plain words: this part needs the
  computer you will work on; on that computer, go to
  **hireflownow.com/applications**, sign in with the same email, and you will
  be taken to exactly this step; your answers so far are saved. Two ways to
  take the link away: **"Email me the link"** (see below) and a "Copy link"
  button for the step's own address. Nothing on that screen starts a test or
  a timer, opens an attempt, or records an integrity event.
  - **The address is `/applications`, on purpose.** Signed out, it asks them
    to sign in and comes back (AppLayout carries `?redirect=`). On a
    computer, the applications page opens the step itself when the arrival
    is fresh (the address typed or opened from a message, or straight from
    signing in) and exactly ONE application has a step waiting for a
    computer (`stepWaitingOnComputer`, `src/lib/resumeOnComputer.ts`).
    Reached from inside the app it is the list as always; with two or more
    steps waiting it is the list, each card's button opening its own step.
    The bare site is NOT named: with one open role it opens that role's page,
    where Apply leads to the application's overview (or, for a different
    role, starts a new application for the wrong job). The job's own short
    link is not named either, for the same reason, and because a job closed
    to new applicants answers "this role isn't open". The copied step link
    goes straight to the step, through sign-in too.
  - A closed application (rejected or hired) never gets this screen: its
    `phase` stays on the step the decision found it at, so a phone opening
    that step sees the decision card ("The hiring team has made a decision"),
    the same card a step behind them shows.
  - When a page that read itself as a computer is refused by the server
    (`computer_required`) mid-step, the gate swaps the page out for this
    screen. The page's integrity monitor then ends quietly and records no
    "left the test page", and the screen drops "Nothing has started here"
    (an attempt may have been opened when the page mounted).
- The connection check's "I can't right now, run it here anyway" escape is
  REMOVED on phones and tablets. On a computer that is not the one they will
  work from, the existing "No → open this step on that computer" path stays,
  and "run it here anyway" stays for computers only (still flagged to staff).
- The server agrees: `connection-test`'s `record` refuses a run whose stamps
  or device say phone/tablet (plain-words 400), so the gate cannot be skipped
  by editing the page. The typing test, chat practice and interview functions
  record the device kind their attempt started on (from the request's
  User-Agent, the same parser), and a phone start is refused the same way.
  **The server enforces STARTS only.** A phone or tablet may CONTINUE an
  attempt a computer started (`computerGateForAttempt` in
  `supabase/functions/_shared/assessmentSession.ts`: the chat or interview
  turns and its evaluation or submit, the typing test's complete and
  submit, the connection check's events and record), and a retried submit
  on a finished step gets its normal answer. A new timed typing run and
  every sales chat call are refused outright. What keeps a phone off a
  continuation is the page's own gate (CandidateStepGate shows only this
  screen, and the step page never loads); someone who skips the page can
  finish on a phone what a computer began. Refusing continuations too would
  be a server change (refuse phone/tablet turns and submits on a gated step
  unless the step is finished); not built.
- Staff: **built (2026-10-06).** When the "Continue on your computer"
  screen shows, it makes ONE write, once per step:
  `public.mark_waiting_on_computer(application, step, device_kind)`
  (`supabase/migrations/20261006191020_waiting_on_computer.sql`, called
  through `src/lib/waitingOnComputer.ts`) stamps
  `applications.notes.waiting_on_computer = {step_id, at, device_kind}`.
  SECURITY DEFINER; only the application's own signed-in applicant may call
  it (revoked from PUBLIC and anon), on a reached, unfinished step the rule
  above covers, from a phone or a tablet, on an application not yet decided
  (one at `interview` is refused, HF001, as every reader treats it as
  decided); a stamp already naming the step is kept as it is (`at` = the
  first time they hit the gate) unless something happened on the step since
  (an attempt started or moved, or staff reopened it) or its time is
  unreadable or in the future: then a fresh stamp is written, so a later
  visit to the gate (a retake, or after starting on a computer) is shown
  again. It goes through
  `merge_application_notes`, opens no attempt, records no event and changes
  no status or phase. Applied to production (the function is live; checked
  2026-10-07). Where it is missing (an older database), the call fails
  quietly (logged) and staff see what they saw before.
  The staff record reads it (`waitingOnComputerOf`, `src/cockpit/lib/assessmentRecord.ts`):
  the step's live words are "Waiting to continue on a computer · opened on a
  phone 2 h ago", `record.live` is that (state `waiting`, amber), and the
  applicants list's one line and the profile's rail say "Waiting to continue
  on a computer · <step> · step 3 of 7" (`journeyLineRuns`). The person
  stays on Part-way, and reaching the screen counts as their last move. The
  stamp is IGNORED, never cleared, once the step's result is on file, the
  application is decided, an attempt on the step is being taken or has moved
  since the stamp (they went to the computer), the step is not theirs now,
  or the rule does not cover it. The applicant could write the key
  themselves (notes outside the protected subsets are theirs); it only ever
  describes them, and a stamp dated more than a minute in the future is
  ignored (it used to read "Active now" forever). The connection check's old phone hint is gone with the
  gate: `earlierNoOf`'s phone/tablet branch (ConnectionCheckPhase) no longer
  fires for new visits, because a phone never reaches that page, so someone
  who opened the check on a phone and then took it on their computer reads
  as a plain "Yes", not "no_switched".

## "Email me the link" (2026-10-07)

On the first live day three applicants reached "Continue on your computer" on
a phone and did not carry on. The owner: *"make it a little bit easy if there
is a way. I don't know, but I think that's fine. If they want to, they will
continue."* So it is one optional button, not a redesign. (This document used
to say the screen had no such button because no email could be sent. Email
has been live since 2026-10-04.)

- **The button** is the screen's main action when the applicant has an
  address to send to: one press emails the link to the address they are
  signed in with, so it is waiting in their inbox when they sit down at the
  computer. "Copy link" stays beside it (and is the main action when there
  is no address). One line under the buttons says what happened, in plain
  words: "Sent to maria@example.com. Open it on your computer."; "We sent it
  a moment ago. Check your inbox and your spam folder, or try again in 2
  minutes."; "Emails are turned off for your account, so nothing was sent.
  Copy the link instead."; "Couldn't send it just now. Copy the link instead,
  or try again in a few minutes." It only ever says "sent" when the server
  said so. After one goes the button rests ("Email sent") for three minutes.
- **The email** comes from the hiring team like every other candidate email:
  "Continue your application on your computer". It says they asked for it,
  that the next part is done on the computer they would use for the job,
  gives the button ("Continue my application": their applications, through
  candidate sign-in, the same place the screen names) and the address to type
  by hand, and says everything so far is saved. It never names what does the
  checking behind the tests.
- **It is the one email an applicant can ask the system to send, so it trusts
  nothing in the request** (`supabase/functions/_shared/continueOnComputerEmail.ts`,
  called from `send-notification-email` for the type `continue_on_computer`):
  - the page sends only the application's id (`src/lib/sendContinueLinkEmail.ts`);
  - it goes to whoever is signed in (read from their own sign-in), never to a
    user id or an address in the request;
  - the application must be theirs and not closed; someone else's and one
    that does not exist read the same;
  - the applicant's name, the job's title and the team's name are looked up,
    so nothing typed on a page reaches the email's words;
  - their email settings are respected as for any candidate email;
  - it is limited on the server: one every three minutes and four an hour
    for one person, and 150 an hour for everyone together. When the limiter
    cannot be asked, nothing is sent. (The other limits in
    `_shared/rateLimit.ts` let a call through when the limiter is down,
    because they guard a test in progress; this guards a convenience, and the
    mail quota every other email depends on.)
- **"Sent" is only said when it is true.** The mail client does not throw
  when the provider refuses a message (a spent quota, an address it will not
  take): it answers `{ data: null, error }`, and the function used to log
  that and report the email as sent. It now answers 502 with `success: false`
  for every kind of email, so this button says "Couldn't send it just now"
  and every other caller's "sent" means the same.
- **Nothing starts.** Pressing it opens no attempt, starts no test or timer
  and records no integrity event, like everything else on that screen.
- The dev preview never sends anything: it answers as the function would,
  and `?__previewEmail=wait | off | fail` shows the other three outcomes.

## Proof

- "Email me the link": `scripts/continue_link_email.test.mjs` (the email's
  words; who may have it; the limits, and that a limiter that cannot be asked
  sends nothing; one request decided start to finish with a hostile request
  body; how the page reads each answer; the wiring). The function's real
  handler was also run under Deno with every network call answered by a
  stand-in (sign-in, database, limiter, mail provider; nothing sent): the
  applicant's own address only, whatever the request named; the second press
  refused; signed out, someone else's application, a closed one, a limiter
  that is down and a provider that refuses all send nothing; the other kinds
  of email unchanged. And all 21 kinds were built offline before the deploy.
  In a browser: `scripts/computer_only_browser_check.mjs` (the button on an
  iPhone: says where it went, rests, starts nothing).

- Staff line: `scripts/waiting_on_computer.pglite.test.mjs` (the function
  against the real migrations: who may call it, which steps, once per step,
  no attempt, the forgery guard still guarding) and
  `scripts/waiting_on_computer.test.mjs` (the record, the rail and the list
  read it, and ignore it when it is no longer true).

- Unit: the gate decision for each step of a job with and without a
  connection check; the device decision for the user agents in
  `scripts/connection_check_client.test.mjs`.
- Server: `record` with a phone device is refused; a typing/chat/interview
  start from a phone UA is refused.
- Browser: at a phone viewport with a mobile UA, the form and skills check
  work; the connection check, typing test, chat practice and interview each
  show only "Continue on your computer"; at 1280 with a desktop UA they all
  run. Also (`scripts/computer_only_browser_check.mjs`): an Android tablet on
  Chrome's default desktop site and an iPhone on "Request Desktop Website"
  are gated and named tablet and phone; every card button on the
  applications list opens its own step on both viewports (never a 404); a
  fresh arrival at `/applications` on a computer with one step waiting opens
  that step, and the list stays with two; a closed application's step shows
  the decision card on a phone.
