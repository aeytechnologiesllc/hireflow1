

# Fix: Consistent Dark Theme on ALL Public Pages and Loading Screens

## Problem
Several public-facing pages and loading screens still use `bg-background`, which resolves to white when a user has previously toggled light theme in the dashboard. The user sees an inconsistent flash of white on auth loading, legal pages, and other public screens.

## Rule
- **Public pages** (landing, auth, candidate portal, legal, loading screens, marketing, join team, verify, guest job creator, OAuth callback, 404): ALWAYS dark theme
- **Authenticated dashboard pages**: Respect user's theme preference (toggle between light/dark)

## Pages That Need Fixing

### 1. `src/components/animations/AuthLoadingScreen.tsx` (line 40)
This is the loading screen shown during sign-in -- the exact one the user reported flashing white.
- **From:** `<div className="fixed inset-0 bg-background z-50 ...`
- **To:** `<div className="fixed inset-0 bg-[hsl(220,18%,10%)] z-50 ... dark`

### 2. `src/components/LoadingFallback.tsx` (line 5)
Generic loading fallback that can appear on any route transition.
- **From:** `<div className="min-h-screen ... bg-background ...`
- **To:** `<div className="dark min-h-screen ... bg-[hsl(220,18%,10%)] text-white ...`

### 3. `src/pages/Terms.tsx` (line 7)
Public legal page.
- **From:** `<div className="min-h-screen bg-background">`
- **To:** `<div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white">`
- Also update header (line 9): replace `bg-background/95` and `bg-background/60` with hardcoded dark equivalents

### 4. `src/pages/Privacy.tsx` (line 7)
Public legal page.
- **From:** `<div className="min-h-screen bg-background">`
- **To:** `<div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white">`
- Also update header (line 9): same pattern as Terms

### 5. `src/pages/VerifyDocument.tsx` (lines 80, 91, 106)
Public document verification page -- three separate return blocks.
- Add `dark` class and replace `bg-background` with `bg-[hsl(220,18%,10%)]` on all three outer divs

### 6. `src/pages/JoinTeam.tsx` (lines 289, 300, 329)
Public team invitation page -- three separate return blocks.
- Add `dark` class and replace `bg-background` with `bg-[hsl(220,18%,10%)]` on all three outer divs

### 7. `src/pages/GuestJobCreator.tsx` (lines 460, 467, 469)
Public guest job creator page.
- Add `dark` class and replace `bg-background` on the two outer container divs (loading state at line 460 and main content at line 467)
- The `bg-background/90` on the nav bar (line 469) should also be updated

### 8. `src/pages/OAuthGoogleCallback.tsx` (line 86)
OAuth callback page shown during Google sign-in.
- **From:** `<div className="min-h-screen ... bg-background">`
- **To:** `<div className="dark min-h-screen ... bg-[hsl(220,18%,10%)] text-white">`

### 9. `src/pages/MarketingDemo.tsx` (line 227)
Full-screen marketing demo page.
- **From:** `<div className="fixed inset-0 bg-background ...`
- **To:** `<div className="fixed inset-0 bg-[hsl(220,18%,10%)] ... dark`

### 10. `src/pages/NotFound.tsx` (line 12)
404 page.
- **From:** `<div className="... bg-muted">`
- **To:** `<div className="dark ... bg-[hsl(220,18%,10%)] text-white">`

## Pages NOT Changed (correct as-is)
- `src/pages/Index.tsx` -- Already uses hardcoded dark colors, no `bg-background`
- `src/pages/Auth.tsx` -- Already fixed in previous change
- `src/pages/CandidateAuth.tsx` -- Already fixed in previous change
- `src/pages/CandidatePortalLanding.tsx` -- Already fixed in previous change
- `src/components/AppLayout.tsx` -- Authenticated layout, should respect theme toggle

## Technical Approach
The pattern is the same across all files:
1. Add `dark` CSS class to the outermost container -- this forces all child elements using theme variables to resolve to dark values
2. Replace `bg-background` with `bg-[hsl(220,18%,10%)]` -- this hardcodes the dark background so it cannot be overridden by stored theme preference
3. Add `text-white` where needed for text contrast

This is a scoped, non-breaking change. The dashboard's theme toggle continues to work independently for authenticated pages.
