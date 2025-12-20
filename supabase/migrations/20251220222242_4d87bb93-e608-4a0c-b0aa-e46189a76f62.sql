-- Drop the existing constraint and add 'reviewed' as an allowed status value
ALTER TABLE document_requests 
DROP CONSTRAINT IF EXISTS document_requests_status_check;

ALTER TABLE document_requests 
ADD CONSTRAINT document_requests_status_check 
CHECK (status IN ('pending', 'submitted', 'reviewed', 'approved', 'rejected'));