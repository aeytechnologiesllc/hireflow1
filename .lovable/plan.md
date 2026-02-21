

# Mobile Onboarding Overhaul -- Zero-Scroll, Viewport-Fit Design

## The Core Problem

Both onboarding wizards (Employer and Candidate) use `min-h-screen` with `overflow-y-auto`, allowing content to extend beyond the viewport. On mobile devices (especially smaller iPhones like SE and standard Android phones), elements overflow, buttons get pushed off-screen, and users must scroll to find the action button. The onboarding should feel like swiping through premium cards -- everything visible, action button always reachable.

---

## Design Principles

1. **100dvh viewport lock** -- Use `h-[100dvh]` (dynamic viewport height) instead of `min-h-screen`. This respects the iOS Safari address bar and Android Chrome toolbar, giving us the actual visible area.
2. **Flex column with pinned CTA** -- Every step uses `flex flex-col` with the action button area pinned at the bottom via `mt-auto`, so it is always visible regardless of content above.
3. **Content scales to fit** -- Icons, text, and spacing shrink on mobile. No step should need scrolling.
4. **Progressive disclosure** -- On mobile, show less text per card (shorter descriptions or hide them) so content fits.

---

## Phase 1: Shared Layout Foundation (Both Wizards)

### Changes to `OnboardingWizard.tsx`

**Outer container:**
- Change from `fixed inset-0 ... overflow-y-auto ... py-6 md:py-8` to `fixed inset-0 ... h-[100dvh] overflow-hidden py-4 md:py-8`
- On mobile: `overflow-hidden` prevents any scrolling
- Inner content wrapper: `flex flex-col h-full` so steps can use `flex-1` and `mt-auto`

**Background orbs:**
- Reduce mobile orb sizes from 400px/350px/200px to 200px/150px/100px via responsive classes
- Keeps the premium ambient feel without wasting GPU on invisible pixels

**Progress indicators:**
- Reduce `mb-8` to `mb-4` on mobile
- Reduce dot sizes slightly

### Changes to `CandidateOnboardingWizard.tsx`

**Add `useIsMobile` hook** -- Currently missing entirely.

**Outer container:**
- Change from `min-h-screen ... overflow-y-auto p-4` to `fixed inset-0 h-[100dvh] overflow-hidden p-4`
- Same flex column structure as employer wizard

**Background orbs:**
- Reduce sizes on mobile (same approach)

---

## Phase 2: Employer Onboarding -- Per-Step Mobile Fixes

### Step 0: Welcome ("Hire Smarter, Not Harder")

Current issues: 180px outer rotating ring + 120px core orb + large title + paragraph + button = too tall.

Mobile fix:
- Reduce orb from 120px to 72px, remove the outer dashed ring and middle pulsing ring on mobile (keep just the core orb with glow)
- Remove orbiting particles on mobile (they add visual noise on small screens)
- Title: `text-2xl` on mobile (down from `text-4xl`)
- Subtitle: `text-base` on mobile (down from `text-xl`)
- Reduce `mb-8` spacing to `mb-4`
- Button pinned at bottom with `mt-auto`

### Step 1: What Makes Us Different (Feature Cards)

Current issues: 2x2 grid with full descriptions + stat badges + rotation dots + CTA = requires scrolling.

Mobile fix:
- Switch from 2x2 grid to a **single active card** display on mobile -- show only the currently highlighted feature card with full detail, with small dot indicators below showing which card is active
- This eliminates the need to show all 4 cards at once
- Auto-rotation still works (already implemented)
- Tap dots to manually switch
- Card content area is compact: icon + title + description + stat in one centered card
- CTA pinned at bottom

### Step 2: How AVA Works (Journey Timeline)

Current issues: 5 timeline steps + benefit callout + CTA = too much content.

Mobile fix:
- Reduce timeline card padding from `p-3` to `p-2`
- Reduce step circle from `w-12 h-12` to `w-9 h-9`
- Reduce gap between steps from `gap-4` to `gap-2`
- Move the "AVA Difference" benefit callout into a compact single-line format (icon + short text) instead of the full card
- Reduce or hide description text on cards (show only title)
- CTA pinned at bottom

### Step 3: Pricing/Trial

Current issues: Trial badge + title + billing toggle + 2 plan cards with feature lists + CTA = massive scroll on mobile.

Mobile fix:
- Plan cards: Show condensed version on mobile -- plan name, price, and top 3 features only (hide the rest behind a "and X more" label)
- Reduce plan card padding from `p-4 md:p-6` to `p-3`
- Feature list items: tighter spacing (`space-y-1` on mobile vs `space-y-2`)
- Stack plans vertically (already single column on mobile) but with less vertical space
- CTA pinned at bottom

### Step 4: Launch Sequence

This step already uses `fixed inset-0` and centers content -- it works fine on mobile. No changes needed.

---

## Phase 3: Candidate Onboarding -- Per-Step Mobile Fixes

### Step 0: Welcome ("Welcome to HireFlow")

Current issues: 28x28 icon + large title + subtitle + paragraph + button + step dots = too tall on smaller phones.

Mobile fix:
- Reduce icon from `w-28 h-28` to `w-16 h-16` on mobile
- Inner briefcase icon from `w-12 h-12` to `w-8 h-8`
- Title: `text-2xl` on mobile (down from `text-4xl`)
- Subtitle: `text-base` on mobile (down from `text-xl`)
- Hide or merge the secondary paragraph into the subtitle
- Reduce `space-y-8` to `space-y-4` on mobile
- CTA pinned at bottom

### Step 1: Features Showcase (2x2 Grid)

Current issues: 2x2 grid with descriptions + back/continue buttons = overflows.

Mobile fix:
- Same approach as employer Step 1: switch to **single active card** display on mobile with dot indicators
- Keeps the auto-rotation behavior
- Much less vertical space needed
- Back/Continue buttons pinned at bottom

### Step 2: How It Works (Timeline)

Current issues: 4 timeline steps with connecting line + back/continue buttons.

Mobile fix:
- Reduce step circle from `w-12 h-12` to `w-9 h-9`
- Reduce spacing between steps (`py-4` to `py-2`)
- Shorter description text or hide on mobile (title is enough)
- Title: `text-2xl` on mobile (down from `text-3xl`)
- Buttons pinned at bottom

### Step 3: Ready ("You're All Set!")

Current issues: 32x32 success icon + title + description + pro tip card + back/start buttons.

Mobile fix:
- Reduce icon from `w-32 h-32` to `w-20 h-20` on mobile
- CheckCircle2 from `w-16 h-16` to `w-10 h-10`
- Title: `text-2xl` on mobile
- Pro tip card: reduce padding and text size
- Buttons pinned at bottom

---

## Phase 4: Testing and Edge Cases

- Test on iPhone SE (375x667) -- the smallest common iOS screen
- Test on iPhone 14/15 Pro (393x852) -- standard iOS
- Test on standard Android (360x800, 412x915)
- Verify iOS Safari dynamic viewport (address bar show/hide) works with `100dvh`
- Verify swipe gestures still work on employer wizard
- Verify confetti on candidate completion doesn't cause layout shift
- Verify LaunchSequence overlay doesn't conflict with viewport lock

---

## Files Changed

1. **`src/components/subscription/OnboardingWizard.tsx`** -- Viewport lock, per-step mobile layout fixes for all 5 steps
2. **`src/components/subscription/CandidateOnboardingWizard.tsx`** -- Add `useIsMobile`, viewport lock, per-step mobile layout fixes for all 4 steps

## Files NOT Changed

- `LaunchSequence.tsx` -- Already uses `fixed inset-0`, works fine
- `useSwipeGesture.ts` -- Works correctly
- `use-mobile.tsx` -- Works correctly
- No global CSS changes needed
- No new dependencies

