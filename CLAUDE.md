# HireFlow - Project Reference

> **Current work: [`docs/LAUNCH-PLAN.md`](docs/LAUNCH-PLAN.md).** Seven
> phases toward the customer-service-hiring launch, with the owner's rules
> for how each phase is done (build → verify → re-check → lock down → ship,
> autonomously, until a re-check finds nothing). Read its Rules, Known facts
> and Progress log before starting anything, then continue the first phase
> that is not closed.

> ⚠️ The project ref below is load-bearing. It was previously wrong here
> (`kcotpxlggfvgclwksmhl`), and that wrong value was copied into a database
> trigger, silently breaking every push notification. Verify before changing.

## Hosting & Infrastructure

| Service | Details |
|---------|---------|
| **Frontend Hosting** | Vercel |
| **Live URL** | https://hireflownow.com |
| **Vercel Project** | aeytechnologiesllc-8936s-projects/hireflow1 |
| **GitHub Repo** | https://github.com/aeytechnologiesllc/hireflow1 |
| **Branch** | main |

## Supabase

| Item | Value |
|------|-------|
| **Project ID** | yqklrkpptnhubsnijqze |
| **Project URL** | https://yqklrkpptnhubsnijqze.supabase.co |
| **Dashboard** | https://supabase.com/dashboard/project/yqklrkpptnhubsnijqze |
| **Edge Functions** | https://supabase.com/dashboard/project/yqklrkpptnhubsnijqze/functions |
| **Database Migrations** | see supabase/migrations (all applied) |
| **Edge Functions Deployed** | see supabase/functions |

## Auth Providers

| Provider | Status |
|----------|--------|
| **Email/Password** | Enabled (Supabase Auth) |
| **Google OAuth** | **Disabled** at Supabase (`external_google_enabled=false`, checked 2026-09-04). The UI hides every Google button behind `VITE_GOOGLE_AUTH_ENABLED`. To turn it on: add the Google client ID + secret under Authentication → Providers → Google in the Supabase dashboard, then set the Vercel flag. |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Payments:** Stripe (not yet configured on new project)
- **Voice/AI:** ElevenLabs TTS, OpenAI (via Edge Functions)

## Environment Variables (Vercel Production)

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_CLIENT_ID`

## Branding / App Icon

The app icon is **the logo's own mark**: the brass rising line `#E0B96A` on the ink tile `#14120E`, the same mark as `Wordmark.tsx` and the front page's bar (recoloured 2026-10-25 when the owner locked the colours; it was the jade line on a dark jade tile, chosen 2026-10-11).

**The colours are locked (owner, 2026-10-25): ink and ivory with a brass accent.** No green anywhere. The front page stays dark; the app follows the device (Day: ink on ivory; Night: ivory on ink). The action colour is `--action` (ink by day, ivory at night; it was `--jade`); brass is Ava's verdict, the score and anything that costs money, never a plain button. Guards `no-jade-tokens-left` and `brass-only-for-ava-score-money` hold it. Every size is made by `node scripts/make-app-icons.mjs`; docs in [`BRANDING.md`](BRANDING.md). **Do NOT revive the old dark-tile orb icon** (removed 2026-06-30) — see the "DO NOT REVIVE" section in BRANDING.md. Direction 5 (brass flow) is kept as a backup at `branding/backup-icon-flow.png`.

## The October 2026 hiring run was the owner's own (noted 2026-10-24)

The spike in the live data (about 1,400 page views on 2026-10-07; 154 of the
155 applications between 2026-10-05 and 2026-10-10; 2 hires) was the owner
hiring a real support team lead for their own business through a Philippines
job board. It went very well. The app was being built and fixed live during
that run, so that period's data (accounts confirmed instantly, no
confirmation emails) shows the settings of the time, not today's: check live
settings directly. The quiet since is not lost traction; no outside business
has been invited yet. The landing's "153 applied, 71 finished, 3 worth a
call" are from this run.

## Positioning (owner, 2026-10-24)

HireFlow's niche is **hiring customer service agents, chat and phone, for any
kind of business** (the owner's example: a doctor's office). Ava should build
the tests to fit the business and the channel. Not a sweepstakes pitch, and
not main-street roles like barista or cashier. The owner doesn't want the
green look; blue doesn't feel right to them either.

## Distribution & billing state (updated 2026-09-16, first set 2026-09-04)

- **Free tier is fully open** while Stripe is off: trials never expire, no job or applicant caps, voice is off for every business but the platform's own account (2026-10-11; get-subscription still reports a 120-minute grant, unused) (migration `20260904110000_free_tier_open`, further relaxed by the recovered `20260627131622_relax_job_limit_billing_deferred`). Nothing may sit behind a paywall or show a price as due while billing is off. Re-gate when the pay-per-job model ships.
- **Google Indexing API / IndexNow were removed on 2026-10-05** (87f7628, "Google Jobs is removed"): nothing fires on publish/close any more. The job feeds (`jobs.xml`, `adzuna.xml`, `jooble.xml`) only list a job that has a country (`api/job-feed.mjs`), so Zulu's worldwide-remote job (no country) is in none of them (checked 2026-10-11). The sitemap is served by `api/sitemap.mjs` (proxying the `sitemap` edge function) so it goes out as XML.
- **Email is on**: `RESEND_API_KEY` has been set since 2026-10-04 (checked with `supabase secrets list` on 2026-10-21), so `send-notification-email` sends from `notifications@hireflownow.com` / `no-reply@hireflownow.com`; the owner confirmed staff receive emails. An older line here said it was unset, and a session repeated it to the owner as a launch blocker. Supabase Auth's own emails (password reset, magic link) go through Resend SMTP too (`smtp.resend.com`, from `hiring@hireflownow.com`); their sender name was "Zulu Support Team" for every business and applicant until the owner had it changed to **"HireFlow"** on 2026-10-24. Email confirmation is off (`mailer_autoconfirm: true`).
- **Models**: all OpenAI calls run on `gpt-5.6-luna` (cheap) / `gpt-5.6-terra` (scoring), voice on `gpt-realtime-2.1` + `gpt-live-transcribe`. GPT-5 models reject non-default `temperature`; the shared helpers strip it. See `docs/MODEL-DEADLINES.md`.
- **Stripe**: no key is set and no checkout exists: the old checkout/webhook functions were deleted from Supabase on 2026-10-11. Billing is built new (pricing v9: free first job, $99/job, $299/mo), with the owner's account exempt through `platform_admins`, never `home_alias`. The owner adds the Stripe keys himself, last.

## Security posture (as of 2026-09-16)

Live safety work already shipped — do not weaken any of it without a specific
reason and a re-verification pass: step gate on the candidate flow; input
sanitizers; private storage (`resumes`, `videos`, `portfolios`, `interviews` —
none are public buckets any more); quiz server-side grading plus
`protect_application_columns`/`protect_document_columns` triggers that block a
client from forging scored or signed columns; team invitation RPCs; forgery
lockdown on public-facing insert/update policies; in-app + push notification
triggers; document signing with a hash chain and audit log (`document-signing`
function, `protect_document_columns` trigger — this one is unconditional, not
gated by a flag); RPC caller checks (`has_role`, subscription/limit lookups,
`is_job_owner`, `is_active_team_member_for_job`) that only ever answer about
the calling user; `voice_session_log`-based voice-minute charging; and access
scoping on the performance report and dossier views.

**Phase 1 of docs/LAUNCH-PLAN.md (live 2026-10-25).** Do not weaken any of
these either; each has a guard or a test that CI runs:
- Stored links open only in-app paths or http(s) addresses: `src/lib/safeLink.ts`
  at every href / `<Link to>` / `window.open` / iframe src fed by data, the
  same rule in the database (`20261025010000_safe_links.sql`), guard
  `stored-links-are-filtered`. Redirect params use `inAppPath` too.
- A Content-Security-Policy, **report-only** for now (`scripts/csp.mjs` writes
  it into `vercel.json`; reports land in `client_error_events` with release
  `csp`). Enforce with `node scripts/csp.mjs --write --enforce` once real
  traffic reports nothing that should be allowed. Editing an inline script in
  `index.html` or `public/landing.html` needs `node scripts/csp.mjs --write`.
- trigger-ava-analysis: `force` is the hiring team's only; an applicant's
  reply is the move only; applicant text is fenced in scoring prompts.
- Practice turns (chat, interview, sales) only for a signed-in applicant's own
  application; job-writing AI needs sign-in; rate limits count by
  CF-Connecting-IP; every OpenAI call takes from a daily ceiling
  (`app_settings.ai_daily_call_cap`, 10,000; usage in `private.ai_daily_usage`).
- Applicants cannot write `phase_ai_analysis`, `employer_notes`, the
  source columns or the voice transcript, and may set the recording link only
  to their own upload in this project's storage
  (`20261025090000_protect_voice_evidence.sql`, `20261025110000_voice_recording_this_project.sql`); an
  applicant's reply from trigger-ava-analysis never carries the team's
  message or a "recommend decline"; notification emails go to the sign-in account's address;
  `profiles.email` is read-only to the API.
- New passwords need 8 characters (sign-in still accepts older shorter ones);
  deleting an account asks for the password; the platform admin can turn on
  an authenticator app in Settings, after which admin tools need the code.
- Everything reachable without sign-in is listed in docs/BACKEND-SCHEMA.md
  ("Reachable without sign-in"), guarded by `public-functions-allow-list`.

**Phase 2 of docs/LAUNCH-PLAN.md (2026-10-25).** Guards in
`scripts/guards/phase-2-launch-locks.mjs`:
- "player" is the owner's own gaming customers. It is a property of the
  business (`business_pages.home_alias`, `_shared/homeBusiness.ts` →
  `_shared/counterpart.ts`), never guessed from a job's text; every other
  business, and not knowing, reads "customer" (a customer-service job built
  from Phase 4's gaming pack says "player" too: docs/CUSTOMER-SERVICE-HIRING.md). Same for the team-lead
  interview script (`interviewPlanFor`: the owner's only when
  `homeBusiness === true`). Guard `no-player-wording-outside-home-business`.
- A business confirms its sign-in email with a 6-digit code before its first
  job goes live (`20261025100000_business_email_check.sql`, trigger
  `jobs_publish_needs_email_check`, HINT `email_not_verified`; the code is
  `send-notification-email`'s `business_email_code` kind, to the signed-in
  caller only). Applicants are never asked. A Google sign-in passes while its
  Google address is still the sign-in address; platform admins pass. The
  stamp is for an address and lapses when the sign-in address changes. Guard `publish-requires-verified-email`.
- The front page counts visits and carries campaign tags to sign-up; a new
  account keeps `signup_source`; Admin → Growth reads `admin_growth()`.
  Guards `landing-has-beacon`, `signup-carries-utm`.

**Phase 5 of docs/LAUNCH-PLAN.md (2026-10-25).** Guards in
`scripts/guards/phase-5-launch-locks.mjs`:
- Every OpenAI call names its business (`business:`), and takes from that
  business's daily AI budget (`ai_business_daily_call_cap`, 2,000) as well as
  the platform's; platform admins are never counted; the owner is told in the
  app at 80%/100% and when a business hits its cap. A cost guard, never a
  paywall. Guard `ai-budget-enforced`.
- The legal pages name **Southern Digital Technologies LLC**; the contact
  email and governing-law state are still owner inputs. Both sign-ups and the
  application form link the Privacy Policy. Guards
  `legal-pages-name-entity-and-contact`, `applicant-signup-shows-privacy-notice`.
- "Delete their information" (⋯ menu) deletes one application and its files
  through `remove-applicant` → `remove_applicant` (service role only, logged).
  Guard `applicant-data-can-be-removed`.

**Trusted-results foundation is built AND live-enforced.** The
`recordStepResult` path and the `public.trusted_result_enforcement` table
(one boolean flag per self-reported step type: `chatInterviewResult`,
`chatSimulationResult`, `phase`, `portfolioResult`, `salesSimulationResult`,
`typingTestResult`, `videoIntroResult`, `voiceInterviewResult`) exist, and as
re-verified live on 2026-09-16 **all 8 flags are `enforced = true`**. The 7
`enforce_*` migrations (repo files at
`supabase/migrations/20260916150100`–`150700_enforce_*.sql`) plus
`enforce_phase_lock` (which flips `phase`, the 8th flag — repo file
`supabase/migrations/20260916180000_enforce_phase_lock.sql`) are all applied
to production, under Management-API-restamped versions
`20260916183325`–`20260916184013`; see `docs/MIGRATION-HISTORY.md` section 2
for the version mapping. `protected_trusted_result_notes_subset` now refuses
a direct client write to any of those 8 `notes` keys — confirmed for the
voice case via `pg_get_functiondef` on the live
`submit_voice_interview_manual_end()`, which no longer writes
`voice_interview_transcript`/`phase_ai_analysis` directly (the post-migration
body). A prior version of this section, and of
`docs/MIGRATION-HISTORY.md`, claimed the opposite (`enforced = false`,
"never applied") — that claim was already false when it was written, six
minutes after these migrations actually ran; re-run the query above yourself
before trusting either this line or that one, per
`docs/MIGRATION-HISTORY.md`'s "Keeping this file honest across sessions."

**Notification emails are caller-checked (live since 2026-10-07).**
`send-notification-email` works out who is asking and decides who may set off
each kind of email, and looks up who signs it and who is named in it
(`supabase/functions/_shared/notificationAccess.ts`,
`docs/NOTIFICATION-EMAILS.md`). Before that, anyone holding the site's public
key could have any template ("You've got the job" included) sent to any user
id, signed with any name: the gateway lets the public key through even with
`verify_jwt = true`. Never add a kind of email that takes its recipient or
its signer from the request. `scripts/notification_access.test.mjs` runs the
real function against a stand-in world and fails if a rule is weakened.
One edge function calling another presents the project's secret key in the
**`apikey` header with no `Authorization` header** (seen live 2026-10-07):
a check that reads only `Authorization` refuses every function-to-function
call, which is what the first version of this lock did for five hours.

**Every account has a `profiles` row (re-checked live 2026-10-11).** On
2026-09-16 one account had none and the self-healing
`public.reconcile_orphaned_profiles()`
(`supabase/migrations/20260831190000_reconcile_orphaned_profiles.sql`) was
never applied; `select count(*) from auth.users u left join public.profiles p
on p.user_id=u.id where p.user_id is null` now returns 0. Re-run it before
trusting this line; see `docs/MIGRATION-HISTORY.md` section 3a.

**Before other businesses join (2026-10-11 overview, 3e62305 + f2cdb7f).**
Applications start clean on INSERT (no self-set score, stage or result);
documents, videos and resumes are reachable only by the applicant's own
business; team members join only by invitation and an account belongs to
one business; voice is off for everyone but `platform_admins`; a suspended
business cannot publish and its jobs leave `published_jobs_public`;
applicant emails come from the job's business by name. The 15 old
Stripe/boost/blueprint/voice-credit edge functions were DELETED from
Supabase (they would have woken with the old prices the moment a Stripe key
was set) — never redeploy them; billing gets built new, with new secret
names. A function called inside a view runs with the caller's rights: read
tables directly in `published_jobs_public` (a rehearsal caught
`business_status_of()` refusing every visitor).

**Never ask for date of birth or age on an application (2026-10-11).**
Every application starts with the built-in "Are you 18 or older?"
(`src/lib/ageCheck.ts`; never stored in a job's own questions), and the
database refuses to send one that answered "No" (`applications_refuse_under_18`).
The owner asked for date of birth; most applicants are in the Philippines,
where RA 10911 Section 5(a) makes it unlawful to "require the declaration of
age or birth date during the application process". The exact date comes after
the hire, from the ID asked for with "Ask for ID or papers".

**No business approval (the owner, 2026-10-11: "I don't want the
headache").** Every business is open from sign-up, ID papers included; three
reports from three different people pause one by itself
(`20261011190000_open_by_default_report_pause.sql`, docs/BUSINESS-TRUST.md).
No TIN check: no law requires one. Don't bring back an approval step.
New businesses get one-time guided tips (`src/cockpit/tips`, table
`ui_tips_seen`; accounts made from 2026-10-11 08:00 UTC, never
`platform_admins`). hireflownow.com/open-jobs lists every business's live
jobs; the front page's "Looking for a job?" goes there, `/careers` stays Zulu's.

See `docs/ARCHITECTURE.md` and `docs/BACKEND-SCHEMA.md` for the current live
schema, and `docs/MIGRATION-HISTORY.md` for how migration history was
reconciled with the live database on 2026-09-16 — including the full reverse
check (every one of the 144 repo migration files, diffed by name against the
complete, freshly-queried live table, not a search scoped to one category)
that found **82** such files, not 20 and not 7, split into three different
situations: **1** never applied with a real live consequence (the
orphaned-profile fix — the `enforce_*`/`enforce_phase_lock` migrations are
now confirmed applied, see "Security posture" above), **2** never applied
that would fail outright if run today (target dropped showcase tables), and
**79** applied untracked (10 by hand against the current schema, 69 that
predate `schema_migrations` tracking entirely and are this project's
original foundational migrations).

## Before touching this clone

Run `git fetch origin && git status -sb` first. Other sessions push to `main` from other folders; on 2026-09-04 this clone was 43 commits behind and an audit nearly fixed bugs that were already fixed upstream.

## Applying migrations through the Management API

When applying migrations directly through the Supabase Management API (rather
than `npx supabase db push`), pause **at least 2 seconds** between applies and
**stop immediately** if one fails — do not continue to the next migration.
Also note: the Management API stamps each migration's live `version` with the
time it was called, which can differ from the version encoded in the repo file
name that was pushed. Diff repo files against `supabase_migrations.schema_migrations`
by migration **name**, not by version — see `docs/MIGRATION-HISTORY.md`.

## Local Development

```bash
cd hireflow1
npm install
npm run dev
# Runs on http://localhost:8080
```

## Deploying Changes

Push to `main` branch on GitHub — Vercel auto-deploys.

```bash
git add .
git commit -m "your message"
git push origin main
```

## Supabase CLI Commands

```bash
# Link (already done)
npx supabase link --project-ref yqklrkpptnhubsnijqze

# Push database migrations
# DO NOT run this blind: db push matches by version, and 38 repo migrations
# are stamped with a different version than the one recorded live (see
# docs/MIGRATION-HISTORY.md, "Same migration, different version stamp").
# A blind push will re-apply those 38 against production and write a
# duplicate schema_migrations row. Reconcile against
# docs/MIGRATION-HISTORY.md first.
npx supabase db push

# Deploy all edge functions
npx supabase functions deploy

# Deploy a single edge function
npx supabase functions deploy <function-name>
```

## Edge function imports are pinned (2026-10-07)

Every edge function imports the Supabase client by exact version
(`https://esm.sh/@supabase/supabase-js@2.117.2`), and
`scripts/guards/edge-function-pinned-imports.mjs` fails on any remote import
in `supabase/functions` without a full x.y.z version. On 2026-10-07 a deploy
was blocked outright: functions imported the floating `@2`, and a release
published six minutes earlier could not be served by esm.sh ("Failed to bundle
the function ... Module not found"). To move to a newer release: change
`SUPABASE_JS` in that guard, replace the version in the imports that carry
the old one, run `node scripts/deno_check_functions.mjs`, and commit
`deno.lock` with it. A function only picks a new version up when it is next
deployed, so pinning changed nothing that is live. Eleven functions
deliberately stay on older pins (2.45.0, 2.49.1; listed in the guard): move
one only with that function's own tests.

## Still Needs Setup (updated 2026-09-16)

- [ ] Stripe live keys — checkout is deliberately disabled (fails loudly, takes no money) until pay-per-job billing ships; see "Distribution & billing state" above
- [ ] One real, complete, published job on production — the feed and Google indexing pipeline are wired and valid but currently serve 0 jobs because the live database has 0 rows in `jobs`/`applications`
  (the 7 `enforce_*` trusted-result migrations plus `enforce_phase_lock` are already applied live — re-verified 2026-09-16; do not re-add them here without re-running the query in "Security posture" first)
- [ ] Verify `ONESIGNAL_*` push-notification secrets are current in Supabase Edge Function secrets — the wrong-project-ref bug that silently broke every push was fixed (`20260826221000_fix_push_notification_wrong_project_url`), but re-confirm a live send before relying on it
- [ ] Custom domain settings beyond `hireflownow.com`, if any additional domain is wanted on Vercel

Already configured and working, despite older notes here: `OPENAI_API_KEY`
(every AI feature — job writing, scoring, chat/voice interviews, documents,
portfolio analysis — runs live on `gpt-5.6-luna`/`gpt-5.6-terra`/
`gpt-realtime-2.1`, see `docs/MODEL-DEADLINES.md`). `ELEVENLABS_API_KEY` is
only used by the `/marketing-demo` page — no candidate or employer flow depends
on it, so it is not a launch blocker either way.
