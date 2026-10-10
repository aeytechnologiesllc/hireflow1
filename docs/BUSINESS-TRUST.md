# Business trust: keeping scammers out

HireFlow is opening to other businesses (the owner, 2026-10-10: "do it all").
A hiring site that can ask applicants for ID papers is exactly what a scammer
wants: sign up as a "business", post a fake job, collect people's IDs. This is
what stops that. Migration `20261011100000_business_trust.sql`; proof in
`scripts/business_trust.pglite.test.mjs`.

## Standing

Every business is **new**, **approved** or **suspended** (`business_standing`;
no row means new). Only an admin changes it, on the Admin page
(`admin_set_business_status`).

| | New | Approved | Suspended |
|---|---|---|---|
| Post jobs, receive applicants | yes | yes | no: its published jobs are closed |
| Ask for a payment email, TIN or other file | yes | yes | no |
| Ask for a government ID, NBI clearance or proof of address | no (unless it has paid) | yes | no |

- Suspending closes the business's published jobs (drafts stay drafts),
  remembers which, and tells the business in its bell. Reinstating reopens
  exactly those jobs.
- An admin cannot suspend their own account.
- `business_has_paid()` is `false` until billing ships; billing redefines it,
  so a business that has paid may ask for ID papers without waiting.

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
reports; the reported business never sees who reported it.

## Admins

`platform_admins` holds who runs HireFlow (the owner's account,
zack@yahoo.com). `is_platform_admin()` answers only about the caller. The
admin functions (`admin_businesses`, `admin_reports`, `admin_close_report`,
`admin_set_business_status`) refuse everyone else. Nobody reads or writes the
new tables directly from a client.
