-- Add voice_interview_duration column to applications table
ALTER TABLE applications ADD COLUMN voice_interview_duration integer DEFAULT 10;