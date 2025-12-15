-- Create a storage bucket for video introductions
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true);

-- Create policies for video uploads
CREATE POLICY "Users can upload their own videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Employers can view candidate videos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'videos' AND
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE j.employer_id = auth.uid()
    AND a.candidate_id::text = (storage.foldername(name))[1]
  )
);