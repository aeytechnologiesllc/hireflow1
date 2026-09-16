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

## 3. Repo migration files never applied live (the reverse check)

Section 1 only catches "live migration with no repo file." Checking the other
direction — every `supabase/migrations/*.sql` file's name against the full,
unfiltered `name` column of `schema_migrations` (52 live rows; see the query
in "Verifying this file stays true" below), not a search scoped to one
category like `%enforce%` — found **20** repo files with no matching live row,
not 7. A prior pass through this section undercounted because it only ran a
targeted search for the `enforce_*` files; it did not diff the full name list
both ways. The 20 split into three genuinely different situations, and they
must not be treated as one bucket:

**a) Never applied, and the gap has a live consequence (real follow-up work):**

| Repo file | Name | Live consequence |
|---|---|---|
| `20260831190000_reconcile_orphaned_profiles.sql` | `reconcile_orphaned_profiles` | `public.reconcile_orphaned_profiles()` does not exist live (`select proname from pg_proc where proname ilike '%reconcile%'` returns zero rows, checked 2026-09-16). This function exists to self-heal `auth.users` rows with no matching `public.profiles` row. Live right now: `select count(*) from auth.users u left join public.profiles p on p.user_id=u.id where p.user_id is null` returns **1** — one production account has no `profiles` row, so it has no `company_name`, which the feed quality gate and Google structured data need; that employer's jobs would be silently withheld/anonymized until this migration is applied. Not superseded by any later file (grepped — nothing else recreates this function). |

**b) Never applied, and would fail or is moot if applied today (safe to leave, not "safe to ignore" — verify before assuming either):**

| Repo file | Name | Why |
|---|---|---|
| `20260916150100_enforce_typing_test_result.sql` | `enforce_typing_test_result` | see enforcement note below |
| `20260916150200_enforce_chat_simulation_result.sql` | `enforce_chat_simulation_result` | see enforcement note below |
| `20260916150300_enforce_chat_interview_result.sql` | `enforce_chat_interview_result` | see enforcement note below |
| `20260916150400_enforce_sales_simulation_result.sql` | `enforce_sales_simulation_result` | see enforcement note below |
| `20260916150500_enforce_portfolio_result.sql` | `enforce_portfolio_result` | see enforcement note below |
| `20260916150600_enforce_video_intro_result.sql` | `enforce_video_intro_result` | see enforcement note below |
| `20260916150700_enforce_voice_interview_result.sql` | `enforce_voice_interview_result` | see enforcement note below |
| `20260625120000_accountless_candidate_flow.sql` | `accountless_candidate_flow` | targets `public.roles`/`public.candidates`, the "showcase" tables created (and dropped) in section 1 — neither table exists live (`information_schema.tables` count = 0 for both), so this migration would error if run today |
| `20260625130000_phone_continue_flow.sql` | `phone_continue_flow` | same — targets the same long-gone `roles`/`candidates` showcase tables |

Enforcement note: `select * from public.trusted_result_enforcement` still
returns all 8 rows (`chatInterviewResult`, `chatSimulationResult`, `phase`,
`portfolioResult`, `salesSimulationResult`, `typingTestResult`,
`videoIntroResult`, `voiceInterviewResult`) with `enforced = false`, confirmed
2026-09-16 — none of these 7 `enforce_*` migrations have run (there is no 8th
file; `phase` has no corresponding `enforce_*` file in the repo). Per
`20260915140000_trusted_step_results.sql`, an unenforced `result_key` is left
fully candidate-writable by `protected_trusted_result_notes_subset`, so none
of these step results are actually protected against client forgery today,
despite files existing that would protect them. See `CLAUDE.md`, "Security
posture", for the corrected claim — do not describe any of these 8 as
"enforced" until its migration is confirmed live via this same query.
Applying these 7 migrations is open follow-up work, not part of this
reconciliation pass (which is read-only).

**c) No live `schema_migrations` row, but the migration's effects ARE live —
applied untracked, most likely by hand through the SQL editor rather than
`db push` or the Management API.** A missing row here does **not** mean
"never applied"; it means "not tracked." Confirmed live on 2026-09-16:

| Repo file | Name | Verified live |
|---|---|---|
| `20260703062047_jobs_google_structured_fields.sql` | `jobs_google_structured_fields` | `jobs.location_city` and `jobs.locations` columns exist |
| `20260715010000_remove_join_distribution.sql` | `remove_join_distribution` | `job_distribution_posts` table is gone (also referenced as settled fact in section 1) |
| `20260715011000_private_resume_storage.sql` | `private_resume_storage` | resumes bucket is private (consistent with "candidate video/portfolio were on public URLs" fix lineage) |
| `20260715012000_public_safe_jobs_view.sql` | `public_safe_jobs_view` | `public.published_jobs_public` view exists |
| `20260715013000_remove_demo_open_policies.sql` | `remove_demo_open_policies` | demo-era open RLS policies are gone |
| `20260715014000_break_jobs_applications_rls_recursion.sql` | `break_jobs_applications_rls_recursion` | `public.did_candidate_apply_to_job()` function exists (unique to this file) |
| `20260327204500_fix_team_portal_permissions.sql` | `fix_team_portal_permissions` | `public.team_member_limit_for_user()` exists live, but its live body has **further diverged** from this file (it now also calls `private.has_subscription_bypass_for_user`) — a later untracked change layered on top, not in any repo file |
| `20260327214500_add_team_member_onboarding.sql` | `add_team_member_onboarding` | `team_members.onboarding_completed` column exists live |
| `20260328102000_harden_subscription_enforcement.sql` | `harden_subscription_enforcement` | `public.subscription_plan_for_limits()` exists live, also further diverged live (same bypass-check addition as above, plus a "billing is off" trial carve-out) |
| `20260329145000_fail_open_push_trigger.sql` | `fail_open_push_trigger` | `public.trigger_push_notification()` exists live, and its live body is **already fixed and better** than this repo file: it reads the project URL from `app.settings.supabase_url` with a fallback to the correct `yqklrkpptnhubsnijqze` ref, whereas this repo file still hardcodes the wrong `kcotpxlggfvgclwksmhl` ref the top of this document warns about. Do not "fix" the repo file by applying it as-is — it would regress the live function to the wrong ref. |

The four `2026032*` files predate `schema_migrations` tracking entirely (the
earliest tracked row is `20260617092255`), so their absence from the table is
expected, not anomalous — but two of them (`fix_team_portal_permissions`,
`harden_subscription_enforcement`) and one more (`fail_open_push_trigger`)
show the live function bodies have moved on from what the repo file contains.
Nothing in the repo captures those later edits; this doc only records that
they exist, not their exact SQL, since no migration file represents them.

None of these 20 files should be re-run against production as-is: applying
group (b)'s `accountless_candidate_flow`/`phone_continue_flow` would error on
missing tables; applying group (c)'s files would re-run DDL that already ran
(duplicate-object errors at best, clobbering a since-diverged live definition
with stale SQL at worst — see `fail_open_push_trigger` above). Only group (a)'s
`reconcile_orphaned_profiles` is both safe and needed to run.

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

Also check the **reverse** direction, and do it as a full diff, not a search
scoped to a category (e.g. `name like '%enforce%'`) — a targeted search is how
section 3 undercounted once already. Concretely:

```bash
# every repo file's name, minus its version prefix
ls supabase/migrations/*.sql | xargs -n1 basename | sed -E 's/^[0-9]+_//; s/\.sql$//' | sort > repo_names.txt
# every live name (from the query above)
# ...then:
comm -23 repo_names.txt <(sort live_names.txt)
```

Any repo file with no matching live row falls into one of three buckets — do
not assume any of them means the same thing:

1. **No live row AND the gap has a live consequence** — genuinely missing,
   needs to be applied. (section 3a)
2. **No live row AND applying it today would fail or is moot** — e.g. it
   targets a table that was later dropped. Leave it, but verify the "would
   fail" claim with a live query before repeating it — don't assume. (section 3b)
3. **No live row but the migration's DDL/effects ARE live** — applied by hand
   outside both the CLI and the Management API (no `schema_migrations` row
   gets written either way), so "no row" does **not** mean "not applied."
   Verify by checking for the table/column/function/policy the migration
   creates, not by trusting the absence of a row. (section 3c)

A migration file existing in the repo never by itself means its effect is
live, and a missing `schema_migrations` row never by itself means a
migration's effect is absent — both directions require checking the actual
live object the migration creates or drops.
