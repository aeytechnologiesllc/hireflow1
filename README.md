# HireFlow

An AI-assisted hiring app for main-street small businesses. An employer posts a
job, candidates apply and go through a screening flow (quiz, chat/voice
interview, portfolio, etc.) guided by an in-app assistant called Ava, and the
employer reviews a scored pipeline, messages candidates, and sends documents for
signature. Candidates never see the words "AI" or "Ava" — the copy stays plain
and everyday.

Live at **https://hireflownow.com**.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui
- **Backend:** Supabase — Postgres 17, Edge Functions (Deno), Auth, Storage
- **Hosting:** Vercel (frontend + `api/*.mjs` serverless functions), auto-deploys `main`
- **AI:** OpenAI (text + voice, via Edge Functions), ElevenLabs TTS (marketing demo only)

See [docs/BACKEND-SCHEMA.md](docs/BACKEND-SCHEMA.md) for the live database schema
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the frontend talks to it.

## Local development

```bash
npm install
npm run dev
# http://localhost:8080
```

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`,
pointing at the Supabase project in `CLAUDE.md`.

## Testing & guardrails

Before committing, all of the following must pass:

```bash
npm run build
npm run typecheck:ratchet    # type errors must never exceed the recorded baseline
node scripts/guardrails.mjs  # repo-specific rules: design tokens, safety invariants, etc.
node scripts/*.test.mjs      # unit tests
node scripts/*pglite*.mjs    # RLS/RPC/trigger tests against a real Postgres (PGlite)
```

Any edge function you add or change should also pass `deno check`.

Guardrail failures come with a fix-it style explanation in `scripts/guardrails.mjs`;
add new guards under `scripts/guards/` per `scripts/guards/README.md` (each guard
must fail on the old code and pass on the fix).

## Where the docs live

| Doc | What it covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Frontend ↔ Supabase schema shape, layer map |
| [`docs/BACKEND-SCHEMA.md`](docs/BACKEND-SCHEMA.md) | Live tables, storage buckets, key RPCs |
| [`docs/MIGRATION-HISTORY.md`](docs/MIGRATION-HISTORY.md) | Repo migration file ↔ live migration version mapping |
| [`docs/CANDIDATE-FLOW.md`](docs/CANDIDATE-FLOW.md) | Candidate-facing UX flow and routes |
| [`docs/MODEL-DEADLINES.md`](docs/MODEL-DEADLINES.md) | Which AI model each edge function uses, and how to swap one |
| [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) | Where a published job actually gets distributed, automatically |
| [`docs/DOCUMENT-SIGNING.md`](docs/DOCUMENT-SIGNING.md) | Document-signing flow and integrity guarantees |
| [`docs/TRUSTED-RESULTS.md`](docs/TRUSTED-RESULTS.md) | Server-trusted vs self-reported screening step results |
| [`BRANDING.md`](BRANDING.md) | App icon / brand asset source of truth |
| `CLAUDE.md` | Project reference: hosting, Supabase project, env vars, current known gaps |

## Deploying

Push to `main` — Vercel auto-deploys the frontend. Database migrations and edge
functions are deployed separately with the Supabase CLI; see `CLAUDE.md` for the
commands and the pacing rule for the Management API.
