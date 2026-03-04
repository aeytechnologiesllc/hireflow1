

# Mobile Onboarding Performance Optimization

## Problem
The onboarding screens are jittery and laggy on mobile devices and Telegram mini apps. The root cause is excessive GPU-heavy animations running simultaneously via Framer Motion.

## Key Performance Bottlenecks Identified

### Employer Wizard (`OnboardingWizard.tsx`)
1. **Scan line animation** (line 163-168): Animates `top` property from -10% to 110% infinitely — this triggers layout recalculations every frame instead of using GPU-composited transforms
2. **Two floating orbs** (lines 172-181): Animating `scale` and `opacity` infinitely on large blurred elements (`blur-[120px]`, `blur-[100px]`) — blur is extremely expensive on mobile GPUs
3. **Progress dot glow** (lines 204-213): Each active dot runs an infinite `opacity` animation with `filter: blur(6px)` — another blur compositing cost per frame
4. **Step 0 core orb**: Infinite `boxShadow` animation (3 keyframes) — boxShadow changes trigger paint on every frame
5. **Step 2 AVA orb**: Infinite `boxShadow` + `scale` animation simultaneously
6. **Step 3 trial badge**: Infinite `boxShadow` animation with 3 keyframes
7. **`backdrop-blur-md`** on timeline cards (line 490) — forces compositing layers on every card

### Candidate Wizard (`CandidateOnboardingWizard.tsx`)
1. **Two floating orbs** (lines 88-97): Same blur + scale + opacity infinite animations
2. **Step 0 icon**: `backdrop-blur-sm` on the icon container + `animate-pulse` on a blurred div + infinite `rotate` animation
3. **Step 3 success icon**: Infinite `scale` animation on a blurred div + `backdrop-blur-sm`

### LaunchSequence (`LaunchSequence.tsx`)
4. **Scan line**: Same `top` property animation (layout trigger)
5. **Two background orbs**: Large blurred elements animating infinitely
6. **Multiple exhaust particles**: 4-8 particles each with individual infinite animations

## Solution: Mobile-Only Performance Mode

On mobile (`isMobile`), apply these optimizations while keeping desktop animations unchanged:

### File 1: `OnboardingWizard.tsx`

1. **Remove scan line on mobile** — hide the `motion.div` that animates `top`. It's subtle and not worth the layout cost.
2. **Make floating orbs static on mobile** — remove `animate` and `transition` props, keep them as static decorative blurs with fixed opacity. Use CSS `will-change: transform` and `transform: translateZ(0)` to promote to GPU layer.
3. **Remove progress dot glow on mobile** — remove the inner `motion.div` with blur animation on the active dot. The colored bar is sufficient.
4. **Replace `boxShadow` animations with static shadows on mobile** — for the core orb (step 0), AVA orb (step 2), and trial badge (step 3), use a single static `boxShadow` value instead of animating between 3 keyframes.
5. **Remove `backdrop-blur-md`** from timeline cards on mobile — change to just `bg-card` (opaque background, no blur).
6. **Add `will-change: transform`** to step transition containers for smoother AnimatePresence swaps.

### File 2: `CandidateOnboardingWizard.tsx`

1. **Make floating orbs static on mobile** — same approach: remove `animate`/`transition`, keep as static decorative elements.
2. **Remove `backdrop-blur-sm`** from icon containers on mobile.
3. **Remove `animate-pulse`** on blurred decorative divs on mobile — use static opacity.
4. **Remove infinite `rotate`** animation on the briefcase icon on mobile.
5. **Simplify step 3 success glow** — remove the infinite `scale` animation on the blurred div.

### File 3: `LaunchSequence.tsx`

1. **Replace `top` scan line animation with `translateY`** on mobile — use `y` property instead of `top` to keep it on the compositor thread.
2. **Make background orbs static on mobile** — remove infinite animations.
3. **Reduce exhaust particles from 4/8 to 2/4 on mobile** — fewer concurrent animations.

### General Approach
- Every change is gated behind `isMobile` — desktop stays identical
- Replace Framer Motion `animate` props with static CSS where possible on mobile
- Eliminate all `backdrop-blur` on mobile (the single most expensive CSS property on mobile GPUs)
- Eliminate all infinite `boxShadow` animations on mobile (triggers paint every frame)
- Keep entrance/exit animations (fade, slide) — these are one-shot and fine

## Files Changed
1. `src/components/subscription/OnboardingWizard.tsx`
2. `src/components/subscription/CandidateOnboardingWizard.tsx`
3. `src/components/animations/LaunchSequence.tsx`

