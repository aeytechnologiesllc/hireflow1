-- Add columns to track dual-signature workflow
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS candidate_signature_data text,
ADD COLUMN IF NOT EXISTS candidate_signed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS employer_signature_data text,
ADD COLUMN IF NOT EXISTS employer_signed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS signing_order text DEFAULT 'candidate_first';