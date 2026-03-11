

# Mobile-Only Employer Focus + Build Error Fix

## Problem
On mobile view, the landing page and auth page show candidate-related links ("Find a Job", "Looking for work?", "Candidate Portal", "Are you a job seeker?"). These should be hidden on mobile so the experience is strictly employer-focused.

Additionally, there are build errors due to missing `NodeJS` namespace (caused by a previous tsconfig edit removing type declarations).

## Changes

### 1. Fix Build Errors — `tsconfig.app.json`
Add `"types": ["node"]` or use `ReturnType<typeof setTimeout>` pattern. Since this is a Vite/browser project, the cleanest fix is to add a global type declaration for `NodeJS.Timeout` without pulling in all Node types.

Create `src/types/node.d.ts` with:
```typescript
declare namespace NodeJS {
  interface Timeout {}
}
```

### 2. Landing Page (`src/pages/Index.tsx`) — Hide candidate links on mobile

- **Line 174**: "Looking for work?" link — already has `hidden sm:block`, so it's already hidden on mobile. No change needed.
- **Lines 324-348**: "I want to:" role selection with "Hire Talent" and "Find a Job" buttons — wrap the entire section in `hidden sm:flex` so it's hidden on mobile. On mobile, the "Get Started" button already goes to `/auth` (employer).
- **Line 591**: Footer "Candidate Portal" link — add `hidden sm:inline` to hide on mobile.

### 3. Auth Page (`src/pages/Auth.tsx`) — Hide candidate links on mobile

- **Lines 400-405**: "Looking for work? Go to Candidate Portal" — wrap in `hidden sm:block`.
- **Lines 795-801**: "Are you a job seeker? Visit the candidate portal" — wrap in `hidden sm:block`.

All changes use Tailwind responsive classes so candidate links remain visible on desktop but are completely hidden on mobile (< 768px).

