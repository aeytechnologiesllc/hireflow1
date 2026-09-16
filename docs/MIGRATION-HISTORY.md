# Migration history — repo files vs. the live database

Read from the live project (`yqklrkpptnhubsnijqze`) on **2026-09-16** via
`select version, name, statements from supabase_migrations.schema_migrations`
(SELECT-only; no writes). This is the authoritative record of what has actually
run against production — `supabase/migrations/*.sql` in the repo is a working copy
that had drifted from it in three ways, all fixed by this pass:

1. Live migrations with no matching repo file at all (section 1).
2. The same migration under two different `version` stamps — CLI vs.
   Management API (section 2).
3. Repo files with no matching live row — which is **not** one bucket; see
   section 3 for the three genuinely different reasons this happens.

This file was re-verified against a **fresh** live snapshot taken during this
pass (62 rows in `schema_migrations`, not the 52 an earlier pass assumed) after
a prior version of it was caught making a claim that had already gone stale
between the live migrations being applied and the doc being committed. See
"Keeping this file honest across sessions" at the end — the single biggest
source of error in this document has been treating a live snapshot as
permanent instead of re-running the queries immediately before every commit
that touches this file.

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

### 1b. Three more live migrations, initially miscategorized as a fresh gap

A fresh `select version, name from supabase_migrations.schema_migrations`
taken during this pass returned **62** rows, not the 52 a prior version of
this file was written against. The 10-row delta is the 7 `enforce_*`
migrations (see section 2 — they are Management API restamps, not new work)
plus three more:

| Live version | Live name |
|---|---|
| `20260916183348` | `blueprint_entitlement_and_purchase_integrity` |
| `20260916183351` | `client_error_events_and_page_views` |
| `20260916184013` | `enforce_phase_lock` |

A first look treated these as the same "live migration, no repo file
anywhere" gap that section 1 exists to close, and flagged it as unrecovered
follow-up work. That was wrong in an important way: **the repo files exist**
— `git log --all` finds them as
`supabase/migrations/20260916160000_blueprint_entitlement_and_purchase_integrity.sql`,
`supabase/migrations/20260916165000_client_error_events_and_page_views.sql`
and `supabase/migrations/20260916180000_enforce_phase_lock.sql` — but on
`main`, via three commits (`65f29b3`, `302d64f`/`bc83fbb`, `5419f81`) that
landed *after* this branch (`fix/w1-records`) was cut from `main` at
`98a4439`. `main` has since merged eight other `fix/w1-*` branches this
branch never picked up (coaching-report rework, homepage rebuild, brand
cleanup, doc withdraw/void, CI/observability, dev preview — see
`git log --oneline --graph fix/w1-records main` for the full divergence).
This is exactly the drift `CLAUDE.md`'s "Before touching this clone" section
warns about, just between branches instead of between clones.

Since the file content already exists verbatim and matches the live
`statements` for all three (diffed word-for-word, including source comments,
during this pass), they were pulled into this branch unchanged, at their
original `main` filenames/timestamps — **not** re-recovered under the live
restamped version the way section 1 does for a truly-missing file, which
would have created a *third*, colliding copy of the same migration once this
branch and `main` are both merged. They are listed in section 2's restamp
table below like every other Management-API-restamped migration, because
that is what they are: same name, same SQL, different version because of
*when* and *how* they were applied, not missing work.

Practical note for whoever merges this branch: `main` already has these
three files under their original names above; this branch now has identical
copies under the same names. Git will see them as identical adds and merge
cleanly — there is nothing to reconcile by hand.

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
| `20260916150100_enforce_typing_test_result.sql` | `20260916150100` | `20260916183325` | `enforce_typing_test_result` |
| `20260916150200_enforce_chat_simulation_result.sql` | `20260916150200` | `20260916183329` | `enforce_chat_simulation_result` |
| `20260916150300_enforce_chat_interview_result.sql` | `20260916150300` | `20260916183332` | `enforce_chat_interview_result` |
| `20260916150400_enforce_sales_simulation_result.sql` | `20260916150400` | `20260916183335` | `enforce_sales_simulation_result` |
| `20260916150500_enforce_portfolio_result.sql` | `20260916150500` | `20260916183338` | `enforce_portfolio_result` |
| `20260916150600_enforce_video_intro_result.sql` | `20260916150600` | `20260916183341` | `enforce_video_intro_result` |
| `20260916150700_enforce_voice_interview_result.sql` | `20260916150700` | `20260916183345` | `enforce_voice_interview_result` |
| `20260916160000_blueprint_entitlement_and_purchase_integrity.sql` | `20260916160000` | `20260916183348` | `blueprint_entitlement_and_purchase_integrity` |
| `20260916165000_client_error_events_and_page_views.sql` | `20260916165000` | `20260916183351` | `client_error_events_and_page_views` |
| `20260916180000_enforce_phase_lock.sql` | `20260916180000` | `20260916184013` | `enforce_phase_lock` |

The 7 `enforce_*` rows and the last 3 rows above were all applied to
production live within about 7 minutes of each other (18:33:25–18:40:13 UTC
on 2026-09-16) — well **before** a prior version of this file was committed
at 18:39:53 UTC the same day (commit `882cf499`), which is why that version's
claim that these were "never applied" was already false the moment it was
written, not something that went stale afterward. See "Keeping this file
honest across sessions" below.

`20260703075257_google_indexing_notifications.sql`,
`20260904110000_free_tier_open.sql`, `20260904112000_employer_public_branding_view_parity.sql`,
`20260904120000_candidate_notification_links.sql`, and
`20260904121000_message_notifications.sql` are **not** in this table — their
repo version and live version already match exactly.

## 3. Repo migration files never applied live (the reverse check)

Section 1 only catches "live migration with no repo file." Checking the other
direction — every `supabase/migrations/*.sql` file's name (all **144** repo
files, including the 3 pulled in from `main` in section 1b) against the full,
unfiltered `name` column of `schema_migrations` (**62** live rows on the fresh
snapshot this pass re-ran, not the 52 an earlier pass assumed), not a search
scoped to one category like `%enforce%` — found **82** repo files with no
matching live row, not 20 and not 7.

Two prior passes through this section both undercounted, in two different
ways, and both mistakes are worth naming so a third pass doesn't repeat
either:

- The **first** pass found only 20, because by the time the 7 `enforce_*`
  files were re-checked they had already been applied live (see section 2) —
  so the true unmatched count at that moment was smaller than 20, not larger,
  and describing those 7 as "never applied" was simply wrong against a fresh
  snapshot.
- The **second** pass, run correctly as an unscoped `comm -23` diff, still
  only reported 20, because it silently dropped **69** UUID-named files
  (`supabase/migrations/2025121*_<uuid>.sql` through
  `supabase/migrations/20260312*_<uuid>.sql`) that also have no live row, on
  the grounds that a couple of spot-checked ones looked foundational — without
  running the same existence check this section already applies to every
  other bucket.

Every one of the 82 has now been mechanically checked — not spot-checked —
by extracting the tables, columns, functions, triggers and policies each
file's own `CREATE`/`ALTER` statements target, then querying
`information_schema.tables`, `information_schema.columns`, `pg_proc` and
`pg_policies` for each one. They split into three genuinely different
situations, and must not be treated as one bucket:

**a) Never applied, and the gap has a live consequence (real follow-up work) — 1 file:**

| Repo file | Name | Live consequence |
|---|---|---|
| `20260831190000_reconcile_orphaned_profiles.sql` | `reconcile_orphaned_profiles` | `public.reconcile_orphaned_profiles()` does not exist live (`select proname from pg_proc where proname ilike '%reconcile%'` returns zero rows, re-checked 2026-09-16). This function exists to self-heal `auth.users` rows with no matching `public.profiles` row. Live right now: `select count(*) from auth.users u left join public.profiles p on p.user_id=u.id where p.user_id is null` returns **1** — one production account has no `profiles` row, so it has no `company_name`, which the feed quality gate and Google structured data need; that employer's jobs would be silently withheld/anonymized until this migration is applied. Not superseded by any later file (grepped — nothing else recreates this function). |

The 7 `enforce_*` files that a prior version of this section placed in this
group are **not** in it any more: re-checked fresh during this pass,
`select result_key, enforced from public.trusted_result_enforcement` returns
all **8** rows (including `phase`) as `enforced = true`, and
`pg_get_functiondef('public.submit_voice_interview_manual_end(uuid,jsonb,integer)')`
shows the live body no longer writes `voice_interview_transcript` /
`phase_ai_analysis` directly — the post-migration shape. All 7 are applied
(see section 2's restamp table); there is no candidate-forgery gap open on
any of the 8 `trusted_result_enforcement` rows as of this pass. Do not
re-open this as follow-up work without re-running that query first — see
"Keeping this file honest across sessions" below.

**b) Never applied, and would fail if applied today (safe to leave — targets tables that no longer exist) — 2 files:**

| Repo file | Name | Why |
|---|---|---|
| `20260625120000_accountless_candidate_flow.sql` | `accountless_candidate_flow` | targets `public.roles`/`public.candidates`, the "showcase" tables created (and dropped) in section 1 — neither table exists live (`information_schema.tables` count = 0 for both; the file's own first statement, `alter table public.roles add column ...`, would error immediately), so this migration would fail if run today |
| `20260625130000_phone_continue_flow.sql` | `phone_continue_flow` | same — its last statement indexes `public.candidates`, the same long-gone showcase table |

**c) No live `schema_migrations` row, but the migration's effects ARE live —
applied untracked, most likely by hand through the SQL editor, or before this
project even used `schema_migrations` tracking.** A missing row here does
**not** mean "never applied"; it means "not tracked." This is by far the
largest group — **79 files** — split into two batches below.

c.1 — the 10 named files already confirmed live on 2026-09-16:

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

c.2 — 69 UUID-named files (`supabase/migrations/<14-digit timestamp>_<uuid>.sql`,
dated 2025-12-14 through 2026-03-12) that predate `schema_migrations` tracking
by even longer than the four `2026032*` files above. These are the original
Lovable/Supabase-generated migration history for this project's real
`profiles`/`jobs`/`applications`/`documents`/... schema — the one
`docs/ARCHITECTURE.md` and `docs/BACKEND-SCHEMA.md` describe as live today —
not the abandoned `roles`/`candidates` showcase schema from section 1. Every
table, added column, and function these 69 files create was checked against
the live catalog during this pass (`information_schema.tables`,
`information_schema.columns`, `pg_proc`); **all of them exist live**, so the
whole batch belongs in group (c), not (a) or (b) — there is no open
follow-up work hiding in here. One is a known duplicate of a later, better
group-(c.1) entry: `20260312192158_10503616-a026-4354-8bc3-8f69e2d1b036.sql`
is the *original* `trigger_push_notification()`, later superseded in place
(still untracked) by the fixed body `20260329145000_fail_open_push_trigger.sql`
already describes above — both are historical layers of the same live
function, neither needs to be (re-)applied. This existence check confirms
each file's target objects are present; it does not diff every function body
line-by-line the way the three `2026032*` divergences above were diffed, so a
similar body-level divergence could in principle exist undetected in one of
the 15 functions this batch defines — none surfaced any inconsistency with
current application code while extracting this table, but that is a lighter
check than section (c.1) got, not an equally deep one.

| Repo file | Objects checked against the live catalog |
|---|---|
| `supabase/migrations/20251214183024_d6bca30d-17a4-42ed-8763-75d537c5ca92.sql` | creates `applications`, `documents`, `interviews`, `jobs`, `messages`, `notifications`, `profiles`, `team_invitations`, `user_roles`; defines `generate_job_code()`, `get_user_role()`, `handle_new_user()`, `has_role()`, `update_updated_at_column()` |
| `supabase/migrations/20251214202144_e780f8dc-cff7-4686-a358-6a706799bc91.sql` | creates `document_audit_logs`, `document_templates`; adds `documents.sender_id` |
| `supabase/migrations/20251214211904_e2bb2bef-9670-4fcb-bc3f-22232ee1f4fc.sql` | adds `jobs.application_questions` |
| `supabase/migrations/20251214214736_b96b9c27-21b5-4c24-ae88-7c95fb3ad338.sql` | adds `documents.candidate_signature_data` |
| `supabase/migrations/20251214222311_87357bd1-2726-4c59-a398-ee0b68733868.sql` | RLS policy work (4 policies, e.g. "Users can upload their own resume on storage") |
| `supabase/migrations/20251215001652_fecce7f2-24b8-4513-87a2-4a6d8e2a5f01.sql` | RLS policy work (3 policies, e.g. "Users can upload their own videos on storage") |
| `supabase/migrations/20251215012717_68ad67d2-33d3-444c-a8fb-bbbe438047f8.sql` | RLS policy work (1 policy, e.g. "System can insert notifications on notifications") |
| `supabase/migrations/20251215015158_dff41abe-b1cf-4851-b3ff-0665a3e61c65.sql` | adds `document_audit_logs.signer_name`, `documents.document_hash`; defines `block_audit_modification()` |
| `supabase/migrations/20251215015739_f853b633-fc4c-4c52-9b2c-ebf472647e04.sql` | RLS policy work (2 policies, e.g. "Employers can delete their documents on documents") |
| `supabase/migrations/20251215031758_63ce3c19-9a28-4722-88a1-bac0b71b7939.sql` | RLS policy work (1 policy, e.g. "Candidates can update their own applications on applications") |
| `supabase/migrations/20251215032249_0f54e804-6a96-467b-a577-d438f21746a8.sql` | RLS policy work (1 policy, e.g. "Candidates can delete their own applications on applications") |
| `supabase/migrations/20251215032835_87a1ac15-1cd8-4f47-a5cc-acb29ba5e954.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251215034113_e14fe750-560d-4b34-84ae-2f65acee040b.sql` | defines `block_audit_modification()` |
| `supabase/migrations/20251215034808_5cccdcc4-98d1-4edf-a22c-f1fc19eb6ba6.sql` | RLS policy work (1 policy, e.g. "Users can delete their own messages on messages") |
| `supabase/migrations/20251215051841_43298116-c5a8-451e-9bf8-820a02b02897.sql` | adds `applications.employer_notes` |
| `supabase/migrations/20251215054759_9630c0f8-f061-45b6-ba3a-b9c35c97f6c5.sql` | creates `team_members`; adds `team_invitations.invite_code`; defines `generate_invite_code()`, `get_team_member_permissions()`, `is_team_member()` |
| `supabase/migrations/20251215060535_ff04f7dd-ee9c-4df4-925b-3b490f1ba9d3.sql` | RLS policy work (10 policies, e.g. "Anyone can view invitations by code on team_invitations") |
| `supabase/migrations/20251215061056_bcc21897-9f99-42ee-b05a-059102062e3e.sql` | RLS policy work (1 policy, e.g. "Users can insert team_member role for themselves on user_roles") |
| `supabase/migrations/20251215062042_13098fef-8a9f-4bcf-9e8f-a0c9e2472639.sql` | RLS policy work (1 policy, e.g. "Inviters can delete their invitations on team_invitations") |
| `supabase/migrations/20251215071210_ffe9620a-20da-4154-bbd9-3b725ab95b12.sql` | creates `subscription_usage`, `subscriptions` |
| `supabase/migrations/20251215162802_9fe28682-1f9a-4246-9bff-8c63f0ee698b.sql` | adds `subscription_usage.voice_minutes_used`, `applications.voice_interview_result` |
| `supabase/migrations/20251215171946_f07ef311-3985-40bc-8591-6a536a563aa4.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251216015646_cf669035-42c9-4208-bfb7-bf2f143a889e.sql` | RLS policy work (1 policy, e.g. "Invitees can accept their invitations on team_invitations") |
| `supabase/migrations/20251216140501_858d25ee-cc98-44f5-b4b9-e43e89bcbacf.sql` | RLS policy work (3 policies, e.g. "Employers can upload documents on storage") |
| `supabase/migrations/20251216154917_000be7b9-8311-4d8a-99f0-0bfacb7fd69d.sql` | adds `profiles.email_notifications_enabled` |
| `supabase/migrations/20251216160358_29b827a1-c787-4bc7-b017-3941ee47423f.sql` | adds `messages.file_url`, `messages.file_name`, `messages.file_type`, `messages.file_size` |
| `supabase/migrations/20251216190601_142e7c52-36ca-4b11-a5ef-153a392fb810.sql` | creates `voice_credits` |
| `supabase/migrations/20251216220244_cb4320bb-0951-44c2-8d7c-7e029fcbcfee.sql` | RLS policy work (4 policies, e.g. "Candidates can upload portfolio files on storage") |
| `supabase/migrations/20251217060815_f5551487-093d-4d83-98ed-3145e211821f.sql` | adds `applications.voice_interview_duration` |
| `supabase/migrations/20251217081249_a0466cee-e59f-4fe8-9a15-ec6f929001ff.sql` | adds `applications.voice_interview_recording_url` |
| `supabase/migrations/20251217172455_ea9cf01b-8cc7-4652-85ab-100f24c6ecf0.sql` | adds `applications.voice_interview_language_rule` |
| `supabase/migrations/20251217200812_5615d0e5-46f2-42e9-bbb7-4b6ffb020531.sql` | RLS policy work (1 policy, e.g. "Candidates can view their own interview recordings on storage") |
| `supabase/migrations/20251217212912_c5dedab0-2aa5-4fc2-ac6e-b844f7cbdb21.sql` | adds `applications.voice_interview_transcript` |
| `supabase/migrations/20251217214606_c834ef41-57b6-47df-83b9-63eda09aac54.sql` | defines `notify_application_status_change()` |
| `supabase/migrations/20251218160711_1a850adb-d3c7-41d3-a645-a746b2988921.sql` | adds `interviews.candidate_response`, `interviews.proposed_times`, `interviews.candidate_note` |
| `supabase/migrations/20251218190307_c5d3a607-a9d0-476c-8c04-8782c5e4fda0.sql` | RLS policy work (2 policies, e.g. "Employers can delete applications to their jobs on applications") |
| `supabase/migrations/20251219050304_e00f64b2-ad71-428a-8cd4-0bf6f3b1cbbe.sql` | defines `check_application_deadline()` |
| `supabase/migrations/20251219051027_91388b5d-8552-49da-a07c-e33aae553755.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251219163914_4265662a-02b8-4b06-bdbf-acc447fef102.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251219170828_ac34a61e-2adf-493a-b57f-6c6bf7c7634b.sql` | adds `documents.is_locked`, `documents.locked_at`, `documents.completion_certificate`, `document_audit_logs.signature_event_id`, `document_audit_logs.pre_signature_hash`, `document_audit_logs.post_signature_hash`, `document_audit_logs.signing_order_position`, `document_audit_logs.timestamp_utc` |
| `supabase/migrations/20251219171832_d74000eb-b0b9-41fd-9934-cc9e01c5ec6e.sql` | RLS policy work (3 policies, e.g. "Employers can create documents on documents") |
| `supabase/migrations/20251219173453_9b7d5623-6fd2-428d-9aa6-cd0b039b98c9.sql` | adds `documents.document_code`; defines `generate_document_code()` |
| `supabase/migrations/20251219200047_6d9e26e8-c040-4244-afeb-5162698d4fea.sql` | RLS policy work (1 policy, e.g. "Users can delete their own notifications on notifications") |
| `supabase/migrations/20251220202447_0e7e6beb-6f5c-464b-be68-bd6cc82fd5e6.sql` | creates `document_requests` |
| `supabase/migrations/20251220222242_4d87bb93-e608-4a0c-b0aa-e46189a76f62.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251221193845_3c057eb7-5104-4d92-9294-09eb06e81364.sql` | creates `document_packages`; adds `documents.package_id`, `document_requests.package_id`; defines `validate_package_status()` |
| `supabase/migrations/20251221193900_8837f477-2b24-4e8f-93de-501f819bac09.sql` | defines `validate_package_status()` |
| `supabase/migrations/20251224110034_61620f3d-8240-4588-9ad6-eda5d327dfea.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251224131219_812d4365-235b-4182-bef1-b10256cdc049.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251224135858_dd26268d-8737-4133-ad25-22defef84f8b.sql` | RLS policy work (2 policies, e.g. "Employers can delete interviews on interviews") |
| `supabase/migrations/20251225200140_d4c0404f-5a9c-45a2-8273-7250aca95405.sql` | adds `jobs.required_wpm` |
| `supabase/migrations/20251226005154_0ca3b503-54e3-48c2-84ce-aba4ef60f881.sql` | adds `applications.rejected_by` |
| `supabase/migrations/20251226023247_7db58468-61cf-406f-b88a-a49f25bdd0a5.sql` | adds `document_requests.candidate_viewed_at` |
| `supabase/migrations/20251226024550_c59dcd35-418c-4fcb-a4f3-0f7d3792eb8e.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251226141436_198c1a46-707e-489f-963e-5c1910d05c70.sql` | adds `profiles.company_address`, `documents.final_pdf_hash` |
| `supabase/migrations/20251227004711_b4a274fe-c5d1-467a-bc5e-417d009abe49.sql` | creates `blueprint_purchases` |
| `supabase/migrations/20251227012500_067f9c84-bc30-45b0-b1c1-4db863667914.sql` | RLS policy work (4 policies, e.g. "Users can upload their own avatar on storage") |
| `supabase/migrations/20251227020347_aeabe603-46cf-4cf1-9ba6-73a5020794e7.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251227030902_4b191baa-4501-4ca5-9468-fcfea2028cba.sql` | adds `profiles.email_voice_minutes`, `subscriptions.voice_low_balance_notified_at` |
| `supabase/migrations/20251227174653_2e1bad8a-eaf1-44fc-be02-411ee48b7403.sql` | RLS policy work (1 policy, e.g. "Employers can view applicant profiles on profiles") |
| `supabase/migrations/20251228173443_49e1d77b-28d2-45ab-bc05-b7d4d14ec35b.sql` | adds `applications.resume_score` |
| `supabase/migrations/20251228185317_8db02f1c-5f2a-4313-a991-477e914969bf.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20251228225629_7a63007b-46c8-44dc-9985-49cd11e2e8fa.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20260104033645_6a744c8b-a43c-4199-9efb-e9f716534229.sql` | no DDL object extracted (comment-only or pure grant/data statement) |
| `supabase/migrations/20260104033710_3924b621-9cf0-47f5-8b80-bdfc778135b4.sql` | RLS policy work (10 policies, e.g. "Developers can view all profiles on profiles") |
| `supabase/migrations/20260214203756_997c3d1b-b82c-4df6-9b1b-429df3d740bd.sql` | adds `profiles.onboarding_completed` |
| `supabase/migrations/20260214215715_fbc808c2-942c-416d-87d3-0ec4a38625f2.sql` | defines `assign_user_role()`, `handle_new_user()` |
| `supabase/migrations/20260312192140_02ed0275-7da7-4dee-b90b-e2cdaee92324.sql` | creates `push_subscriptions` |
| `supabase/migrations/20260312192158_10503616-a026-4354-8bc3-8f69e2d1b036.sql` | defines `trigger_push_notification()` |

Of the 82 files in this section, only **1** (group a) is genuinely missing
and actionable; **2** (group b) would fail if run and must stay unrun; the
remaining **79** (group c) are already live, just untracked — re-running any
of them would at best no-op against `IF NOT EXISTS`/`OR REPLACE` and at worst
clobber a since-diverged live definition with stale SQL (see
`fail_open_push_trigger`). This reconciliation pass is read-only and applies
none of them; `reconcile_orphaned_profiles` is separate follow-up work, one
migration at a time through the Management API with the 2-second pause
below, stopping immediately if it fails.

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
against the `version` prefix, for the reason above). Any live name with no
repo file needs one more check before assuming it is genuinely missing:
**`git log --all` and `git log --oneline main` for that name** — as section
1b found, a live migration can have a perfectly good repo file that simply
hasn't been merged into whatever branch this doc is being checked from yet.
Only recover it as a brand-new file (section 1's method, stamped with the
live version) if no such file exists anywhere in git history; if one does,
pull that exact file in under its own name/timestamp instead, so you don't
create a second, differently-named copy of the same migration that collides
with the real one when branches merge.

Also check the **reverse** direction, and do it as a full diff, not a search
scoped to a category (e.g. `name like '%enforce%'`) — a targeted search is
one of the two different ways section 3 has undercounted already (the other
being: checking a snapshot that was already stale by the time the check ran,
rather than a snapshot taken fresh, immediately before comparing). Concretely:

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
2. **No live row AND applying it today would fail outright** — e.g. it
   targets a table that was later dropped, so its own DDL would error. Leave
   it, but verify the "would fail" claim with a live query before repeating
   it — don't assume. (section 3b) Do **not** default a file into this
   bucket just because it looks safe to skip: an idempotent migration
   (`CREATE ... IF NOT EXISTS`, `UPDATE ... WHERE`, `CREATE OR REPLACE`) that
   is missing live is not "moot" — check what it protects or enables before
   deciding it has no consequence. This is exactly how the 7 `enforce_*`
   files were miscategorized here once already (section 3a fixed it).
3. **No live row but the migration's DDL/effects ARE live** — applied by hand
   outside both the CLI and the Management API (no `schema_migrations` row
   gets written either way), so "no row" does **not** mean "not applied."
   Verify by checking for the table/column/function/policy the migration
   creates, not by trusting the absence of a row. (section 3c)

A migration file existing in the repo never by itself means its effect is
live, and a missing `schema_migrations` row never by itself means a
migration's effect is absent — both directions require checking the actual
live object the migration creates or drops. And a repo file existing in *this
checkout* never by itself means it doesn't exist elsewhere in git — check
`git log --all` before treating a live-only migration as unrecovered.

## Keeping this file honest across sessions

Every version of this document so far has gone stale in the same way: a
snapshot of the live database (or of `supabase/migrations/`) taken at some
point during the session, then treated as still true at commit time, when in
fact other work — this session's own later commits, another branch's
concurrent Management API applies, or another clone entirely (`CLAUDE.md`'s
"Before touching this clone" warning is the same problem, one level up) —
changed the live state in between. Commit `882cf499`'s claim that all 7
`enforce_*` migrations and `phase` were unenforced was already false when it
was committed, six minutes after those migrations were actually applied.

Before committing any change to this file:

1. Re-run `select version, name from supabase_migrations.schema_migrations
   order by version` and `select result_key, enforced from
   public.trusted_result_enforcement` fresh — don't reuse a result from
   earlier in the session, no matter how recently it ran.
2. Re-run `ls supabase/migrations/*.sql` fresh, and re-run both `comm`
   directions in "Verifying this file stays true" against that fresh list.
3. If any count in this file (62 live rows, 144 repo files, 82/1/2/79 in
   section 3, 38 restamps in section 2, 19 recovered in section 1) doesn't
   match what you just re-ran, the file is wrong — fix the numbers before
   fixing the prose around them.
4. Grep `git log --all` for any name that still looks unmatched after step 2,
   per section 1b — a name can be live-and-unmerged, not live-and-missing.
