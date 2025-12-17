-- Add recording URL column to applications table
ALTER TABLE public.applications 
ADD COLUMN voice_interview_recording_url TEXT;

-- Create storage bucket for interview recordings (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-interview-recordings', 'voice-interview-recordings', false);

-- RLS policy: Employers can view interview recordings for their jobs
CREATE POLICY "Employers can view interview recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voice-interview-recordings'
  AND EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON a.job_id = j.id
    WHERE a.id::text = (storage.foldername(name))[1]
    AND j.employer_id = auth.uid()
  )
);

-- RLS policy: Team members can view interview recordings for assigned jobs
CREATE POLICY "Team members can view interview recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voice-interview-recordings'
  AND EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id::text = (storage.foldername(name))[1]
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- RLS policy: Candidates can upload their own recordings
CREATE POLICY "Candidates can upload interview recordings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'voice-interview-recordings'
  AND EXISTS (
    SELECT 1 FROM applications a
    WHERE a.id::text = (storage.foldername(name))[1]
    AND a.candidate_id = auth.uid()
  )
);