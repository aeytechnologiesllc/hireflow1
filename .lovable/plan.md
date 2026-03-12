
What’s going wrong right now (root causes)

1) Mobile paywall isn’t scrollable  
- The expired-trial payment screen is a fixed fullscreen overlay centered with no vertical overflow handling.
- On small screens, the card height exceeds viewport, so lower plan/action content is inaccessible.

2) You did pay, but access didn’t unlock in-app  
- Your payment account is `vivdnxt@gmail.com` (not `viddnxt...`), and there is an active Stripe subscription (`sub_1T9xA7JoMc2msNl4O980OpID`).
- But your backend subscription row is still `trial + expired`, so app gating keeps showing paywall.

3) Auto-update path is currently broken  
- Webhook logs show signature verification failure (“No signatures found matching expected signature”), so automatic DB activation didn’t run.

4) Fallback sync path is not reliable enough  
- In checkout UI, sync result is treated as success even when `synced: false` (false-positive success state).
- No observed sync function calls in current user network snapshot during the stuck state.
- There is “pending sync” recovery logic in layout, but the flag is never actually set anywhere, so that recovery path is effectively dead.

5) Redirect/congrats flow mismatch  
- Checkout return URL is wired to `/settings?subscription=success`, not dashboard-first.
- Success handling is concentrated in Settings; if flow occurs elsewhere or callback timing misses, user can land back in purchase UI and feel looped.

6) Welcome toast behavior is too sticky for this context  
- “Welcome back” toast is shown from auth and not tuned for quick-dismiss behavior during immediate gated-screen transitions.

Implementation plan

1. Fix mobile paywall scrolling first (critical UX blocker)
- Update `TrialExpiredOverlay` to mobile-safe scroll:
  - outer container: `overflow-y-auto`, `items-start` on mobile, safe vertical padding.
  - inner card: viewport-aware max-height to keep CTAs reachable.
- Preserve desktop centered behavior.

2. Make subscription activation deterministic (no false positives)
- In `EmbeddedCheckoutDialog`:
  - only mark payment complete when `syncSubscription` returns `synced === true`.
  - add timed retry sequence (short backoff) before exposing manual refresh.
  - never show success modal if backend still not synced.
- Keep manual “I already paid — Refresh access” as hard fallback.

3. Globalize success handling (not Settings-only)
- Move/duplicate `subscription=success` handling into `AppLayout` so it works from any route.
- After successful sync:
  - clear query params
  - unlock access immediately
  - route user to `/dashboard` if they came from blocked state
  - show success feedback once.

4. Repair backend auto-sync channel
- Validate webhook signing secret for the current endpoint and rotate it if mismatched.
- Keep strict signature verification (secure), but improve logs for fast diagnosis.
- Ensure this path updates subscription row reliably so UI unlocks even without manual refresh.

5. Fix welcome toast timing
- Shorten welcome toast display duration (quick smooth fade, ~1.2–1.8s) in:
  - `src/pages/Auth.tsx`
  - `src/pages/CandidateAuth.tsx`
- Keep warnings/errors at normal readable durations.

Technical details (files to touch)

- `src/components/subscription/TrialExpiredOverlay.tsx`
- `src/components/subscription/EmbeddedCheckoutDialog.tsx`
- `src/components/AppLayout.tsx`
- `src/pages/Settings.tsx` (de-duplicate with global success handler)
- `src/pages/Auth.tsx`
- `src/pages/CandidateAuth.tsx`
- `supabase/functions/stripe-checkout/index.ts` (return flow consistency)
- `supabase/functions/sync-subscription/index.ts` (result semantics for retries)
- `supabase/functions/stripe-webhook/index.ts` + secret config verification

Validation checklist (end-to-end)

- Mobile 390x844: paywall fully scrollable; all plan/actions reachable.
- Complete checkout once:
  - app unlocks immediately (no “pay again” loop)
  - user ends on dashboard with success feedback
  - backend subscription row becomes active with Stripe IDs.
- Simulate delayed webhook:
  - retry sync path still unlocks correctly.
- Confirm welcome toast appears quickly and dismisses quickly/smoothly.
