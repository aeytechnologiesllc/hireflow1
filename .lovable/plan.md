
# Fix: Consistent Dark Theme Across All Pages

## Problem
The auth page (and other pages) are rendering in light/white mode because the `ThemeProvider` in `App.tsx` has `enableSystem` enabled. When a user's operating system is set to light mode, it overrides the `defaultTheme="dark"` setting, causing pages like `/auth` to appear white instead of dark.

## Root Cause
In `src/App.tsx` line 77:
```tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
```
The `enableSystem` prop tells `next-themes` to use the OS preference, which can be "light" -- overriding the intended dark default.

## Solution
Remove `enableSystem` from the `ThemeProvider` so the app always starts in dark mode. Users can still toggle the theme via the ThemeToggle component inside the dashboard, but the landing page, auth pages, and all other pages will default to dark and stay dark unless explicitly changed.

## Changes

**File: `src/App.tsx`** (line 77)
- Remove `enableSystem` from the `ThemeProvider` props
- Change from: `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>`
- Change to: `<ThemeProvider attribute="class" defaultTheme="dark">`

This single change ensures:
- Landing page stays dark (already has hardcoded dark styles as backup)
- Auth pages (`/auth`, `/candidate/auth`) render in dark mode
- Candidate portal landing renders in dark mode
- Dashboard and all authenticated pages default to dark
- The ThemeToggle in the dashboard still works for users who want to switch
- The theme toggle only affects the logged-in experience, not public pages

No other file changes are needed.
