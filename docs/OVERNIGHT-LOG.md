# Overnight run — 26 Aug 2026

Running autonomously while you sleep. This file is the record; I update it as work lands.

## Done and verified live

### Launch repairs — commit `9b968a1`, migrations `58826c6`

| Fix | Verified how |
|---|---|
| **Account-enumeration hole closed.** `check-email-exists` answered, with no login, whether any email had an account. Retired (410). Its only caller was candidate password reset, which used it to say "no account found" — the exact disclosure that makes reset an enumeration tool. That flow now answers identically either way. | `curl` → `410 {"error":"gone"}` |
| **Rate limiting on money-spending public endpoints.** They must stay open (accountless candidates, guest job creator) so the fix is a spend cap, not auth. Postgres-backed, fails open by design. | 16 rapid calls → 15 through, 16th `429` |
| **Stripe test-key trap removed.** A missing `VITE_STRIPE_PUBLISHABLE_KEY` silently dropped **production** into Stripe test mode — checkout opened, looked right, could not take real money. Now it fails loudly and the dialog says so. | Build clean; fallback gone from source |
| **Feed quality gate.** A job only reaches `/jobs.xml` with a real company name, city, country, live deadline, and no exclude flag. Also emits `<dateposted>` — several aggregators reject the source without that exact spelling. | Feed serves valid XML, 0 jobs (all four are QA — correctly withheld) |
| **No more "Confidential" to Google.** Job pages never claim an anonymous employer; a listing that can't satisfy Google ships `noindex` instead of broken structured data. | Googlebot fetch → full valid JobPosting |
| **ROOT CAUSE FOUND: 5 of 14 accounts had no `profiles` row at all.** No profile → no company name → the job can never be published in a form Google or any aggregator accepts. A paying customer could have been stuck there. Backfilled; `handle_new_user` is now idempotent and cannot break a signup; `ensure_profile_exists()` added as a self-healing net. | `users_without_profile` = 0 |
| **Node 24 pinned** before Vercel disables Node 20 on 1 Oct 2026. | `package.json` engines |
| **October model deadlines defused.** Every model name now reads from an env var — swapping is a dashboard change, not a deploy. | `docs/MODEL-DEADLINES.md` |

Live proof of the fixed job page:

```
noindex present : False
JobPosting      : YES
  employer   : Ridgeway Garage      (was "Confidential")
  location   : Atlanta / GA / US    (was empty)
  salary     : 22 - 26 USD HOUR     (was missing)
```

## Running now — the audit loop

Your rule, implemented exactly: **20 independent auditors per round** (Sonnet 5, in
parallel) → dedupe → **one fixer per file** so two agents can never edit the same file →
build + typecheck verification → **repeat**. The loop exits only after a full round finds
nothing, and I keep running rounds past 30 if anything is still turning up.

The twenty lenses: build integrity · dead code · endpoint security · data security &
RLS · payments · auth flows · candidate journey · employer journey · edge-function error
handling · database integrity · API routes · env/config · React correctness · error &
empty states · accessibility · responsive · performance · AI-copy rules · data
consistency · dependency risk.

## Waiting on you (nothing else is blocked)

1. **Stripe live keys** — the one thing standing between this app and real money.
2. **Facebook Business account** — start it first; Meta's verification is the longest clock.
3. **Lock the three prices** — one line from you.
4. **Google Search Console** — ten minutes, so the now-valid listings get trusted.

---

# Free-flow pass — 4 Sep 2026

Owner's order of operations: prove the free product end to end before any Stripe key or
Facebook account is handed over. Nothing may block on payment.

## Found on the live site and fixed

| What was wrong | What a user saw | Fix |
|---|---|---|
| **Every account was a 7-day trial that flipped to a paywall** on the next login — with no Stripe key the "Upgrade" button failed, so the only exit was Sign out. Live jobs stopped taking applications at the same moment. | "Your trial has ended" over every screen; candidates: "This employer is not currently accepting new applications." | Trials never end; migration `20260904110000_free_tier_open` + `get-subscription`, `check-applicant-limit`. |
| **One job, ever; 15 applicants; 15 voice minutes.** The owner's own account had 0 minutes, so his voice interviews could never start. | "Job creation is locked"; candidates: "We are unable to start the interview at this time." | Limits removed (−1); 120 voice minutes per employer for a year; existing accounts topped up. |
| **Production was on `gpt-4.1` / `gpt-4o-mini`** (retire 14 Oct 2026) and four features called a Lovable gateway with no key (dead since launch). | Portfolio scoring silently defaulted to 60; documents, blueprint reports failed. | All text on `gpt-5.6-luna` / `gpt-5.6-terra`, voice on `gpt-realtime-2.1` + `gpt-live-transcribe`; the four functions ported to OpenAI; GPT-5 rejects `temperature`, so the shared helpers strip it (verified live: drafting 7 s, flow 19 s, scoring 32 s, chat stream OK, voice session mints). |
| **Sitemap listed 26 QA job pages** ("[RERUN-B 0831] … (do not use)"); the feed's only job had city = "Pakistan" (a country) and a garage hiring a DevOps engineer. | Google was being handed test junk. | Sitemap honours `exclude_from_feed` and the feed's gate; the feed refuses a country or state as a city; both QA jobs flagged excluded. Live: sitemap 2 pages, feed 0 jobs — correct until a real, complete job exists. |
| **Google Indexing API** — nobody knew if it worked. | — | Verified: `status: sent`, Google accepted the URL. Search Console is already set up. IndexNow ping added for Bing/Yandex. |
| Employers could not close or delete a job; could publish with zero screening steps; a geocoder miss silently kept a job out of the feed; team members were checked for their own company name instead of the owner's. | — | All fixed in the create/edit flow and Jobs page. |
| Sign-in: expired/cancelled auth links spun for 15 s then said "timed out" and sent candidates to the employer door; new OAuth users rendered in the wrong shell until reload; a role-less session could stall forever. | — | Callback reads the error and answers at once; role refreshes after assignment; candidate routes bounce to the candidate door with a return path. |
| Messaging: candidates could only reply, never write first; employers got no badge/bell/push for a new message; another candidate's message did not appear live; "Message candidate" from Interviews lost the candidate; sending waited on the email. | — | Candidate can open a thread with any hiring team they applied to; DB trigger creates a notification (bell + push) per message; badge on the cockpit nav; live updates for every thread; email fire-and-forget. Migration `20260904121000_message_notifications`. |

## Distribution

`docs/DISTRIBUTION.md` has the researched list. Live and automatic: Google for Jobs (Indexing
API), Bing via IndexNow, sitemap. Ready to submit (needs the owner's yes, because the forms ask
for a contact name/email): Jooble (`/jooble.xml`), Talent.com (`/jobs.xml`), Adzuna
(`/adzuna.xml`). Not viable: Indeed, ZipRecruiter, LinkedIn, Glassdoor, SimplyHired.

## Still needs the owner

1. **Email provider** — `RESEND_API_KEY` is not set, so no notification email leaves the building (application received, interview invites, decisions). Needs a Resend account and a DNS record for `hireflownow.com`.
2. **Google sign-in** — off at Supabase. Needs the Google client ID + secret pasted into Supabase → Authentication → Providers, then `VITE_GOOGLE_AUTH_ENABLED=true` on Vercel.
3. **Say yes** to the three feed submissions above.
4. **One real, complete job** — the feed and sitemap are correctly empty until an actual business posts with a company name and a city.
5. Stripe keys and the Facebook Business account — last, per your call.
