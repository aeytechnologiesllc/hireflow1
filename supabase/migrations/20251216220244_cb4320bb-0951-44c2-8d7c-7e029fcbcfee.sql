-- Create portfolios storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolios', 'portfolios', true)
ON CONFLICT (id) DO NOTHING;

-- Allow candidates to upload their portfolio files
CREATE POLICY "Candidates can upload portfolio files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'portfolios' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view portfolio files (for employer review)
CREATE POLICY "Portfolio files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'portfolios');

-- Allow candidates to update their own portfolio files
CREATE POLICY "Candidates can update their portfolio files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'portfolios' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow candidates to delete their own portfolio files
CREATE POLICY "Candidates can delete their portfolio files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'portfolios' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);