

# Fix Subscription Security Gaps (Items 1-3)

Three targeted fixes to close the security and data integrity gaps identified in the audit.

---

## Fix 1: Trial Voice Credits Exploit

**File:** `supabase/functions/get-subscription/index.ts` (lines 252-292)

The trial auto-provisioning path inserts 15 minutes every time the balance hits 0, with no duplicate check. A user can exhaust credits, refresh, and get 15 more minutes infinitely.

**Change:** Before inserting trial credits, check if a trial credit record already exists for this user (any status, including exhausted). If one exists, skip provisioning.

```typescript
// Before inserting, check if trial credits were EVER provisioned
const { data: existingTrialCredit } = await supabaseAdmin
  .from("voice_credits")
  .select("id")
  .eq("user_id", user.id)
  .eq("source", "subscription")
  .lte("minutes_granted", 15) // trial-sized allocation
  .maybeSingle();

if (existingTrialCredit) {
  console.log("Trial credits already provisioned previously - skipping");
} else {
  // ...existing insert logic...
}
```

---

## Fix 2: Webhook Signature Verification Fallback

**File:** `supabase/functions/stripe-webhook/index.ts` (lines 26-37)

Currently, if `STRIPE_WEBHOOK_SECRET` or `signature` is missing, the webhook falls back to `JSON.parse(body)` -- allowing anyone to POST a fake event and get a free subscription.

**Change:** Remove the fallback. If secret or signature is missing, reject the request with a 401.

```typescript
if (!webhookSecret || !signature) {
  console.error("Missing webhook secret or signature");
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const event = await stripe.webhooks.constructEventAsync(
  body, signature, webhookSecret, undefined,
  Stripe.createSubtleCryptoProvider()
);
```

---

## Fix 3: Subscription Deduplication in Sync

**File:** `supabase/functions/sync-subscription/index.ts`

After finding a Stripe customer, the function only picks the first active subscription. If a customer has multiple active subs (Growth + Business), it silently ignores the duplicate.

**Change:** After retrieving all active/trialing subscriptions, if there are more than one, cancel all but the most recent one in Stripe, then sync the remaining one.

```typescript
if (allSubscriptions.length > 1) {
  // Sort by created date descending, keep newest
  allSubscriptions.sort((a, b) => b.created - a.created);
  const toCancel = allSubscriptions.slice(1);
  for (const sub of toCancel) {
    logStep("Canceling duplicate subscription", { id: sub.id });
    await stripe.subscriptions.cancel(sub.id);
  }
}
const subscription = allSubscriptions[0];
```

---

## Summary

| Fix | File | Risk Addressed |
|-----|------|---------------|
| 1 | get-subscription/index.ts | Infinite free voice minutes for trial users |
| 2 | stripe-webhook/index.ts | Fake webhook events granting free subscriptions |
| 3 | sync-subscription/index.ts | Customers double-charged with duplicate subs |

All three are edge function changes only -- no database migrations, no frontend changes.

