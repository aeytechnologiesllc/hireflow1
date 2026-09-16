# Migration history — repo files vs. the live database

Read from the live project (`yqklrkpptnhubsnijqze`) on **2026-09-16** via
`select version, name, statements from supabase_migrations.schema_migrations`
(SELECT-only; no writes). This is the authoritative record of what has actually
run against production — `supabase/migrations/*.sql` in the repo is a working copy
that had drifted from it in two ways, both fixed by this pass.

## 1. Migrations applied live with no matching repo file (recovered)

19 rows in `schema_migrations` had no corresponding file anywhere in
`supabase/migrations/` (matched by name; none of their SQL duplicates an existing
repo file under a different name — checked by normalizing and hashing every
migration's SQL). Each has been written to
`supabase/migrations/<version>_<name>.sql` with a
`-- Recovered from the live migration history on 2026-09-16.` header, using the
exact `statements` stored live.

| Live version | Name | Recovered file |
|---|---|---|
| `20260617092255` | `hireflow_schema` | `20260617092255_hireflow_schema.sql` |
| `20260617093357` | `roles_demo_insert_policy` | `20260617093357_roles_demo_insert_policy.sql` |
| `20260617095249` | `roles_full_brief_columns` | `20260617095249_roles_full_brief_columns.sql` |
| `20260617105349` | `roles_flow_rigor_openings` | `20260617105349_roles_flow_rigor_openings.sql` |
| `20260617125729` | `public_apply_flow` | `20260617125729_public_apply_flow.sql` |
| `20260617132840` | `pipeline_actions` | `20260617132840_pipeline_actions.sql` |
| `20260617135027` | `interview_audio_storage` | `20260617135027_interview_audio_storage.sql` |
| `20260617140407` | `interview_storage_policy_fix` | `20260617140407_interview_storage_policy_fix.sql` |
| `20260625062732` | `add_hireflow1_auth_core` | `20260625062732_add_hireflow1_auth_core.sql` |
| `20260625062755` | `hireflow1_auth_bootstrap` | `20260625062755_hireflow1_auth_bootstrap.sql` |
| `20260627102730` | `add_ats_scoring_columns` | `20260627102730_add_ats_scoring_columns.sql` |
| `20260627104811` | `add_resume_score_column` | `20260627104811_add_resume_score_column.sql` |
| `20260627131622` | `relax_job_limit_billing_deferred` | `20260627131622_relax_job_limit_billing_deferred.sql` |
| `20260630051849` | `jobs_structured_location_salary` | `20260630051849_jobs_structured_location_salary.sql` |
| `20260630074028` | `join_distribution_schema` | `20260630074028_join_distribution_schema.sql` |
| `20260708034409` | `employer_public_branding_view` | `20260708034409_employer_public_branding_view.sql` |
| `20260709060437` | `harden_billing_rls_stop_free_plan_and_credit_forgery` | `20260709060437_harden_billing_rls_stop_free_plan_and_credit_forgery.sql` |
| `20260709062626` | `make_resumes_bucket_private_with_scoped_read` | `20260709062626_make_resumes_bucket_private_with_scoped_read.sql` |
| `20260901130252` | `make_candidate_media_buckets_private` | `20260901130252_make_candidate_media_buckets_private.sql` |

Notes on this group:

- `20260617092255_hireflow_schema.sql` created the "showcase" `roles`/`candidates`
  schema described (and now corrected) in `docs/ARCHITECTURE.md`. It was
  superseded by the `hireflow1` auth core migrations the same day and the
  showcase tables were never recreated — they do not exist live today.
- `20260625062732_add_hireflow1_auth_core.sql` and
  `20260625062755_hireflow1_auth_bootstrap.sql` ran 23 seconds apart and do
  almost the same setup in slightly different (both idempotent) forms. Both are
  recovered exactly as applied — they are not deduplicated, because this file
  records what actually ran, not what should have run.
- `20260630074028_join_distribution_schema.sql` created
  `job_distribution_posts` and JOIN-related columns on `applications`; these were
  later removed by the repo's own `20260715010000_remove_join_distribution.sql`.
  Recovered here anyway, for an accurate history.
- `20260627131622_relax_job_limit_billing_deferred.sql` was superseded by
  `20260904110000_free_tier_open.sql` (already in the repo).
- `20260708034409_employer_public_branding_view.sql` was adjusted further by
  `20260904112000_employer_public_branding_view_parity.sql` (already in the repo).
- `20260901130252_make_candidate_media_buckets_private.sql` is the fix behind the
  "candidate video/portfolio were on public URLs" incident — see project memory.

None of these 19 files rename or replace an existing repo file — they only fill
gaps. Existing repo file names were left untouched.

## 2. Same migration, different version stamp (Management API re-stamping)

Every migration applied via the Supabase **Management API** (as opposed to the
Supabase CLI / `db push`) gets a **new `version`** in
`supabase_migrations.schema_migrations` — one derived from *when the API call
ran*, not the version encoded in the file name that was pushed. On 2026-09-15 and
2026-09-16 several migrations were applied this way, so the same migration now
has two identities: the repo file's version prefix, and a different, later
live version. The SQL is identical (or intentionally idempotent-equivalent); this
is bookkeeping drift, not missing work, so **no new file was written for these** —
only this mapping.

| Repo file | Repo version | Live version | Live name |
|---|---|---|---|
| `20260625180000_add_email_exists_rpc.sql` | `20260625180000` | `20260625213738` | `add_email_exists_rpc` |
| `20260625140000_ava_engine_flow.sql` | `20260625140000` | `20260625213939` | `ava_engine_flow` |
| `20260703010000_join_integration_connections.sql` | `20260703010000` | `20260703053253` | `join_integration_connections` |
| `20260718221053_internal_test_account_subscription_bypass.sql` | `20260718221053` | `20260718221949` | `internal_test_account_subscription_bypass` |
| `20260718225758_remove_public_subscription_bypass_rpc.sql` | `20260718225758` | `20260718225807` | `remove_public_subscription_bypass_rpc` |
| `20260826210000_job_feed_quality_gate.sql` | `20260826210000` | `20260826212626` | `job_feed_quality_gate` |
| `20260826210500_published_jobs_public_expose_feed_flag.sql` | `20260826210500` | `20260826212730` | `published_jobs_public_expose_feed_flag` |
| `20260826211000_edge_function_rate_limiting.sql` | `20260826211000` | `20260826213746` | `edge_function_rate_limiting` |
| `20260826212000_profiles_backfill_and_harden.sql` | `20260826212000` | `20260826214439` | `profiles_backfill_and_harden` |
| `20260826220000_revoke_email_exists_enumeration_rpc.sql` | `20260826220000` | `20260826221012` | `revoke_email_exists_enumeration_rpc` |
| `20260826221000_fix_push_notification_wrong_project_url.sql` | `20260826221000` | `20260826222207` | `fix_push_notification_wrong_project_url` |
| `20260827205000_add_ai_scorecard_column.sql` | `20260827205000` | `20260827202924` | `add_ai_scorecard_column` |
| `20260827210000_lockdown_subscription_writes.sql` | `20260827210000` | `20260827203347` | `lockdown_subscription_writes` |
| `20260827211000_lockdown_notification_inserts.sql` | `20260827211000` | `20260827203357` | `lockdown_notification_inserts` |
| `20260829150000_scheduling_v2_windows_and_rooms.sql` | `20260829150000` | `20260829190234` | `scheduling_v2_windows_and_rooms` |
| `20260830190000_capture_company_name_on_signup.sql` | `20260830190000` | `20260831003757` | `capture_company_name_on_signup` |
| `20260915100000_private_portfolios_and_attachments.sql` | `20260915100000` | `20260915120317` | `private_portfolios_and_attachments` |
| `20260915110000_quiz_answer_keys_server_side.sql` | `20260915110000` | `20260915130715` | `quiz_answer_keys_server_side` |
| `20260915120000_team_invitations_lockdown.sql` | `20260915120000` | `20260915120538` | `team_invitations_lockdown` |
| `20260915121000_forgery_policy_lockdown.sql` | `20260915121000` | `20260915120544` | `forgery_policy_lockdown` |
| `20260915122000_in_app_notifications_for_key_moments.sql` | `20260915122000` | `20260915120547` | `in_app_notifications_for_key_moments` |
| `20260915123000_high_entropy_document_codes.sql` | `20260915123000` | `20260915130329` | `high_entropy_document_codes` |
| `20260915130000_public_views_tighten.sql` | `20260915130000` | `20260915130338` | `public_views_tighten` |
| `20260915131000_rpc_caller_checks.sql` | `20260915131000` | `20260915130342` | `rpc_caller_checks` |
| `20260915140000_trusted_step_results.sql` | `20260915140000` | `20260916135053` | `trusted_step_results` |
| `20260915141000_job_owner_rpc_caller_checks.sql` | `20260915141000` | `20260916135130` | `job_owner_rpc_caller_checks` |
| `20260915150000_document_signing.sql` | `20260915150000` | `20260916140557` | `document_signing` |
| `20260916140000_voice_session_log.sql` | `20260916140000` | `20260916135127` | `voice_session_log` |

`20260703075257_google_indexing_notifications.sql`,
`20260904110000_free_tier_open.sql`, `20260904112000_employer_public_branding_view_parity.sql`,
`20260904120000_candidate_notification_links.sql`, and
`20260904121000_message_notifications.sql` are **not** in this table — their
repo version and live version already match exactly.

## Why this happens: the Management API stamping rule

`npx supabase db push` (CLI) applies a migration file and records
`schema_migrations.version` as the version encoded in the file name. Applying a
migration through the **Management API** (`apply_migration`, used by tooling that
talks to Supabase directly rather than shelling out to the CLI) instead stamps
`version` with the time the API call was made. If a migration is drafted with one
timestamp in its filename and then applied through the API later, the repo and the
live database end up with two different version numbers for the same SQL. Both
are legitimate ways to apply a migration — this is a naming/bookkeeping mismatch,
not a data-integrity problem — but it means **the live version is not derivable
from the repo file name**, and any tooling (or person) diffing repo files against
`schema_migrations` by version number alone will produce false positives. Diff by
migration **name**, not by version, or consult this file.

## Operational lesson: pause between Management API applies

When applying several migrations back-to-back through the Management API, pause
at least **2 seconds** between calls and **stop immediately on the first
failure** rather than continuing to the next migration. Applying too fast, or
plowing ahead after a failure, is how this repo ended up with the drift recovered
above. See `CLAUDE.md` for the same rule stated as a standing instruction.

## Verifying this file stays true

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Compare the `name` column against `supabase/migrations/*.sql` file names (not
against the `version` prefix, for the reason above). Any live name with no repo
file is missing and should be recovered the same way this pass did.
