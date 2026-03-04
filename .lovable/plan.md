

# Simplified 3-Step Employer Onboarding

## What Changes

Replace the current 5-step employer onboarding wizard (Welcome → Features → AVA Workflow → Pricing → Launch) with a streamlined 3-step flow + final CTA screen that explains the hiring process rather than listing features.

## New Structure

**Step 1: Post a Job**
- Briefcase icon in a glowing orb
- Title: "Post a Job"
- Description: "Create a job in seconds. AVA automatically generates screening questions and assessments for the role."
- Visual: Simple animated card showing a job form appearing/completing instantly (a mock job card that fades in with a checkmark)

**Step 2: AVA Screens Candidates**
- Sparkles icon in a glowing orb
- Title: "AVA Screens Candidates"
- Description: "Applicants complete assessments, skill tests, and optional voice interviews. AVA evaluates and ranks every candidate automatically."
- Visual: 3 candidate avatars flowing through a filter/funnel — simple motion of dots entering and fewer exiting, keeping the dark/neon aesthetic

**Step 3: Interview Only the Best**
- Check/Trophy icon in a glowing orb
- Title: "Interview Only the Best"
- Description: "Review top candidates, compare scores, and interview only the most qualified applicants."
- Visual: A mini ranking dashboard — 3 horizontal bars (like a leaderboard) with scores, top one highlighted with primary glow

**Final CTA Screen (Step 4):**
- Strong CTA button: "Create Your First Job with AVA"
- Subtext: "Takes less than 2 minutes. No credit card required."
- Calls `handleComplete` directly (no LaunchSequence animation — keeping it fast and purposeful)

## Layout & Navigation

- Keep `h-[100dvh] overflow-hidden` viewport lock
- Progress indicator changes from dots to "Step 1 of 3" text label (with a thin progress bar underneath)
- One step per screen, swipe navigation preserved on mobile
- Each step: icon + title + description + visual centered in viewport, CTA pinned at bottom via `mt-auto`
- "Next" button with arrow on steps 1-3, final CTA on step 4
- "Back" affordance via tapping progress or swiping right

## Animation Philosophy

**Keep:**
- Subtle background grid pattern
- 2 static ambient orbs (already optimized for mobile)
- Smooth step transitions (fade + slide via AnimatePresence)
- Glow accents on icons and CTA button
- Small floating particles (already optimized)

**Remove:**
- Scan line animation
- Feature card rotator
- SVG S-curve journey path
- Pricing cards and billing toggle
- LaunchSequence celebration
- Complex orb animations (rotating rings, orbiting particles)
- All `boxShadow` keyframe animations

## Visual Style

- Dark background maintained
- Each step's icon sits inside a 64px (mobile) / 96px (desktop) gradient orb with static glow shadow
- Step visuals use simple Framer Motion entrance animations (fade-in + slight y-translate), no infinite loops
- Cards/illustrations use `border-primary/20 bg-card/50` styling consistent with existing dark theme
- Typography: title `text-2xl` mobile / `text-4xl` desktop, description `text-base` mobile / `text-lg` desktop

## Technical Details

### File: `src/components/subscription/OnboardingWizard.tsx`

**Complete rewrite of step content** while keeping:
- The outer container structure (viewport lock, background grid, static orbs)
- `useSubscription`, `usePricing`, `useIsMobile`, `useSwipeGesture` hooks
- `completeOnboarding.mutateAsync()` call
- Swipe gesture integration

**Remove:**
- `HIREFLOW_FEATURES` array
- `WORKFLOW_STEPS` array
- `PLANS` array
- `activeFeature` state + auto-rotation effect
- `billingInterval` state
- `LaunchSequence` import
- All 5 existing step renders

**Add:**
- 3 new step definitions (icon, title, description)
- 3 inline step visuals (simple motion components)
- Step 4 as a CTA-only screen
- "Step X of 3" progress indicator replacing dots

**totalSteps** changes from 5 to 4 (3 content steps + 1 CTA).

### No other files changed
- `CandidateOnboardingWizard.tsx` — not part of this change (candidate flow is separate)
- `LaunchSequence.tsx` — no longer imported, but file stays for potential reuse elsewhere

