# Where a HireFlow job goes, automatically

Last verified 2026-10-25 (Google for Jobs and the indexing calls were removed
on 2026-10-05; this file said "Working" until the Phase 7 growth audit).
Rule: a channel is listed here only if it ingests jobs by itself once set up —
no per-job copy-paste, ever. Channels that need a paying partner, a minimum
client count, or a manual post per job are in "Won't work".

## Live today (nothing for the owner to do)

| Channel | How | Status |
|---|---|---|
| **Sitemap** | `/sitemap.xml` (`api/sitemap.mjs` → Supabase function `sitemap`). Lists live jobs that pass the feed's gate. | Working. Search engines find job pages through it; they get no special jobs treatment. |
| **Open jobs** | `hireflownow.com/open-jobs` lists every business's live jobs; the front page's "Looking for a job?" goes there. | Working. Little traffic of its own yet (Admin → Growth, "Public pages"). |
| **The business's own links** | Short link, careers page (`/c/<business>`), share kit and flyer, each tagged so Admin → Growth shows it. | Working. Today this is how almost every applicant arrives. |

## Removed (owner, 2026-10-05: "Google Jobs is removed")

| Channel | What it was | Why it is off |
|---|---|---|
| **Google for Jobs** | `JobPosting` JSON-LD on job pages and Indexing API calls on publish/close (`_shared/googleIndexing.ts`, deleted in 87f7628). | The owner's worldwide-remote role could not be listed without a country. For a local business (a clinic's front desk) it is the channel that matters most, so it is worth asking the owner again before other businesses join (docs/LAUNCH-PLAN.md, owner inputs). |
| **IndexNow (Bing, Yandex, Naver, Seznam)** | A ping beside every Google call. | Removed with it. |

## Free feeds worth submitting (one-time, owner's yes needed — forms ask for a contact name and email)

All read the same gated job set. Formats differ, so each has its own URL.

| Channel | Feed URL to give them | Where to submit | What they'll ask |
|---|---|---|---|
| **Jooble** | `https://hireflownow.com/jooble.xml` | https://help.jooble.org/en/support/tickets/new (or https://jooble.org/ats) | Your name, company, contact email, feed link. Human review, no SLA. Jobs older than 45 days are dropped, so `<updated>` bumps on edit. |
| **Talent.com** | `https://hireflownow.com/jobs.xml` (their spec matches our Indeed-style feed) | https://www.talent.com/integrations → contact form | Name, email, company, feed URL. An account manager replies; they re-read the feed every 4 hours once live. |
| **Adzuna (US)** | `https://hireflownow.com/adzuna.xml` | https://www.adzuna.com/hire/contact/ | Name, email, company, phone, message ("Please add our organic XML feed: …"). No published SLA. |

Suggested message for all three:

> Hi — HireFlow (hireflownow.com) is a small-business hiring platform in the US.
> We publish an organic XML feed of every live job with the employer's real
> company name, city, state, salary, and a direct apply link on our site:
> <feed URL>. Could you add it to your organic index? Happy to adjust any field.
> Thanks, <name>, <email>.

## Maybe later (only if they answer)

- **Careerjet** — free indexing exists; submit form sits behind a CAPTCHA. Feed spec is close to Adzuna's.
- **Jobrapido** — supports organic feeds technically; onboarding is by their sales team, who push paid packages.
- **Trovit / Mitula (Lifull Connect)** — free tier exists; thin US exposure.

## Won't work (do not spend time here)

- **Indeed** — ATS partners must have 10+ paying clients and no free posting tier; publisher program closed since 2022; single-source XML lost free visibility March 2026.
- **Glassdoor, SimplyHired** — ingest only through Indeed.
- **ZipRecruiter** — paid account or approved ATS partner only.
- **LinkedIn Basic Jobs** — partner-only, forbids jobs from free/trial accounts, not accepting new partners.

## What the feed refuses to serve (on purpose)

A job leaves the building only with: a real company name, a real city (never a
country or state standing in for one), a country, an unexpired deadline, a
description over 100 characters, and `exclude_from_feed = false`. Test and QA
jobs are flagged excluded. A valid-but-empty feed is the correct failure mode:
spam-shaped listings get a whole source blacklisted.
