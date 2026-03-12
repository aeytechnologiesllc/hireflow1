

## Fix Push Notifications - 3 Issues Found

### What's Wrong

I investigated thoroughly and found **3 problems** preventing push notifications from working:

1. **Wrong Natively JS bridge API** -- The hook uses invented method names (`window.natively.onesignal.setExternalUserId`, `window.natively.notifications.requestPermission`) that don't match the actual Natively SDK. The real API uses `new NativelyNotifications()` class with methods like `notifications.setExternalId({externalId}, callback)`, `notifications.requestPermission(fallbackToSettings, callback)`, and `notifications.getOneSignalId(callback)`.

2. **OneSignal API uses deprecated field** -- The edge functions use `include_external_user_ids` which is deprecated. The current API requires `include_aliases: { external_id: [userId] }` with `target_channel: "push"`.

3. **push_subscriptions table is empty** -- Because issue #1 means the device registration code never actually ran correctly, your player ID was never stored in the database. Your device IS registered in OneSignal (visible in the screenshot), but the external user ID was never linked.

### Fixes

**Fix 1: Rewrite `usePushNotifications.ts`**
- Load the Natively SDK script tag in `index.html`
- Use `new NativelyNotifications()` with correct method signatures:
  - `notifications.requestPermission(false, callback)` -- `callback` receives `{status: boolean}`
  - `notifications.setExternalId({externalId: user.id}, callback)` -- links Supabase user ID to OneSignal
  - `notifications.getOneSignalId(callback)` -- `callback` receives `{playerId: string}`
- Store the player ID in `push_subscriptions` table as before

**Fix 2: Update `send-push-notification` edge function**
- Replace `include_external_user_ids: [user_id]` with:
  ```
  include_aliases: { external_id: [user_id] },
  target_channel: "push"
  ```

**Fix 3: Update `send-test-push` edge function**
- Same OneSignal API fix as above

**Fix 4: Update CORS headers** in both edge functions to include the full set of Supabase client headers.

