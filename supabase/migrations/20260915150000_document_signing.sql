-- ============================================================================
-- Document signing: server-authoritative sign / countersign, and a real
-- write fence on public.documents.
-- ============================================================================
-- See docs/DOCUMENT-SIGNING.md for the full design and its revision log.
-- 0 rows in public.documents live (confirmed 2026-09-15) — every change here
-- is additive or a fresh lockdown, nothing migrates existing data.
--
-- This migration ships exactly two things:
--   1. public.protect_document_columns() — a BEFORE UPDATE trigger fencing
--      every signing/lock/hash/void column against a direct client UPDATE.
--      The new supabase/functions/document-signing edge function runs as
--      service_role and is exempt (same pattern as
--      protect_application_columns(), 20260915110000_*.sql).
--   2. The DELETE policy swap: candidates lose the ability to delete their
--      own documents outright, and an employer may only delete a document
--      the candidate has not yet signed.
--
-- No new SECURITY DEFINER RPC is added for sign/countersign/decline
-- themselves — see docs/DOCUMENT-SIGNING.md's revision log for why the
-- atomicity fix moved to a compare-and-swap performed directly by the edge
-- function's service-role client instead of a wrapping Postgres function:
-- a plain `UPDATE ... WHERE id = $1 AND <precondition columns>` is exactly
-- as atomic as a SELECT ... FOR UPDATE (concurrent UPDATEs to the same row
-- always serialize at the row level in Postgres), and it avoids adding a
-- second SECURITY DEFINER surface whose own privileges would need
-- independent review.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. protect_document_columns()
-- ----------------------------------------------------------------------------
-- Modeled on public.protect_application_columns() (20260915110000_*.sql):
-- service_role (the document-signing edge function) is exempt via
-- auth.role() — not current_user, which inside a SECURITY DEFINER function
-- is always the function's owner, never the calling role (see that
-- migration's comment for the PGlite-confirmed reasoning). Everyone else
-- gets an explicit allow-list of what a plain client UPDATE may still touch.
--
-- Fixes applied here versus the first draft in docs/DOCUMENT-SIGNING.md §5
-- (see the design doc's revision log for the full writeup of each):
--   (a) team-member detection now matches this codebase's own live
--       convention exactly — array_length(tm.assigned_job_ids, 1) IS NULL —
--       instead of a hand-rolled `tm.assigned_job_ids IS NULL`, which
--       misclassifies a team member scoped to `'{}'::uuid[]` (RLS already
--       treats that as "every job") as neither candidate nor employer and
--       drops them into the unrestricted pass-through branch.
--   (b) is_voided / voided_at / voided_reason are now blocked in BOTH
--       branches (pending and closed), not left writable. Nothing in this
--       codebase writes these columns today (repo-wide grep, confirmed
--       again while writing this migration) — voiding a document is a
--       real, separate product decision (its own audit-log action, its own
--       notification, its own UI) that this pass deliberately does not
--       invent. Blocking the columns outright removes the concrete
--       regression (an employer silently invalidating a locked, completed
--       document with zero audit trail) with no functional loss, since
--       there is no legitimate writer to break.
--   (c) signature_data / signed_at (the legacy, pre-versioned columns) are
--       now blocked in both branches too. `signed_at` is no longer purely
--       legacy after this pass — countersign sets it as the completion
--       timestamp every mounted UI surface already reads (see the design
--       doc's revision log, item 4) — so leaving it client-writable would
--       let an employer forge the displayed completion date on a locked,
--       certificate-bearing document.
--
-- Repairer-pass fixes (second round, see the design doc's revision log for
-- the full writeup of each finding):
--   (d) name/file_url/document_type/expires_at are now blocked on a still-
--       pending document once candidate_signed_at is set — closes the
--       window where an employer could swap the document's actual content
--       after the candidate signed it but before countersigning.
--   (e) recipient_id is now included in the identity-fields check (it was
--       claimed as "checked below" in a comment but never actually
--       checked) — otherwise an employer/team-member could reassign a
--       document's recipient to hijack document_audit_logs read access and
--       /verify's party-only signer-name reveal, even on a locked document.
CREATE OR REPLACE FUNCTION public.protect_document_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_candidate_id uuid;
  v_employer_id  uuid;
  v_is_employer_side boolean;
BEGIN
  -- The document-signing edge function runs on service_role and is
  -- authoritative for every signing/lock/hash write. See
  -- protect_application_columns()'s own comment (20260915110000_*.sql) for
  -- why auth.role(), not current_user, is the correct check inside a
  -- SECURITY DEFINER function.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT a.candidate_id, j.employer_id
    INTO v_candidate_id, v_employer_id
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE a.id = OLD.application_id;

  v_is_employer_side := v_employer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.employer_id = v_employer_id
        AND tm.status = 'active'
        AND tm.can_send_documents = true
        AND (
          array_length(tm.assigned_job_ids, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM public.applications a2
            WHERE a2.id = OLD.application_id
              AND a2.job_id = ANY (tm.assigned_job_ids)
          )
        )
    );

  -- Candidates never write documents directly, full stop. `view`, `sign`,
  -- `decline` all go through the edge function now.
  IF auth.uid() = v_candidate_id AND NOT v_is_employer_side THEN
    RAISE EXCEPTION 'Candidates cannot update documents directly — use the document-signing function';
  END IF;

  IF NOT v_is_employer_side THEN
    -- RLS should already have refused this write; don't second-guess it.
    RETURN NEW;
  END IF;

  IF OLD.status IN ('signed', 'declined') OR OLD.is_locked THEN
    -- A completed or declined document is closed. Nothing about a finished
    -- document is client-writable past this point — voiding is a separate,
    -- not-yet-built flow (see the header comment above), not a silent
    -- column write.
    IF new.name IS DISTINCT FROM old.name
      OR new.file_url IS DISTINCT FROM old.file_url
      OR new.document_type IS DISTINCT FROM old.document_type
      OR new.expires_at IS DISTINCT FROM old.expires_at
      OR new.status IS DISTINCT FROM old.status
      OR new.candidate_signature_data IS DISTINCT FROM old.candidate_signature_data
      OR new.candidate_signed_at IS DISTINCT FROM old.candidate_signed_at
      OR new.employer_signature_data IS DISTINCT FROM old.employer_signature_data
      OR new.employer_signed_at IS DISTINCT FROM old.employer_signed_at
      OR new.is_locked IS DISTINCT FROM old.is_locked
      OR new.locked_at IS DISTINCT FROM old.locked_at
      OR new.completion_certificate IS DISTINCT FROM old.completion_certificate
      OR new.v1_hash IS DISTINCT FROM old.v1_hash
      OR new.v2_hash IS DISTINCT FROM old.v2_hash
      OR new.v3_hash IS DISTINCT FROM old.v3_hash
      OR new.document_hash IS DISTINCT FROM old.document_hash
      OR new.final_pdf_hash IS DISTINCT FROM old.final_pdf_hash
      OR new.document_code IS DISTINCT FROM old.document_code
      OR new.declined_at IS DISTINCT FROM old.declined_at
      OR new.decline_reason IS DISTINCT FROM old.decline_reason
      OR new.signature_data IS DISTINCT FROM old.signature_data
      OR new.signed_at IS DISTINCT FROM old.signed_at
      OR new.is_voided IS DISTINCT FROM old.is_voided
      OR new.voided_at IS DISTINCT FROM old.voided_at
      OR new.voided_reason IS DISTINCT FROM old.voided_reason
    THEN
      RAISE EXCEPTION 'This document is % — it is closed and cannot be edited', old.status;
    END IF;
  ELSE
    -- Still pending: block the columns that only the edge function may ever
    -- set, on top of what's structurally read-only (id, application_id,
    -- created_at, document_code, sender_id, recipient_id, checked below).
    IF new.candidate_signature_data IS DISTINCT FROM old.candidate_signature_data
      OR new.candidate_signed_at IS DISTINCT FROM old.candidate_signed_at
      OR new.employer_signature_data IS DISTINCT FROM old.employer_signature_data
      OR new.employer_signed_at IS DISTINCT FROM old.employer_signed_at
      OR new.status IS DISTINCT FROM old.status
      OR new.is_locked IS DISTINCT FROM old.is_locked
      OR new.locked_at IS DISTINCT FROM old.locked_at
      OR new.completion_certificate IS DISTINCT FROM old.completion_certificate
      OR new.v2_hash IS DISTINCT FROM old.v2_hash
      OR new.v3_hash IS DISTINCT FROM old.v3_hash
      OR new.final_pdf_hash IS DISTINCT FROM old.final_pdf_hash
      OR new.document_hash IS DISTINCT FROM old.document_hash
      OR new.declined_at IS DISTINCT FROM old.declined_at
      OR new.decline_reason IS DISTINCT FROM old.decline_reason
      OR new.viewed_at IS DISTINCT FROM old.viewed_at
      OR new.ip_address IS DISTINCT FROM old.ip_address
      OR new.user_agent IS DISTINCT FROM old.user_agent
      OR new.signature_data IS DISTINCT FROM old.signature_data
      OR new.signed_at IS DISTINCT FROM old.signed_at
      OR new.is_voided IS DISTINCT FROM old.is_voided
      OR new.voided_at IS DISTINCT FROM old.voided_at
      OR new.voided_reason IS DISTINCT FROM old.voided_reason
    THEN
      RAISE EXCEPTION 'Signing fields can only be set by the document-signing function';
    END IF;

    -- Repairer finding: "Employer can bait-and-switch document content
    -- after the candidate signs". While the document is still pending,
    -- name/file_url/document_type/expires_at stay writable (DocumentWizard
    -- legitimately re-saves them right after insert, before anyone has
    -- signed — see the design doc's revision log, should-consider item 4's
    -- neighbor discussion). But once the candidate has signed
    -- (candidate_signed_at is set, v2_hash locked in) and before the
    -- employer countersigns, the document's actual content must not change
    -- out from under a signature the candidate already gave on the
    -- original content — otherwise an employer could swap the file/name/
    -- type after the candidate signs and countersign the swapped version;
    -- the hash chain (v1/v2) and candidate_signed_at would read as
    -- continuous while the served final.pdf reflects content the
    -- candidate never actually reviewed.
    IF old.candidate_signed_at IS NOT NULL AND (
      new.name IS DISTINCT FROM old.name
      OR new.file_url IS DISTINCT FROM old.file_url
      OR new.document_type IS DISTINCT FROM old.document_type
      OR new.expires_at IS DISTINCT FROM old.expires_at
    ) THEN
      RAISE EXCEPTION 'Document content cannot change after the candidate has signed';
    END IF;
  END IF;

  IF new.application_id IS DISTINCT FROM old.application_id
    OR new.sender_id IS DISTINCT FROM old.sender_id
    OR new.recipient_id IS DISTINCT FROM old.recipient_id
    OR new.document_code IS DISTINCT FROM old.document_code
  THEN
    RAISE EXCEPTION 'Cannot change document identity fields';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_document_columns_trigger ON public.documents;
CREATE TRIGGER protect_document_columns_trigger
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_document_columns();

-- ----------------------------------------------------------------------------
-- 2. DELETE policies
-- ----------------------------------------------------------------------------
-- Two live policies today have no restriction at all: "Candidates can
-- delete their documents" and "Employers can delete their documents".
DROP POLICY IF EXISTS "Candidates can delete their documents" ON public.documents;
-- Candidates were never supposed to delete evidence of their own signature;
-- nothing in the product exercises this today.

DROP POLICY IF EXISTS "Employers can delete their documents" ON public.documents;
CREATE POLICY "Employers can delete undelivered documents"
  ON public.documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = documents.application_id AND j.employer_id = auth.uid()
    )
    AND candidate_signed_at IS NULL
    AND is_locked = false
  );

-- "Team members can update documents if permitted" is left exactly as-is —
-- that policy only decides *who may attempt* an UPDATE; the new trigger
-- above decides *what* they may change regardless of which RLS policy let
-- the statement through.
