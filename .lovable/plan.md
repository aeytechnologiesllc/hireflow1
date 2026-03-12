

## Plan: Fix Auth Pages — Fit-to-Screen on Mobile + Update Icon

### Problem
Both `/auth` and `/candidate/auth` pages use `min-h-screen` with `overflow-hidden` on the outer container. Combined with generous spacing (`py-8`, `mb-8`, `p-8` card padding), the content overflows the viewport on phones and Natively web views — and the `overflow-hidden` prevents scrolling. The sign-up form (3 fields + password requirements) is worst affected.

Additionally, both pages still import the old `hireflow-logo.png` instead of the new `app-icon-new.png`.

### Solution

**Layout strategy**: Use `min-h-[100dvh]` (dynamic viewport height — accounts for mobile browser chrome and Natively safe areas) with `overflow-y-auto` as a safety net. Tighten spacing on mobile so content fits without needing to scroll in most cases.

### Changes to both `src/pages/Auth.tsx` and `src/pages/CandidateAuth.tsx`

1. **Swap icon import**: `hireflow-logo.png` → `app-icon-new.png`

2. **Outer container**: Change `min-h-screen overflow-hidden` → `min-h-[100dvh] overflow-y-auto`

3. **Reduce mobile spacing**:
   - Container padding: `py-8` → `py-4 sm:py-8`
   - "Back to Home" link: `mb-8` → `mb-4 sm:mb-8`
   - Logo section: `mb-8` → `mb-4 sm:mb-8`
   - Card padding: `p-8` → `p-5 sm:p-8`
   - Tab bar margin: `mb-8` → `mb-5 sm:mb-8`
   - Form heading margins: tighten `mb-6` → `mb-4 sm:mb-6`
   - Input height: keep `h-12` (good touch target)

4. **Reduce gradient orb sizes on mobile** (GPU + overflow): `w-[500px] h-[500px]` → `w-[300px] h-[300px] sm:w-[500px] sm:h-[500px]`

5. **Version bump**: `package.json` → `1.2.0`

### Files
- `src/pages/Auth.tsx` — layout + icon fix
- `src/pages/CandidateAuth.tsx` — layout + icon fix
- `package.json` — version bump

### What stays unchanged
- All auth logic, validation, Google sign-in, password reset flow
- Desktop appearance (changes only affect mobile breakpoints)
- All other pages

