

# Additional Gaps Worth Fixing

## Gap 1: `check-applicant-limit` Has No Authentication (Security)

**File:** `supabase/functions/check-applicant-limit/index.ts`  
**Config:** `verify_jwt = false`

This function accepts an `employerId` from the request body with zero authentication. Anyone can call it to enumerate employer IDs and discover how many applicants each employer has, their plan type, and whether they've hit limits. While it doesn't expose sensitive data directly, it leaks business intelligence (plan tier, applicant counts).

**Fix:** Either add JWT verification or at minimum validate the caller. Since this is likely called during the public application flow (candidate applying), the simplest fix is to stop returning the plan details and just return `limitReached: true/false`.

---

## Gap 2: `invoice.paid` Webhook Has No Duplicate Protection (Voice Credits)

**File:** `supabase/functions/stripe-webhook/index.ts` (lines 152-175)

When `invoice.paid` fires for subscription renewals, it inserts 30 voice minutes with no duplicate check. Stripe can retry webhook deliveries, and each retry would insert another 30 minutes. The `checkout.session.completed` handler (line 62-72) correctly checks for duplicates via `stripe_payment_id`, but the `invoice.paid` handler does not.

**Fix:** Use the invoice ID as a dedup key — check if a voice credit with that `stripe_payment_id` already exists before inserting.

---

## Gap 3: `purchase-voice-credits` Uses Anon Key for Subscription Check (Bypass Risk)

**File:** `supabase/functions/purchase-voice-credits/index.ts` (lines 43-51)

The function checks if the user has a Business subscription using the anon-key Supabase client (RLS-scoped). This is actually fine for reading, but the voice credits balance check (lines 54-63) also uses the anon client. Since `voice_credits` RLS allows users to view their own credits, this works — but if a user somehow had a stale session or RLS was misconfigured, they could bypass the 60-minute cap. Using the admin client for this server-side validation would be more robust.

**Severity:** Low — defense-in-depth improvement.

---

## Gap 4: Webhook `customer.subscription.deleted` Resets to `trial` (Logic Bug)

**File:** `supabase/functions/stripe-webhook/index.ts` (lines 215-232)

When a subscription is canceled in Stripe, the webhook sets `plan_type: 'trial'`. This means a user who cancels their paid plan gets reclassified as a trial user — potentially re-triggering trial auto-provisioning logic (15 free voice minutes) if they've never had trial credits before. They should be set to `expired` or `canceled`, not `trial`.

**Fix:** Change `plan_type: 'trial'` to `plan_type: subscription.metadata?.plan_type || 'growth'` and keep `status: 'canceled'`. Or introduce a dedicated `'free'` plan type for post-cancellation.

---

## Recommended Implementation Order

| Priority | Gap | Risk |
|----------|-----|------|
| High | Gap 2: `invoice.paid` duplicate credits | Double-billing voice minutes on webhook retry |
| High | Gap 4: Canceled → trial logic bug | Free voice credits after cancellation |
| Medium | Gap 1: `check-applicant-limit` info leak | Business intelligence exposure |
| Low | Gap 3: Anon key for server-side checks | Defense-in-depth |

Gaps 2 and 4 are quick fixes in `stripe-webhook/index.ts`. Gap 1 is a minor change to strip sensitive fields from the response. Gap 3 is optional hardening.

