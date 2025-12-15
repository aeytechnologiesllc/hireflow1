-- Allow withdrawing applications by preventing cascaded deletes on audit logs
-- 1) Ensure document_audit_logs.document_id uses ON DELETE SET NULL instead of CASCADE
ALTER TABLE public.document_audit_logs
  DROP CONSTRAINT IF EXISTS document_audit_logs_document_id_fkey;

ALTER TABLE public.document_audit_logs
  ALTER COLUMN document_id DROP NOT NULL;

ALTER TABLE public.document_audit_logs
  ADD CONSTRAINT document_audit_logs_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE SET NULL;

-- 2) Update block_audit_modification() to allow safe SET NULL updates from FK cascade
CREATE OR REPLACE FUNCTION public.block_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Always block explicit DELETEs of audit logs
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs cannot be modified or deleted for compliance reasons';
    RETURN NULL;
  END IF;

  -- For UPDATEs, only allow when document_id is being set to NULL by FK cascade
  -- and all other columns remain unchanged
  IF TG_OP = 'UPDATE' THEN
    IF OLD.document_id IS NOT NULL
       AND NEW.document_id IS NULL
       AND OLD.id = NEW.id
       AND OLD.action = NEW.action
       AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
       AND OLD.location_city IS NOT DISTINCT FROM NEW.location_city
       AND OLD.location_region IS NOT DISTINCT FROM NEW.location_region
       AND OLD.location_country IS NOT DISTINCT FROM NEW.location_country
       AND OLD.ip_address IS NOT DISTINCT FROM NEW.ip_address
       AND OLD.user_agent IS NOT DISTINCT FROM NEW.user_agent
       AND OLD.created_at = NEW.created_at
       AND OLD.details IS NOT DISTINCT FROM NEW.details
       AND OLD.consent_confirmed IS NOT DISTINCT FROM NEW.consent_confirmed
       AND OLD.page_numbers_signed IS NOT DISTINCT FROM NEW.page_numbers_signed
       AND OLD.document_version IS NOT DISTINCT FROM NEW.document_version
       AND OLD.signature_method IS NOT DISTINCT FROM NEW.signature_method
       AND OLD.signer_role IS NOT DISTINCT FROM NEW.signer_role
       AND OLD.signer_email IS NOT DISTINCT FROM NEW.signer_email
       AND OLD.signer_name IS NOT DISTINCT FROM NEW.signer_name
    THEN
      -- This is a safe FK cleanup; allow it
      RETURN NEW;
    END IF;

    -- Any other UPDATE is blocked for compliance reasons
    RAISE EXCEPTION 'Audit logs cannot be modified or deleted for compliance reasons';
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;