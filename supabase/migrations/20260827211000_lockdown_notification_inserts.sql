-- ============================================================================
-- RLS HOLE: public.notifications INSERT open to literally anyone, incl. anon.
-- ============================================================================
-- supabase/migrations/20251215012717_68ad67d2-33d3-444c-a8fb-bbbe438047f8.sql
-- created:
--
--   "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true)
--
-- No `TO` clause = applies to PUBLIC (`anon` and `authenticated` both), and
-- `WITH CHECK (true)` means any caller can insert a notification claiming to
-- be for any user_id — spoof a fake "You're hired!" or "New document to
-- sign" for a stranger, or spam every user_id you can guess/enumerate.
--
-- public.notifications columns (from 20251214183024_*.sql — no application_id
-- or job_id column exists on this table):
--   id, user_id, type (notification_type enum), title, message, link,
--   is_read, created_at
--
-- Two backend paths insert notifications and stay completely unaffected by
-- this migration, because they run on service_role (bypasses RLS) or as a
-- SECURITY DEFINER trigger function owned by the migration role (also
-- bypasses RLS — table owners are exempt from RLS unless FORCE ROW LEVEL
-- SECURITY is set, which it is not here):
--   supabase/functions/candidate-interview-response/index.ts  (supabaseAdmin)
--   supabase/functions/trigger-ava-analysis/index.ts          (supabaseAdmin)
--   public.notify_application_status_change()                 (SECURITY DEFINER
--     trigger on applications, from 20251217214606_*.sql)
--
-- Every legitimate CLIENT-side insert, made under a user's own JWT, falls
-- into exactly one of four shapes:
--
--   (a) EMPLOYER (or an active TEAM MEMBER of that employer) -> the CANDIDATE
--       of an application on one of the employer's jobs.
--       Call sites: src/components/EmployerRescheduleReviewDialog.tsx,
--         src/components/documents/CreateDocumentDialog.tsx,
--         src/components/documents/DocumentWizard.tsx,
--         src/hooks/useApplications.ts (status/phase change notifications),
--         src/hooks/useDocumentPackages.ts;
--         supabase/functions/ava-voice-tools/index.ts runs its notification
--         inserts on the caller's own JWT (anon key + forwarded
--         Authorization header, filtered to `jobs.employer_id = user.id`),
--         so it is just an employer insert and needs no special-casing.
--       Uses the existing recursion-safe helpers from
--       20260715014000_break_jobs_applications_rls_recursion.sql
--       (public.is_job_owner, public.is_active_team_member_for_job) rather
--       than re-deriving the jobs/applications/team_members join inline, to
--       stay consistent with how this schema already avoids RLS recursion
--       between jobs/applications/team_members.
--
--   (b) EMPLOYER (or whoever is recorded as the requester) -> the CANDIDATE
--       of a document_requests row they created.
--       Call site: src/hooks/useDocumentRequests.ts (useCreateDocumentRequest)
--       — the document_requests row is inserted immediately before the
--       notification in the same mutation, so it already exists at
--       policy-check time. Note: src/components/documents/
--       DocumentRequestWizard.tsx:190 sets `employer_id: user.id` to
--       whichever user is signed in (it does not look up the *job's* real
--       employer_id), so when a team member creates the request,
--       document_requests.employer_id ends up holding the team member's own
--       id, not the job owner's. Checking `dr.employer_id = auth.uid()`
--       mirrors that exact client behavior and correctly covers both cases
--       without needing a separate team-member branch here.
--
--   (c) CANDIDATE -> the EMPLOYER of a job they applied to, OR the
--       employer/requester of a document_requests row addressed to them.
--       Call sites: src/pages/VoiceInterviewPhase.tsx (notifies
--         jobs.employer_id after a completed AI interview),
--         src/components/documents/DocumentUploadDialog.tsx (notifies
--         request.employer_id after uploading a requested document).
--
--   (d) Self-insert (auth.uid() = user_id) — allowed for sanity; no known
--       call site relies on it today, but there is no reason to block a
--       user from writing a notification to themselves.
--
-- Untouched by this migration:
--   "Users can view their own notifications"   (SELECT, 20251214183024_*.sql)
--   "Users can update their own notifications" (UPDATE, 20251214183024_*.sql)
--   "Users can delete their own notifications" (DELETE, 20251219200047_*.sql)
-- ============================================================================

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Related parties can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  -- (d) self-insert
  auth.uid() = user_id

  -- (a) employer/team-member -> candidate of an application on one of the
  -- employer's jobs
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.candidate_id = notifications.user_id
      AND (
        public.is_job_owner(a.job_id, auth.uid())
        OR public.is_active_team_member_for_job(a.job_id, auth.uid())
      )
  )

  -- (b) employer/requester -> candidate of a document_requests row they
  -- created
  OR EXISTS (
    SELECT 1
    FROM public.document_requests dr
    WHERE dr.employer_id = auth.uid()
      AND dr.candidate_id = notifications.user_id
  )

  -- (c) candidate -> employer of a job they applied to
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.candidate_id = auth.uid()
      AND public.is_job_owner(a.job_id, notifications.user_id)
  )

  -- (c) candidate -> employer/requester of a document_requests row
  -- addressed to them
  OR EXISTS (
    SELECT 1
    FROM public.document_requests dr
    WHERE dr.candidate_id = auth.uid()
      AND dr.employer_id = notifications.user_id
  )
);

-- Belt and braces: the `TO authenticated` clause above already excludes
-- `anon`, but make it impossible to accidentally re-open this table to
-- unauthenticated callers via a future broad GRANT.
REVOKE INSERT ON public.notifications FROM anon;
