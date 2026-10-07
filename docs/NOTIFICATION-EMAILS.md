# Who can make the system send an email (2026-10-07)

Every product email goes out through one edge function,
`supabase/functions/send-notification-email`: the decline note, "You've got
the job", interview times, document requests, message alerts, the hiring
team's own alerts. This is who may ask it for each, and what the email may
say.

## What was wrong

Until 2026-10-07 the function sent whatever it was asked. The kind of email,
the recipient's user id and every word in it came from the request, and the
request needed nothing but the site's public key (the gateway lets that key
through even with `verify_jwt = true`; a signed-out request reached the
handler). So anyone who knew how could have the hiring address send any user
an official-looking "You've got the job", a decline, an interview time or a
document request, signed with any company's name, or flood an employer with
alerts. Found while adding "Email me the link" (docs/COMPUTER-ONLY-TESTS.md),
the first kind that checked its caller. In the two days of function logs
checked that day (2026-10-05 13:20 UTC onward, which covers the first live
day) every email the function processed matched real activity: the
application pairs, two phase moves from testing, the 24 "please redo" emails
and two declines. No "hired" email and no kind out of place. Older logs were
not checked.

## The rule

Every request is somebody's, and each kind of email belongs to the people who
can already do the thing it reports. The rules mirror the database's own
write policies for that thing (`applications`, `interviews`,
`document_packages`, `document_requests`, `messages`), so an email can be set
off by exactly the people who could have caused it.

The function works out who is asking itself (`identifyCaller`):

- **the system**: another edge function or a script holding the service key
  (this function's own key compared whole; or another form of it, proven by
  calling something only a service key may call). The key counts in either
  the `Authorization` or the `apikey` header: see "How the system really
  calls" below;
- **a signed-in person**, by their own sign-in;
- otherwise **nobody**, who gets nothing sent (401), for every kind.

| kind | who may ask | to whom |
| --- | --- | --- |
| `status_rejected`, `status_hired`, `phase_advanced` | the job's owner, or an active team member of that owner with **manage pipeline** | someone who applied to that job |
| `interview_scheduled`, `interview_pick_time`, `interview_cancelled`, `interview_rescheduled` | the owner, or a team member with **schedule interviews** | someone who applied to that job |
| `document_sent`, `document_requested` | the owner, or a team member with **send documents** | someone who applied to that job |
| `new_message` | the owner, or a team member with **message candidates**, to an applicant of theirs; or an applicant, to the owner of a job they applied to | the other of the two |
| `application_received` | an applicant | themself |
| `new_application`, `phase_completed` | an applicant | the owner of a job they applied to |
| `document_signed`, `reschedule_requested`, `voice_minutes_low`, `voice_minutes_exhausted`, `interview_ready`, `interview_reminder`, `steps_reopened`, `interview_confirmed`, `interview_time_picked` | the system only | as the system says |
| `continue_on_computer` | its own gate (`_shared/continueOnComputerEmail.ts`) | the signed-in applicant |

A team member limited to some jobs (`assigned_job_ids`) is the hiring team
only for applicants of those jobs. A membership that is not `active` is no
membership. Anything else is refused with one answer, 403 `not_allowed`,
whether the recipient exists or not.

## What an email may say

The words that matter are looked up, never taken from the request:

- **who signs it**: the job owner's own business name (`profiles.company_name`
  of the employer whose job links the two). With none on file it is "The
  hiring team". The page used to send this, and a blank one arrived as "This
  employer";
- **the applicant's name** in the hiring team's alerts, and **the sender's
  name** and thread link in a message alert: the caller's own;
- **the job**, for anything an applicant sets off: a title is kept only when
  it is the title of a job that really links them, else the newest such job.
  The hiring team may name their own job (they could rename it anyway);
- **which side the recipient is on** (a message alert reads differently for
  each).

What is left of the request's own text is the detail only the sender has: a
date and time, a document's name, a phase's name, a message preview, the
proposed interview times. Each is cut to one short plain line (no line
breaks, no control characters), and anything else in the request is dropped.

The system's own requests are sent as asked, as they always were.

## How the system really calls (found 2026-10-07, five hours after the lock)

Another edge function calls with the project's secret key
(`supabaseAdmin.functions.invoke(...)`). That request arrives with the key in
the **`apikey` header and no `Authorization` header at all**. Seen live with
two throwaway functions that reported only the shape of what they received:
`authorization: none, apikey: sb_secret (equal to the callee's own key)`. A
browser sends the public key in both, or the person's sign-in in
`Authorization`.

The first version of `identifyCaller` read only `Authorization`. So from
15:34 UTC on 2026-10-07 every email one function asked another to send was
answered `401 not_signed_in`: "they suggested other times"
(`reschedule_requested`), "ready for interview" (`interview_ready`). The
function's tests modelled the key in `Authorization` and all passed. The
request log shows no such email was attempted in those hours, so none was
lost; it was found while adding the two emails below, by asking the live
function from a throwaway one for an email to a user who does not exist.

Now the service key counts in either header (holding it is the proof), a
person is still only ever read from `Authorization`, and the tests call the
function the way a function really does (`asFunction`: the key in `apikey`,
nothing else) as well as the way a browser does. Putting the old check back
fails fourteen of them.

**When a new caller of this function is added, prove it on the live
function before trusting it**: a request for a kind it may send, to a user
id that does not exist, answers 404 "User profile not found" when the caller
is accepted and 401/403 when it is not, and sends nothing either way.

## When an interview time is agreed

`candidate-interview-response` sends two emails, as the system, when an
applicant picks an offered time, swaps to another, or confirms a set one
(docs/INTERVIEWS.md):

- `interview_confirmed`, to the applicant: the job, the date and the time on
  their own clock with the zone named, the length, and how to join. The
  meeting link is never in it (one link serves every interview; the
  application page opens it 15 minutes before the start). The button opens
  their own application, and only when the id is an id.
- `interview_time_picked`, to the job's owner: who, which job, and when on
  the team's clock; it reads as picked, moved or confirmed.

Both respect the recipient's interview-email setting.

## Limits

An applicant may set off 30 emails an hour, the hiring team 1,500 (passing on
a hundred applicants in one sitting is ordinary work, and a decline that is
silently not sent is worse than a busy hour; the number only stops a runaway
loop). These are ceilings on nuisance, not the lock: when the limiter cannot
be asked, an entitled email still goes. ("Email me the link" is the
opposite, on purpose: it sends nothing when its limiter is down.) A refused
request is not counted against anyone.

## Answers

`200 { success: true, recipient }` when the mail provider accepted it; `200`
with no `success` when the recipient has that kind turned off; `400
unknown_type`; `401 not_signed_in`; `403 not_allowed`; `429 too_many`; `502`
when the provider refused the message; `503 try_later` when it could not
look up whose request this was (nothing is sent). The pages already treat
anything but an explicit success as "not sent" (`src/utils/emailStatus.ts`).

No page had to change: the rules read who is asking and who it is for, both
of which every existing call already carries.

## Adding a kind of email

Give it a rule in `NOTIFICATION_RULES`
(`supabase/functions/_shared/notificationAccess.ts`); the test fails until
you do. If a page sets it off, decide which of the people above it belongs
to; if only the system does, it is `service`, and the caller must hold the
service key. Never add a kind that takes its recipient or its signer from
the request.

## Proof

`scripts/notification_access.test.mjs`. Its second half bundles the
function's real `index.ts` with only its three outside modules replaced (the
HTTP server, the mail client, the database client) and drives it against a
small world: an owner, another employer, team members with and without each
permission, one limited to a job, one no longer active, applicants, a
signed-in stranger, and nobody. Among what it holds true: with no real
sign-in none of the 23 kinds sends anything; nine ways of sending a decision
without being the hiring team for that applicant are refused, for five
kinds, including an applicant sending themself "You've got the job"; a
hand-made token that only claims to be the service is nobody; every
legitimate sender's email still goes, signed by the real owner and naming a
real job whatever the request said; the system's callers are served as
before; "Email me the link" is unchanged.
