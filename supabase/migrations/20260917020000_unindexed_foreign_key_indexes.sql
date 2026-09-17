-- Migration: unindexed_foreign_key_indexes
--
-- Origin: this is a deliberate partial cherry-pick of the
-- unindexed_foreign_keys section (section "1.") from
-- fix/w2-db-perf's supabase/migrations/20260916191000_db_performance_advisors.sql
-- (commit 3feb9644, "Fix privilege-escalation and idempotency bugs in
-- db_performance_advisors migration"). That branch's Supabase performance
-- advisor run (project yqklrkpptnhubsnijqze, 2026-09-16) found 24 foreign-key
-- columns with no covering index; the 24 CREATE INDEX statements below are
-- copied verbatim from that section, unchanged.
--
-- Deliberately NOT taken: that same migration's section "2." (auth_rls_initplan
-- wrap + multiple_permissive_policies consolidation, ~31 "Consolidated ..."
-- policies). That section was generated from a snapshot of live pg_policies
-- taken before several security fixes landed on 2026-09-16 (team-message
-- receiver check, null-safe candidate ownership checks, forgery lockdown,
-- etc.), and reintroducing it would silently drop at least one of them: it
-- fails scripts/guards/team-message-receiver.mjs because its consolidated
-- "Team members can send messages if permitted" policy omits
-- messages.receiver_id = a.candidate_id. There is no live traffic yet
-- (auth_db_connections_absolute / multiple_permissive_policies are advisory,
-- not correctness, findings), so there is no urgency to ship it broken.
-- Once every 2026-09-16 security migration is live, that section must be
-- regenerated from the *current* live policies (not fix/w2-db-perf's
-- snapshot), re-verified to be initplan-wrap-only with no semantic change
-- (same approach as fix/w2-db-perf's PGlite proof), and re-checked against
-- every scripts/guards/*.mjs policy guard before it ships.
--
-- Live verification performed before writing this file (read-only
-- information_schema/pg_catalog queries against project yqklrkpptnhubsnijqze,
-- 2026-09-16, via the Management API):
--   - all 24 (table, column) pairs exist in public schema;
--   - all 24 columns are the referencing side of a live FOREIGN KEY constraint;
--   - none of the 24 already has an index with that column as its leading key
--     (checked via pg_index.indkey[0]), so none are skipped as redundant.
-- Row counts on the affected tables are 0 for every table except
-- public.messages (6 rows) and public.notifications (7 rows) — the live
-- database has no real jobs/applications yet (test data cleared 2026-09-15/16,
-- see CLAUDE.md "Distribution & billing state"). CREATE INDEX (no CONCURRENTLY)
-- is fine at these row counts: the brief exclusive lock each statement takes
-- has nothing of size to build and nothing to contend with. Revisit
-- CONCURRENTLY once there is real traffic on any of these tables.
--
-- Idempotent: every index is created with IF NOT EXISTS, matching the source
-- migration.

CREATE INDEX IF NOT EXISTS idx_applicant_packs_job_unlock_id ON public.applicant_packs (job_unlock_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON public.applications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_client_error_events_last_user_id ON public.client_error_events (last_user_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_logs_document_id ON public.document_audit_logs (document_id);
CREATE INDEX IF NOT EXISTS idx_document_packages_application_id ON public.document_packages (application_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_package_id ON public.document_requests (package_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_employer_id ON public.document_templates (employer_id);
CREATE INDEX IF NOT EXISTS idx_documents_application_id ON public.documents (application_id);
CREATE INDEX IF NOT EXISTS idx_documents_package_id ON public.documents (package_id);
CREATE INDEX IF NOT EXISTS idx_documents_recipient_id ON public.documents (recipient_id);
CREATE INDEX IF NOT EXISTS idx_documents_sender_id ON public.documents (sender_id);
CREATE INDEX IF NOT EXISTS idx_google_indexing_notifications_requested_by ON public.google_indexing_notifications (requested_by);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews (application_id);
CREATE INDEX IF NOT EXISTS idx_jobs_employer_id ON public.jobs (employer_id);
CREATE INDEX IF NOT EXISTS idx_messages_application_id ON public.messages (application_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_ledger_job_id ON public.quiz_attempt_ledger (job_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_inviter_id ON public.team_invitations (inviter_id);
CREATE INDEX IF NOT EXISTS idx_team_members_employer_id ON public.team_members (employer_id);
CREATE INDEX IF NOT EXISTS idx_team_members_invitation_id ON public.team_members (invitation_id);
CREATE INDEX IF NOT EXISTS idx_voice_interview_charges_application_id ON public.voice_interview_charges (application_id);
CREATE INDEX IF NOT EXISTS idx_voice_interview_charges_voice_session_log_id ON public.voice_interview_charges (voice_session_log_id);
