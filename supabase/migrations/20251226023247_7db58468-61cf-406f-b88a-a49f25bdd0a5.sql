-- Add candidate_viewed_at field to document_requests to track when candidates have seen their pending requests
ALTER TABLE public.document_requests 
ADD COLUMN candidate_viewed_at TIMESTAMPTZ DEFAULT NULL;