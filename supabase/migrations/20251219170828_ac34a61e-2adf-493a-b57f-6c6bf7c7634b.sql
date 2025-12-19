-- Add document versioning columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS v1_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS v2_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS v3_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS completion_certificate jsonb;

-- Add enhanced audit trail columns
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS signature_event_id uuid DEFAULT gen_random_uuid();
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS pre_signature_hash text;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS post_signature_hash text;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS signing_order_position integer;
ALTER TABLE document_audit_logs ADD COLUMN IF NOT EXISTS timestamp_utc text;