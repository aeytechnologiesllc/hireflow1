
# Fix Stripe Webhook Signature Verification for Deno

## Problem
Your Stripe webhook endpoint is set up correctly in the Stripe Dashboard, and the `STRIPE_WEBHOOK_SECRET` is already saved. However, the webhook edge function uses `stripe.webhooks.constructEvent()` (synchronous, Node.js crypto), which can fail in the Deno runtime. It needs to use the async version with Deno's SubtleCrypto provider.

Additionally, after your previous payment, the `sync-subscription` function was never called (zero logs), meaning the `onComplete` callback from the embedded checkout didn't fire successfully. This could be a timing issue or the Stripe component not supporting `onComplete` as expected with this version.

## Changes

### 1. Fix webhook signature verification (`supabase/functions/stripe-webhook/index.ts`)
Replace the synchronous `constructEvent` with the async Deno-compatible version:

```text
// Before (may fail in Deno)
event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

// After (Deno-compatible)
event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  webhookSecret,
  undefined,
  Stripe.createSubtleCryptoProvider()
);
```

### 2. Add retry logic to EmbeddedCheckoutDialog (`src/components/subscription/EmbeddedCheckoutDialog.tsx`)
The `onComplete` callback may not fire reliably. Add a polling fallback: after the checkout form loads, periodically check if the subscription has been synced. Also add a manual "Refresh" button so users can trigger sync themselves if needed.

### 3. Manually fix your current subscription
Since the webhook wasn't working when you paid, I'll note that once the webhook fix is deployed, future payments will work automatically. For your current payment, clicking "Refresh access" on the trial-expired screen should call `sync-subscription` which checks Stripe directly by email -- this should pick up your active subscription.

## Technical Details

### Webhook function changes:
- Make the handler `async` for `constructEventAsync`
- Use `Stripe.createSubtleCryptoProvider()` for Deno compatibility
- Keep the fallback JSON parse when no webhook secret is configured (dev mode)

### EmbeddedCheckoutDialog changes:
- Add a small delay (3 seconds) after `onComplete` fires before syncing, to give Stripe time to finalize
- Add a "Having trouble? Click to refresh" link as manual fallback
- Keep existing fallback sync on dialog close

## Files Changed
1. `supabase/functions/stripe-webhook/index.ts` -- Fix `constructEvent` to async Deno-compatible version
2. `src/components/subscription/EmbeddedCheckoutDialog.tsx` -- Add delay + manual refresh fallback
