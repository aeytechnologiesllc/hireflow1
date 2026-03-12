

## Research: Why HireFlow Lags in Natively on Android + Pull-to-Refresh Conflict

### Why the app lags in Natively (Android)

Natively wraps your web app in an **Android WebView** (not a full browser). WebViews have significantly weaker rendering performance than Chrome, especially for:

1. **`backdrop-blur` / CSS blur filters** — These are GPU-compositing-heavy. Your `AppHeader` uses `backdrop-blur-[2px]` on mobile and `backdrop-blur-sm` on desktop. The `DeveloperLayout` header also uses `backdrop-blur-xl`. Every frame during scroll forces the GPU to re-composite blurred layers. On Android WebView, this causes visible jank.

2. **Large blurred gradient orbs** — Both `AppLayout` and `CandidateLayout` render two `blur-[60px]` gradient divs on mobile (200px and 150px). These persist during scroll and consume GPU resources continuously.

3. **Framer Motion animations running during scroll** — Components like `FloatingParticles`, the MiniAva mascot, and various `motion.div` elements with infinite `repeat` animations compete for the JS thread during scroll events. Android WebView's JS engine is slower than Chrome's.

4. **Custom touch handlers on the root container** — The edge-swipe detection (`onTouchStart/Move/End` on the root div) and the pull-to-refresh touch handlers both intercept touch events on every frame, adding JS overhead during scroll.

5. **No hardware acceleration hints** — The blurred orbs and animated elements don't use `transform: translateZ(0)` or `will-change` to promote layers to the GPU compositor.

**Natively does NOT have an SDK you need to install** for performance. It's a WebView wrapper — the performance depends entirely on how lightweight your web app is. There's no magic SDK fix. The fix is optimizing the web app itself for WebView constraints.

### Pull-to-Refresh Conflict

You're right. **Natively has its own native pull-to-refresh** (documented in their Style settings: "Drag to the bottom to refresh the page"). Your custom `usePullToRefresh` hook adds a competing JS-based pull-to-refresh with touch interception, Framer Motion spring physics, SVG ring animation, and haptic calls — all firing during the same downward swipe gesture. This creates:

- **Double pull-to-refresh** — native one + yours
- **Touch event contention** — your JS handler processes every `touchmove` before the native handler can act
- **Animation overhead** — your green orb + SVG ring animate via Framer Motion during what should be a simple native gesture

---

## Plan: Disable Custom Pull-to-Refresh + Performance Hardening

### 1. Remove custom pull-to-refresh from all pages

**Files**: `src/pages/Dashboard.tsx`, `src/pages/Jobs.tsx`, `src/pages/Applicants.tsx`, `src/pages/Interviews.tsx`, `src/pages/Notifications.tsx`

- Remove `usePullToRefresh` import and usage
- Remove `pullHandlers` spread on container divs
- Remove `<PullIndicator />` rendering
- Let Natively's native pull-to-refresh handle page refresh (it reloads the WebView page)

### 2. Remove the hook file

**File**: `src/hooks/usePullToRefresh.tsx` — Delete entirely. No other files depend on it beyond the 5 pages above.

### 3. Performance optimizations for Android WebView

**File**: `src/components/AppHeader.tsx`
- Remove `backdrop-blur-[2px]` on mobile — change to `bg-card` (solid, no blur) on mobile, keep blur on desktop only: `bg-card md:bg-card/80 md:backdrop-blur-sm`

**File**: `src/components/AppLayout.tsx` (both EmployerLayout and CandidateLayout)
- Remove the two gradient orb divs on mobile (hide with `hidden md:block`) — they add no functional value and hurt scroll performance in WebView
- Keep them on desktop where GPU is not constrained

**File**: `src/components/DeveloperLayout.tsx`
- Same: remove `backdrop-blur-xl` from header on mobile, hide gradient orbs on mobile

### Summary of changes
- 5 page files: remove pull-to-refresh usage
- 1 hook file: delete `usePullToRefresh.tsx`
- 3 layout/header files: remove mobile blur and gradient orbs

No design changes on desktop. Mobile-only performance optimizations.

