

## Diagnosis: This is our code issue, not Stripe

Stripe test mode works identically to live mode. The payment went through successfully (confirmed in logs: `sub_1T9xUiJoMc2msNl4hCXvLk6d`, status `active`, Growth plan, $29). The problem is entirely on our side — two bugs:

### Bug 1: `get-subscription` reads with the wrong client
Line 81 of `get-subscription/index.ts` queries the `subscriptions` table using `supabaseClient` (anon/user-auth key). But `sync-subscription` writes using `supabaseAdmin` (service role). Due to RLS or read-consistency differences between these two client contexts, the read returns stale data (`trial/expired`) even after sync successfully wrote `growth/active`.

**Fix**: Change line 81 from `supabaseClient` to `supabaseAdmin`. The function already verifies the user's identity via `auth.getUser()`, so this is safe. Every other query in this function already uses `supabaseAdmin`.

### Bug 2: Webhook signature mismatch (secondary)
The `STRIPE_WEBHOOK_SECRET` stored in secrets doesn't match what Stripe is sending. This means the automatic webhook path (which would update the DB without needing client-side sync) is completely broken. The client-side `sync-subscription` fallback works, but the read bug above prevents the UI from seeing the updated data.

**Fix**: You'll need to update the webhook signing secret from your Stripe Dashboard (Developers → Webhooks → select the endpoint → Signing secret). But fixing Bug 1 alone will resolve the immediate "trial expired" issue since the sync-subscription path is working correctly.

### Changes

1. **`supabase/functions/get-subscription/index.ts`** — Change subscription query from `supabaseClient` to `supabaseAdmin` on line 81, add error logging for `subError`

2. **`src/components/AppLayout.tsx`** — Add a delayed second `refetch()` (500ms) after sync success as insurance, and invalidate the query cache before refetching

