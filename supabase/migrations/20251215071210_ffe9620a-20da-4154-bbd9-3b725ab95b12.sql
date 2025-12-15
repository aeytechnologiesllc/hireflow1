-- Create subscriptions table for tracking user subscriptions
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_type TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  trial_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days'),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  currency TEXT DEFAULT 'USD',
  amount INTEGER,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create subscription_usage table for tracking limits
CREATE TABLE public.subscription_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  jobs_created INTEGER DEFAULT 0,
  applicants_received INTEGER DEFAULT 0,
  documents_sent INTEGER DEFAULT 0,
  team_members_added INTEGER DEFAULT 0,
  ai_analyses_used INTEGER DEFAULT 0,
  period_start TIMESTAMP WITH TIME ZONE DEFAULT date_trunc('month', now()),
  period_end TIMESTAMP WITH TIME ZONE DEFAULT (date_trunc('month', now()) + INTERVAL '1 month'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscriptions
CREATE POLICY "Users can view their own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert subscriptions"
ON public.subscriptions FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update subscriptions"
ON public.subscriptions FOR UPDATE
USING (true);

-- RLS policies for subscription_usage
CREATE POLICY "Users can view their own usage"
ON public.subscription_usage FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage"
ON public.subscription_usage FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update usage"
ON public.subscription_usage FOR UPDATE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_usage_updated_at
BEFORE UPDATE ON public.subscription_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();