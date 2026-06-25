# Architecture — `_repo` dual schema

## Overview

The `_repo` app serves two Supabase shapes from one codebase:

| Mode | Detection | Employer jobs | Candidate apply |
|------|-----------|---------------|-----------------|
| **showcase** | `public.jobs` missing (PGRST205) | `roles` table | Accountless via `showcaseApply.ts` |
| **hireflow1** | `public.jobs` exists | `jobs` table + auth | Legacy phase engine (`/applications/:id/...`) |

Detection: `detectSchemaMode()` in `src/cockpit/data/showcaseSource.ts` — cached per session.

**Canonical for project `yqklrkpptnhubsnijqze`:** showcase (`roles` / `candidates` / `applications`). The `jobs` table is absent on this project.

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
