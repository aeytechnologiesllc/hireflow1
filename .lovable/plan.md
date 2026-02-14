
# Fix: White Buttons on Landing Page

## Problem
The "Hire Talent" and "Find a Job" buttons on the landing page (`/`) use `variant="outline"`, which applies `bg-background` from the theme's CSS variables. The landing page uses hardcoded dark colors (e.g., `hsl(220,18%,7%)`) outside the theme system. When the page first loads, the CSS variable `--background` can briefly resolve to white before the dark theme kicks in, causing the buttons to flash white.

## Solution
Override the background color on those two buttons explicitly with the landing page's dark color scheme, so they never depend on the theme variable.

## Changes

**File: `src/pages/Index.tsx`** (lines 331-347)

- On the "Hire Talent" button (line 333): add `bg-[hsl(220,18%,7%)]` to override the default `bg-background`
- On the "Find a Job" button (line 342): add `bg-[hsl(220,18%,7%)]` to override the default `bg-background`

This ensures the buttons always match the landing page's dark background regardless of theme loading state.

## Technical Details

Current button code:
```tsx
<Button variant="outline" className="border-fuchsia-500/30 hover:border-fuchsia-500 hover:bg-fuchsia-500/10 text-white min-w-[160px]">
```

Updated button code:
```tsx
<Button variant="outline" className="bg-[hsl(220,18%,7%)] border-fuchsia-500/30 hover:border-fuchsia-500 hover:bg-fuchsia-500/10 text-white min-w-[160px]">
```

Same pattern applied to the "Find a Job" button with its emerald colors.
