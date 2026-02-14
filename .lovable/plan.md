

# Fix: Force Dark Theme on All Public/Auth Pages

## Problem
The auth pages (`/auth`, `/candidate/auth`, `/candidate`) use `bg-background`, which references the theme CSS variable. When a user has previously toggled to light theme in the dashboard, that preference is stored in `localStorage` by `next-themes`. So when they later visit the sign-in page, it renders in light/white mode instead of dark.

Removing `enableSystem` (done previously) only prevents OS preference from overriding -- it doesn't prevent a saved "light" theme choice from applying to public pages.

## Solution
Force these public pages to always render in dark mode by wrapping their content in a `<div className="dark">` container and replacing `bg-background` with explicit dark background colors. This ensures they are always dark regardless of the stored theme preference.

## Changes

### 1. `src/pages/Auth.tsx` (line 362)
- Change outer div from:
  ```tsx
  <div className="min-h-screen bg-background relative overflow-hidden">
  ```
  to:
  ```tsx
  <div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white relative overflow-hidden">
  ```

### 2. `src/pages/CandidateAuth.tsx` (line 273)
- Change outer div from:
  ```tsx
  <div className="min-h-screen bg-background relative overflow-hidden">
  ```
  to:
  ```tsx
  <div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white relative overflow-hidden">
  ```

### 3. `src/pages/CandidatePortalLanding.tsx` (line 27)
- Change outer div from:
  ```tsx
  <div className="min-h-screen bg-background relative overflow-hidden">
  ```
  to:
  ```tsx
  <div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white relative overflow-hidden">
  ```

## How It Works
- The `dark` class on the container forces all child elements using theme variables (like `text-foreground`, `bg-card`, `border-border`) to resolve to their dark theme values
- The explicit `bg-[hsl(220,18%,10%)]` ensures the background is always dark, matching the landing page aesthetic
- This approach is scoped -- the dashboard's theme toggle continues to work independently for authenticated pages
