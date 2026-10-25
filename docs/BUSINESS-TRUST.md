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
admin on the Admin page, or by itself when three different people report it
(migration `20261011190000_open_by_default_report_pause.sql`). No law asks a
hiring app to check a business's tax number, so there is no TIN check.

| | Open (approved) | Paused (suspended) |
|---|---|---|
| Post jobs, receive applicants | yes | no: its published jobs are closed |
| Ask for papers, ID papers included | yes | no |

- Pausing (`business_pause()`, used by the admin's button and by the reports)
  closes the business's published jobs (drafts stay drafts), remembers which,
  and tells the business in its bell. Opening it again reopens exactly those
  jobs and closes its open reports, so one more report can't pause it again
  straight away.
- Three reports from three different people pause a business by itself, and
  every admin is told. HireFlow's own account (`platform_admins`) is never
  paused, by reports or by hand.
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
  live.
- The code is mailed to the address the database recorded it for, never to
  an address looked up again, so an address changed in between cannot get a
  code made for another (third Pass C review, 2026-10-25;
  `20261025140000_business_email_check_round3.sql`).
- Known limit: the per-inbox limits (ten an hour, twenty a day) also mean a
  stranger who signs up with "you+tag@" addresses can use up a real
  business's limit for a day; that business is told to message us from Help.
  A determined sender with many networks could also fill the 300-an-hour
  ceiling. A bot check on sign-up (Cloudflare Turnstile, Phase 2 task 5,
  waiting on the owner's keys) is the fix for both.
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
suspicious documents, fake job, unsafe, or something else, with a note. One
open report per person per job (a second adds to the first), at most five a
day. Every admin is told in their bell. A reporter reads only their own
reports; the reported business never sees who reported it. Three open
reports from different people pause the business by itself (see Standing).

## Admins

`platform_admins` holds who runs HireFlow (the owner's account,
zack@yahoo.com). `is_platform_admin()` answers only about the caller. The
admin functions (`admin_businesses`, `admin_reports`, `admin_close_report`,
`admin_set_business_status`) refuse everyone else. Nobody reads or writes the
new tables directly from a client.
