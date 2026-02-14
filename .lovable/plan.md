

# Employer Portal Visual System Refinement

## Overview
A system-wide design token and global CSS refinement to elevate the Employer Portal to Linear/Stripe-level polish. No component redesigns -- just tuning the underlying color system, spacing, depth, and motion tokens so every page benefits automatically.

---

## 1. Color System Refinement (`src/index.css` -- `.dark` block)

Shift the dark theme backgrounds to a richer blue-tinted dark palette with better depth layering:

| Token | Current | New | Purpose |
|-------|---------|-----|---------|
| `--background` | `220 15% 8%` | `222 47% 7%` | Slightly bluer, closer to #0F172A |
| `--card` | `220 13% 11%` | `222 35% 10%` | Lighter than bg, visible separation |
| `--popover` | `220 13% 12%` | `222 35% 12%` | Distinct from card |
| `--secondary` | `220 13% 15%` | `222 30% 14%` | Interactive surface |
| `--muted` | `220 13% 15%` | `222 30% 14%` | Match secondary |
| `--muted-foreground` | `220 10% 55%` | `220 15% 58%` | Slightly brighter for readability |
| `--border` | `220 12% 18%` | `222 20% 16%` | Subtle but visible |
| `--sidebar-background` | `220 13% 9%` | `222 47% 6%` | 3-4% darker than main bg |
| `--shadow-glow` | `0 0 20px ... 0.15` | `0 0 15px ... 0.12` | 15% less glow intensity |

Text hierarchy (no variable changes needed -- achieved through consistent class usage):
- Headings: `text-foreground` (near-white, ~98%)
- Body: `text-foreground/80` or existing classes
- Meta: `text-muted-foreground` (bumped to 58%)
- Disabled: `opacity-45`

---

## 2. Card and Container Depth (`src/components/ui/card.tsx`)

Update the Card base styles for better depth separation:
- Add `shadow-sm` to default card class
- Ensure border uses low-opacity styling: `border-border/50`
- Keep existing `rounded-lg` (matches 8-12px radius goal)

---

## 3. Spacing and Breathing Room (`src/index.css`)

Add a utility class for consistent section spacing and update main content padding:
- `main` padding in `AppLayout.tsx`: increase from `p-3 md:p-6` to `p-4 md:p-8`
- Add `.section-gap` utility: `@apply space-y-6 md:space-y-8`

---

## 4. Button System Consistency (`src/components/ui/button.tsx`)

Refine button variants for premium feel:
- **Default (primary)**: Add `shadow-sm hover:shadow-md` and `hover:brightness-110`
- **Destructive**: Add `shadow-sm` for depth
- Keep existing active scale (`active:scale-[0.98]`)
- Ensure transitions use `duration-200 ease-in-out`

---

## 5. Table Refinement (`src/components/ui/table.tsx`)

- Strengthen row hover: `hover:bg-muted/60` (up from `hover:bg-muted/50`)
- Add `transition-colors duration-150` to rows
- Add `min-w-0` to table wrapper for flex containment

---

## 6. Dialog Backdrop Enhancement (`src/components/ui/dialog.tsx`)

- Add `backdrop-blur-sm` to `DialogOverlay`
- Already has viewport constraints from previous hardening -- no changes needed there

---

## 7. Header Refinement (`src/components/AppHeader.tsx`)

- Add subtle bottom shadow: `shadow-sm` alongside border
- Add `backdrop-blur-sm` for glass effect when scrolling behind gradient orbs

---

## 8. Sidebar Depth (`src/components/AppSidebar.tsx`)

- Replace gradient background with simpler `bg-sidebar` (which will now be distinctly darker)
- Reduce glow orb opacity from `/20` and `/15` to `/10` and `/8` for subtlety
- Reduce the `animate-pulse-glow` box-shadow intensity by ~15%

---

## 9. Global Animation Tuning (`src/index.css` + `tailwind.config.ts`)

- Standardize transition durations: update `fade-in` from `0.5s` to `0.3s`, `slide-in-left/right` from `0.5s` to `0.3s`
- Ensure all use `ease-in-out` or custom cubic-bezier
- Reduce `pulse-glow` shadow intensity from `0.3/0.5` to `0.25/0.4`

---

## 10. Layout Padding (`src/components/AppLayout.tsx`)

- Increase main content padding from `p-3 md:p-6` to `p-4 md:p-8` for more breathing room
- Apply to both employer and candidate layouts

---

## Files Changed

1. **`src/index.css`** -- Dark theme color tokens, glow intensity, animation durations, section spacing utility
2. **`tailwind.config.ts`** -- Animation duration tuning (fade-in, slide-in)
3. **`src/components/ui/card.tsx`** -- Add shadow and border refinement
4. **`src/components/ui/button.tsx`** -- Add shadow states and transition tuning
5. **`src/components/ui/table.tsx`** -- Stronger hover, transition, flex containment
6. **`src/components/ui/dialog.tsx`** -- Backdrop blur on overlay
7. **`src/components/AppHeader.tsx`** -- Shadow and backdrop-blur
8. **`src/components/AppSidebar.tsx`** -- Reduce glow intensity
9. **`src/components/AppLayout.tsx`** -- Increase main content padding

## What stays unchanged
- All page components (Dashboard, Jobs, Applicants, etc.) -- they inherit changes from tokens
- All modal/dialog consumers -- inherit from base Dialog
- Tooltip, Popover, Dropdown -- already hardened in previous pass
- Auth pages, landing page -- separate light/dark theme
- Sidebar navigation structure and logic
- Mobile responsive behavior

## Why this works
By changing CSS custom properties and base component styles, every page and modal in the Employer Portal automatically gets the refinement without touching individual page files. This is a true design system approach.

