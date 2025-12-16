-- Create voice_credits table to track all voice minutes (subscription and purchased)
CREATE TABLE public.voice_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('subscription', 'purchase')),
  minutes_granted INTEGER NOT NULL,
  minutes_remaining INTEGER NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  stripe_payment_id TEXT,
  pack_size TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'voided')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_credits ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view their own voice credits"
ON public.voice_credits
FOR SELECT
USING (auth.uid() = user_id);

-- System can insert credits (for subscriptions and purchases)
CREATE POLICY "System can insert voice credits"
ON public.voice_credits
FOR INSERT
WITH CHECK (true);

-- System can update credits (for deducting minutes and status changes)
CREATE POLICY "System can update voice credits"
ON public.voice_credits
FOR UPDATE
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_voice_credits_user_active ON public.voice_credits (user_id, status, expires_at)
WHERE status = 'active';