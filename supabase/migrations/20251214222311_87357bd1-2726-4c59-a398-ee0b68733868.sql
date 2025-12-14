-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to resumes bucket
CREATE POLICY "Users can upload their own resume"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to view their own resumes
CREATE POLICY "Users can view their own resume"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access to resumes for employers
CREATE POLICY "Resumes are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'resumes');

-- Allow users to delete their own resumes
CREATE POLICY "Users can delete their own resume"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);