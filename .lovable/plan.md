

# Skip Landing Page in Native App (Natively)

## Industry Standard

Every major hiring/job app follows the same pattern:

- **Indeed, LinkedIn, Monster, Glassdoor, ZipRecruiter** — native apps **never** show a marketing landing page. On first launch you see either a brief onboarding carousel (2-3 value prop slides) or go straight to login/signup. Returning logged-in users land directly on their dashboard.
- The marketing landing page is a **web-only concept** — it exists for SEO, Google Ads, and browser visitors who haven't committed yet. App store users have already "committed" by downloading.

## Recommended Approach for HireFlow

Detect whether the app is running inside Natively (wrapped WebView) and skip the landing page:

```text
Browser (desktop/mobile):
  / → Landing Page (Index.tsx) → /auth → /dashboard

Natively App:
  / → Redirect to /auth (if not logged in) or /dashboard (if logged in)
```

## Implementation

1. **Detect Natively context** — Natively injects a `window.natively` object or a user-agent marker. Use this to detect we're in the app wrapper.

2. **Update `Index.tsx`** — Add a check at the top: if running in Natively and not logged in → redirect to `/auth`. If logged in → redirect to `/dashboard` (or `/applications` for candidates).

3. **No changes to desktop** — The landing page continues to work exactly as-is for browser visitors.

This is ~10 lines of code in `Index.tsx` — a simple `useEffect` redirect based on the Natively detection.

