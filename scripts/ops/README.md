# Operator scripts (used by the agent sessions of 2026-10-25)

Run from the repo root. None of them prints a secret: the two that need the
Supabase access token read the CLI's own saved token from the macOS keychain
(the CLI's own keychain read hung from 2026-10-25 ~02:40, so it is passed by
environment instead).

| Script | What it does |
|---|---|
| `fullsuite.sh` | Pass B in one go: every guard, the typecheck ratchet, the build, the Deno check of every edge function, and every `scripts/*.test.mjs` / `*pglite*.mjs`. Prints one line each and the failing test files. Run it before every push (about 10 minutes). |
| `apply_migration.sh <file> <name>` | Applies one migration through the Management API, recorded live under `<name>`. One at a time, 3 seconds apart, stop on any failure (CLAUDE.md). Then record the live version in docs/MIGRATION-HISTORY.md §4. |
| `deploy.sh <fn>...` | Deploys edge functions (`--use-api`). |
| `deps.mjs <changed file>...` | Which edge functions reach the changed files through relative imports, i.e. what to deploy. In zsh pass a list as `${=CH}`. |
| `smoke.sh` | Read-only checks of the live site and a few signed-out function calls. Plain requests to hireflownow.com were answered by Vercel's bot check (403, `x-vercel-mitigated: challenge`) on 2026-10-25; check the site in a browser instead while that lasts. |
