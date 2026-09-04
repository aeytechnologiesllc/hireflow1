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

## Distribution & billing state (2026-09-04)

- **Free tier is fully open** while Stripe is off: trials never expire, no job or applicant caps, 120 voice minutes per employer (migration `20260904110000_free_tier_open`). Re-gate when the pay-per-job model ships.
- **Google Indexing API works** — the service account in `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` is a verified Search Console owner; every publish/close fires `URL_UPDATED`/`URL_DELETED`, plus an IndexNow ping (key file in `public/`).
- **Email is not wired**: `RESEND_API_KEY` is unset, so `send-notification-email` returns `skipped`. Auth emails (reset links) go through Supabase's default SMTP, which is rate-limited.
- **Models**: all OpenAI calls run on `gpt-5.6-luna` (cheap) / `gpt-5.6-terra` (scoring), voice on `gpt-realtime-2.1` + `gpt-live-transcribe`. GPT-5 models reject non-default `temperature`; the shared helpers strip it. See `docs/MODEL-DEADLINES.md`.

## Before touching this clone

Run `git fetch origin && git status -sb` first. Other sessions push to `main` from other folders; on 2026-09-04 this clone was 43 commits behind and an audit nearly fixed bugs that were already fixed upstream.

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
npx supabase db push

# Deploy all edge functions
npx supabase functions deploy

# Deploy a single edge function
npx supabase functions deploy <function-name>
```

## Still Needs Setup

- [ ] Custom domain on Vercel
- [ ] Stripe keys (for payments/subscriptions)
- [ ] ElevenLabs API key (for voice features)
- [ ] OpenAI API key (for AI features)
- [ ] Push notification keys
