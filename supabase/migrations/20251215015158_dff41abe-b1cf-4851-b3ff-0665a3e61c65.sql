-- Add new columns to document_audit_logs for comprehensive tracking
ALTER TABLE public.document_audit_logs
ADD COLUMN IF NOT EXISTS signer_name text,
ADD COLUMN IF NOT EXISTS signer_email text,
ADD COLUMN IF NOT EXISTS signer_role text,
ADD COLUMN IF NOT EXISTS signature_method text,
ADD COLUMN IF NOT EXISTS consent_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS document_hash text,
ADD COLUMN IF NOT EXISTS document_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS location_city text,
ADD COLUMN IF NOT EXISTS location_region text,
ADD COLUMN IF NOT EXISTS location_country text,
ADD COLUMN IF NOT EXISTS page_numbers_signed text[];

-- Add new columns to documents table for integrity tracking
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS document_hash text,
ADD COLUMN IF NOT EXISTS version_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_voided boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS voided_reason text;

-- Create function to block modifications on audit logs (immutability)
CREATE OR REPLACE FUNCTION public.block_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified or deleted for compliance reasons';
  RETURN NULL;
END;
$$;

-- Create trigger to prevent updates on audit logs
DROP TRIGGER IF EXISTS prevent_audit_update ON public.document_audit_logs;
CREATE TRIGGER prevent_audit_update
BEFORE UPDATE ON public.document_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_audit_modification();

-- Create trigger to prevent deletes on audit logs
DROP TRIGGER IF EXISTS prevent_audit_delete ON public.document_audit_logs;
CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON public.document_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_audit_modification();

-- Remove foreign key constraint on user_id to persist audit logs after user deletion
-- First check if the constraint exists and drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'document_audit_logs_user_id_fkey' 
    AND table_name = 'document_audit_logs'
  ) THEN
    ALTER TABLE public.document_audit_logs DROP CONSTRAINT document_audit_logs_user_id_fkey;
  END IF;
END $$;