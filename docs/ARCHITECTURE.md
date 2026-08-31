# Architecture — `_repo` dual schema

## Overview

The `_repo` app serves two Supabase shapes from one codebase:

| Mode | Detection | Employer jobs | Candidate apply |
|------|-----------|---------------|-----------------|
| **showcase** | `public.jobs` missing (PGRST205) | `roles` table | Accountless via `showcaseApply.ts` |
| **hireflow1** | `public.jobs` exists | `jobs` table + auth | Legacy phase engine (`/applications/:id/...`) |

Detection: `detectSchemaMode()` in `src/cockpit/data/showcaseSource.ts` — cached per session.

> ⚠️ **This line was wrong until 2026-08-31 and it is load-bearing — verify before
> changing it.** It previously claimed showcase (`roles` / `candidates`) was
> canonical and that `jobs` was absent. The opposite is true, and an agent that
> believed it would build against tables that do not exist.

**Canonical for project `yqklrkpptnhubsnijqze`:** **hireflow1** (`jobs` /
`applications` / `profiles` / `user_roles`). Verified against the live database on
2026-08-31: `public.jobs` and `public.applications` exist; **`public.roles` and
`public.candidates` do not exist at all.**

Confirm before relying on either shape — it is one query:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('jobs','roles','candidates','applications');
```

Because `detectSchemaMode()` falls back rather than throwing, code written against
the wrong shape takes the wrong branch **silently** instead of failing loudly. That
is the same trap as the wrong Supabase project ref documented at the top of
`CLAUDE.md`.

## Layer map

```
Employer UI (cockpit pages)
  └─ useCockpitData hooks
       ├─ showcase → showcaseSource.ts (roles, applications, …)
       └─ hireflow1 → useJobs, useApplications, …

Candidate UI
  ├─ /candidate/* (no AppLayout auth wall)
  │    └─ showcaseApply.ts → Supabase roles/candidates/applications
  └─ /applications/* (hireflow1, auth required)

Create job
  └─ useCreateJob → showcase: createShowcaseRole() | hireflow1: jobs.insert
```

## Employer cockpit

- Pages: `src/cockpit/pages/*` re-exported from `src/pages/Dashboard.tsx`, `Jobs.tsx`, etc.
- Jobs list: `fetchShowcaseJobs()` maps `roles` → `JobRow` including `roleCode`
- Share: `candidateApplyUrl(roleCode)` → `/candidate/apply?code=…`
- Applicants: `fetchShowcaseCandidates()` reads `applications` joined to `candidates` / `roles`

## Candidate accountless path (showcase)

See [CANDIDATE-FLOW.md](./CANDIDATE-FLOW.md).

Data module: `src/lib/showcaseApply.ts`

## Auth

- Employer: `/auth` → AppLayout → subscription gating (showcase uses local trial fallback — no `get-subscription` call)
- Candidate: optional `/candidate/auth` — **not** required to apply on showcase path
- `linked_user_id` on applications links guest rows after OAuth/email signup
- Logged-in employers on showcase see `emp_marias_cafe` data via `showcaseSource.ts` (not auth user id)

## Hireflow1 hook gating

Hooks that query `jobs` / `jobs!inner` joins are **disabled** when `detectSchemaMode()` returns `showcase` (`useSchemaMode` in `src/hooks/useSchemaMode.ts`). Cockpit pages use `showcaseSource` adapters instead.

## What is NOT unified yet

- Full quiz/voice phase engine on showcase path (stubs on resume; screening edge fns live in parent `web/` project)
- `hireflow1` `applications.job_id` vs showcase `applications.role_id` — different columns, same table name on different deployments
- Employer `employer_id` on showcase is hardcoded `emp_marias_cafe` for demo (logged-in employer auth user id ≠ showcase employer row)

## Related docs

- [CANDIDATE-FLOW.md](./CANDIDATE-FLOW.md) — UX flows and routes
- [BACKEND-SCHEMA.md](./BACKEND-SCHEMA.md) — tables, columns, RLS
- Parent repo `CLAUDE.md` — product rules, Deep Jade, orb, applicant no-AI-language rule

## Run locally

```bash
cd _repo && npm run dev
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` pointing at `yqklrkpptnhubsnijqze`.
