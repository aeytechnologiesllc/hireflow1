# HireFlow - Project Reference

## Hosting & Infrastructure

| Service | Details |
|---------|---------|
| **Frontend Hosting** | Vercel |
| **Live URL** | https://hireflow1-iota.vercel.app |
| **Vercel Project** | aeytechnologiesllc-8936s-projects/hireflow1 |
| **GitHub Repo** | https://github.com/aeytechnologiesllc/hireflow1 |
| **Branch** | main |

## Supabase

| Item | Value |
|------|-------|
| **Project ID** | kcotpxlggfvgclwksmhl |
| **Project URL** | https://kcotpxlggfvgclwksmhl.supabase.co |
| **Dashboard** | https://supabase.com/dashboard/project/kcotpxlggfvgclwksmhl |
| **Edge Functions** | https://supabase.com/dashboard/project/kcotpxlggfvgclwksmhl/functions |
| **Database Migrations** | 71 migrations (all applied) |
| **Edge Functions Deployed** | 37 functions |

## Auth Providers

| Provider | Status |
|----------|--------|
| **Email/Password** | Enabled (Supabase Auth) |
| **Google OAuth** | Enabled (native Supabase OAuth) |

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
npx supabase link --project-ref kcotpxlggfvgclwksmhl

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
