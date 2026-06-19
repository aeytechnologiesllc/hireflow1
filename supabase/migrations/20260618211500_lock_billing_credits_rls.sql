-- P0-5: Lock billing/credits RLS
-- Problem: subscriptions, subscription_usage, and voice_credits each shipped
-- permissive INSERT (WITH CHECK(true)) and UPDATE (USING(true)) policies with no
-- TO clause (=> PUBLIC, incl. authenticated). Combined with the client only ever
-- holding the publishable key, any logged-in user could self-grant any plan,
-- mint voice credits, or tamper with ANOTHER tenant's billing row (USING(true)
-- has no user_id scope). All legitimate writes go through service-role edge
-- functions, which bypass RLS and grants, so removing client write access is
-- functionally free EXCEPT for one client-side flow: the onboarding wizard
-- flips subscriptions.onboarding_completed on the caller's own row. That single
-- column is preserved via Postgres column-level UPDATE privileges.

-- =========================================================================
-- subscriptions
-- =========================================================================

-- Drop the permissive write policies.
DROP POLICY IF EXISTS "System can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;

-- Revoke ALL client write access. Service-role bypasses these grants entirely.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;

-- Re-grant UPDATE on ONLY the harmless onboarding flag to authenticated.
-- Column-level privilege is the Postgres-native way to restrict columns that
-- RLS cannot. This lets the onboarding wizard (src/hooks/useSubscription.ts
-- completeOnboarding, src/pages/Dashboard.tsx handleTestOnboarding) keep working
-- while plan_type/status/stripe_*/amount/etc. remain unwritable by the client.
-- The BEFORE UPDATE trigger that sets updated_at is unaffected: Postgres checks
-- column UPDATE privilege against the SET-list of the statement, not against
-- columns mutated inside a trigger.
GRANT UPDATE (onboarding_completed) ON public.subscriptions TO authenticated;

-- Allow that update only on the caller's own row (and only their own row as the
-- post-image), now WITH CHECK (the old policy had none / USING(true)).
CREATE POLICY "Users can update their own subscription onboarding flag"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- (The existing SELECT-own-row policy "Users can view their own subscription"
--  and the developer SELECT policy are intentionally left in place.)

-- =========================================================================
-- subscription_usage  (no client writes exist anywhere in the app)
-- =========================================================================

DROP POLICY IF EXISTS "System can insert usage" ON public.subscription_usage;
DROP POLICY IF EXISTS "System can update usage" ON public.subscription_usage;

REVOKE INSERT, UPDATE, DELETE ON public.subscription_usage FROM anon, authenticated;

-- (Existing SELECT-own-row policy "Users can view their own usage" and the
--  developer SELECT policy remain so the client can still read usage counters.)

-- =========================================================================
-- voice_credits  (no client writes exist anywhere in the app)
-- =========================================================================

DROP POLICY IF EXISTS "System can insert voice credits" ON public.voice_credits;
DROP POLICY IF EXISTS "System can update voice credits" ON public.voice_credits;

REVOKE INSERT, UPDATE, DELETE ON public.voice_credits FROM anon, authenticated;

-- (Existing SELECT-own-row policy "Users can view their own voice credits" and
--  the developer SELECT policy remain so the client can still read its balance.)

-- =========================================================================
-- Post-deploy: audit existing rows for prior tampering, e.g.
--   SELECT user_id, plan_type, status, stripe_subscription_id, updated_at
--   FROM public.subscriptions
--   WHERE plan_type <> 'trial' AND stripe_subscription_id IS NULL;
-- (plan upgraded without a Stripe subscription id => suspect)
-- and voice_credits with source='purchase' but NULL stripe_payment_id.
