# The Privacy Policy and the Terms and Conditions

Written 2026-10-09. The owner: "write terms and condition and privacy policy
dont mention company name and address for now". Asked who they are for, he
chose applicants and employers together, so they still fit when the product
page goes live.

They replace two pages dated December 19, 2024, written for a product that no
longer exists: they named a company, promised fees, and gave email addresses
nobody reads.

- The words: `src/content/legal.ts` (`PRIVACY_POLICY`, `TERMS`).
- The page: `src/components/LegalPage.tsx`, shown by `src/pages/Privacy.tsx`
  (`/privacy`) and `src/pages/Terms.tsx` (`/terms`).
- Proof: `scripts/legal_pages.test.mjs`.

These were written by an AI from what the code does, not by a lawyer. They
are honest and plain; they are not legal advice. A lawyer should read them
before the site takes on employers other than the owner.

## The owner's rule

The company is named, Southern Digital Technologies LLC (the owner,
2026-10-24), and no other; no postal address, no email address until the
owner gives one (docs/LAUNCH-PLAN.md, Phase 5, owner inputs). The way to
reach the company is in the account: **Contact us** in an applicant's
account menu, **Help** for a hiring team (help_messages; the platform admin
reads it, the hiring business never does;
`20261025200000_help_for_applicants.sql`). Messages reach the hiring
business, so the pages never send a privacy request there (the Phase 5
review). The test fails on any other company name, "Zulu", "HireFlow", a
street address, or anything shaped like an email address or a phone number.

## Where each statement was checked

On 2026-10-09, against the repo and the live project.

| The page says | Checked against |
|---|---|
| Sign-up takes a name, an email and a password | `src/pages/CandidateAuth.tsx`, `src/hooks/useAuth.tsx` |
| Optional profile fields, a public photo | `profiles` columns; the `avatars` bucket is public live, every other bucket private |
| Events recorded during tests; no screen; camera and microphone only in a video introduction while it is recorded and in a spoken interview from start to end | `src/hooks/useTestIntegrity.ts`, `docs/ASSESSMENT-RECORD.md` |
| Connection check: speeds, device details, IP addresses | `supabase/functions/connection-test`, `docs/EQUIPMENT-CHECK.md` |
| Typing test, chat practice, written interview contents | `submit-typing-test`, `docs/TYPING-IN-CHAT.md`, `ai-chat-interview` |
| Signing keeps signature, time, name, email, IP, browser | `supabase/functions/document-signing` |
| Page counts: no cookie, no visitor number, no IP; DNT and GPC | `public/beacon.js`, `supabase/functions/page-views` |
| No application is declined by software alone; the site itself turns one away only for a block, a "No" to "Are you 18 or older?" or a re-application within a month of withdrawing, and asks for a wait after a great many in an hour | no code path writes a rejection but a staff action; the live job runs in `auto` mode, which only moves an applicant to the next step; the refusals are `applications_refuse_blocked`, `applications_refuse_under_18` (`20261011200000`), `applications_refuse_recent_withdrawal` (30 days, `20261025350000`) and the start limit (`too_many_applications`, `20261025540000`). The policy called the block list "the one automatic refusal" until the twelfth Phase 5 review (2026-10-26) |
| A blocked account cannot apply again | `block_applicants` migration |
| Who sees an applicant | live policies on `profiles`: the person themselves, the hiring team for their application, and a developer role held by 0 accounts |
| Applicants cannot see scoring or recorded events | `docs/ASSESSMENT-RECORD.md` |
| The companies named | Supabase, Vercel, OpenAI, Resend are in use; notifications go through the browser's own push service (Web Push, `20261021220000_web_push.sql`; no OneSignal keys are set, checked 2026-10-25 with `supabase secrets list`); the built-in video call needs a key (`DAILY_API_KEY`, set) and is said as "if" the team uses it |
| Most things are not deleted on a timer | the only scheduled deletion is `document-cleanup` (below) |
| Identity papers asked for are deleted 24 hours after someone on the hiring team first opens them, or 7 days after they were sent if nobody does; openings are recorded; no bank numbers asked | `supabase/functions/document-cleanup` (pg_cron `document-cleanup`, every hour since 2026-10-10; `20261011130000_id_papers_deleted_after_opening.sql`), `supabase/functions/requested-document-url`, `src/lib/documentRequests.ts`; re-checked 2026-10-25 (this row said 30 days, the rule before 2026-10-10), see `docs/DOCUMENT-REQUESTS.md`. Since the twelfth Phase 5 review (`20261025610000`, 2026-10-26) the timer holds under a flood: the due papers and the files of deleted requests are read through fair picks, by business (`document_requests_due_pick`, `document_file_trash_fair_pick`), an applicant links only their own upload, and a business asks at most 50 papers of one application and 300 an hour; before, one business's 5,000 requests kept a real ID removed through Delete their information for 26 runs. Since the thirteenth Phase 5 review (`20261025640000`) an ID sent again does not leave the earlier copy for the browser alone to delete: the database queues it and the next hourly run deletes it; and only a file in its own request's folder is ever opened or deleted through a request. Since the twelfth security review (`20261025630000`) both picks read only what a run can take, however many papers wait (ranking every one passed the API's 8-second timeout well within what a flood of businesses can leave), and a photo whose upload went through but whose link was never saved, and which the dialog could not remove either, is queued seven days after its request was asked for and deleted in the next hourly run; what is still not on a timer (such a photo uploaded after that, still unlinked) is in `docs/DOCUMENT-REQUESTS.md`; the policy's wording is unchanged |
| The company that runs the site | Southern Digital Technologies LLC (the owner, 2026-10-24), named in both openings; 2026-10-25 |
| A new account (hiring or applicant) keeps the campaign tags and the site it arrived from | `src/hooks/useAuth.tsx` (`signup_source`, for every sign-up), read by `admin_growth()`; 2026-10-25 |
| The way to reach the company is Contact us (an applicant, at `/contact`) or Help (a hiring team, at `/help`), never Messages; the short version says so too | `src/cockpit/pages/Help.tsx`, `send_help_message` (`20261025200000_help_for_applicants.sql`): the platform admin reads it, the business never does; 2026-10-25 |
| A withdrawn application, or one whose job is deleted, takes its files with it ("removes your application … for good") | `applications_queue_voice_recordings` queues, for document-cleanup's hourly run, whatever storage holds for it: its recordings, video introduction, work samples, and since the eleventh Phase 5 review (`20261025540000`) the resume and form files it lists that no other application of theirs, nor their profile, still uses; and a deleted document's kept copies, however it goes (`documents_queue_files`, `20261025570000`). document-cleanup takes the queue a few from each person a run, so one account filling it holds up only itself (`storage_file_trash_fair_pick`, `20261025560000`, the eighth security review), and each person's oldest note goes oldest first and a note that keeps failing after every new one, so many accounts hold up nobody for good (`20261025580000`, the ninth), and people take turns (each run records whom it took) and a note that failed waits out a back-off, so a burst by many accounts delays a later removal by about a run for every 200 of them, not for weeks (`20261025590000`, the tenth), and a withdrawal's files go together in its turn, so a stream of new accounts never makes its later files wait longer each time (`20261025600000`, the eleventh), and each run reads only the people it can reach, so a queue of any size is still read in time (`20261025620000`, the twelfth: ranking the whole queue passed the API's 8-second timeout at about 700,000 notes, and no run emptied it again); and a Delete Account with two applications takes up to a withdrawal's worth in each turn after its first, where it gave one file a turn, each behind everyone who queued since (the twelfth's finding 2); a backed-up queue, or a read that timed out, is told to the admins once a day; 2026-10-25 |
| Only the business's "Delete their information" (or the applicant) removes an application, and it is recorded | `20261025550000` dropped the two browser delete policies a business had, and `20261025570000` keeps an application on its job (moving it to a throwaway job and deleting that was another way; the eighth security review); `remove_applicant` logs who and why (`private.applicant_removals`); deleting a whole job still deletes its applications, by design; 2026-10-25 |
| What Delete Account removes, and what stays | `supabase/functions/delete-account`: not in its list are the quiz attempt ledger, the block list, the note that a team removed an application (`private.applicant_removals`, with its reason), the spoken-interview minutes (`voice_session_log`) and error reports (typing-test starts go with the applications, `ON DELETE CASCADE`; the tenth Phase 5 review); a withdrawal note (`private.application_withdrawals`) goes with the account. The record of each signature (`document_audit_logs`: name, email, time, IP address, browser, device, place) stays as proof: `prevent_audit_delete` refuses any delete, and delete-account no longer tries (it failed and logged an error for everyone who had signed). Settings' confirm says what goes and what stays by who is deleting (`src/content/deleteAccount.ts`): an applicant, a business (its jobs and their applications go too), a team member (their chats and sent documents go to the owner, `delete-account`'s handover). The twelfth Phase 5 review: the confirm said "All your data ... will be permanently deleted"; `scripts/delete_account.test.mjs` runs the real function. The fourteenth: the Danger Zone row above the button said "your account and all data" (applicants) and "all associated data" (the hiring team); it is the same function's `summary` now, which says what stays. The note of each business someone applied to and how it was in touch (`private.business_contacts`, kept so a report counts after the business deletes its messages or the application; `20261025670000`) goes with the account: both of its ids are foreign keys to `auth.users` ON DELETE CASCADE, and delete-account deletes the auth user last |
| A hiring team turns its own email alerts off in Settings (applicants have no email switch: withdrawing stops a job's emails); an application can be withdrawn until the interview, the offer or a decline, and while nothing is signed; after that, Messages to the business or Contact us | `src/pages/Settings.tsx` (staff only), `src/pages/Applications.tsx` (`canWithdraw`: in_progress, pending, reviewing), the applicant's delete policy (`20261011197000`). The policy said only "withdraw that application" until the twelfth Phase 5 review, while Withdraw is gone from the interview stage on |
| Free at the moment | billing was removed; no price is shown anywhere |
| Three people the business has been in touch with pause it by their reports; once a report has been looked at and closed, a new one from that person counts again only after the business is in touch with them again | `employer_reports_auto_pause` reads the record of contact (`private.business_contacts`, `20261025670000`) and leaves out someone an admin already heard (`report_already_heard`: a report of theirs closed by the reopen or by Close, with no contact since; the fifteenth Phase 5 review, `20261025680000`); a card the business writes into its applicant's bell counts as a message; since the sixteenth review ("by message, by an email other than turning them down") an email from the hiring team counts too, but a decline (send-notification-email records it, `business_contacts_remember_email`, `20261025690000`), a report someone adds to is worked out again, and a browser's new time, link or notes on an interview is contact; since the seventeenth ("by moving their application forward"), the hiring team's browser moving an application to an interview, an offer, a hire or another step is contact, never a move to rejected (`business_contacts_remember_move`, `20261025700000`), and a decline names the job and the business as they were when the person applied and goes once, for a real decline; docs/BUSINESS-TRUST.md, launch_locks_behaviour sections 22 to 26 |
| What we collect names reports (the job, the reason, the note, when, and who) and a Contact us thread, read by us, kept until the account is deleted; the note of contact keeps when each kind first and last happened and decides when a report does not count | `employer_reports` (`reporter_id` ON DELETE CASCADE, `details` up to 1,000 characters, `20261011100000`), `help_messages` (an applicant's thread keyed to their account, ON DELETE CASCADE, `20261011180000`, `20261025200000`); `private.business_contacts.first_at` / `last_at` and `report_already_heard` (`20261025680000`), an email from the hiring team recorded as a message (`20261025690000`); the sixteenth Phase 5 review, finding 4; the hiring team moving an application forward recorded as a message (`20261025700000`), the seventeenth |

## Still to add

1. **How to contact the company directly.** Southern Digital Technologies LLC
   is named (2026-10-25). Still waiting on the owner: a contact email for
   legal and privacy questions (one that is read; the Philippines Data Privacy
   Act expects a data-protection contact) and the postal address, if any.
2. **Which state's law applies** to the terms: the state the LLC is
   registered in (owner input).
3. **Agreement at sign-up.** Done 2026-10-25: the business sign-up's
   agreement links the Terms and the Privacy Policy; the applicant sign-up
   says creating an account agrees to the Terms and links the Privacy Policy;
   the application form says who sees it; the team-member sign-up ("Create
   Account & Join Team") has the business sign-up's agreement, ticked before
   the account is made (the eleventh Phase 5 review: it had none) (guard
   `applicant-signup-shows-privacy-notice`).
4. **How long information is kept.** Apart from identity papers (deleted 24
   hours after first opened, or 7 days after sending, since 2026-10-10),
   nothing is deleted on a timer. A set
   period for the rest would be better, and needs a job that enforces it.
5. **Delete Account leaves a few records behind**: the record of each
   signature (kept as proof), test-attempt counts, a block-list entry, a
   business's removal note with its reason, spoken-interview minutes, error
   reports. The policy names each, and so does Settings' confirm (since the
   twelfth Phase 5 review). Removing the technical ones with the account
   would be cleaner; the signing record stays by design. A withdrawal note
   and spoken-interview recordings now go with the account (2026-10-25).
6. **A profile photo is at a public address.** The policy says so. A private
   bucket would be better.
7. **A copy of your information** is promised on request and is done by hand:
   there is no export. Deletion on request is in the product since
   2026-10-25: a business uses "Delete their information" (docs/APPLICANTS-LIST.md,
   section 11); an applicant deletes their own account in Settings.

If the site changes (a new step, a new provider, a price), change
`src/content/legal.ts` and its date in the same change.
