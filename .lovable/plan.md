

# Premium Onboarding UI Polish + "AI Magic Moment" CTA

## Current State

The `OnboardingWizard.tsx` already implements most of what's requested: glassmorphism cards, radial glow, meaning-driven step animations (JobCardVisual, FunnelVisual, LeaderboardVisual), 250ms transitions, mobile optimization, and "Create Your First Job with AVA" CTA. The code is well-structured.

## What Actually Needs to Change

The current implementation is solid. The main gap is the **"AI Magic Moment"** on the final screen -- instead of just a button, show a job role input with suggestions that makes it feel like you're already using the product.

### 1. Replace Final CTA Screen (Step 4) with Job Role Input

Transform the current step 4 from a simple button into an interactive "Create a Job with AVA" screen:

- Large heading: "Create a Job with AVA"
- Subtext: "Type the role you're hiring for"
- A glassmorphism-styled text input field
- 4 quick-pick suggestion chips below: "Software Engineer", "Customer Support", "Sales Associate", "Marketing Manager"
- Clicking a chip fills the input
- Once a role is entered, show the CTA button: "Generate Workflow →"
- Clicking it calls `handleComplete` (and optionally stores the role for pre-filling job creation)

This creates the "magic moment" where users feel they're already inside the product.

### 2. Minor Layout Polish

- Tighten spacing between the visual card and CTA button on content steps
- Ensure the icon orb glow ring is visible on all steps

### Files Changed

1. `src/components/subscription/OnboardingWizard.tsx` -- replace step 4 CTA with interactive job role input + suggestion chips

