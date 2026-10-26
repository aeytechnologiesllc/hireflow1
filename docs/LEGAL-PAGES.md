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
| No application is declined by software alone | no code path writes a rejection but a staff action; the live job runs in `auto` mode, which only moves an applicant to the next step |
| A blocked account cannot apply again | `block_applicants` migration |
| Who sees an applicant | live policies on `profiles`: the person themselves, the hiring team for their application, and a developer role held by 0 accounts |
| Applicants cannot see scoring or recorded events | `docs/ASSESSMENT-RECORD.md` |
| The companies named | Supabase, Vercel, OpenAI, Resend are in use; notifications go through the browser's own push service (Web Push, `20261021220000_web_push.sql`; no OneSignal keys are set, checked 2026-10-25 with `supabase secrets list`); the built-in video call needs a key (`DAILY_API_KEY`, set) and is said as "if" the team uses it |
| Most things are not deleted on a timer | the only scheduled deletion is `document-cleanup` (below) |
| Identity papers asked for are deleted 24 hours after someone on the hiring team first opens them, or 7 days after they were sent if nobody does; openings are recorded; no bank numbers asked | `supabase/functions/document-cleanup` (pg_cron `document-cleanup`, every hour since 2026-10-10; `20261011130000_id_papers_deleted_after_opening.sql`), `supabase/functions/requested-document-url`, `src/lib/documentRequests.ts`; re-checked 2026-10-25 (this row said 30 days, the rule before 2026-10-10), see `docs/DOCUMENT-REQUESTS.md` |
| The company that runs the site | Southern Digital Technologies LLC (the owner, 2026-10-24), named in both openings; 2026-10-25 |
| A new account (hiring or applicant) keeps the campaign tags and the site it arrived from | `src/hooks/useAuth.tsx` (`signup_source`, for every sign-up), read by `admin_growth()`; 2026-10-25 |
| The way to reach the company is Contact us (an applicant, at `/contact`) or Help (a hiring team, at `/help`), never Messages; the short version says so too | `src/cockpit/pages/Help.tsx`, `send_help_message` (`20261025200000_help_for_applicants.sql`): the platform admin reads it, the business never does; 2026-10-25 |
| A withdrawn application, or one whose job is deleted, takes its files with it ("removes your application … for good") | `applications_queue_voice_recordings` queues, for document-cleanup's hourly run, whatever storage holds for it: its recordings, video introduction, work samples, and since the eleventh Phase 5 review (`20261025540000`) the resume and form files it lists that no other application of theirs, nor their profile, still uses; and a deleted document's kept copies, however it goes (`documents_queue_files`, `20261025570000`). document-cleanup takes the queue a few from each person a run, so one account filling it holds up only itself (`storage_file_trash_fair_pick`, `20261025560000`, the eighth security review), and each person's oldest note goes oldest first and a note that keeps failing after every new one, so many accounts hold up nobody for good (`20261025580000`, the ninth), and people take turns (each run records whom it took) and a note that failed waits out a back-off, so a burst by many accounts delays a later removal by about a run for every 200 of them, not for weeks (`20261025590000`, the tenth), and a withdrawal's files go together in its turn, so a stream of new accounts never makes its later files wait longer each time (`20261025600000`, the eleventh); a backed-up queue is told to the admins once a day; 2026-10-25 |
| Only the business's "Delete their information" (or the applicant) removes an application, and it is recorded | `20261025550000` dropped the two browser delete policies a business had, and `20261025570000` keeps an application on its job (moving it to a throwaway job and deleting that was another way; the eighth security review); `remove_applicant` logs who and why (`private.applicant_removals`); deleting a whole job still deletes its applications, by design; 2026-10-25 |
| What Delete Account removes, and what stays | `supabase/functions/delete-account`: not in its list are the quiz attempt ledger, the block list, the note that a team removed an application (`private.applicant_removals`, with its reason), the spoken-interview minutes (`voice_session_log`) and error reports (typing-test starts go with the applications, `ON DELETE CASCADE`; the tenth Phase 5 review); a withdrawal note (`private.application_withdrawals`) goes with the account |
| A hiring team turns its own email alerts off in Settings (applicants have no email switch: withdrawing stops a job's emails); an application can be withdrawn | `src/pages/Settings.tsx` (staff only), `src/pages/Applications.tsx` |
| Free at the moment | billing was removed; no price is shown anywhere |

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
5. **Delete Account leaves a few technical records behind** (test-attempt
   counts, a block-list entry, a business's removal note
   with its reason, spoken-interview minutes, error reports). The policy names
   each. Removing them with the account would be cleaner. A withdrawal note
   and spoken-interview recordings now go with the account (2026-10-25).
6. **A profile photo is at a public address.** The policy says so. A private
   bucket would be better.
7. **A copy of your information** is promised on request and is done by hand:
   there is no export. Deletion on request is in the product since
   2026-10-25: a business uses "Delete their information" (docs/APPLICANTS-LIST.md,
   section 11); an applicant deletes their own account in Settings.

If the site changes (a new step, a new provider, a price), change
`src/content/legal.ts` and its date in the same change.
