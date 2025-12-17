-- Allow candidates to view (SELECT) their own interview recordings
-- This is needed for createSignedUrl to work after upload
CREATE POLICY "Candidates can view their own interview recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voice-interview-recordings' 
  AND (storage.foldername(name))[1] IN (
    SELECT a.id::text FROM applications a WHERE a.candidate_id = auth.uid()
  )
);