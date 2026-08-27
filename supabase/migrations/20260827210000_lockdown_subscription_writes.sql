-- ============================================================================
-- RLS HOLE: public.subscriptions / public.subscription_usage writable by
-- ANY authenticated (or anon) client.
-- ============================================================================
-- supabase/migrations/20251215071210_ffe9620a-20da-4154-bbd9-3b725ab95b12.sql
-- created these four policies with no `TO` clause (= applies to PUBLIC, i.e.
-- both `anon` and `authenticated`):
--
--   "System can insert subscriptions"  ON subscriptions      FOR INSERT WITH CHECK (true)
--   "System can update subscriptions"  ON subscriptions      FOR UPDATE USING (true)
--   "System can insert usage"          ON subscription_usage FOR INSERT WITH CHECK (true)
--   "System can update usage"          ON subscription_usage FOR UPDATE USING (true)
--
-- `USING/WITH CHECK (true)` means literally anyone with an anon key can set
-- plan_type = 'enterprise' on someone else's subscription, zero out their
-- usage counters, forge a stripe_subscription_id, etc. The policy names
-- ("System can ...") were presumably meant to be reserved for the backend,
-- but Postgres RLS has no notion of "the backend" — the real backend writers
-- below never needed these policies at all, because they run on the
-- service_role key, which bypasses RLS entirely and is completely unaffected
-- by anything in this migration:
--
--   supabase/functions/stripe-webhook/index.ts       (supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY)
--   supabase/functions/get-subscription/index.ts     (supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY)
--   supabase/functions/sync-subscription/index.ts    (supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY)
--   supabase/functions/deduct-voice-minutes/index.ts (supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY)
--   supabase/functions/delete-account/index.ts       (supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY)
--
-- The ONLY legitimate client-side write, made under the user's own JWT, is:
--
--   src/hooks/useSubscription.ts:217
--     supabase.from('subscriptions')
--       .update({ onboarding_completed: true })
--       .eq('user_id', user?.id)
--
-- so the policy below allows exactly that shape (own row, UPDATE only), and
-- the column-level GRANT/REVOKE pair that follows it is a second, independent
-- layer: even if a future RLS policy is written sloppily, a client still
-- cannot smuggle plan_type/status/amount/etc. into the same UPDATE, because
-- `authenticated` only holds column privilege on onboarding_completed.
--
-- Untouched by this migration (do not re-run/duplicate these):
--   "Users can view their own subscription"        (SELECT, subscriptions)
--   "Users can view their own usage"                (SELECT, subscription_usage)
--   "Developers can view all subscriptions"         (SELECT, 20260104033710_*.sql)
--   "Developers can view all subscription usage"    (SELECT, 20260104033710_*.sql)
-- ============================================================================

-- Drop the four permissive "System can ..." policies.
DROP POLICY IF EXISTS "System can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can insert usage" ON public.subscription_usage;
DROP POLICY IF EXISTS "System can update usage" ON public.subscription_usage;

-- Replace with the one legitimate client-side write: a user completing their
-- own onboarding. Row-level: only your own row, and only via UPDATE.
CREATE POLICY "Users can complete their own onboarding"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Column-level tightening (belt and braces): even on your own row, a plain
-- UPDATE can only ever touch onboarding_completed. plan_type, status,
-- stripe_customer_id, amount, etc. are only writable by service_role, which
-- is unaffected by REVOKE (it does not run as `authenticated` or `anon`).
REVOKE UPDATE ON public.subscriptions FROM authenticated, anon;
GRANT UPDATE (onboarding_completed) ON public.subscriptions TO authenticated;

-- No client should ever INSERT or DELETE a subscriptions row directly — rows
-- are created by get-subscription/sync-subscription and deleted only by
-- delete-account, all under service_role.
REVOKE INSERT, DELETE ON public.subscriptions FROM authenticated, anon;

-- subscription_usage has no legitimate client write path at all: every
-- counter (jobs_created, applicants_received, documents_sent,
-- team_members_added, ai_analyses_used, voice_minutes_used, ...) is
-- maintained exclusively by service_role edge functions. With the two
-- "System can ..." policies above dropped and none replacing them, RLS
-- already default-denies every INSERT/UPDATE for `authenticated`/`anon`;
-- these REVOKEs make that explicit at the grant layer too.
REVOKE INSERT, UPDATE, DELETE ON public.subscription_usage FROM authenticated, anon;
