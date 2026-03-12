

## Make Clickable Tiles Visually Obvious on Mobile (Touch Devices)

### Problem
The `card-interactive` class only uses `hover:` states, which don't exist on touch devices. On mobile, clickable cards look identical to static ones — no visual affordance.

### Solution
Add always-visible cues to `card-interactive` that signal "this is tappable" without relying on hover:

1. **Update `.card-interactive` in `src/index.css`**
   - Add a subtle right chevron-like border accent (via a slightly brighter left or right border) — always visible
   - Add `active:scale-[0.98]` for tactile press feedback on touch (replaces the translate approach on mobile)
   - Add a persistent subtle inner glow/shadow so interactive cards are visually distinct from static ones

2. **Add a chevron icon to clickable cards** in key pages
   - On mobile viewports, append a small `ChevronRight` icon (muted color) to the card's main row, signaling tappability
   - Apply to: `Jobs.tsx`, `Applicants.tsx`, `Dashboard.tsx`, `Notifications.tsx`, `Documents.tsx`, `Interviews.tsx`

### Specific CSS change
```css
.card-interactive {
  @apply transition-all duration-200 cursor-pointer
         border-border/70
         hover:border-primary/50 hover:-translate-y-[1px]
         hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.15)]
         active:scale-[0.98] active:shadow-none;
  /* Always-visible subtle glow on interactive cards */
  box-shadow: inset 0 0 0 0.5px hsl(var(--primary) / 0.08);
}
```

### Files to change
- `src/index.css` — update `.card-interactive` with persistent visual cue + active press scale
- `src/pages/Jobs.tsx` — add `ChevronRight` indicator on mobile
- `src/pages/Applicants.tsx` — same
- `src/pages/Dashboard.tsx` — same for clickable cards
- `src/pages/Notifications.tsx` — same
- `src/pages/Documents.tsx` — same  
- `src/pages/Interviews.tsx` — same
- `src/components/documents/DocumentRequestCard.tsx` — same

