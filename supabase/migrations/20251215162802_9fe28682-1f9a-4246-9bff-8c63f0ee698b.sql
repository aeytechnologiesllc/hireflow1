-- Add voice_minutes_used to subscription_usage table
ALTER TABLE public.subscription_usage 
ADD COLUMN IF NOT EXISTS voice_minutes_used integer DEFAULT 0;

-- Add voice_interview_language preference to applications for candidate voice interviews
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS voice_interview_result jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS voice_interview_language text DEFAULT 'en';

-- Update comment for clarity
COMMENT ON COLUMN public.subscription_usage.voice_minutes_used IS 'Total voice minutes used this billing period for AVA Voice Assistant';