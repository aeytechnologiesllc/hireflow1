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
| Identity papers asked for are deleted 30 days after approval (or 30 days after "send it again", if never re-sent); openings are recorded; no bank numbers asked | `supabase/functions/document-cleanup` (pg_cron `document-cleanup`, daily), `supabase/functions/requested-document-url`, `src/lib/documentRequests.ts`; checked 2026-10-10, see `docs/DOCUMENT-REQUESTS.md` |
| What Delete Account removes, and what stays | `supabase/functions/delete-account`: not in its list are the quiz attempt ledger, typing-test starts, the block list and error reports |
| Emails can be turned off; an application can be withdrawn | `src/pages/Settings.tsx`, `src/pages/Applications.tsx` |
| Free at the moment | billing was removed; no price is shown anywhere |

## Still to add

1. **Who runs the site.** A privacy policy is expected to name the business
   responsible and how to contact it. Left out at the owner's request, for now.
2. **Which country's law applies** to the terms. It follows from (1).
3. **Agreement at sign-up.** Neither sign-up screen asks anyone to agree to
   these or links to them; the only links are in the careers page's footer.
4. **How long information is kept.** Apart from identity papers (deleted 30
   days after approval since 2026-10-10), nothing is deleted on a timer. A set
   period for the rest would be better, and needs a job that enforces it.
5. **Delete Account leaves four technical records behind.** The policy says
   so. Removing them with the account would be cleaner.
6. **A profile photo is at a public address.** The policy says so. A private
   bucket would be better.
7. **A copy of your information** is promised on request and is done by hand:
   there is no export.

If the site changes (a new step, a new provider, a price), change
`src/content/legal.ts` and its date in the same change.
