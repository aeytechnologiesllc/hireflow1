

# Fix Mobile Onboarding Animation (Step 2: "How AVA Works For You")

## Problem
The Step 2 journey map animation has several issues on mobile:
- The SVG-based S-curve with `offsetPath` CSS animations has poor support on mobile Safari and some Android browsers, causing the AVA orb to not animate or render incorrectly
- Absolutely positioned step cards overlap with SVG nodes and overflow the container
- The bottom cards ("You Review", "Interview Winners") get cut off
- The CTA button ("See What You Get") is pushed below the visible area or hidden

## Solution
Replace the mobile SVG journey with a clean **vertical timeline layout** using standard Framer Motion animations (no `offsetPath` dependency). Keep the desktop SVG animation unchanged.

## Technical Changes

### File: `src/components/subscription/OnboardingWizard.tsx`

**Replace the mobile branch** (lines 448-741, the `isMobile ? (...)` block) with a simple vertical timeline:

- **Layout**: A vertical flex column with a glowing center line (CSS, not SVG)
- **Each step**: A row with the step number circle on the timeline line, and the card beside it (alternating left/right)
- **Animation**: Staggered fade-in-up using Framer Motion `variants` (reliable on all browsers)
- **AVA orb**: A simple pulsing orb at the top of the timeline that animates downward once, using standard `y` transform (no `offsetPath`)
- **Sizing**: Cards use `w-full` within a constrained container, no absolute positioning, no overflow

**Vertical timeline structure:**
```
  [AVA Orb - pulsing at top]
       |
  [1] ---- [Post a Job card]
       |
  [2] ---- [Candidates Apply card]
       |
  [3] ---- [AVA Screens card]
       |
  [4] ---- [You Review card]
       |
  [5] ---- [Interview Winners card]
```

**Key implementation details:**
- Each step is a flex row: `items-center gap-4`
- Timeline line is a vertical `div` with `w-0.5 bg-gradient-to-b from-primary via-purple-500 to-cyan-500` connecting the nodes
- Step circles: `w-10 h-10 rounded-full` with number, glow effect via `shadow-[0_0_12px_hsl(var(--primary))]`
- Cards: `p-3 rounded-xl bg-card/80 border border-primary/20` -- same styling as current but in normal flow
- Stagger animation: each step fades in with 0.15s delay between them
- Remove the broken `offsetPath` SVG orb animation entirely for mobile

**Fix CTA button:**
- Ensure the "See What You Get" button and the "AVA Difference" callout card are visible without excessive scrolling
- Reduce `mb-8` spacing on the journey section to `mb-6` on mobile
- The key benefit callout box text can be slightly smaller on mobile (`text-xs` instead of `text-sm`)

### No other files changed
- Desktop SVG animation remains untouched
- All other onboarding steps (0, 1, 3, 4) remain unchanged

