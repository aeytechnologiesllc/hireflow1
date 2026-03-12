

## Make Clickable Tiles Visually Interactive

### Problem
Clickable cards across the app (Jobs, Applicants, Dashboard, Notifications, Documents, etc.) only have `hover:border-primary/50` and `cursor-pointer` -- subtle cues that don't clearly communicate interactivity, especially on the dark theme.

### Approach
Add a layered hover effect to all clickable cards: a slight upward lift (`hover:-translate-y-[1px]`), a soft glow shadow, and a subtle background brightness shift. This maintains the premium dark aesthetic while making interactivity unmistakable.

Since these cards all use the shared `<Card>` component from `src/components/ui/card.tsx`, the cleanest approach is to create a reusable CSS class or a variant pattern, then apply it consistently.

### Implementation

**1. Add a shared utility class in `src/index.css`**
```css
.card-interactive {
  @apply transition-all duration-200 cursor-pointer 
         hover:border-primary/50 hover:-translate-y-[1px] 
         hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.15)]
         active:translate-y-0 active:shadow-none;
}
```

**2. Apply `card-interactive` to all clickable Card instances across ~12 files:**
- `src/pages/Jobs.tsx` -- JobCard
- `src/pages/Applicants.tsx` -- ApplicantCard
- `src/pages/Dashboard.tsx` -- stat cards, recent applicant cards
- `src/pages/Notifications.tsx` -- notification cards
- `src/pages/Documents.tsx` -- document cards
- `src/pages/Interviews.tsx` -- interview cards
- `src/pages/Messages.tsx` -- conversation list items
- `src/pages/TeamPortal.tsx` -- action cards
- `src/components/GettingStartedChecklist.tsx` -- checklist items
- `src/components/documents/DocumentRequestCard.tsx`
- `src/components/subscription/LimitReachedDialog.tsx`
- Any other clickable Card with `cursor-pointer`

Replace verbose inline classes like `hover:border-primary/50 transition-colors cursor-pointer` with just `card-interactive`, keeping any additional conditional classes (like selection rings) alongside it.

### Result
Every clickable tile gets a consistent, premium hover treatment: border glow + micro-lift + shadow bloom + snappy active press-back. Non-clickable cards remain static, creating clear visual hierarchy.

