-- Create blueprint_purchases table for tracking paid blueprint downloads
CREATE TABLE public.blueprint_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  amount_paid INTEGER DEFAULT 199,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_blueprint_purchases_user_id ON public.blueprint_purchases(user_id);
CREATE INDEX idx_blueprint_purchases_application_id ON public.blueprint_purchases(application_id);

-- Enable RLS
ALTER TABLE public.blueprint_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own purchases
CREATE POLICY "Users can view their own blueprint purchases"
ON public.blueprint_purchases
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own purchases (used after Stripe verification)
CREATE POLICY "Users can insert their own blueprint purchases"
ON public.blueprint_purchases
FOR INSERT
WITH CHECK (auth.uid() = user_id);