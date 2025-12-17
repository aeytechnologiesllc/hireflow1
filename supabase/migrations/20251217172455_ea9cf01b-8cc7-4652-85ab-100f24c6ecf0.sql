-- Add new columns for interview configuration
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS voice_interview_language_rule TEXT DEFAULT 'soft' CHECK (voice_interview_language_rule IN ('hard', 'soft')),
ADD COLUMN IF NOT EXISTS voice_interview_video_enabled BOOLEAN DEFAULT true;