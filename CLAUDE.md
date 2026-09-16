# HireFlow - Project Reference

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

The app icon is **"Direction 4" — an ivory tile with the jade Ava orb**. Master + full docs in [`BRANDING.md`](BRANDING.md). All web/Apple/PWA/Android-maskable assets live in `public/` and are derived from `branding/app-icon-master.png`. **Do NOT revive the old dark-tile orb icon** (removed 2026-06-30) — see the "DO NOT REVIVE" section in BRANDING.md. Direction 5 (brass flow) is kept as a backup at `branding/backup-icon-flow.png`.

## Distribution & billing state (updated 2026-09-16, first set 2026-09-04)

- **Free tier is fully open** while Stripe is off: trials never expire, no job or applicant caps, 120 voice minutes per employer (migration `20260904110000_free_tier_open`, further relaxed by the recovered `20260627131622_relax_job_limit_billing_deferred`). Nothing may sit behind a paywall or show a price as due while billing is off. Re-gate when the pay-per-job model ships.
- **Google Indexing API works** — the service account in `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` is a verified Search Console owner; every publish/close fires `URL_UPDATED`/`URL_DELETED`, plus an IndexNow ping (key file in `public/`). The live `jobs.xml` feed is valid but currently serves 0 jobs — the live database has 0 rows in `jobs`/`applications` (test data was cleared on 2026-09-15/16); it needs one real, complete, published job to prove end to end.
- **Email is not wired**: `RESEND_API_KEY` is unset, so `send-notification-email` returns `skipped`. Auth emails (reset links) go through Supabase's default SMTP, which is rate-limited.
- **Models**: all OpenAI calls run on `gpt-5.6-luna` (cheap) / `gpt-5.6-terra` (scoring), voice on `gpt-realtime-2.1` + `gpt-live-transcribe`. GPT-5 models reject non-default `temperature`; the shared helpers strip it. See `docs/MODEL-DEADLINES.md`.
- **Stripe**: no live key is set. Checkout fails loudly (no silent test-key fallback) and takes no money — this is intentional until billing is turned on for real.

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

**One production account has no `profiles` row right now.** Verified live
2026-09-16: `select count(*) from auth.users u left join public.profiles p
on p.user_id=u.id where p.user_id is null` returns 1. The self-healing fix
for this, `public.reconcile_orphaned_profiles()`
(`supabase/migrations/20260831190000_reconcile_orphaned_profiles.sql`), was
never applied — the function does not exist live. Until it's applied, that
account has no `company_name`, which the feed quality gate and Google
structured data need, so its jobs are silently withheld/anonymized. This is
a real, live gap, not a bookkeeping one; see `docs/MIGRATION-HISTORY.md`
section 3a.

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

## Still Needs Setup (updated 2026-09-16)

- [ ] Stripe live keys — checkout is deliberately disabled (fails loudly, takes no money) until pay-per-job billing ships; see "Distribution & billing state" above
- [ ] One real, complete, published job on production — the feed and Google indexing pipeline are wired and valid but currently serve 0 jobs because the live database has 0 rows in `jobs`/`applications`
- [ ] Apply `20260831190000_reconcile_orphaned_profiles.sql` — one live account currently has no `profiles` row (see "Security posture" above), so its jobs are silently withheld from the feed/Google structured data
  (the 7 `enforce_*` trusted-result migrations plus `enforce_phase_lock` are already applied live — re-verified 2026-09-16; do not re-add them here without re-running the query in "Security posture" first)
- [ ] Verify `ONESIGNAL_*` push-notification secrets are current in Supabase Edge Function secrets — the wrong-project-ref bug that silently broke every push was fixed (`20260826221000_fix_push_notification_wrong_project_url`), but re-confirm a live send before relying on it
- [ ] Custom domain settings beyond `hireflownow.com`, if any additional domain is wanted on Vercel

Already configured and working, despite older notes here: `OPENAI_API_KEY`
(every AI feature — job writing, scoring, chat/voice interviews, documents,
portfolio analysis — runs live on `gpt-5.6-luna`/`gpt-5.6-terra`/
`gpt-realtime-2.1`, see `docs/MODEL-DEADLINES.md`); `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON`
(Indexing API + IndexNow both fire on publish/close). `ELEVENLABS_API_KEY` is
only used by the `/marketing-demo` page — no candidate or employer flow depends
on it, so it is not a launch blocker either way.
