

## Root Cause Found: Missing Natively SDK Script

After reading the official Natively documentation thoroughly, the problem is clear and singular:

**The Natively JS SDK script tag is not in `index.html`.** Without it, `NativelyNotifications` class never exists on the window, so:
- Device registration silently skips (the `if (!window.NativelyNotifications) return` guard)
- `setExternalId` never runs, so OneSignal never maps your user ID to the device
- `push_subscriptions` table stays empty
- Test push via `include_aliases: { external_id: [user.id] }` finds no matching device

The device shows in OneSignal because Natively's native layer registers with OneSignal automatically. But the JS bridge (which sets the external ID mapping) was never loaded.

## Plan

### 1. Add Natively SDK to `index.html`
Add the official script tag per their docs:
```html
<script async onload="nativelyOnLoad()" src="https://cdn.jsdelivr.net/npm/natively@2.20.0/natively-frontend.min.js"></script>
```

### 2. Improve `usePushNotifications.ts` registration flow
Follow the exact pattern from Natively's official JS SDK docs:
- Use `getPermissionStatus` first to check current state
- Only call `requestPermission` if not already granted
- Call `setExternalId` and wait for success confirmation before proceeding
- Call `getOneSignalId` with retry logic (player ID may not be available immediately after first permission grant)
- Add `removeExternalId` on sign-out to clean up

### 3. Add diagnostic logging to `send-test-push` edge function
- Return `recipients` count from OneSignal response so the UI can show whether the notification actually targeted a device
- Log the full OneSignal response for debugging

### 4. No changes needed to OneSignal API calls
The current `include_aliases` approach in both edge functions is correct per current OneSignal API.

### Files to change
- `index.html` — add SDK script tag
- `src/hooks/usePushNotifications.ts` — improved registration with retries and proper flow
- `supabase/functions/send-test-push/index.ts` — return recipients count in response

