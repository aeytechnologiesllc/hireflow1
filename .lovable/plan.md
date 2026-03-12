

## Plan: Fix Empty Screen Issues on Lazy-Loaded Pages

### Root Cause

Two issues combine to create "empty screen" behavior:

1. **Invisible lazy-load fallback**: The `LazyFallback` component in `App.tsx` renders a completely blank div. When pages like Settings, Team, or Interviews are lazy-loaded on a slower mobile connection, users see an empty screen with no loading indication.

2. **Role resolution race condition**: In `useAuth.tsx`, `loading` is set to `false` after `getSession()` resolves, but `fetchUserRole()` runs asynchronously *after* that. This means `role` can be `null` for a brief period while the app has already stopped showing the loading screen. Pages that depend on `role` (like Settings checking `isEmployer`) may render incorrectly or appear empty during this gap.

### Changes

**1. `src/App.tsx` — Better lazy fallback (line 67-69)**

Replace the blank `LazyFallback` with a visible loading indicator (a centered spinner or skeleton) so users know the page is loading:

```tsx
function LazyFallback() {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
```

**2. `src/hooks/useAuth.tsx` — Defer `loading = false` until role is resolved (lines 71-84)**

Currently `setLoading(false)` fires after `getSession()`, before `fetchUserRole()` completes. Change to only set loading false *after* the role has been fetched:

- Make `fetchUserRole` and `checkTeamMembership` return promises
- In the initial `getSession` handler, await both before calling `setLoading(false)`
- This ensures `role` is always populated before the app renders authenticated content

**3. `src/pages/Settings.tsx` — Add loading guard (line 19-23)**

Add an early return with a loading skeleton if `role` is still `null`, preventing a blank render:

```tsx
if (!user || role === null) {
  return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
}
```

### Files
- `src/App.tsx` — LazyFallback improvement
- `src/hooks/useAuth.tsx` — Fix loading state to wait for role resolution
- `src/pages/Settings.tsx` — Add loading guard

