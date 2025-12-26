-- Add new profile fields for employer identity block
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS company_address TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Add final PDF hash field to documents (byte-level hash of final burned PDF)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS final_pdf_hash TEXT;

-- Add comment explaining the purpose
COMMENT ON COLUMN documents.final_pdf_hash IS 'SHA-256 hash of the final PDF bytes with embedded signatures, computed after burnSignaturesIntoPdf()';
COMMENT ON COLUMN profiles.company_address IS 'Full business address for employer identity block on documents';
COMMENT ON COLUMN profiles.job_title IS 'Representative title/position for document signing authorization';