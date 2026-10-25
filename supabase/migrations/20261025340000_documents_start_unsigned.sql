-- A document a browser creates starts unsigned (Phase 7 security review,
-- round 2, 2026-10-25, H1).
--
-- protect_document_columns runs on UPDATE only, and the insert rules check
-- who may create a document, not what it says. So a business (or a teammate
-- allowed to send documents) could insert a document on its own applicant's
-- application that was already "signed": status 'signed', is_locked,
-- candidate_signed_at, candidate_signature_data 'Jane X', made-up hashes, a
-- certificate and a code of its own choosing. The public /verify page then
-- showed "Verification Successful · Fully Executed": a fee or bond agreement
-- the applicant never saw, certified by HireFlow.
--
-- Every insert from a browser now starts the way the pages already start
-- one: pending, unlocked, with no signature, no signing time, no hash past
-- v1 (the sender's own hash of what they send), no certificate, no void or
-- decline, nothing about a viewer, and a document code the database makes.
-- Only the document-signing function (service role) ever moves it on.

CREATE OR REPLACE FUNCTION public.documents_insert_starts_unsigned()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  NEW.is_locked := false;
  NEW.locked_at := NULL;
  NEW.signature_data := NULL;
  NEW.signed_at := NULL;
  NEW.candidate_signature_data := NULL;
  NEW.candidate_signed_at := NULL;
  NEW.employer_signature_data := NULL;
  NEW.employer_signed_at := NULL;
  NEW.v2_hash := NULL;
  NEW.v3_hash := NULL;
  NEW.document_hash := NULL;
  NEW.final_pdf_hash := NULL;
  NEW.completion_certificate := NULL;
  NEW.declined_at := NULL;
  NEW.decline_reason := NULL;
  NEW.is_voided := false;
  NEW.voided_at := NULL;
  NEW.voided_reason := NULL;
  NEW.viewed_at := NULL;
  NEW.ip_address := NULL;
  NEW.user_agent := NULL;
  NEW.reminder_sent_at := NULL;
  -- set_document_code (it runs after this one: triggers fire by name) makes a fresh one.
  NEW.document_code := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.documents_insert_starts_unsigned() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_insert_starts_unsigned ON public.documents;
CREATE TRIGGER documents_insert_starts_unsigned
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_insert_starts_unsigned();
