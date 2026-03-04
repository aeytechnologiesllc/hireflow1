

# Premium Onboarding UI Upgrade

## What Changes

Upgrade the visual quality and animation sophistication of `OnboardingWizard.tsx` to feel like Linear/Stripe/Vercel -- adding glassmorphism, radial focus glows, meaning-driven step animations, and tighter layout spacing. Single file change.

## Visual Depth

- Add a **soft radial gradient glow** centered behind the content area (using a CSS `radial-gradient` div) to create depth and focus
- Wrap each step visual in a **glass card** container: `bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-2xl shadow-2xl` (desktop only for backdrop-blur; mobile uses opaque `bg-card/80`)
- Icon orb gets a subtle outer ring glow via a second layered div

## Animation Upgrades (Step Visuals)

**Step 1 -- JobCardVisual (Workflow Generation Simulation):**
- Title line fades in (delay 0.2s)
- Two description lines stagger in (delay 0.4s, 0.5s)
- A mini progress bar animates from 0% to 100% width (delay 0.6s, duration 0.6s)
- Checkmark scales in with a spring (delay 1.2s)
- "Workflow generated" text fades in and briefly glows via `text-shadow` (delay 1.3s)

**Step 2 -- FunnelVisual (AI Screening):**
- 5 candidate circles appear staggered (delay 0.2-0.5s)
- AVA spark icon pulses once in the center (delay 0.7s)
- 3 candidates fade out + scale down (delay 1.0s)
- 2 remaining candidates get a primary border glow (delay 1.2s)

**Step 3 -- LeaderboardVisual (Ranking):**
- 3 bar rows slide in from left (staggered)
- Score bars fill with easing (staggered, delay 0.4-0.7s)
- #1 bar gets a green/primary glow effect after filling
- A small Check icon fades in next to #1 (delay 1.0s)

All animations are one-shot entrance animations (no infinite loops). Duration ~1.5s total per step.

## Layout Tightening

- Reduce icon orb bottom margin: `mb-5 -> mb-3` (mobile), `mb-8 -> mb-5` (desktop)
- Reduce title bottom margin: `mb-2 -> mb-1.5` (mobile), `mb-3 -> mb-2` (desktop)
- Reduce description bottom margin: `mb-6 -> mb-4` (mobile), `mb-10 -> mb-6` (desktop)
- Reduce "Next" button top spacing: `mt-10 -> mt-6` (desktop)

## Background Focus Glow

Add a centered radial gradient div behind the main content:
```
background: radial-gradient(ellipse at center, hsl(var(--primary) / 0.08) 0%, transparent 70%)
```
Positioned absolute, centered, ~600px wide on desktop / ~300px on mobile. Creates a soft spotlight effect.

## Transition Speed

- Step transitions: `duration: 0.4 -> 0.25` for snappier feel
- Slide distance: `y: 30 -> 20` for subtler motion

## Glass Card Wrapper

The step visuals get wrapped in a glass container:
- Desktop: `bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]`
- Mobile: `bg-card/80 border border-white/[0.06] rounded-xl p-4 shadow-lg` (no backdrop-blur for performance)

## CTA Final Screen

Already says "Create Your First Job with AVA" -- no change needed there. The celebratory orb and layout are kept.

## Mobile Performance

- All `backdrop-blur` gated behind `!isMobile`
- No infinite animations added
- Glass card on mobile uses opaque background instead of blur
- Radial focus glow uses small size and low opacity on mobile

## Files Changed

1. `src/components/subscription/OnboardingWizard.tsx` -- upgraded visuals, animations, layout, glass cards

