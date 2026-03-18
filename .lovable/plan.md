

## Current Issues & Plan

### Problem Summary

1. **Build is broken** — `@tiptap/react` is imported in `rich-textarea.tsx` but missing from `package.json`. Nothing deploys until this is fixed, which is why you see none of the Google sign-in changes live.

2. **Google Sign-In in Natively** — The code for the compact G button IS already written in `Auth.tsx` (lines 450-470). It will appear once the build is fixed. However, the current implementation uses `supabase.auth.signInWithOAuth` directly instead of the Lovable Cloud managed `lovable.auth.signInWithOAuth`. This needs to be updated for Google OAuth to work properly.

3. **"Back to Home" is a dead loop** — The link goes to `/`, but `Index.tsx` detects Natively and immediately redirects back to `/auth`. So clicking it does nothing visible.

---

### Fix 1: Restore `@tiptap/react` dependency

Add `@tiptap/react@^2.11.5` back to `package.json`. This unblocks the entire build.

### Fix 2: Update Google Sign-In to use Lovable Cloud managed OAuth

**Files: `src/pages/Auth.tsx`, `src/pages/CandidateAuth.tsx`, `src/hooks/useAuth.tsx`**

- Use the Configure Social Login tool to generate the Lovable Cloud auth module
- Replace `supabase.auth.signInWithOAuth` calls with `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
- This ensures Google OAuth works correctly in all environments including Natively WebViews

### Fix 3: Fix "Back to Home" button behavior in Natively

**File: `src/pages/Auth.tsx`**

The "Back to Home" `<Link to="/">` currently navigates to Index.tsx, which detects Natively and redirects right back to `/auth` — a dead loop.

Fix: When in Natively (`inWebView` is true), change the link behavior. Instead of linking to `/`, it should either:
- Navigate to `/` but with a query param like `?showLanding=true` that Index.tsx respects by skipping the auto-redirect
- This lets the user see the landing page content

**File: `src/pages/Index.tsx`**

- Update the Natively redirect logic (lines 159-168) to check for `?showLanding=true` — if present, skip the auto-redirect and show the landing page
- When in Natively, hide the "Looking for work?" candidate portal link and any candidate-related CTAs since this is employer-focused only
- Keep the Sign In / Get Started buttons pointing to `/auth`

---

### Technical Details

```text
Current flow (broken):
  Auth.tsx "Back to Home" → / → Index.tsx detects Natively → redirects to /auth → loop

Fixed flow:
  Auth.tsx "Back to Home" → /?showLanding=true → Index.tsx sees param, shows landing
  Index.tsx in Natively: hides candidate links, employer-only content
```

All three fixes will ship together. The build fix unblocks deployment, then the Google and navigation fixes go live.

