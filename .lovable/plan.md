

# Embed Stripe Checkout Inside the App

## Overview
Instead of redirecting users to `checkout.stripe.com`, we'll embed the Stripe Checkout form directly inside a dialog/modal within HireFlow. This uses Stripe's official **Embedded Checkout** feature.

## How It Works Today
When a user clicks "Subscribe", the app calls the `stripe-checkout` edge function, which returns a Stripe Checkout URL. The app then opens that URL in a new browser tab, taking the user away from HireFlow.

## What Changes

### 1. Install Stripe frontend packages
Add `@stripe/react-stripe-js` and `@stripe/stripe-js` as dependencies. These provide the `EmbeddedCheckoutProvider` and `EmbeddedCheckout` components.

### 2. Update the `stripe-checkout` edge function
Add `ui_mode: "embedded"` to the Checkout Session creation and include a `return_url` (instead of `success_url`). When embedded mode is used, Stripe returns a `client_secret` instead of a URL. The function will return both so existing flows still work if needed.

Key change in the edge function:
- Add `ui_mode: "embedded"` to session creation
- Replace `success_url`/`cancel_url` with `return_url` (Stripe requirement for embedded mode)
- Return `{ clientSecret: session.client_secret }` instead of `{ url: session.url }`

### 3. Create an `EmbeddedCheckoutDialog` component
A new dialog component (`src/components/subscription/EmbeddedCheckoutDialog.tsx`) that:
- Loads `@stripe/stripe-js` with your publishable key
- Wraps the `EmbeddedCheckout` component inside `EmbeddedCheckoutProvider`
- Shows a loading spinner while the checkout form loads
- Renders inside a large dialog/drawer (responsive for mobile)

### 4. Update `useSubscription` hook
Modify `createCheckoutSession` to return `clientSecret` instead of `url`. The mutation will pass the client secret to the embedded checkout dialog.

### 5. Update all 5 checkout trigger points
These files currently do `window.open(url, "_blank")` after getting the checkout URL. They'll instead open the embedded checkout dialog with the client secret:

- `src/components/subscription/SubscriptionSettings.tsx`
- `src/components/subscription/TrialExpiredOverlay.tsx`
- `src/components/subscription/UpgradePrompt.tsx`
- `src/components/subscription/LimitReachedDialog.tsx`
- `src/components/AvaVoiceButton.tsx`

The pattern changes from:
```
const { url } = await createCheckoutSession.mutateAsync({...});
window.open(url, "_blank");
```
To:
```
const { clientSecret } = await createCheckoutSession.mutateAsync({...});
setCheckoutClientSecret(clientSecret); // opens the embedded dialog
```

### 6. Handle completion
After payment, Stripe's embedded checkout redirects within the iframe to the `return_url`. We'll set the return URL to the settings page with a success parameter. When the dialog detects completion or the user closes it, we sync the subscription state.

## Technical Details

### Edge function change (stripe-checkout)
```typescript
const session = await stripe.checkout.sessions.create({
  // ... existing config ...
  ui_mode: "embedded",
  return_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
  // remove success_url and cancel_url
});

return Response(JSON.stringify({ clientSecret: session.client_secret }));
```

### New EmbeddedCheckoutDialog component
```typescript
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Renders inside a Dialog with the Stripe checkout form embedded
```

### Stripe publishable key
The component needs the Stripe **publishable key** (not secret key). This is a public key safe for frontend use. It will need to be added as a `VITE_STRIPE_PUBLISHABLE_KEY` environment variable or hardcoded since it's public.

## Files Changed
1. `supabase/functions/stripe-checkout/index.ts` -- Add embedded mode
2. `src/components/subscription/EmbeddedCheckoutDialog.tsx` -- New component
3. `src/hooks/useSubscription.ts` -- Return clientSecret
4. `src/components/subscription/SubscriptionSettings.tsx` -- Use embedded dialog
5. `src/components/subscription/TrialExpiredOverlay.tsx` -- Use embedded dialog
6. `src/components/subscription/UpgradePrompt.tsx` -- Use embedded dialog
7. `src/components/subscription/LimitReachedDialog.tsx` -- Use embedded dialog
8. `src/components/AvaVoiceButton.tsx` -- Use embedded dialog

