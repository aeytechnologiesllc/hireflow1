-- ============================================================================
-- RLS HOLE (a): public.blueprint_purchases INSERT lets a client forge a paid
-- purchase for free.
-- ============================================================================
-- supabase/migrations/20251227004711_*.sql created:
--
--   "Users can insert their own blueprint purchases" ON blueprint_purchases
--   FOR INSERT WITH CHECK (auth.uid() = user_id)
--
-- Any authenticated candidate can INSERT their own blueprint_purchases row
-- directly (no Stripe session, no payment) — src/hooks/useImprovementBlueprint.ts
-- (checkPurchaseStatus) unlocks the $1.99 paid report purely on row existence
-- (`.eq("application_id", id).eq("user_id", user.id).maybeSingle()`), so this
-- is a free unlock of a paid feature.
--
-- The only legitimate writer is supabase/functions/verify-blueprint-purchase/
-- index.ts, which retrieves the Stripe checkout session server-side, checks
-- `payment_status === "paid"` and that the session metadata's applicationId/
-- userId match the caller, and only then inserts — using
-- SUPABASE_SERVICE_ROLE_KEY (supabaseAdmin), which bypasses RLS entirely and
-- is completely unaffected by dropping this policy. No client-side code path
-- inserts this table (the only other reference is the SELECT in
-- checkPurchaseStatus above). So there is no replacement policy: after this
-- migration, nothing running as `authenticated` or `anon` can insert a row at
-- all.
--
-- Untouched by this migration:
--   "Users can view their own blueprint purchases" (SELECT, 20251227004711_*.sql)
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert their own blueprint purchases" ON public.blueprint_purchases;

-- Belt and braces: no policy replaces it, so RLS already default-denies every
-- authenticated/anon INSERT — this makes that explicit at the grant layer too
-- and survives a future broad `GRANT ALL ... TO authenticated` on this table.
REVOKE INSERT ON public.blueprint_purchases FROM authenticated, anon;


-- ============================================================================
-- RLS HOLE (b): public.document_audit_logs INSERT open to literally anyone,
-- incl. anon — and supabase/functions/verify-document reads it as the source
-- of truth for who signed a document.
-- ============================================================================
-- supabase/migrations/20251214202144_*.sql created:
--
--   "System can insert audit logs" ON document_audit_logs
--   FOR INSERT WITH CHECK (true)
--
-- No `TO` clause (= PUBLIC, i.e. `anon` and `authenticated` both) and
-- `WITH CHECK (true)`: anyone can insert an audit-log row for any
-- document_id, claiming any user_id/signer_name/signer_email/signer_role,
-- with any document_hash/pre_signature_hash/post_signature_hash. This is the
-- table supabase/functions/verify-document/index.ts's PUBLIC (no-auth)
-- verification endpoint reads for its signer list:
--
--   .from('document_audit_logs').select('*').eq('document_id', document.id)
--     .in('action', ['candidate_signed', 'employer_countersigned'])
--   ... signers.push({ name: candidateLog?.signer_name || 'Candidate', ... })
--
-- so a forged 'candidate_signed' row with a made-up signer_name is exactly a
-- forged signing attestation on the public verification page.
--
-- Every place that inserts this table today (grepped across src/,
-- supabase/functions/, api/):
--
--   LIVE, reachable:
--     src/components/documents/DocumentWizard.tsx:723 — action 'created',
--       fired by whoever just created the document (employer or a permitted
--       team member; document_id refers to the row this same call just
--       inserted into `documents`, so its sender_id is theirs).
--
--   Unreferenced by any route or component (dead code — not imported
--   anywhere, so unreachable in the shipped app, but kept working below
--   rather than assumed gone):
--     src/components/documents/CreateDocumentDialog.tsx:205 — action 'created'
--     src/components/documents/DocumentViewerDialog.tsx:105 — action 'viewed'
--     src/components/documents/DocumentViewerDialog.tsx:139 — action 'signed'
--     src/components/documents/DocumentViewerDialog.tsx:190 — action 'declined'
--     src/lib/auditTrail.ts (createAuditLog + every log* helper) — imported
--       only for fetchAuditTrail (a SELECT) by
--       src/components/documents/EmployerReviewPanel.tsx; none of its INSERT
--       helpers (logCandidateSigned, logEmployerCountersigned, etc. — the
--       ones that DO carry signer_name/document_hash/signature fields) are
--       called from anywhere.
--
--   None of the above ever sets signer_name, signer_email, signer_role, or
--   any hash/signature field — those columns, and the 'candidate_signed' /
--   'employer_countersigned' / 'electronic_consent_confirmed' /
--   'employer_review_confirmed' / 'document_completed' actions verify-document
--   actually cares about, currently have no writer anywhere in this codebase
--   (the real e-sign pipeline that would populate them, under service_role,
--   has not shipped yet). Nothing today relies on a client being able to
--   write them, so this migration closes that off pre-emptively rather than
--   waiting for a live incident.
--
-- Fix, two layers:
--
--   1. INSERT policy, `TO authenticated` only: the action must be one of the
--      benign, non-signing activity actions every call site above actually
--      uses, AND the caller must be a party to the document (its sender,
--      its recipient, the application's candidate, the job's employer, or
--      an active team member on that job — the same relationship
--      "Users can view documents related to their applications" and
--      "Team members can view documents for assigned jobs" already grant
--      read access on). Every other action — signing_session_started,
--      electronic_consent_confirmed, candidate_signed,
--      employer_review_confirmed, employer_countersigned, document_completed,
--      document_voided/voided, edited, and the legacy 'signed' used by the
--      dead DocumentViewerDialog handler — is refused for authenticated/anon
--      and left to service_role (RLS-exempt) once the real signing pipeline
--      ships.
--
--   2. BEFORE INSERT trigger: for any non-service_role caller, forces
--      user_id/signer_name/signer_email/signer_role from the caller's own
--      auth.uid()/profile — never trusted from the client payload — and
--      nulls out every signature/hash field (signature_method,
--      consent_confirmed, document_hash, pre_signature_hash,
--      post_signature_hash, signing_order_position, page_numbers_signed,
--      signature_event_id), so even an action this migration failed to
--      exclude can never carry a forged identity or a forged hash. A
--      service_role caller (the future real signing edge function) is left
--      untouched — it is the authoritative source for exactly these fields.
--
-- The existing immutability triggers (prevent_audit_update /
-- prevent_audit_delete, from 20251215015158_*.sql) are untouched and keep
-- doing their job once a row lands.
--
-- Untouched by this migration:
--   "Users can view audit logs for their documents" (SELECT, 20251214202144_*.sql)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_document_audit_log_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate_id uuid;
  v_name text;
  v_email text;
BEGIN
  -- The real signing pipeline runs on service_role and is authoritative for
  -- identity and hash fields — leave it completely untouched.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Every other caller: force identity from the session, never the payload.
  NEW.user_id := auth.uid();

  SELECT a.candidate_id INTO v_candidate_id
  FROM public.documents d
  JOIN public.applications a ON a.id = d.application_id
  WHERE d.id = NEW.document_id;

  NEW.signer_role := CASE WHEN v_candidate_id = auth.uid() THEN 'candidate' ELSE 'employer' END;

  SELECT p.full_name, p.email INTO v_name, v_email
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  NEW.signer_name := v_name;
  NEW.signer_email := v_email;

  -- No client-origin row may carry a signature or hash claim, regardless of
  -- what the action turns out to be.
  NEW.signature_method := NULL;
  NEW.consent_confirmed := NULL;
  NEW.document_hash := NULL;
  NEW.pre_signature_hash := NULL;
  NEW.post_signature_hash := NULL;
  NEW.signing_order_position := NULL;
  NEW.page_numbers_signed := NULL;
  NEW.signature_event_id := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_document_audit_log_identity() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_audit_log_identity ON public.document_audit_logs;
CREATE TRIGGER enforce_audit_log_identity
BEFORE INSERT ON public.document_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_audit_log_identity();

DROP POLICY IF EXISTS "System can insert audit logs" ON public.document_audit_logs;
DROP POLICY IF EXISTS "Related parties can log non-signing document activity" ON public.document_audit_logs;

CREATE POLICY "Related parties can log non-signing document activity"
ON public.document_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND action = ANY (ARRAY[
    'created', 'document_created',
    'viewed', 'document_viewed',
    'declined', 'document_declined',
    'downloaded', 'document_downloaded'
  ])
  AND EXISTS (
    SELECT 1
    FROM public.documents d
    JOIN public.applications a ON a.id = d.application_id
    WHERE d.id = document_audit_logs.document_id
      AND (
        a.candidate_id = auth.uid()
        OR d.sender_id = auth.uid()
        OR d.recipient_id = auth.uid()
        OR public.is_job_owner(a.job_id, auth.uid())
        OR public.is_active_team_member_for_job(a.job_id, auth.uid())
      )
  )
);

REVOKE INSERT ON public.document_audit_logs FROM anon;


-- ============================================================================
-- RLS HOLE (c): public.messages INSERT lets any authenticated user message
-- any other user on any application_id, and it fires a notification
-- (public.notify_new_message(), 20260904121000_*.sql) at the target.
-- ============================================================================
-- supabase/migrations/20251214183024_*.sql created:
--
--   "Users can send messages" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id)
--
-- The only requirement is that you are who you say you are — receiver_id and
-- application_id are both unchecked, so any signed-in user can DM any other
-- user id they can guess/enumerate, optionally pointing application_id at an
-- application that has nothing to do with either of them.
--
-- The one other messages INSERT policy, "Team members can send messages if
-- permitted" (20251216160358_*.sql), is untouched and already shaped the
-- right way — sender_id = auth.uid(), an active team member on the job behind
-- application_id, with can_message_candidates = true. This migration mirrors
-- that same shape for the default (non-team-member) case.
--
-- Legitimate shapes, from src/hooks/useMessages.ts and
-- src/cockpit/pages/Messages.tsx:
--
--   - useMessageableEmployers / useMessageableCandidates only ever offer, as
--     a valid contact, the JOB OWNER on the candidate's side
--     (`app.jobs?.employer_id`) or the CANDIDATE on an application to one of
--     the employer's own jobs — i.e. candidate <-> job owner, keeping the
--     2026-09-04 behaviour (message_notifications.sql) where a candidate can
--     start a thread with the hiring team of a job they applied to.
--   - useSendMessage's `application_id` param is optional
--     (`application_id?: string`) and cockpit Messages.tsx says why in its
--     own comment ("Team-member RLS on messages is keyed on application_id —
--     a row without one is invisible to them ... Send every message with the
--     application it belongs to when we know it"): a reply in an existing
--     thread does not always have one to hand. Live data confirms this is
--     exercised, not theoretical: of the 7 rows in public.messages today, 6
--     have application_id IS NULL, and every one of those 7 is still a real
--     candidate/job-owner pair.
--
-- Fix: sender must be a real counterparty of the receiver — either the
-- candidate on an application to a job the receiver owns, or the owner of a
-- job the receiver is the candidate on — using the same public.is_job_owner
-- helper the team-member policy's sibling policies already rely on
-- (20260715014000_break_jobs_applications_rls_recursion.sql). When
-- application_id IS NOT NULL it must be exactly that shared application
-- (blocks pointing a real conversation at an unrelated application_id);
-- when it is NULL, any qualifying application between the two of them is
-- enough, matching the optional-application_id shape above.
--
-- Untouched by this migration:
--   "Team members can send messages if permitted"       (INSERT, 20251216160358_*.sql)
--   "Users can view their own messages"                 (SELECT, 20251214183024_*.sql)
--   "Team members can view messages for assigned jobs"   (SELECT, 20251216160358_*.sql)
--   "Receivers can update message read status"           (UPDATE, 20251214183024_*.sql)
--   "Users can delete their own messages"                (DELETE, 20251215034808_*.sql)
-- ============================================================================

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Counterparties can send messages" ON public.messages;

CREATE POLICY "Counterparties can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    -- candidate -> owner of a job they applied to
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.candidate_id = auth.uid()
        AND public.is_job_owner(a.job_id, messages.receiver_id)
        AND (messages.application_id IS NULL OR messages.application_id = a.id)
    )
    -- job owner -> candidate of an application on one of their jobs
    OR EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.candidate_id = messages.receiver_id
        AND public.is_job_owner(a.job_id, auth.uid())
        AND (messages.application_id IS NULL OR messages.application_id = a.id)
    )
  )
);

REVOKE INSERT ON public.messages FROM anon;
