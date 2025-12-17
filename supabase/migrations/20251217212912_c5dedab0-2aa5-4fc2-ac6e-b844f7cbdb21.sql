-- Add voice_interview_transcript column to store full timestamped transcript
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS voice_interview_transcript JSONB;