

## Plan: Fix Toggle Switch Overflow on Narrow Viewports

### Problem
The toggle rows use `flex justify-between` but the text `div` has no `min-width: 0` constraint, so it can push the switch outside the container. The switch itself also lacks `flex-shrink: 0`.

### Changes

**`src/pages/Settings.tsx`** — Fix all toggle rows (lines 276-346, 357-375)

Every toggle row currently looks like:
```tsx
<div className="flex items-center justify-between">
  <div>
    <p>...</p>
    <p>...</p>
  </div>
  <Switch ... />
</div>
```

Change each to:
```tsx
<div className="flex items-center justify-between gap-4">
  <div className="min-w-0 flex-1">
    <p>...</p>
    <p>...</p>
  </div>
  <Switch className="shrink-0" ... />
</div>
```

This applies to all 8 toggle rows (6 notification + 2 privacy).

Key fixes:
- `gap-4` — consistent spacing between text and switch
- `min-w-0 flex-1` on the text div — allows text to shrink and wrap instead of pushing the switch out
- `shrink-0` on Switch — prevents the switch from being compressed

No changes to the Switch component itself — visual design stays the same.

### Files
- `src/pages/Settings.tsx`

