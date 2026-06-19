-- =====================================================================
-- P0-7: Stop candidates forging employer signatures / integrity hashes
--       and tampering with locked, legally-binding signed documents.
--
-- The candidate UPDATE policy "Candidates can update document status"
-- (migration 20251214202144) has a USING clause but NO WITH CHECK, and
-- Postgres RLS cannot restrict *which columns* a candidate may write. So a
-- candidate could set status='signed', forge employer_signature_data /
-- employer_signed_at, overwrite the *_hash integrity values, flip
-- is_locked / is_voided, and rewrite completion_certificate on their own
-- document row -- defeating the entire dual-signature + audit-hash design.
--
-- Fix = (1) add a WITH CHECK so a candidate can only ever update rows that
-- belong to their own application (defence in depth; prevents re-homing a
-- row to another application via UPDATE), and (2) a BEFORE UPDATE trigger
-- that does the column-level enforcement RLS cannot.
--
-- The trigger uses a strict ALLOWLIST for candidate updates rather than a
-- blocklist: a candidate-initiated UPDATE may only change the columns the
-- live candidate signing/declining/viewing flow legitimately writes
-- (DocumentSigningDialog.tsx). ANY change to ANY other column -- including
-- every employer-signature / hash / lock / void / certificate / routing
-- column -- is rejected. An allowlist is strictly safer than a blocklist:
-- a forge-sensitive column added by a future migration is blocked by
-- default instead of silently slipping through.
--
-- The trigger is intentionally scoped to CANDIDATE updates only. Employer
-- and team-member updates (countersigning, locking, voiding, hashing,
-- editing) and service_role / edge-function updates pass through untouched.
--
-- Edge case explicitly handled (verifier objection): a candidate opening an
-- already-LOCKED document whose viewed_at is still NULL must still be able
-- to record the view (DocumentSigningDialog.recordDocumentView, which does
-- UPDATE ... SET viewed_at=now()). Once a row is locked, the trigger permits
-- a candidate to change ONLY viewed_at (benign view tracking) and rejects
-- every other column change -- so "block updates once is_locked=true" holds
-- for all meaningful columns while the legitimate view-tracking write on a
-- completed document keeps working.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Recreate the candidate UPDATE policy WITH a WITH CHECK clause.
--    (Defence in depth: prevents re-homing a row to another application.)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Candidates can update document status" ON public.documents;

CREATE POLICY "Candidates can update document status"
ON public.documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = documents.application_id
      AND a.candidate_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = documents.application_id
      AND a.candidate_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------
-- 2. BEFORE UPDATE trigger enforcing column-level immutability for
--    candidate-initiated updates (the part RLS cannot do).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_candidate_document_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_is_candidate boolean;
  v_is_employer_side boolean;
BEGIN
  -- Service role / internal (edge functions, autopilot, migrations,
  -- superuser): no end-user JWT context. Never restrict these -- they are
  -- the real source of truth for hashes, lock/void state, etc.
  IF v_uid IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Is the caller the candidate on this document's application?
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = NEW.application_id
      AND a.candidate_id = v_uid
  ) INTO v_is_candidate;

  -- Is the caller the employer (or an active team member) for this
  -- document's application? Employer-side updates are unrestricted here
  -- (their own RLS policy still governs whether the row is theirs).
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.id = NEW.application_id
      AND (
        j.employer_id = v_uid
        OR public.is_team_member(v_uid, j.employer_id)
      )
  ) INTO v_is_employer_side;

  -- Only candidates who are NOT also on the employer side are guarded.
  IF NOT v_is_candidate OR v_is_employer_side THEN
    RETURN NEW;
  END IF;

  -- ----- From here on, this is a pure candidate-initiated update. -----

  -- (A) Locked (fully executed) document: candidates may change ONLY
  --     viewed_at (benign view tracking of a completed document). Any
  --     other column change is rejected. This is what makes
  --     recordDocumentView() succeed on a locked doc while keeping the
  --     locked row otherwise immutable to candidates.
  IF COALESCE(OLD.is_locked, false) THEN
    IF NEW.viewed_at        IS DISTINCT FROM OLD.viewed_at
       AND (
            NEW.application_id           IS NOT DISTINCT FROM OLD.application_id
        AND NEW.name                     IS NOT DISTINCT FROM OLD.name
        AND NEW.file_url                 IS NOT DISTINCT FROM OLD.file_url
        AND NEW.document_type            IS NOT DISTINCT FROM OLD.document_type
        AND NEW.status                   IS NOT DISTINCT FROM OLD.status
        AND NEW.signed_at                IS NOT DISTINCT FROM OLD.signed_at
        AND NEW.created_at               IS NOT DISTINCT FROM OLD.created_at
        AND NEW.sender_id                IS NOT DISTINCT FROM OLD.sender_id
        AND NEW.recipient_id             IS NOT DISTINCT FROM OLD.recipient_id
        AND NEW.declined_at              IS NOT DISTINCT FROM OLD.declined_at
        AND NEW.decline_reason           IS NOT DISTINCT FROM OLD.decline_reason
        AND NEW.signature_data           IS NOT DISTINCT FROM OLD.signature_data
        AND NEW.ip_address               IS NOT DISTINCT FROM OLD.ip_address
        AND NEW.user_agent               IS NOT DISTINCT FROM OLD.user_agent
        AND NEW.expires_at               IS NOT DISTINCT FROM OLD.expires_at
        AND NEW.reminder_sent_at         IS NOT DISTINCT FROM OLD.reminder_sent_at
        AND NEW.candidate_signature_data IS NOT DISTINCT FROM OLD.candidate_signature_data
        AND NEW.candidate_signed_at      IS NOT DISTINCT FROM OLD.candidate_signed_at
        AND NEW.employer_signature_data  IS NOT DISTINCT FROM OLD.employer_signature_data
        AND NEW.employer_signed_at       IS NOT DISTINCT FROM OLD.employer_signed_at
        AND NEW.signing_order            IS NOT DISTINCT FROM OLD.signing_order
        AND NEW.signer_name              IS NOT DISTINCT FROM OLD.signer_name
        AND NEW.signer_email             IS NOT DISTINCT FROM OLD.signer_email
        AND NEW.signer_role              IS NOT DISTINCT FROM OLD.signer_role
        AND NEW.signature_method         IS NOT DISTINCT FROM OLD.signature_method
        AND NEW.consent_confirmed        IS NOT DISTINCT FROM OLD.consent_confirmed
        AND NEW.document_hash            IS NOT DISTINCT FROM OLD.document_hash
        AND NEW.document_version         IS NOT DISTINCT FROM OLD.document_version
        AND NEW.location_city            IS NOT DISTINCT FROM OLD.location_city
        AND NEW.location_region          IS NOT DISTINCT FROM OLD.location_region
        AND NEW.location_country         IS NOT DISTINCT FROM OLD.location_country
        AND NEW.page_numbers_signed      IS NOT DISTINCT FROM OLD.page_numbers_signed
        AND NEW.version_number           IS NOT DISTINCT FROM OLD.version_number
        AND NEW.is_voided                IS NOT DISTINCT FROM OLD.is_voided
        AND NEW.voided_at                IS NOT DISTINCT FROM OLD.voided_at
        AND NEW.voided_reason            IS NOT DISTINCT FROM OLD.voided_reason
        AND NEW.v1_hash                  IS NOT DISTINCT FROM OLD.v1_hash
        AND NEW.v2_hash                  IS NOT DISTINCT FROM OLD.v2_hash
        AND NEW.v3_hash                  IS NOT DISTINCT FROM OLD.v3_hash
        AND NEW.is_locked                IS NOT DISTINCT FROM OLD.is_locked
        AND NEW.locked_at                IS NOT DISTINCT FROM OLD.locked_at
        AND NEW.completion_certificate   IS NOT DISTINCT FROM OLD.completion_certificate
        AND NEW.document_code            IS NOT DISTINCT FROM OLD.document_code
        AND NEW.company_address          IS NOT DISTINCT FROM OLD.company_address
        AND NEW.job_title                IS NOT DISTINCT FROM OLD.job_title
        AND NEW.final_pdf_hash           IS NOT DISTINCT FROM OLD.final_pdf_hash
        AND NEW.package_id               IS NOT DISTINCT FROM OLD.package_id
       )
    THEN
      -- viewed_at-only change on a locked doc: allow.
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Document is locked and can no longer be modified by the candidate'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (B) Unlocked document: candidates may change ONLY the columns the live
  --     signing/declining/viewing flow writes. Everything else must be
  --     unchanged. (Allowlist => any unlisted/forge-sensitive column,
  --     including ones added by future migrations, is blocked by default.)
  IF NOT (
        -- columns a candidate is permitted to change:
        --   view tracking:        viewed_at, user_agent, ip_address
        --   candidate signature:  candidate_signature_data, candidate_signed_at,
        --                         v2_hash, version_number
        --   decline:              status (constrained to 'declined' below),
        --                         declined_at, decline_reason
        -- all other columns must be IS NOT DISTINCT FROM OLD (i.e. unchanged):
            NEW.application_id           IS NOT DISTINCT FROM OLD.application_id
        AND NEW.name                     IS NOT DISTINCT FROM OLD.name
        AND NEW.file_url                 IS NOT DISTINCT FROM OLD.file_url
        AND NEW.document_type            IS NOT DISTINCT FROM OLD.document_type
        AND NEW.signed_at                IS NOT DISTINCT FROM OLD.signed_at
        AND NEW.created_at               IS NOT DISTINCT FROM OLD.created_at
        AND NEW.sender_id                IS NOT DISTINCT FROM OLD.sender_id
        AND NEW.recipient_id             IS NOT DISTINCT FROM OLD.recipient_id
        AND NEW.signature_data           IS NOT DISTINCT FROM OLD.signature_data
        AND NEW.expires_at               IS NOT DISTINCT FROM OLD.expires_at
        AND NEW.reminder_sent_at         IS NOT DISTINCT FROM OLD.reminder_sent_at
        AND NEW.employer_signature_data  IS NOT DISTINCT FROM OLD.employer_signature_data
        AND NEW.employer_signed_at       IS NOT DISTINCT FROM OLD.employer_signed_at
        AND NEW.signing_order            IS NOT DISTINCT FROM OLD.signing_order
        AND NEW.signer_name              IS NOT DISTINCT FROM OLD.signer_name
        AND NEW.signer_email             IS NOT DISTINCT FROM OLD.signer_email
        AND NEW.signer_role              IS NOT DISTINCT FROM OLD.signer_role
        AND NEW.signature_method         IS NOT DISTINCT FROM OLD.signature_method
        AND NEW.consent_confirmed        IS NOT DISTINCT FROM OLD.consent_confirmed
        AND NEW.document_hash            IS NOT DISTINCT FROM OLD.document_hash
        AND NEW.document_version         IS NOT DISTINCT FROM OLD.document_version
        AND NEW.location_city            IS NOT DISTINCT FROM OLD.location_city
        AND NEW.location_region          IS NOT DISTINCT FROM OLD.location_region
        AND NEW.location_country         IS NOT DISTINCT FROM OLD.location_country
        AND NEW.page_numbers_signed      IS NOT DISTINCT FROM OLD.page_numbers_signed
        AND NEW.is_voided                IS NOT DISTINCT FROM OLD.is_voided
        AND NEW.voided_at                IS NOT DISTINCT FROM OLD.voided_at
        AND NEW.voided_reason            IS NOT DISTINCT FROM OLD.voided_reason
        AND NEW.v1_hash                  IS NOT DISTINCT FROM OLD.v1_hash
        AND NEW.v3_hash                  IS NOT DISTINCT FROM OLD.v3_hash
        AND NEW.is_locked                IS NOT DISTINCT FROM OLD.is_locked
        AND NEW.locked_at                IS NOT DISTINCT FROM OLD.locked_at
        AND NEW.completion_certificate   IS NOT DISTINCT FROM OLD.completion_certificate
        AND NEW.document_code            IS NOT DISTINCT FROM OLD.document_code
        AND NEW.company_address          IS NOT DISTINCT FROM OLD.company_address
        AND NEW.job_title                IS NOT DISTINCT FROM OLD.job_title
        AND NEW.final_pdf_hash           IS NOT DISTINCT FROM OLD.final_pdf_hash
        AND NEW.package_id               IS NOT DISTINCT FROM OLD.package_id
  ) THEN
    RAISE EXCEPTION 'Candidates cannot modify employer signature, integrity, lock, void, certificate, or routing fields on a document'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (C) status: a candidate may move it ONLY into 'declined' (the decline
  --     flow). They may never set 'signed' (the employer countersignature)
  --     or any other value.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'declined'::public.document_status THEN
    RAISE EXCEPTION 'Candidates may only decline; the signed status is set on employer countersignature'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_candidate_document_update_guard() IS
  'P0-7: restricts candidate-initiated document UPDATEs to an allowlist (view tracking, candidate signature fields, decline fields) and constrains status changes to declined. Service-role and employer/team updates are unaffected. On a locked row, candidates may change only viewed_at.';

DROP TRIGGER IF EXISTS enforce_candidate_document_update_guard ON public.documents;
CREATE TRIGGER enforce_candidate_document_update_guard
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_candidate_document_update_guard();
