-- Make document_id nullable first
ALTER TABLE public.document_audit_logs
ALTER COLUMN document_id DROP NOT NULL;

-- Drop existing foreign key constraint
ALTER TABLE public.document_audit_logs
DROP CONSTRAINT IF EXISTS document_audit_logs_document_id_fkey;

-- Re-add with ON DELETE SET NULL to preserve audit logs when documents are deleted
ALTER TABLE public.document_audit_logs
ADD CONSTRAINT document_audit_logs_document_id_fkey
FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;