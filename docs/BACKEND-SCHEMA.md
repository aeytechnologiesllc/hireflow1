# Backend schema

Supabase project: **`yqklrkpptnhubsnijqze`** (Postgres 17). Verified live against
`information_schema` / the Supabase management API on **2026-09-16**. The live
database currently has 0 rows in `jobs` and `applications` (test data was cleared);
do not assume any row exists — build fixtures inside tests instead.

There is only **one** schema in production: `jobs` / `applications` / `profiles`.
Earlier drafts of this doc (and of `docs/ARCHITECTURE.md`) described a second
"showcase" schema (`roles`, `candidates`, `employers`, `kpis`, …) as if it were
live and canonical. That schema does **not exist** on the live database — its
migration (recovered as `supabase/migrations/20260617092255_hireflow_schema.sql`,
see `docs/MIGRATION-HISTORY.md`) was superseded by the `jobs`/`applications` auth
core the same day. Do not build against `roles`/`candidates`.

## Tables (public schema)

One line each, in the order `information_schema` returns them. RLS is enabled on
every table below.

| Table | Rows (2026-09-16) | Purpose |
|---|---|---|
| `profiles` | 23 | One row per authenticated user (employer or candidate): contact/company info, notification preferences, resume/LinkedIn/portfolio links |
| `user_roles` | 20 | Which `app_role` (`employer`, `candidate`, `team_member`, `developer`) each `auth.users` row has |
| `jobs` | 0 | Employer job postings: brief, structured location/salary, screening workflow config, quiz/questions, feed-eligibility flag |
| `applications` | 0 | One row per candidate application to a job: pipeline `phase`/`status`, resume + AI scoring, voice interview result, document rejection state |
| `interviews` | 0 | Scheduled human interviews for an application: proposed/confirmed times, meeting link, AI-assisted questions/feedback |
| `messages` | 6 | Employer ↔ candidate chat tied to an application, with optional file attachment |
| `notifications` | 7 | In-app notification feed per user (new application, message, document update, etc.) |
| `documents` | 0 | Offer letters / contracts / NDAs sent for signature: multi-party signing state, hashes, versioning, audit fields |
| `document_requests` | 0 | Employer request for a candidate to submit a document (e.g. ID, certification) |
| `document_packages` | 0 | Groups multiple `documents`/`document_requests` sent together for one application |
| `document_templates` | 0 | Employer-authored reusable document templates |
| `document_audit_logs` | 0 | Append-only signing audit trail: signer identity, IP, hashes before/after each signature event |
| `team_invitations` | 0 | Pending/accepted invites for an employer's team members, with per-invite permission flags |
| `team_members` | 0 | Accepted team members under an employer, with per-member permission flags and job assignment |
| `subscriptions` | 16 | One row per user's billing state (Stripe ids, plan, trial window); see `hireflow-free-tier-open-2026-09` — free tier is open, nothing is gated on this table right now |
| `subscription_usage` | 15 | Per-period usage counters (jobs created, applicants, AI analyses, voice minutes) used for limit checks once billing is re-enabled |
| `voice_credits` | 32 | Voice-minute grants/purchases per user, with remaining balance and expiry |
| `voice_session_log` | 0 | One row per Ava voice session: minutes charged, caller, time/hard caps — the source of truth for voice billing (`20260916140000_voice_session_log.sql`) |
| `blueprint_purchases` | 0 | One-off Stripe purchases of a candidate's performance-report "blueprint" |
| `push_subscriptions` | 0 | Web push registrations per user/device |
| `google_indexing_notifications` | 0 | Log of Google Indexing API calls fired on job publish/close |
| `private_rate_limit` | 11 | Fixed-window rate limiting for public edge functions; rows expire via `prune_rate_limits()` |
| `job_quiz_keys` | 0 | Server-side quiz answer keys, kept out of any client-readable table (`20260915110000_quiz_answer_keys_server_side.sql`) |
| `quiz_attempt_ledger` | 0 | Tracks quiz attempts/retakes per candidate per job step, to stop resubmission |
| `trusted_result_enforcement` | 8 | Feature flags gating whether each self-reported step result (typing test, chat/voice interview, portfolio, …) must match a server-recorded trusted result before it is trusted |

## Storage buckets

| Bucket | Public? | Notes |
|---|---|---|
| `resumes` | No | Private since `20260709062626_make_resumes_bucket_private_with_scoped_read.sql`; readable by the resume's owner and the employer who owns the job it was submitted to |
| `videos` | No | Candidate video introductions; private since `20260901130252_make_candidate_media_buckets_private.sql` |
| `portfolios` | No | Candidate work samples; private since the same migration |
| `interviews` | No | Voice-interview audio |

Client code mints short-lived **signed URLs** for all of the above
(`src/utils/candidateMediaUrl.ts`, `src/utils/resumeSignedUrl.ts`); nothing reads
these buckets by a permanent public URL any more.

## Key RPC / trigger surfaces

- `has_role`, `get_user_role`, `is_job_owner`, `is_active_team_member_for_job` — caller-scoped checks used across RLS policies and edge functions; each answers only about the calling user (`docs/` migrations `20260915131000_rpc_caller_checks.sql`, `20260915141000_job_owner_rpc_caller_checks.sql`)
- `protect_application_columns`, `protect_document_columns` — triggers that block a client write from forging server-owned columns (scores, signing state)
- `job_limit_for_user` / `subscription_plan_for_limits` — billing limit lookups, currently relaxed to unlimited while Stripe is off (`20260904110000_free_tier_open.sql`)

## Applying migrations

From the repo root, with the Supabase CLI linked to `yqklrkpptnhubsnijqze`:

```bash
npx supabase db push
```

**Do not run this blindly against `yqklrkpptnhubsnijqze`.** `db push` decides
what to apply by matching each repo file's version prefix against
`supabase_migrations.schema_migrations.version`. 27 repo migrations are
currently stamped with a different version than the one recorded live (see
`docs/MIGRATION-HISTORY.md`, "Same migration, different version stamp"), so an
unreconciled push will treat those as new and re-run their DDL a second time
against production. Reconcile local migration history against
`docs/MIGRATION-HISTORY.md` first.

Migration files are named `<version>_<name>.sql` under `supabase/migrations/`.
**The live `version` stamp and the repo filename's version prefix can differ** —
see `docs/MIGRATION-HISTORY.md` for why, and for the mapping between the two for
every migration applied since 2026-09-15.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the frontend talks to this schema
- [MIGRATION-HISTORY.md](./MIGRATION-HISTORY.md) — repo file ↔ live version mapping, recovered migrations
- Parent repo `CLAUDE.md` — product rules, billing/free-tier state, security posture
