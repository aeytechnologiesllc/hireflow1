-- Add email preference for voice minutes notifications
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_voice_minutes boolean DEFAULT true;

-- Add tracking for last low balance notification to prevent spam
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS voice_low_balance_notified_at timestamp with time zone DEFAULT NULL;