-- Add human-readable document code column
ALTER TABLE documents ADD COLUMN document_code TEXT UNIQUE;

-- Create trigger function to auto-generate document code
CREATE OR REPLACE FUNCTION generate_document_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_code IS NULL THEN
    NEW.document_code := 'DOC-' || UPPER(SUBSTRING(md5(random()::text), 1, 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER set_document_code
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION generate_document_code();

-- Backfill existing documents with unique codes
UPDATE documents 
SET document_code = 'DOC-' || UPPER(SUBSTRING(md5(id::text), 1, 6))
WHERE document_code IS NULL;

-- Make column NOT NULL after backfill
ALTER TABLE documents ALTER COLUMN document_code SET NOT NULL;