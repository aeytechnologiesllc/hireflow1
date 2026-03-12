

## Plan: Android WebView / Natively Scroll & Viewport Fix

### Problem
Several layout containers use patterns that break scrolling on Android WebView:
- `overflow-hidden` on scroll-blocking containers
- `min-h-screen` (uses `100vh` which is static on Android and doesn't account for browser chrome)
- Missing `height: 100%` on `html/body/#root` chain, so flex children can't calculate bounded heights

### Changes

**1. `src/index.css` — Global foundation (line 152-155)**
Add `height: 100%` to `html, body, #root` so the flex layout chain works on Android WebView. Keep `overflow-x: hidden`.

```css
html, body, #root {
  height: 100%;
  overflow-x: hidden;
  max-width: 100vw;
}

body {
  overflow-y: auto;
}
```

**2. `src/components/DeveloperLayout.tsx` (line 100)**
Change `min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full`
→ `h-[100dvh] bg-background relative overflow-x-hidden flex w-full`

Same fix already applied to AppLayout — DeveloperLayout was missed.

**3. `src/components/subscription/OnboardingWizard.tsx` (line 261-263)**
Mobile branch uses `overflow-hidden` which blocks scroll on longer step content.
Change: `isMobile ? "h-[100dvh] overflow-hidden"` → `isMobile ? "h-[100dvh] overflow-y-auto"`

**4. `src/components/subscription/CandidateOnboardingWizard.tsx` (line 85)**
Same fix: `isMobile ? 'h-[100dvh] overflow-hidden'` → `isMobile ? 'h-[100dvh] overflow-y-auto'`

**5. `src/pages/CandidatePortalLanding.tsx` (line 27)**
Change `min-h-screen ... overflow-hidden` → `min-h-[100dvh] ... overflow-y-auto`

**6. `src/pages/Index.tsx` (line 171)**
Change `min-h-screen ... overflow-x-hidden` → `min-h-[100dvh] ... overflow-x-hidden`

**7. `src/pages/NotFound.tsx` (line 12)**
Change `min-h-screen` → `min-h-[100dvh]`

**8. `src/pages/AuthCallback.tsx` (line 65)**
Change `min-h-screen` → `min-h-[100dvh]`

**9. `src/pages/OAuthGoogleCallback.tsx` (line 86)**
Change `min-h-screen` → `min-h-[100dvh]`

**10. `src/pages/GuestJobCreator.tsx` (lines 464, 471)**
Change `min-h-screen` → `min-h-[100dvh]`

**11. `src/pages/Terms.tsx` (line 7)**
Change `min-h-screen` → `min-h-[100dvh]`

**12. `src/pages/VerifyDocument.tsx` (lines 80, 91, 106)**
Change `min-h-screen` → `min-h-[100dvh]`

### Summary
- 12 files touched
- All `min-h-screen` → `min-h-[100dvh]` (dynamic viewport units for Android)
- All scroll-blocking `overflow-hidden` on page-level containers → `overflow-y-auto`
- Global `height: 100%` chain on html/body/#root for proper flex layout in WebView
- No logic or API changes — CSS only

