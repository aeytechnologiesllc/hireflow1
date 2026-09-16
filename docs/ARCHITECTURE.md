# Architecture

## Overview

The frontend has code for two Supabase schema shapes, but only one is live:

| Mode | Detection | Employer jobs | Candidate apply | Live on `yqklrkpptnhubsnijqze`? |
|------|-----------|---------------|------------------|---|
| **hireflow1** | `public.jobs` exists | `jobs` table + auth | `/applications/:id/...` phase engine | **Yes — canonical** |
| **showcase** | `public.jobs` missing (PGRST205) | `roles` table | Accountless via `showcaseApply.ts` | No — `public.roles` and `public.candidates` do not exist |

Detection: `detectSchemaMode()` in `src/cockpit/data/showcaseSource.ts` — cached per
session. `useSchemaMode` (`src/hooks/useSchemaMode.ts`) disables `jobs`/`jobs!inner`
query hooks whenever detection returns `showcase`.

> ⚠️ **Verify before changing this.** This doc previously (until 2026-08-31) claimed
> `roles`/`candidates` was the canonical schema and that `jobs` was absent — the
> opposite is true. That is the same trap as the wrong Supabase project ref
> documented at the top of `CLAUDE.md`: because `detectSchemaMode()` falls back
> rather than throwing, code written against the wrong shape takes the wrong branch
> **silently**, not loudly.

**Canonical for project `yqklrkpptnhubsnijqze`:** **hireflow1** (`jobs` /
`applications` / `profiles` / `user_roles`, plus the tables in
[BACKEND-SCHEMA.md](./BACKEND-SCHEMA.md)). Re-verified live on 2026-09-16:
`public.jobs` and `public.applications` exist (0 rows each — test data was
cleared); `public.roles`, `public.candidates`, `public.employers`, `public.kpis`
do not exist. The showcase migration that once created them
(`supabase/migrations/20260617092255_hireflow_schema.sql`, recovered — see
[MIGRATION-HISTORY.md](./MIGRATION-HISTORY.md)) was superseded by the hireflow1
auth core the same day, and the showcase tables were never recreated.

The `showcase*` frontend code paths below are therefore **dead on production** —
`detectSchemaMode()` always resolves to `hireflow1` against the live project. They
still exist in the tree (and still compile) as a local-demo / offline fallback;
do not build new features against them.

Confirm the live shape before relying on either path — it is one query:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('jobs','roles','candidates','applications');
```

## Layer map

```
Employer UI (cockpit pages)
  └─ useCockpitData hooks
       ├─ showcase → showcaseSource.ts (roles, applications, …) — dead on prod
       └─ hireflow1 → useJobs, useApplications, …             — live path

Candidate UI
  ├─ /candidate/* (no AppLayout auth wall)
  │    └─ showcaseApply.ts → Supabase roles/candidates/applications — dead on prod
  └─ /applications/* (hireflow1, auth required)                     — live path

Create job
  └─ useCreateJob → showcase: createShowcaseRole() (dead on prod) | hireflow1: jobs.insert
```

## Employer cockpit

- Pages: `src/cockpit/pages/*` re-exported from `src/pages/Dashboard.tsx`, `Jobs.tsx`, etc.
- Live path reads/writes `jobs` and `applications` via `src/hooks/useJobs.ts` and related hooks, gated by `useSchemaMode`.

## Auth

- Employer: `/auth` → AppLayout → subscription gating (free tier is fully open — see `CLAUDE.md` "Distribution & billing state"; nothing is actually gated today)
- Candidate: optional `/candidate/auth`
- `linked_user_id` on applications links a guest-created row after OAuth/email signup

## What is NOT unified yet

- The showcase (`roles`/`candidates`) code path is dead weight against the live
  project. It is not deleted because it is still reachable for local/offline demo
  use; removing it is a separate cleanup, not a records-truth fix.
- `hireflow1` `applications.job_id` vs showcase `applications.role_id` — different
  columns, same table name, only one of which exists live.

## Related docs

- [CANDIDATE-FLOW.md](./CANDIDATE-FLOW.md) — UX flows and routes
- [BACKEND-SCHEMA.md](./BACKEND-SCHEMA.md) — live tables, columns, RLS
- [MIGRATION-HISTORY.md](./MIGRATION-HISTORY.md) — repo file ↔ live migration version mapping
- Parent repo `CLAUDE.md` — product rules, Deep Jade design, Ava seal, applicant no-AI-language rule

## Run locally

```bash
npm install
npm run dev
# http://localhost:8080
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` pointing at
`yqklrkpptnhubsnijqze`.
