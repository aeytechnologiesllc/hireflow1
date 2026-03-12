

## Plan: Premium Pull-to-Refresh Redesign

### Problem
The current pull-to-refresh uses a static `ArrowDown` icon with abrupt CSS transitions — no spring physics, no smooth snap-back, and the indicator feels cheap and jarring.

### Solution — Phantom Wallet-style pull-to-refresh

Replace the indicator with a **minimal glowing orb** that uses spring physics via Framer Motion. No arrow icon, no bordered circle — just a subtle luminous dot that grows and pulses as you pull, then smoothly animates into a spinning state on release.

### Changes — `src/hooks/usePullToRefresh.tsx`

1. **Remove** `Loader2` and `ArrowDown` icon imports
2. **Import** `motion, useSpring, useTransform` from `framer-motion`
3. **Replace PullIndicator** with a premium orb design:
   - A small (8px → 28px) glowing circle using `bg-primary` with a soft `box-shadow` glow
   - `useSpring` for the vertical position — gives elastic snap-back when released without reaching threshold
   - Progress ring (SVG `<circle>` with `strokeDashoffset`) that fills as you pull — shows threshold clearly
   - On refresh: orb pulses gently with `animate={{ scale: [1, 1.15, 1] }}` loop + rotation on the ring
   - On release (below threshold): spring animates back to `translateY(0)` with `stiffness: 400, damping: 30`
4. **Smooth pullProgress reset**: Instead of instantly setting `setPullProgress(0)`, animate it down via spring so the orb shrinks smoothly
5. **Add haptic at threshold crossing**: Fire a light haptic when `pullProgress` crosses the threshold (not just on release), giving tactile feedback that "you've pulled enough"
6. **Version bump** to `1.2.1`

### Visual Design
- Idle: invisible
- Pulling (0-80%): Small translucent primary-colored dot fades in, progress ring fills around it
- Pulling (80-100%): Dot is fully opaque, ring complete, subtle glow intensifies — user knows they can release
- Refreshing: Dot pulses smoothly, ring rotates — no janky spinner icon
- Complete: Dot shrinks and fades out with spring easing

### Files
- `src/hooks/usePullToRefresh.tsx` — full redesign of indicator + spring physics
- `package.json` — bump to `1.2.1`

### No changes needed to consumers
The hook API (`handlers`, `PullIndicator`, `isRefreshing`, `pullProgress`) stays identical — Dashboard, Jobs, Applicants, Interviews, Notifications all work without edits.

