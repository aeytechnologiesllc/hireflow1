-- Create documents storage bucket for uploaded files
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Employers can upload documents
CREATE POLICY "Employers can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view documents they uploaded or are recipients of
CREATE POLICY "Users can view their documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Employers can delete their uploaded documents
CREATE POLICY "Employers can delete their documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);