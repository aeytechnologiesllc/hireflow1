

## Plan: Fix Scrolling Across All Pages on Mobile

### Root Cause

In `AppLayout.tsx`, both the employer and candidate layout wrappers use:

```
className="min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full"
```

The problem: `min-h-screen` combined with `overflow-hidden` breaks scrolling on mobile. Here's why:

- `min-h-screen` means the container **can grow** beyond the viewport — it has no fixed height constraint
- Because it can grow, `flex-1` on the `<main>` element doesn't get a **bounded height**
- Without a bounded height, `overflow-auto` on `<main>` has nothing to overflow against — so no scroll
- On desktop browsers this is less noticeable because content often fits, but on mobile (especially Android WebView / Natively) the viewport is smaller and content overflows with no way to scroll

### Fix

**Change the outer container from `min-h-screen` to `h-[100dvh]`** on both employer and candidate layouts (lines 282 and 391). This:

1. Gives the flex container a **fixed height** equal to the dynamic viewport
2. `flex-1` on `<main>` then fills the remaining space after the header
3. `overflow-auto` on `<main>` now works correctly — content scrolls within the bounded area
4. `100dvh` (dynamic viewport height) accounts for mobile browser chrome bars and Natively safe areas

Also keep `overflow-x-hidden` but remove `overflow-hidden` (vertical) since the fixed height + flex layout handles containment.

### Changes — `src/components/AppLayout.tsx`

**Line 282** (employer layout): Change class from  
`"min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full"`  
to  
`"h-[100dvh] bg-background relative overflow-x-hidden flex w-full"`

**Line 391** (candidate layout): Same change.

### Files
- `src/components/AppLayout.tsx` — two class changes (lines 282 and 391)

