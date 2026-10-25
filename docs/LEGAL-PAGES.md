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

No company name, no postal address, no email address. The way to reach the
people who run the site is Messages in the account, as everywhere else
(applicants' emails are no-reply, docs/MESSAGES.md). The test fails on any of
"LLC", "Inc", "Zulu", "HireFlow", a street address, or anything shaped like
an email address or a phone number.

## Where each statement was checked

On 2026-10-09, against the repo and the live project.

| The page says | Checked against |
|---|---|
| Sign-up takes a name, an email and a password | `src/pages/CandidateAuth.tsx`, `src/hooks/useAuth.tsx` |
| Optional profile fields, a public photo | `profiles` columns; the `avatars` bucket is public live, every other bucket private |
| Events recorded during tests; no screen, camera or microphone | `src/hooks/useTestIntegrity.ts`, `docs/ASSESSMENT-RECORD.md` |
| Connection check: speeds, device details, IP addresses | `supabase/functions/connection-test`, `docs/EQUIPMENT-CHECK.md` |
| Typing test, chat practice, written interview contents | `submit-typing-test`, `docs/TYPING-IN-CHAT.md`, `ai-chat-interview` |
| Signing keeps signature, time, name, email, IP, browser | `supabase/functions/document-signing` |
| Page counts: no cookie, no visitor number, no IP; DNT and GPC | `public/beacon.js`, `supabase/functions/page-views` |
| No application is declined by software alone | no code path writes a rejection but a staff action; the live job runs in `auto` mode, which only moves an applicant to the next step |
| A blocked account cannot apply again | `block_applicants` migration |
| Who sees an applicant | live policies on `profiles`: the person themselves, the hiring team for their application, and a developer role held by 0 accounts |
| Applicants cannot see scoring or recorded events | `docs/ASSESSMENT-RECORD.md` |
| The companies named | Supabase, Vercel, OpenAI, Resend are in use; OneSignal only inside the mobile app; the built-in video call needs a key that may not be set (said as "if") |
| Most things are not deleted on a timer | the only scheduled deletion is `document-cleanup` (below) |
| Identity papers asked for are deleted 24 hours after someone on the hiring team first opens them, or 7 days after they were sent if nobody does; openings are recorded; no bank numbers asked | `supabase/functions/document-cleanup` (pg_cron `document-cleanup`, every hour since 2026-10-10; `20261011130000_id_papers_deleted_after_opening.sql`), `supabase/functions/requested-document-url`, `src/lib/documentRequests.ts`; re-checked 2026-10-25 (this row said 30 days, the rule before 2026-10-10), see `docs/DOCUMENT-REQUESTS.md` |
| The company that runs the site | Southern Digital Technologies LLC (the owner, 2026-10-24), named in both openings; 2026-10-25 |
| A new hiring account keeps the campaign tags it arrived with | `src/hooks/useAuth.tsx` (`signup_source`), read by `admin_growth()`; 2026-10-25 |
| What Delete Account removes, and what stays | `supabase/functions/delete-account`: not in its list are the quiz attempt ledger, typing-test starts, the block list and error reports |
| Emails can be turned off; an application can be withdrawn | `src/pages/Settings.tsx`, `src/pages/Applications.tsx` |
| Free at the moment | billing was removed; no price is shown anywhere |

## Still to add

1. **How to contact the company directly.** Southern Digital Technologies LLC
   is named (2026-10-25). Still waiting on the owner: a contact email for
   legal and privacy questions (one that is read; the Philippines Data Privacy
   Act expects a data-protection contact) and the postal address, if any.
2. **Which state's law applies** to the terms: the state the LLC is
   registered in (owner input).
3. **Agreement at sign-up.** Neither sign-up screen asks anyone to agree to
   these or links to them; the only links are in the careers page's footer.
4. **How long information is kept.** Apart from identity papers (deleted 24
   hours after first opened, or 7 days after sending, since 2026-10-10),
   nothing is deleted on a timer. A set
   period for the rest would be better, and needs a job that enforces it.
5. **Delete Account leaves four technical records behind.** The policy says
   so. Removing them with the account would be cleaner.
6. **A profile photo is at a public address.** The policy says so. A private
   bucket would be better.
7. **A copy of your information** is promised on request and is done by hand:
   there is no export.

If the site changes (a new step, a new provider, a price), change
`src/content/legal.ts` and its date in the same change.
