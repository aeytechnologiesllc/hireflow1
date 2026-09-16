-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Revenue-protection hardening (verified 2026-07-09).
-- All legitimate writes to these tables come from service-role edge functions
-- (Stripe webhooks, get-subscription, purchase/deduct voice credits), which
-- bypass RLS. The only real client write is onboarding_completed on the user's
-- own subscription row (src/hooks/useSubscription.ts) — preserved below.

-- voice_credits: remove "anyone can mint free minutes" write policies
DROP POLICY IF EXISTS "System can insert voice credits" ON public.voice_credits;
DROP POLICY IF EXISTS "System can update voice credits" ON public.voice_credits;

-- subscription_usage: remove "reset your own quota" write policies
DROP POLICY IF EXISTS "System can insert usage" ON public.subscription_usage;
DROP POLICY IF EXISTS "System can update usage" ON public.subscription_usage;

-- subscriptions: remove free-upgrade INSERT + blanket UPDATE
DROP POLICY IF EXISTS "System can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;

-- Let authenticated users update ONLY their own row...
CREATE POLICY "Users update own subscription row"
  ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ...and ONLY the onboarding flag (plan_type/status stay server-only).
REVOKE UPDATE ON public.subscriptions FROM anon, authenticated;
GRANT UPDATE (onboarding_completed) ON public.subscriptions TO authenticated;
