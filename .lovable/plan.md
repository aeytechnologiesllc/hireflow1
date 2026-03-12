

## Issues Found

**1. Tooltips reappear every visit** — Both `FeatureDiscoveryTooltip` and `FirstJobTooltip` auto-dismiss after 8 seconds, but if the user navigates away before that timeout fires, the cleanup function cancels the timer and `localStorage` is never written. Next visit, the tooltip shows again. Fix: mark as "seen" in localStorage the moment the tooltip becomes visible, not only on dismiss.

**2. FirstJobTooltip cut off on mobile** — It uses `absolute right-0 bottom-full` positioning relative to the ProcessingModeToggle button. On mobile, this means it anchors to the right edge of a small button, and the tooltip body extends leftward but can get clipped by the card boundary. Fix: Change to a centered fixed overlay on mobile (same pattern as `FeatureDiscoveryTooltip`'s mobile mode).

**3. Analytics pie chart tooltip looks bad** — Recharts applies a default black/white label box on hover. The `contentStyle` sets the container background, but the default label text color remains dark/black, creating poor contrast against the dark card theme. Fix: Add a custom tooltip renderer that displays the label and value with proper theme colors, no boxy container — just clean text with the segment color dot.

---

## Plan

### File: `src/components/FeatureDiscoveryTooltip.tsx`
- In the `useEffect` that sets `isVisible(true)`, immediately also write `localStorage.setItem(storageKey, "dismissed")` at the same time. This way, even if the user navigates away before auto-dismiss or clicking "Got it", the tooltip won't reappear. The "Got it" button and auto-dismiss become purely UI cleanup (hiding the current instance).

### File: `src/components/FirstJobTooltip.tsx`
- Same fix: when `setIsVisible(true)` fires, also write `localStorage.setItem(STORAGE_KEY, "true")`.
- For mobile positioning: detect mobile viewport and render as a centered fixed overlay (with backdrop) instead of the current `absolute right-0 bottom-full` position, matching the pattern used by `FeatureDiscoveryTooltip` on mobile.

### File: `src/pages/Analytics.tsx`
- Replace the default Recharts `<Tooltip>` on the PieChart with a custom `content` renderer that:
  - Uses a borderless, semi-transparent dark card background
  - Shows a small color dot + label + value in `text-foreground` / `text-muted-foreground`
  - No rectangular border box — clean, minimal, premium look
  - Applies to the Application Status donut chart specifically

### Files modified
- `src/components/FeatureDiscoveryTooltip.tsx`
- `src/components/FirstJobTooltip.tsx`
- `src/pages/Analytics.tsx`

