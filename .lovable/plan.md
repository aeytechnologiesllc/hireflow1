

# Mobile Onboarding — Final Viewport Fixes

## What Was Found

After thorough review of both onboarding wizards, the overall implementation is solid. The `h-[100dvh]`, `overflow-hidden`, and `mt-auto` pattern is correctly applied across all steps. However, three specific issues remain that could cause overflow on the smallest screens (iPhone SE at 375x667):

### Issue 1: Employer Step 4 — Hard `min-h-[500px]` on LaunchSequence wrapper
**File:** `OnboardingWizard.tsx`, line 810
The LaunchSequence celebration step has `min-h-[500px]` which is a fixed minimum height. On an iPhone SE (667px viewport), after subtracting padding (top 12px + bottom 8px), progress dots (~28px), and the "swipe to navigate" text (~20px), there's only ~600px available. The 500px min-height itself fits, but it prevents the content from shrinking if needed and the wrapper doesn't use `flex-1` to fill remaining space properly.

**Fix:** Replace `min-h-[500px]` with `flex-1` on mobile so it fills remaining viewport space naturally, keep `min-h-[500px]` on desktop only.

### Issue 2: Employer Step 3 — Plan cards can stack too tall
**File:** `OnboardingWizard.tsx`, line 728
Two plan cards stacked vertically with 3 features each can exceed available space on iPhone SE. The `flex-1 min-h-0` on the grid container is correct, but the cards themselves don't have `overflow-hidden` so they won't clip.

**Fix:** Add `overflow-hidden` to the plan grid on mobile so if content is slightly too tall, it clips rather than overflowing the viewport.

### Issue 3: Candidate step indicators outside flex layout
**File:** `CandidateOnboardingWizard.tsx`, lines 421-430
The step indicator dots are rendered after the `flex-1` content container. This means they add extra height (~24px) that's outside the flex calculation, potentially pushing the CTA button slightly off-screen on very small viewports.

**Fix:** Move the step indicators inside the main flex container (before the content area) so they're part of the flex layout calculation and don't add unexpected height.

---

## Changes

### File 1: `src/components/subscription/OnboardingWizard.tsx`

- **Line 810**: Change `min-h-[500px]` to use `flex-1` on mobile:
  - From: `className="flex flex-col items-center justify-center min-h-[500px] w-full"`
  - To: `className={`flex flex-col items-center justify-center w-full ${isMobile ? 'flex-1' : 'min-h-[500px]'}`}`

- **Line 728**: Add `overflow-hidden` to the plan grid on mobile:
  - From: `className={`grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-4xl ${isMobile ? 'flex-1 min-h-0' : 'mb-8'}`}`
  - To: `className={`grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-4xl ${isMobile ? 'flex-1 min-h-0 overflow-hidden' : 'mb-8'}`}`

### File 2: `src/components/subscription/CandidateOnboardingWizard.tsx`

- **Lines 100-101 + 420-430**: Move the step indicators from after the content div to inside the main flex container, right after the opening `div`, before the content area. This ensures they're part of the flex layout calculation.
  - The indicators should be placed similarly to how the Employer wizard does it (before the `AnimatePresence` content block)

---

## What stays unchanged
- All desktop layouts
- All animation logic
- All step content and copy
- Swipe gesture handling
- LaunchSequence component itself
- Background orbs and effects

## Expected result
Every step of both onboarding wizards will fit within the viewport on all mobile devices, including iPhone SE (375x667), with zero scrolling and CTA buttons always visible.
