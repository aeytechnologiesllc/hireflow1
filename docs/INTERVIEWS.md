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

## Proof

`scripts/interview_times.test.mjs`: the Eastern-to-Manila case, no zone on
file, daylight saving, half-hour zones, where the zone is read from, and the
wiring of all four email paths and of the owner's own link. A walk-through in
the dev preview (an owner on US Eastern, an applicant whose check recorded
another zone) read back what would have been emailed.
