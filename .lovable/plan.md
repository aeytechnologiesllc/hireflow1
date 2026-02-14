
# Fix: Subscription Not Activating After Payment

## Root Cause Analysis

After thorough investigation, I found **multiple issues** preventing the subscription from activating after payment:

### Issue 1: Sync Only Triggers on Dialog Close
The `EmbeddedCheckoutDialog` only calls `syncSubscription` when the user manually closes the dialog (`handleOpenChange(false)`). If the user refreshes the page, navigates away, or if there's any interruption, sync never happens. The Stripe `EmbeddedCheckout` component supports an `onComplete` callback that fires when payment succeeds -- we're not using it.

### Issue 2: No Auto-Sync on Return
The checkout sends a `return_url` with `?subscription=success`, but **no code on the Settings page** detects this parameter to trigger a sync. So even if the user lands back on the settings page after payment, nothing happens.

### Issue 3: Malformed Return URL
The return URL is constructed incorrectly:
```text
successUrl = "https://domain.com/settings?subscription=success"
return_url = successUrl + "?session_id={CHECKOUT_SESSION_ID}"
Result:  "...?subscription=success?session_id=..." (double ?)
```
This should use `&` for the second parameter.

### Issue 4: Webhook Not Configured
The `stripe-webhook` edge function exists and is deployed, but **no webhook endpoint is registered in the Stripe Dashboard**. This means Stripe never notifies your backend about successful payments. The webhook is the most reliable way to activate subscriptions (it works even if the user closes their browser).

### Database Evidence
Your subscription record shows:
- `status: expired`, `plan_type: trial`
- `stripe_customer_id: null`, `stripe_subscription_id: null`
- This confirms the webhook never fired and sync was never called

## Fixes

### 1. Update EmbeddedCheckoutDialog -- Use onComplete callback
Add Stripe's `onComplete` callback to automatically trigger sync the moment payment succeeds, without waiting for the user to close the dialog. Also add a success state UI so the user knows payment went through.

### 2. Fix Return URL in stripe-checkout edge function
Change the double `?` to properly append with `&`:
```text
Before: successUrl + "?session_id=..."
After:  successUrl + "&session_id=..."
```

### 3. Add Auto-Sync on Settings Page
When the Settings page loads with `?subscription=success` in the URL, automatically call `syncSubscription` to update the database. This handles the case where the embedded checkout redirects the user.

### 4. Webhook Configuration (User Action Required)
You'll need to register the webhook endpoint in your Stripe Dashboard:
- URL: Your backend webhook function URL
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Then save the webhook signing secret as a backend secret

This is the most reliable path since it works server-to-server without depending on the user's browser.

## Files Changed
1. `src/components/subscription/EmbeddedCheckoutDialog.tsx` -- Add onComplete callback and success UI
2. `supabase/functions/stripe-checkout/index.ts` -- Fix return URL
3. `src/pages/Settings.tsx` -- Add auto-sync on `?subscription=success`

## Technical Details

### EmbeddedCheckoutDialog Changes
```text
- Add onComplete callback to EmbeddedCheckoutProvider options
- When onComplete fires: call syncSubscription, show success message
- Keep the existing dialog-close sync as a fallback
- Add a success state with a "Continue" button
```

### Settings Page Changes
```text
- On mount, check for ?subscription=success in URL
- If found, call syncSubscription automatically
- Show a toast notification for the result
- Remove the query parameter from URL after handling
```
