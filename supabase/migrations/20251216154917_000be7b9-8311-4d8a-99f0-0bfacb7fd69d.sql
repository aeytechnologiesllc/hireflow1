-- Add email notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_new_applications boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_messages boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_interview_reminders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_document_updates boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email_phase_updates boolean DEFAULT true;