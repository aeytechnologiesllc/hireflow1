# Interviews with applicants (2026-10-07)

The live conversation with an applicant, after the tests: how it is set up,
whose clock its time is written on, and where the call happens.

## Setting one up

"Set up interview" on an applicant's profile
(`src/cockpit/pages/CandidateDetail.tsx`) opens
`src/components/InterviewSchedulingWizard.tsx`:

- **Offer a time** (the default): one start time, and only one. The
  applicant gets an email, books it on their application page
  (`CandidateInterviewConfirmationCard`, server side
  `candidate-interview-response`), and it lands on the staff Interviews page
  (`src/cockpit/pages/Interviews.tsx`). If they cannot make it they write
  when they are free and the owner sets a new time (see "When the applicant
  can't make it"). Choosing another time on the wheel replaces the one
  chosen. Until 2026-10-07 the wheel took up to six and the applicant picked
  among them.
- **Book it directly**: for a time already agreed some other way. The
  applicant confirms it or says they cannot make it.
- **Two clocks on the wheel, and a suggestion** (`src/lib/interviewSuggestion.ts`,
  `src/hooks/useJobInterviewHints.ts`). The owner, picking a time for someone
  twelve hours ahead (2026-10-07): "can you also make it so I can see the
  Philippine time as well next to it ... And kind of also show me a
  suggestion always in there, what would be good based on the job ... if
  they're used to it or not. Because it's got to be good for me too."
  - Every time on the wheel shows the applicant's own time beside the
    owner's. Their clock is the one their connection check recorded; when
    none is on file, the one the job is posted for (its country, or the
    clock its post writes the shift on), and the screen says so. That
    fallback is for the screen only: an email never states a guessed clock.
  - "Suggested" is the times inside the job's own shift when its post states
    one ("3:00 AM to 11:00 AM Philippine time"): the hours they would work,
    so the interview shows whether they are up for it. With no shift in the
    post it is the applicant's waking hours (7:00 AM to a 9:30 PM start on
    their clock). The owner's side is already covered: the wheel only offers
    his 9:00 AM to 8:00 PM.
  - The wheel starts each day on the first suggested time, until he moves it
    himself. "Go to 3:00 PM" brings it back.
  - A wheel row is exactly as tall as the wheel counts on. On a phone the
    stylesheet's 44px button floor made rows taller, so the lit row and the
    button drifted a row apart further down the list.
- **The applicant's page says where their interview stands**
  (`src/lib/teamInterviewStatus.ts`, `useLiveInterviewForApplication`). The
  owner, minutes after his first invitations (2026-10-08): "I just set him up
  for an interview, but it didn't change here. It still says set up
  interview. Can you see if that one went through?" It had; the page read no
  interview at all. Now "Your decision" says "Interview offered ... Not
  booked yet", "Interview booked", or "X can't make it", with the time on
  both clocks, and its button becomes "Change the time" (or "Set a new time",
  which opens the Interviews page). It changes live when the applicant books.
  Changing the time replaces the interview, and the applicant is told it is
  a new time.
- **It opens on the first day that still has a time to offer**
  (`src/lib/interviewOfferDays.ts`). It used to open on today, always: after
  8:00 PM every one of today's times has passed, so the owner, who sets
  interviews up in the evening, was met with an empty wheel and had to find
  tomorrow himself. Today stays in the strip and says it has no times left.
  Booking a time directly had the same hole (any time of today could be
  chosen, passed or not): a passed time is now switched off there.
- **A time that runs into another interview is said before it is sent**
  (`src/lib/interviewClash.ts`): "You already have an interview with Ana at
  this time", or "You offered this time to Ana as well. Whoever books first
  gets it."
- A first conversation is 30 minutes unless changed.
- Setting one up moves the application to the interview stage.

**One live interview for an application.** Setting up a new interview
replaces any earlier one that is still live (it is marked cancelled once the
new one is safely made). On 2026-10-07 the owner set up a second interview
for the same applicant and both sat on the Interviews page, one "No time
yet" and one confirmed.

The applicant can ask to reschedule, and either side can save a calendar file
(`src/lib/calendarInvite.ts`). No reminder email is sent: the
`interview_reminder` kind exists in `send-notification-email` but nothing
asks for it.

**The invitation email was never sent before 2026-10-07.** After making the
interview the wizard looked the applicant up with a select that also asked
for the employer's company name through `profiles:employer_id(...)`.
`profiles` has no foreign keys, so PostgREST refused the whole request (400),
the wizard treated that as "nobody to email", and its success screen read
"Interview scheduled — they'll see it in HireFlow". The owner's own test
found it (the request log showed the 400 and no call to the email function).
The offline preview had hidden it: its stand-in database does not parse
select strings. Now the lookup is `candidate_id, jobs(title)`, a failed
lookup is reported as a failed email, and the success screen says plainly
when no email went out (`inviteEmailWords`, `src/lib/interviewTimes.ts`).
`scripts/candidate_interview.test.mjs` fails if any screen embeds `profiles`
in a select again.

**A tab left open used to keep running old code.** At 22:29 UTC on
2026-10-07, two and a half hours after the fix above was live, the owner set
up a second test interview and the invitation email was again not sent: the
request log shows the OLD lookup (the 400). His staff tab had been open since
before the fix, and the app only reloads when a page's code can no longer be
fetched at all. Staff tabs were then made to move to the newest build as
they changed page. That was not enough: the same evening he sat on one
applicant's page while a new set-up screen went live, opened it without
changing page, and got the old one. His words: "you also need to make sure
that it will force reload ... all the applicants applying, they're not going
to see a new version unless you do a hard refresh."

So now **every tab moves to the newest build by itself, staff and
applicant** (`useAutoUpdate`, mounted at the root of the app;
`src/lib/newVersion.ts`). The tab asks for the front page every three minutes
while it is in view and whenever it is looked at again, and compares the
build's entry script with its own. Once a newer one is live it reloads at the
first moment that throws nothing away (`safeToReloadNow`):

- on arriving at a page (unless the page just left was a busy one: what it
  sent may still be on its way);
- when the tab is out of view;
- or after it has sat untouched in view for 45 seconds.

And never:

- on a busy page (`isBusyPath`): any test step or interview room (everything
  below an application's own page), the team's interview room, signing in,
  the short application forms, writing a job;
- over an open pop-up, with the cursor in a field, or after anything was
  typed, chosen or uploaded on the page;
- twice for one build (if the reload still lands on the old one, the tab is
  left alone rather than reloaded in a loop).

No hard refresh is needed for any of this: the front page is served to be
re-checked every time (`max-age=0, must-revalidate`) and the app keeps no
service worker. `scripts/new_version.test.mjs` proves the rule, and that
every route below an application's page counts as busy, so a step added
later is covered without anyone remembering.

## What the applicant sees

One reading of the interview row, `src/lib/candidateInterview.ts`, used by
the applications list, the application page and the pop-up, so the three
cannot disagree. Four stages:

| Stage | The row | What they are asked |
|---|---|---|
| **pick** | `candidate_response = 'awaiting_pick'` | Book the offered time, or say they cannot make it and write when they are free. |
| **confirm** | `pending` or empty, time still ahead | Confirm the one time the team set, or say they cannot make it. |
| **waiting** | `reschedule_requested` | Nothing: the team has their message and will set a new time. The offered time stays bookable. |
| **confirmed** | `confirmed`, time still ahead | The time, how to join, a calendar file, "Can't make it?". |

- **Being selected is a celebration, and it is all they see.** The owner sent
  the first version back the same evening (an amber notice box above "Take
  Assessment"): "this SaaS dashboard yellow color ... It needs to be an
  actual applause. You have been selected for an interview. Boom, boom,
  shabam. Get rid of the skill test ... they should not even be seeing the
  skill test or anything else because they have already been selected for
  an interview. ... It all needs to happen in real time too." So:
  - **One sentence, everywhere**: "You've been selected for an interview"
    (`SELECTED_TITLE`), under "Congratulations".
  - **The moment** (`InterviewSelectedMoment`,
    `src/components/candidate/InterviewCelebration.tsx`): full screen, the
    seal pressing in, paper thrown once in the brand's own colours (a popper
    from each lower corner, then one from the middle), and one button. Shown
    once for each interview on each browser (`hf-interview-celebrated:<id>`
    in localStorage), whether the news arrives live or they open the page
    later. It stands still for anyone who asked for less motion.
  - **While an interview is live it is all the application shows.** On the
    list (`src/pages/Applications.tsx`) the card IS the interview
    (`InterviewHero`, on the lit jade-and-brass surface `InterviewSurface`):
    no step, no "Take Assessment". On the application page
    (`src/pages/CandidateApplicationDetail.tsx`) the interview card comes
    first, and the step panel and the list of steps are not shown
    (`interviewLive`). Someone selected is never forwarded to a test on
    arrival either. The steps come back if the interview is cancelled.
  - **Live.** The list listens to `applications` and to `interviews` on one
    subscription that lasts the life of the page, and catches up when the
    line connects. Before, it was torn down and remade after every refetch
    and never heard about interviews, so an answer from the team waited for
    a reload. The page has its own subscription; the owner's screens were
    already live (`useEmployerLiveSync`).
  - **Phones.** The global phone stylesheet restyles every `button` and
    `[role="button"]` (12px text, 10px side padding, 44px high) at a
    specificity no class beats, so the celebration's buttons carry their
    sizes inline, and the hero card is not given `role="button"`.
- **The application page**: `#interview` in the address lands on the card.
- **An offered time is never shown as the appointment.** While they choose,
  the row's `scheduled_at` is only a placeholder (the earliest offered
  time): no date, and no link to join, is shown from it, on the card or in
  the pop-up (`CandidateStatusScreen`).
- **"Can't make it?"** is one dialog, `CandidateRescheduleRequestDialog`:
  a text box for when they are free, and no time pickers (see "When the
  applicant can't make it"). The team sets the new time on the Interviews
  page.
- **Every time is on the reader's own clock, and says so** ("Times are on
  your own clock (GMT+8)").
- **The look is the "Ticket", and no button is a dark slab.** From a photo of
  the confirmed card the owner said (2026-10-07): "why are we still using the
  ugly old design, black buttons, and cheap, cheap style ... before you
  recreate it or change it ... I need you to show me the screenshots first of
  the design ... especially these harsh black buttons. I don't like them.
  Always choose modern." Three options were drawn first (a standalone page
  with the real colours and fonts, one picture each); he chose "Ticket". A
  confirmed interview, and one waiting to be confirmed, is a ticket: the date
  on a stub at the left (weekday, day, month), torn along a dashed line, the
  time large beside it. Each offered time is a small ticket with its own
  "Choose". The stub is three short labels, so the surface carries the date
  in words for a screen reader. Buttons are four kinds of pill and nothing
  else (`.hf-pill` in `src/styles/motion.css`): jade (the one thing to do),
  tonal (a soft tint of the text colour), mint (a soft tint of jade) and
  text. The stock `Button` is not used on these screens or their pop-ups:
  its `outline` variant is `bg-background`, a black slab at night. Fields on
  the pop-ups use the same tint (`.hf-field`), and pop-ups are soft rounded
  sheets (`.hf-sheet`). The same pills are on the team's "Other times
  suggested" pop-up. **For any redesign: draw options and show them before
  changing a screen.**
- **Nothing is booked on one tap.** Choosing a time asks "Book this time?"
  with the day and time in words; only "Yes, book it" sends the answer, and
  moving a booked time asks the same way. The owner, 2026-10-07: "as soon as
  I clicked on the time, it just went ahead and did it. It didn't say, are
  you sure."
- **The way in** (`joinPlan`, `src/lib/candidateInterview.ts`): a link of the
  team's own opens **two hours** before the start (the owner: "it will be
  available a couple hours before"); the built-in room fifteen minutes
  before, which is when the room itself opens. The Join button is always a
  real button: before the way in opens it shows when it will ("Join opens
  Sun at 7:00 AM"; `joinOpensWords`) and, pressed, says so instead of doing
  nothing.
  The link itself is not on the page before then (one Google Meet link
  serves every interview); the calendar file carries it.
- **A confirmed interview stays on the page through its length and for an
  hour after** (`interviewLiveUntil`), so someone running late still finds
  the way in. Until 2026-10-07 the whole card disappeared at the minute the
  interview started.
- **The page announces what the TEAM does, not what the applicant just
  did.** Its "your interview was rescheduled" pop-up fired for the
  applicant's own pick as well; their own answers are now marked for a few
  seconds (`src/lib/ownInterviewChange.ts`) and a first pick among offered
  times is never a reschedule. A cancelled interview is announced only when
  no other took its place.
- **The applicant's menu has no "Enter Job Code"** (removed 2026-10-07 at the
  owner's word). `/apply` still answers an old link that carries a code.

## One time, one applicant

The owner offers the same handful of times to several applicants at once (on
2026-10-07 he was about to invite nine). Until then nothing stopped two of
them booking the same one. Now the first to book a time gets it.

- **What counts as taken**: another interview of the SAME hiring team that
  is booked (`status = scheduled`, `candidate_response = confirmed`) and
  overlaps the offered time. Back to back is not an overlap. An offer nobody
  has answered takes nothing. (`takenWindowStarts` in
  `supabase/functions/_shared/interviewAnswer.ts`.)
- **The applicant does not see a taken time.** Their page asks the function
  which of its offered times are gone (`action: "open_slots"`, writes
  nothing) when it opens, when they come back to it, and once a minute while
  they are choosing.
- **Two people tapping the same time**: the function looks again at the
  moment of booking and refuses the second with `slot_taken`. That applicant
  is told "That time was just taken", the time leaves their list, and nothing
  about their interview changes.
- **The offered time taken**: the page says so and they write when they are
  free.
- **If the look-up itself fails, nobody is blocked.** A double booking the
  team can sort out is better than an applicant who cannot book at all.
- **Not covered**: this is a look and then a write, not a database lock, so
  two bookings inside the same split second could both land. It also only
  knows interviews made in this tool, not the owner's own calendar.

## What the interview is, said before anyone has to ask

A finalist wrote to the owner on 2026-10-08, the morning after booking: "I
previously completed the chat practice and written interview ... I understood
from the previous communication that the position is fully remote and
chat-only. Could you please let me know what the upcoming 30-minute video
interview will cover and whether this is the final interview stage?" Nothing
had told him. The owner: "we should clarify ... chat interview has been done.
Now you will have a video interview with the hiring team ... this is the
final stage ... so other [applicants] don't ever get confused."

So one sentence is said everywhere an applicant learns they were selected:
**"This is the final step: a 30-minute video call with {team}. It is a
conversation, not another test."** (`interviewAboutWords`,
`src/lib/candidateInterview.ts`: the length and the kind come from the
interview itself; a phone call and a meeting in person are said as what they
are.)

- **The page**: the full-screen "selected" moment, the interview card on the
  list, and the card on the application (offered, to confirm, booked).
- **The invitation email** opens with it ("You have completed the online
  steps, and you have been selected for the final step ..."), before the
  time. The sender passes the kind and the length; the email function keeps
  only one of three fixed phrases and a short length, never text from the
  request.
- **The confirmation email** has "What to expect" with the same.
- **The bell** (`*_interview_bell_final_step.sql`): "You passed the online
  steps for X. The final step is a 30-minute video call with the hiring
  team ...".
- **Before anyone is chosen**: the screen after the last test, and the
  application's own page once every step is done, add "Finalists are invited
  to one last step: a short interview with the hiring team, usually a video
  call." (`FINALIST_LINE`), so a video call is never a surprise to someone
  whose job post says chat only.
- **Questions go to Messages.** Both interview emails end with "Questions
  before then? Open Messages in your account and write to the hiring team."
  The finalist had replied to the email, and the owner could not answer from
  the hiring address. A message in the app stays on the applicant's record,
  and its answer is emailed to them from the hiring address (`new_message`,
  first 100 characters, with a button to read it).

Proof: `scripts/candidate_interview.test.mjs` ("What the interview is, said
before anyone has to ask"), `scripts/notification_access.test.mjs` (both
emails through the real function, hostile kind and length left out),
`scripts/notifications_triggers.pglite.test.mjs` (the bell).

## When the applicant can't make it

The owner, 2026-10-07: "I wanna just give them one time for the interview,
not two, just one. And ... if they cannot make it on that time, don't let
them just select times. Let them write a message ... type out your
availability. Not like actual time, your availability ... And then I get to
schedule it. Because I don't want them to pick two times and then I can't do
those two times. Then we have to do too much back and forth."

So there are no time pickers on the applicant's side any more.

1. **The applicant** presses "Can't make it?" (on an offered time, a time
   set for them, or one already booked) and writes which days they are free
   and from what time to what time (`CandidateRescheduleRequestDialog`: one
   text box, 3 to 500 characters). It is sent as
   `reschedule_requested` with `availability` and their browser's time zone.
2. **The function** keeps the words in `interviews.candidate_note` (one
   line: a line break becomes "; "), keeps no times, and leaves only the
   `fromOffer` mark in `proposed_times` when no time had been agreed
   (`cleanAvailability`, `availabilityToStore`). The applicant's page moves
   to "waiting" and shows them what they wrote.
3. **The team is told** by bell and email ("X can't make the interview
   time"): the time they cannot make on the team's clock, what they wrote,
   and how far their clock is from the team's ("12 hours ahead of yours"),
   because "9 to 2" is on the applicant's clock.
4. **The team sets the new time** on the Interviews page ("Set a new time",
   `EmployerRescheduleReviewDialog`): a day and a clock time, any half hour
   of the day, each shown with the applicant's own time beside it. It goes
   back to the applicant as an offered time to book (`awaiting_pick`, one
   entry in `employer_windows` marked `again: true`), never booked for them
   unseen. Their page says "A new time", their email "A new time for your
   interview", and the team is told when they book it.
5. If they still cannot make it, the same loop: they write, the team sets.

On the Interviews page a time that is only offered reads "Offered · Sat 10 /
9:00 pm · Not booked yet", smaller and quieter than a booked one; an
availability answer reads "No time yet · Your call · Can't make it".

An answer sent from a page left open since before this (a list of times of
the applicant's own) is still read and answered the old way, below.

Proof: `scripts/interview_answer.test.mjs` ("'I can't make it': their
availability, in words"), `scripts/candidate_interview.test.mjs` ("One time
from the team, and no times from the applicant"),
`scripts/notification_access.test.mjs` (both emails through the real
function). Preview: `__previewInterview=pick,own,one` (also `,again`,
`,taken`) and `waiting` as the owner (`,manila` puts the applicant twelve
hours away; `waiting,times` is the older answer).

## When the applicant suggests other times

(Answers from before 2026-10-07, and from a page left open since.)

Every answer an applicant gives is written by the
`candidate-interview-response` function (their browser may only read the
interviews table): `confirm`, `pick_slot`, `repick_slot`,
`reschedule_requested`. Its reading and wording live in
`supabase/functions/_shared/interviewAnswer.ts`.

- **What may be stored.** Suggested times are cleaned first: real moments,
  still ahead, no repeats, at most six, soonest first; the note is plain text
  up to 500 characters. Before 2026-10-07 whatever the browser sent was
  stored as it came. An offer cannot be "confirmed": a time has to be picked.
- **Was a time ever agreed?** A suggestion made while still choosing among
  offered times is a different thing from asking to move an agreed time. The
  function marks each such suggested time `fromOffer: true`
  (`interviews.proposed_times`), because the row's own `scheduled_at` is only
  a placeholder then.
- **What the team is told** (their bell, and the reschedule email) states
  the time on the team's own clock when the wizard recorded it
  (`employer_windows[].zone`, written since 2026-10-07), otherwise on the
  applicant's clock and says so ("9:00 PM GMT+8 (their clock)"). It used to
  be the server's clock, UTC, with no zone: "1:00 PM" for the 9:00 AM the
  owner had offered.
- **The team answers** on the Interviews page ("Review times",
  `EmployerRescheduleReviewDialog`):
  - *Accept this time*: the interview is set to it and is **confirmed**. The
    applicant suggested it, so nobody is asked to confirm again (it used to
    go back to "pending"). They are emailed the time on their own clock.
  - Answering a move of a set time: *Keep the time as it is* (they are asked
    to confirm it).
  - Answering an offer (`fromOffer`): there is no "original time" and no
    "keep". *None of these work* sends them back to choosing among the
    offered times still open, with the invitation email again. When the
    offered times have all passed, the button is off and the dialog says to
    accept one of theirs or message them.

- **When a time becomes agreed, both sides are emailed** (a pick, a swap to
  another offered time, a confirm): the applicant gets "Your interview is
  confirmed" with the date and time on their own clock (their browser's
  zone, else the one their connection check recorded, else the team's, named
  either way), the length and how to join; the job's owner gets "X picked an
  interview time" with the time on the team's clock. The function sends them
  after its answer has gone back (`EdgeRuntime.waitUntil`), so a slow mail
  service can never make a saved pick look failed. The words are built by
  `agreedTimeEmails` (`_shared/interviewAnswer.ts`); the applicant's time by
  `_shared/interviewTimes.ts`, a byte-identical copy of
  `src/lib/interviewTimes.ts`. The kinds and who may send them:
  docs/NOTIFICATION-EMAILS.md. Before 2026-10-07 neither existed: the
  applicant saw it only in the app and the team got only a bell.
- **The Interviews page never shows a placeholder as the appointment.** While
  no time is agreed (`noTimeYet`: still choosing, or a suggestion that
  answers an offer) the row reads "No time yet · They pick" or "Your call"
  instead of a clock time, and the brief says "No time yet" instead of "Set
  for ... ready for Thursday".

## Whose clock a time is written on

**The rule: a time that leaves for an applicant is on the applicant's own
clock and names the time zone. Never a bare time.**

What was wrong: every interview email printed the hiring team's clock with no
zone. The owner is on US Eastern and the applicants are in the Philippines,
exactly twelve hours ahead, so "8:00 PM" read as the applicant's evening and
was their morning. It was found on 2026-10-07, before the first invitation
went out. (The application page was always right: the browser shows the
stored instant on its own clock.)

- The applicant's zone comes from their computer and connection check, which
  records the browser's own: `notes.equipmentCheckResult.device.timezone`.
  Everyone who reaches an interview on the live job has passed that step.
- `src/lib/interviewTimes.ts` writes the words:
  "Friday, October 9 · 8:00 AM Philippine Standard Time". With no zone on
  file it writes the team's clock and names that zone instead
  ("8:00 PM Eastern Daylight Time").
- Four places send a time to an applicant, and all four go through it: the
  wizard (invitation and exact time), `RescheduleInterviewDialog`,
  `EmployerRescheduleReviewDialog` (both answers) and cancelling on the
  Interviews page. `src/hooks/useApplicantTimeZone.ts` looks the zone up and
  never throws: a failed lookup only means the team's clock is named.
- In the wizard the owner picks on their own clock and sees the applicant's
  beside every time ("Thu 8:00 PM", "Fri 8:00 AM theirs"), with one line
  saying where the applicant is and how many hours ahead.

The email function did not change: the labels are plain lines it already
carries (docs/NOTIFICATION-EMAILS.md).

## Where the call happens

- **Built-in video room** (the default when offering times): a private room
  from the `interview-rooms` function (Daily, `DAILY_API_KEY`). It opens 15
  minutes before the start, closes an hour after the end, and holds four
  people. As of 2026-10-07 no real applicant has been in one on the live
  site: rehearse it once before relying on it.
- **A link of the owner's own** (Google Meet, Zoom, Teams, Webex,
  GoToMeeting): when booking an exact time, and since 2026-10-07 when
  offering times too. The interview row then carries `meeting_link` and no
  `meeting_provider`, and both sides get that link to join (the applicant
  once they have picked a time). The last link used is remembered on that
  browser, so one Google Meet "meeting for later" link serves every
  interview.
- **Google Calendar** (a Meet link made automatically) is not connected: the
  `google-calendar` function needs `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`, which are not set.

## The interview guide

"Interview guide" on an applicant's profile, and on each row of the
Interviews page, opens one page to read before and during the call
(`src/cockpit/components/InterviewGuideDialog.tsx`). The owner asked for it on
2026-10-07: "make a system inside that could generate important
questionnaires for the interview ... maybe I just start with why should we
hire you ... I'm more concerned about the thing is constant change, this
whole app, AI, there's a lot of bugs ... team leadership."

It has two parts.

**The plan, the same for every applicant** (`src/lib/interviewGuide.ts`,
written by hand, nothing stored, no AI): words to say as a welcome, the
opening question ("To start, what makes you a good candidate for this
role?"), five questions everyone gets, two to close, one thing to rate for
the whole call (how they speak), and one question to answer for yourself.
Everyone gets the same ones so the answers can be compared. A team lead job
(the scorer's own `inferJobFamily`) gets questions built on the owner's
concerns, from angles the applicant has not already answered (see "How the
questions sound"): the honest picture of the job (they answer players
themselves, lead six agents, and the tools and rules change and have bugs),
a really hard day, someone on their team who disagreed, an agent who is
struggling, and something going wrong when they cannot reach him. Any other
job gets a general set. Every question says what to listen for and what is a
red flag. Nothing is folded away: the page is read during a call.

**The personal part, written for one applicant** by the `interview-guide`
edge function, with one button: a few lines on who they are on paper, three
or four questions only this person should be asked, and facts to confirm.

- It is written from the applicant's own record, which the function reads
  itself. The request names an application and nothing else.
- Who may ask: the job's owner or an active team member scoped to the job,
  by the same functions the applications RLS uses. Not found and not allowed
  read the same (404).
- What the writer is given: the tests' figures, the reviewers' plain notes
  and the applicant's own words (their form, the line a reviewer flagged in
  the practice chat, their written interview), fenced as data. What it is
  NOT given, on purpose: the written-interview grader's verdict, credibility
  rating and list of "inconsistencies" (on the first live days it called 41
  of 43 applicants "No Hire", often for picking the form's top choice), and
  anything about latency (the 200 ms bar fails nearly everyone in the
  Philippines for distance alone). It is told how the form's choices work,
  that second-language mistakes are normal, that a "new promise" flag is one
  reading of one line, and never to accuse.
- A quote is shown as the applicant's words only when it really is in their
  own writing (`personalGuideFrom`). The answer is cut to known keys and
  plain, bounded lines before it is stored or shown (`readPersonalGuide`).
- It is kept in `public.interview_guides`, one row per application, written
  by the function with the service role. **Only the job's hiring team can
  read that table.** It is not in `applications.notes` because an applicant
  can read their own application: they must never see what they will be
  asked or what the interviewer is listening for.
- When the AI service refuses, the function answers the shared 503 and
  stores nothing; the plan is still on the page.

"Copy all" gives the whole guide as plain text, numbered in the order it is
asked, with the interviewer's own ratings and notes under each question.

### How the questions sound (2026-10-09)

The owner, after his first calls: "this looks a little bit too ...
straightforward. Why should we hire you ... I want it to sound more like a
human instead of sounding like I'm reading from a paper ... simple English
... we don't want to ask things we have already asked ... unless it raises a
question."

- **Written to be said.** Short sentences (none over 18 words), one thing at
  a time, and they start the way a person talks: "Can you tell me about...",
  "Let's say...", "Let me tell you what this job is really like." Never the
  bare "Tell me about..." or "Walk me through...". The welcome is words to
  say, not an instruction: it tells the applicant how the call goes and that
  he will take notes, so looking at the screen does not feel like a script.
- **Nothing they have already answered.** By the call a team lead has
  written about the team they led and about a sudden change TWICE (the
  application form, then the written interview's MUST COVER plan), and about
  splitting a shift between players and leading. The old plan asked all
  three a third time. The plan now lists them (`alreadyAsked`), the page
  shows that list above "Ask everyone", and the questions come at his
  concerns from the other side: what the job is really like and how that
  sounds to them, not "tell me about a time".
- **Going back to something they wrote is the personal part's job**, and
  only where an answer left a question. The `interview-guide` function's
  request (version `interview-guide-2`, `guideMaterial.ts`) is told how a
  question must sound, what was already answered in writing, and to return
  to one of those only when the written answer was vague, had no example,
  did not fit another answer, or the written interview never reached it;
  then to say what they wrote and ask for the missing piece.
- If the form or the written interview's plan changes, `alreadyAsked` is out
  of date: `scripts/interview_guide.test.mjs` fails on the written
  interview's four topics for that reason.

### Rating the answers (2026-10-09)

"Give me a button that I could rate all of these answers from 1 to 10. Here
in the interview guide, that way I don't need a separate piece of paper or
something, and I could probably write extra notes here as well."

- Under every question: ten numbers and a notes box. The number chosen is
  solid and the ones under it tinted; tapping it again takes the rating
  away. Two rows of five on a phone. After the call: one rating for how they
  speak, the average of the answers rated, and a box for overall notes under
  the question to answer for yourself.
- **There is no Save button** (it is used during a call). A tap or a word is
  on the screen at once and is sent 0.7 seconds after he stops; the foot of
  the guide says "Ratings and notes saved". Closing the guide, switching
  tabs or apps, or opening another applicant sends whatever has not gone
  yet. Nothing is sent on open, and never before what was saved earlier has
  been read. A save that fails says so, keeps the screen as it is, and does
  not try again by itself: it goes out with the next change
  (`src/cockpit/hooks/useInterviewRatings.ts`).
- They are kept in `public.interview_ratings`, one row per application and
  person who rated, written only through `save_interview_ratings`
  (`supabase/migrations/*_interview_ratings.sql`): the job's owner or an
  active team member on that job, the job taken from the application and the
  rater from the caller. Every entry is read and bounded (a whole number
  from 1 to 10 or none, a note of at most 2000 characters, at most 40
  entries); anything malformed is refused whole. **Only the job's hiring
  team can read that table.** Like the guide itself it is not in
  `applications.notes`, because an applicant can read their own application.
- Each rating keeps the question as it was asked. A question written for one
  applicant has no id, so its rating is kept under a fingerprint of its
  words; when "Write again" replaces the question, the rating is still shown
  at the end of the guide with the question it was given for.
- They decide nothing: no status change, no email, no bell, and the
  applicant's score is not touched.
- In the preview: `&__previewGuide=lead` (a team lead plan),
  `lead,rated` (opens with two answers already rated), `lead,ratedown`
  (every save is refused).

The old "Interview Questions" dialog (generic, sales-flavoured, tied to a
scheduled interview, and opened by no screen) was removed.

## Proof

The guide: `scripts/interview_guide.test.mjs` (the plan and how its questions
sound, the reader, what the writer is and is not given, the request, the
reading of the answer, the function's access rule, the ratings and how they
are saved, the wiring), `scripts/interview_guides.pglite.test.mjs` (against a
real Postgres: the applicant cannot read their own guide, nobody writes the
table from a client) and `scripts/interview_ratings.pglite.test.mjs` (against
a real Postgres: who may save and read ratings, what is kept and what is
refused, and that the applicant can never read how they were rated).
Before it shipped, a private trial copy of the function wrote guides for
three real applicants; every quote it offered checked out as their own words.

The applicant's side: `scripts/candidate_interview.test.mjs` (the four
stages, the words, an offered time never presented as the appointment, the
celebration and its once-only rule, no step shown while an interview is
live, the live list, the page's order, the invitation lookup and its honest
outcome, the menu). A walk-through in the dev preview
(`?__previewRole=candidate&__previewInterview=pick,own`, also `confirm`,
`waiting`, `confirmed`) picked a time, suggested others and confirmed one,
on a computer and a phone, and read back what was sent.

One time, one applicant: `scripts/interview_answer.test.mjs` ("One time, one
applicant": what overlaps and what does not, the refusal before anything is
written, the same-team rule, the look-up that blocks nobody when it fails,
the page). In the preview, `__previewInterview=pick,own,taken` hides a time
someone else booked and `pick,own,race` loses the race at the moment of
booking.

The exchange: `scripts/interview_answer.test.mjs` (whose clock the team
reads, what may be stored, whether a time was ever agreed, the bell's words,
the function, and the team's three answers).

Times: `scripts/interview_times.test.mjs`: the Eastern-to-Manila case, no zone on
file, daylight saving, half-hour zones, where the zone is read from, and the
wiring of all four email paths and of the owner's own link. A walk-through in
the dev preview (an owner on US Eastern, an applicant whose check recorded
another zone) read back what would have been emailed.
