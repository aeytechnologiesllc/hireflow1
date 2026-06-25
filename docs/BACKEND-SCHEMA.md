# Backend schema — showcase candidate path

Supabase project: **`yqklrkpptnhubsnijqze`** (Deep Jade demo / Maria's Café).

Canonical tables for the current `_repo` employer cockpit + accountless apply when `public.jobs` does **not** exist.

## Core tables

### `employers`
| Column | Notes |
|--------|-------|
| `id` | text PK, demo: `emp_marias_cafe` |
| `name`, `owner_name` | Display |

### `roles`
| Column | Notes |
|--------|-------|
| `id` | text PK (`role_*`) |
| `employer_id` | FK → employers |
| `title`, `location`, `pay`, `status` | `status` in `draft`, `live`, `shortlist`, `quiz`, `interview`, `filled`, `closed` |
| `role_code` | **Unique** public apply code (`ROLE-XXXXXX`), auto-generated on insert |
| `flow` | jsonb — hiring flow config (quiz/interview stages) |
| `applicant_count` | Denormalized; bumped on new application (trigger) |
| `description`, `traits`, `employment_type`, … | Extended brief fields |

### `candidates`
| Column | Notes |
|--------|-------|
| `id` | text PK (`cand_*`) — guest applicant id pre-auth |
| `name`, `initials`, `avatar_color` | Display |
| `email`, `phone` | Contact; captured at apply time |

### `applications`
| Column | Notes |
|--------|-------|
| `id` | text PK (`app_*`) |
| `candidate_id` | FK → candidates (required today; guest candidates created at apply) |
| `role_id` | FK → roles |
| `stage` | Pipeline stage: `applied`, `quiz`, `interview`, `shortlist` |
| `current_phase` | **Resume pointer** for accountless flow (`applied`, `quiz`, `interview`, …) |
| `applicant_email` | Denormalized for lookup / linking |
| `applicant_phone` | **Primary continue key** (with normalized digit index) |
| `application_answers` | jsonb — phase 1 Q&A |
| `linked_user_id` | uuid — set when guest links auth account (match phone/email) |
| `decision` | `offer` \| `passed` (employer advance/pass) |
| `voice_score`, `quiz_score`, `note` | Screening |

## Migrations (repo)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260625120000_accountless_candidate_flow.sql` | `role_code`, application contact fields, demo insert/update policies, applicant_count trigger |
| `supabase/migrations/20260625130000_phone_continue_flow.sql` | `linked_user_id`, phone digit indexes |

Legacy SQL also lives in `/web/db/` (parent Hireflow folder) for the original showcase seed — do not re-run `002_seed.sql` on production without founder approval (truncates).

## RLS (pre-launch demo-open)

| Policy | Table | Access |
|--------|-------|--------|
| `public read *` | All showcase tables | SELECT for anon |
| `demo insert roles` | roles | INSERT `with check (true)` |
| `public apply insert candidate` | candidates | INSERT (from `web/db/003_public_apply.sql`) |
| `public apply insert application` | applications | INSERT |
| `demo update application` | applications | UPDATE (advance/pass, phase progress) |

**Launch hardening (required before paying customers):**
- Scope INSERT/UPDATE to authenticated employer or edge-function gates
- Rate-limit / captcha on public apply
- Replace `with check (true)` on roles/applications
- Gate OpenAI edge functions (`verify_jwt`, auth, spend limits)

## Identity model

```
Job code  → roles.role_code     (which job?)
Phone     → applications.*      (which person? — may have many jobs)
Email     → tie-breaker + account link
```

Duplicate apply: same `role_id` + normalized `applicant_email` + normalized `applicant_phone` → return existing application.

## Indexes

- `applications_applicant_phone_idx` — digits-only expression index
- `applications_role_email_idx` — email per role
- `applications_linked_user_idx` — post-auth lookups
- `candidates_phone_digits_idx` — join fallback for phone continue

## Applying migrations

From `_repo` with Supabase CLI linked to `yqklrkpptnhubsnijqze`:

```bash
supabase db push
```

Or apply SQL via Supabase dashboard SQL editor (migrations above in order).

## Verification query (after apply)

```sql
select id, title, role_code, applicant_count from roles order by sort_order desc limit 5;
select id, role_id, applicant_email, applicant_phone, current_phase from applications order by sort_order desc limit 5;
```
