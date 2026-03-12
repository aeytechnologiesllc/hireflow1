

## Issues Identified

### 1. Dashboard checklist flashes on every login
The `GettingStartedChecklist` shows/hides based on `jobs` and `appStats` data. On login, these queries start as `undefined` (loading), so `showGettingStarted` evaluates to `true` (since `!hasJobs || !hasApplicants` is true when data is undefined/null). Once data loads a moment later, the checklist disappears. This flash happens every login.

**Fix**: Add loading guards — don't show checklist while data is still loading.

### 2. Auth form button hidden behind keyboard on mobile
The auth page uses `min-h-[100dvh]` with `overflow-y-auto`, but when the virtual keyboard opens on mobile, the sign-in button is pushed below the visible area. The page doesn't auto-scroll to keep the focused input and submit button visible.

**Fix**: Add `onFocus` scroll-into-view behavior to auth input fields so the form scrolls up when the keyboard opens, keeping the button visible.

### 3. Google Sign-In fails in Natively (Android WebView)
This is a known Google policy: **Google blocks OAuth sign-in from embedded WebViews** (Android's `WebView` class). The error "disallowed_useragent" or "does not comply with Google's secure browser policy" is intentional — Google requires OAuth to happen in the system browser or Chrome Custom Tabs, not inside a WebView.

**Natively supports this** via their "External URLs" or deep-link settings. The OAuth URL (`accounts.google.com`) must be configured to open in the **external system browser** instead of the in-app WebView. This is a Natively configuration change, not a code change. However, we can also detect WebView and hide the Google button, showing a helpful message instead.

**Fix**: Detect WebView environment and either:
- Open Google OAuth via Natively's `openExternalURL` bridge (if available), or
- Hide the Google sign-in button in WebView and show a note explaining to use email/password instead

### 4. Loading spinner stuck after failed Google sign-in
When Google OAuth fails and the user navigates back, `isGoogleLoading` stays `true` because it's only reset in the error callback, but when the user manually navigates back from Google's page, no error callback fires — the component just remounts with `isGoogleLoading` still in its initial `false` state... Actually, the issue is that the page redirects to Google, and when the user comes back, the auth state listener fires but may leave the page in a limbo state. The `AuthLoadingScreen` could be showing because `authLoading` is `true` during the session check.

**Fix**: Add a timeout or visibility-change listener to reset loading state when the user returns from an OAuth attempt.

---

## Plan

### File: `src/pages/Dashboard.tsx`
- In the `showGettingStarted` memo, add: if `isLoadingJobs` or `isLoadingAppStats`, return `false`. This prevents the checklist from flashing while data loads.

### File: `src/pages/Auth.tsx`
- Add a ref-based scroll helper: when an input receives focus, scroll its container to ensure the submit button is visible. Use `scrollIntoView` on the form's submit button after a short delay (to wait for keyboard animation).
- Reset `isGoogleLoading` on `visibilitychange` event (when user returns from Google OAuth tab/browser).

### File: `src/pages/CandidateAuth.tsx`
- Same scroll-into-view fix for input focus.
- Same `visibilitychange` reset for Google loading state.

### File: `src/hooks/useAuth.tsx`
- Add WebView detection utility. In WebView environments, configure Google OAuth to use `window.open` or show a fallback message.

### Files: `src/pages/Auth.tsx` and `src/pages/CandidateAuth.tsx`
- Detect Natively WebView (check `window.natively` or user-agent for `wv`/`WebView`). If in WebView, hide Google sign-in button and show a subtle note: "Use email sign-in on the app" — OR — use Natively's JS bridge to open the OAuth URL externally.

