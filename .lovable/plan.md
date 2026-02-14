

# Embed Stripe Checkout Inside the App

## Overview
Use your Stripe test publishable key (`pk_test_51SYwD8...`) to embed the Stripe Checkout form directly in a dialog, so users never leave HireFlow to pay.

## Changes

### 1. Update `stripe-checkout` edge function
Switch to embedded mode by adding `ui_mode: "embedded"` and replacing `success_url`/`cancel_url` with `return_url`. Return `clientSecret` instead of `url`.

### 2. Create `EmbeddedCheckoutDialog` component
New file: `src/components/subscription/EmbeddedCheckoutDialog.tsx`
- Uses `loadStripe` with the publishable key
- Wraps `EmbeddedCheckout` inside `EmbeddedCheckoutProvider`
- Renders in a large dialog (full-width on mobile)
- Shows loading spinner while form loads
- On close, syncs subscription state

### 3. Update `useSubscription` hook
Change `createCheckoutSession` mutation to return `clientSecret` instead of `url`.

### 4. Update 5 checkout trigger points
Replace `window.open(url, "_blank")` with opening the embedded dialog:

- **SubscriptionSettings.tsx** -- `handleUpgrade` opens embedded dialog
- **TrialExpiredOverlay.tsx** -- `handleUpgrade` opens embedded dialog
- **UpgradePrompt.tsx** -- `handleUpgrade` opens embedded dialog
- **LimitReachedDialog.tsx** -- `handleUpgrade` opens embedded dialog
- **AvaVoiceButton.tsx** -- `handleUpgrade` opens embedded dialog

Each file gets:
- A `checkoutClientSecret` state variable
- The `EmbeddedCheckoutDialog` component rendered with that secret
- The handler sets the secret instead of opening a new tab

### Technical Details

**Edge function key change:**
```text
// Before
session = stripe.checkout.sessions.create({
  success_url: ...,
  cancel_url: ...,
});
return { url: session.url }

// After
session = stripe.checkout.sessions.create({
  ui_mode: "embedded",
  return_url: successUrl + "?session_id={CHECKOUT_SESSION_ID}",
});
return { clientSecret: session.client_secret }
```

**Stripe publishable key:** Stored directly in the `EmbeddedCheckoutDialog` component since it's a public key (safe for frontend).

## Files Changed
1. `supabase/functions/stripe-checkout/index.ts` -- Embedded mode
2. `src/components/subscription/EmbeddedCheckoutDialog.tsx` -- New component
3. `src/hooks/useSubscription.ts` -- Return clientSecret
4. `src/components/subscription/SubscriptionSettings.tsx` -- Use embedded dialog
5. `src/components/subscription/TrialExpiredOverlay.tsx` -- Use embedded dialog
6. `src/components/subscription/UpgradePrompt.tsx` -- Use embedded dialog
7. `src/components/subscription/LimitReachedDialog.tsx` -- Use embedded dialog
8. `src/components/AvaVoiceButton.tsx` -- Use embedded dialog

