# HireFlow - Project Reference

## Hosting & Infrastructure

| Service | Details |
|---------|---------|
| **Frontend Hosting** | Vercel |
| **Live URL** | https://hireflow1-iota.vercel.app |
| **Vercel Project** | aeytechnologiesllc-8936s-projects/hireflow1 |
| **GitHub Repo** | https://github.com/aeytechnologiesllc/hireflow1 |
| **Branch** | main |

## ⚠️ Deployments & preview URLs — READ THIS FIRST (do not get this wrong)

There are MULTIPLE HireFlow Vercel projects under team `aeytechnologiesllc-8936s-projects` (`team_D56p8KW1TNaIunpJZPTGTQYk`). Use the right one:

| URL | Vercel project | How it deploys |
|-----|----------------|----------------|
| **https://hireflow-preview.vercel.app** ✅ canonical live PREVIEW (public, no auth) | `hireflow-preview` (`prj_wA0tarRRA3OMKfbKY8Jm4iIKs8px`) | **Direct Vercel CLI deploy of the built `dist`. NOT git-connected.** |
| https://hireflow1-iota.vercel.app · hireflownow.com | `hireflow1` (`prj_TfqTLJmVsJ3fsJG7HFQt4vFvYQ6f`) | Git: auto-deploys `main`. **Branch pushes make a PROTECTED (401) / blank long preview URL** — do not share those. |

**To update the preview** (`hireflow-preview.vercel.app`):
```bash
cd hireflow1 && npm run build
cd dist
mkdir -p .vercel && printf '%s' '{"projectId":"prj_wA0tarRRA3OMKfbKY8Jm4iIKs8px","orgId":"team_D56p8KW1TNaIunpJZPTGTQYk"}' > .vercel/project.json
printf '%s' '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}' > vercel.json
npx vercel deploy --prod --yes --archive=tgz   # CLI authed as aeytechnologiesllc-8936
```

**DO NOT:** ❌ push a branch to the `hireflow1` project expecting a clean preview (you get a blank, auth-walled `hireflow1-git-…vercel.app`). ❌ create new HireFlow Vercel projects (already too many: hireflow1, hireflow-preview, hireflow, hf-apple, hf-mockups). ❌ promote to `hireflow1` production / `main` until the launch-blockers (illegal auto-reject, backend drift, RLS) are fixed.

**Env gotcha:** the preview build had empty `VITE_SUPABASE_*` → white screen (createClient throws). `src/integrations/supabase/client.ts` now falls back to a PUBLIC url+publishable key so it never boots empty; set real values via env.

> NOTE: the Supabase block below is STALE (see `AUDIT.md`): the repo points at a drifted/dead project, counts are wrong (78 migrations / 39 functions now). Trust `AUDIT.md` over this file for backend.

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
