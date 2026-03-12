

## Push Notifications Integration Plan

### Current Notification System
HireFlow already has a robust in-app + email notification system. The `notifications` table captures events, `GlobalNotificationToasts` shows real-time in-app toasts, and `send-notification-email` sends emails via Resend. Push notifications will add a third delivery channel alongside these.

### Notification Events That Will Trigger Push Notifications

**For Employers:**
- New application received
- Document signed by candidate
- Phase completed by candidate
- Reschedule requested by candidate
- Voice minutes low / exhausted
- Candidate ready for interview

**For Candidates:**
- Application status updates (rejected, hired, offered)
- Interview scheduled / cancelled / rescheduled
- New message from employer
- Document sent for signing
- Document requested
- Phase advanced

---

### Phase 1: Store OneSignal Credentials
- Add `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` as secrets
- These will be used by edge functions to call the OneSignal API

### Phase 2: Create `send-push-notification` Edge Function
- New edge function that accepts `user_id`, `title`, `message`, and optional `url`
- Looks up the user's OneSignal `player_id` (external user ID) from a new `push_subscriptions` table
- Calls the OneSignal REST API to deliver the push notification
- Respects user notification preferences (same as email)

### Phase 3: Database - `push_subscriptions` Table
- New table: `push_subscriptions` with columns: `id`, `user_id`, `player_id` (OneSignal player ID), `platform` (ios/android/web), `created_at`
- RLS: users can manage their own subscriptions
- This table maps HireFlow users to their OneSignal device IDs

### Phase 4: Frontend - Register Device on Login
- After authentication, call the Natively OneSignal JS bridge to get the player ID
- Upsert the player ID into `push_subscriptions` table
- Use Natively's `window.natively.notifications` API to register the device

### Phase 5: Hook Push Notifications into Existing Events
- Modify `send-notification-email` to also call `send-push-notification` after sending email (or create a unified `send-notification` dispatcher)
- Alternatively, add a database trigger on `notifications` INSERT that calls the push function
- The trigger approach is cleaner -- every notification row insertion automatically triggers a push

### Phase 6: Test Notification Endpoint
- Create a `send-test-push` edge function
- Accepts a `user_id` and sends a test push notification ("HireFlow is connected! Push notifications are working.")
- Add a "Send Test Notification" button in Settings for easy testing

---

### Technical Details

**OneSignal API call pattern:**
```text
POST https://onesignal.com/api/v1/notifications
Headers: Authorization: Basic <REST_API_KEY>
Body: {
  app_id: <APP_ID>,
  include_external_user_ids: [<user_id>],
  headings: { en: "title" },
  contents: { en: "message" },
  url: "<deep_link>"
}
```

**Natively JS bridge for device registration:**
```text
window.natively.notifications.getPermissionStatus()
window.natively.notifications.requestPermission()
// OneSignal external user ID is set via Natively's OneSignal integration
// which maps to the user's auth ID
```

**Database trigger approach (preferred):**
A Postgres trigger on `notifications` INSERT calls `send-push-notification` via `pg_net` HTTP extension, so every notification automatically gets a push sent without modifying existing code.

### Implementation Order
1. Store secrets (ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY)
2. Create `push_subscriptions` table with RLS
3. Create `send-push-notification` edge function
4. Create `send-test-push` edge function
5. Add frontend device registration logic (Natively bridge)
6. Add database trigger on `notifications` table to auto-send pushes
7. Add "Send Test Notification" button in Settings

