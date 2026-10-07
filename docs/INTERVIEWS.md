# Interviews with applicants (2026-10-07)

The live conversation with an applicant, after the tests: how it is set up,
whose clock its time is written on, and where the call happens.

## Setting one up

"Set up interview" on an applicant's profile
(`src/cockpit/pages/CandidateDetail.tsx`) opens
`src/components/InterviewSchedulingWizard.tsx`:

- **Offer times** (the default): up to six start times. The applicant gets
  an email, picks one on their application page
  (`CandidateInterviewConfirmationCard`, server side
  `candidate-interview-response`), and it lands on the staff Interviews page
  (`src/cockpit/pages/Interviews.tsx`).
- **Book one exact time**: for a time already agreed some other way. The
  applicant confirms it or asks for another.
- A first conversation is 30 minutes unless changed.
- Setting one up moves the application to the interview stage.

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

## What the applicant sees

One reading of the interview row, `src/lib/candidateInterview.ts`, used by
the applications list, the application page and the pop-up, so the three
cannot disagree. Four stages:

| Stage | The row | What they are asked |
|---|---|---|
| **pick** | `candidate_response = 'awaiting_pick'` | Choose one of the offered times, or say none work and suggest their own. |
| **confirm** | `pending` or empty, time still ahead | Confirm the one time the team set, or ask for another. |
| **waiting** | `reschedule_requested` | Nothing: the team has their times. The offered times stay pickable. |
| **confirmed** | `confirmed`, time still ahead | The time, how to join, a calendar file, "Can't make it?". |

- **The applications list** (`src/pages/Applications.tsx`): the card carries
  the interview's own block (`InterviewCallout`) with its own button, above
  the step. When the next move is the applicant's, that button is the one
  solid button on the card and the step's button steps back to an outline.
  Before 2026-10-07 an applicant who had been offered times saw a small
  "Pick your time" chip beside "Take Assessment" and had to guess that the
  row opened (the owner, testing as an applicant: "make it very clear when
  the interview is scheduled").
- **The application page** (`src/pages/CandidateApplicationDetail.tsx`): the
  interview card (`CandidateInterviewConfirmationCard`) comes first, above
  the step panel; `#interview` in the address lands on it.
- **An offered time is never shown as the appointment.** While they choose,
  the row's `scheduled_at` is only a placeholder (the earliest offered
  time): no date, and no link to join, is shown from it, on the card or in
  the pop-up (`CandidateStatusScreen`).
- **Suggesting other times** ("None of these work?", "Ask for another
  time", "Can't make it?") is one dialog, `CandidateRescheduleRequestDialog`:
  at least two times, an optional note. The team answers on the Interviews
  page.
- **Every time is on the reader's own clock, and says so** ("Times are on
  your own clock (GMT+8)").
- **The link to join** (the built-in room, or the team's own) opens 15
  minutes before the start, not earlier: one Google Meet link serves every
  interview, so it is not handed out days ahead.
- **The applicant's menu has no "Enter Job Code"** (removed 2026-10-07 at the
  owner's word). `/apply` still answers an old link that carries a code.

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
written by hand, nothing stored, no AI): how the half hour runs, the opening
question ("Why should we hire you for this role?"), five questions everyone
gets, two to close, five things to mark from 1 to 5 straight after, and one
question to answer for yourself. Everyone gets the same ones so the answers
can be compared. A team lead job (the scorer's own `inferJobFamily`) gets
questions built on the owner's concerns: the team they led, working the chats
while leading six people, tools and rules that change or break mid-shift, an
agent's wrong promise about money, and an agent who is struggling. Any other
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
asked. Marks are not stored: they are for the owner's own notes.

The old "Interview Questions" dialog (generic, sales-flavoured, tied to a
scheduled interview, and opened by no screen) was removed.

## Proof

The guide: `scripts/interview_guide.test.mjs` (the plan, the reader, what the
writer is and is not given, the request, the reading of the answer, the
function's access rule, the wiring) and
`scripts/interview_guides.pglite.test.mjs` (against a real Postgres: the
applicant cannot read their own guide, nobody writes the table from a client).
Before it shipped, a private trial copy of the function wrote guides for
three real applicants; every quote it offered checked out as their own words.

The applicant's side: `scripts/candidate_interview.test.mjs` (the four
stages, the words, an offered time never presented as the appointment, the
list's block, the page's order, the invitation lookup and its honest
outcome, the menu). A walk-through in the dev preview
(`?__previewRole=candidate&__previewInterview=pick,own`, also `confirm`,
`waiting`, `confirmed`) picked a time, suggested others and confirmed one,
on a computer and a phone, and read back what was sent.

Times: `scripts/interview_times.test.mjs`: the Eastern-to-Manila case, no zone on
file, daylight saving, half-hour zones, where the zone is read from, and the
wiring of all four email paths and of the owner's own link. A walk-through in
the dev preview (an owner on US Eastern, an applicant whose check recorded
another zone) read back what would have been emailed.
