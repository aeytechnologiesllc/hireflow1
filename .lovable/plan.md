

## Small Enhancements to Interactive Cards

Two subtle additions — no overdoing it:

### 1. Faint background tint on interactive cards
Add `bg-primary/[0.02]` to `.card-interactive` so clickable cards have the slightest color warmth compared to flat stat cards. Nearly invisible but subconsciously differentiating.

### 2. Chevron subtle entrance animation
Add a one-time gentle slide-in for the `ChevronRight` icons on mobile — a small `animate-fade-in` so the chevron doesn't just appear static but draws the eye once on page load.

### Files to change
- **`src/index.css`** — Add `background-color: hsl(var(--primary) / 0.02)` to `.card-interactive`
- **`src/pages/Jobs.tsx`** — Add `animate-fade-in` class to the ChevronRight icon
- **`src/pages/Applicants.tsx`** — Same
- **`src/pages/Dashboard.tsx`** — Same
- **`src/pages/Notifications.tsx`** — Same
- **`src/pages/Documents.tsx`** — Same
- **`src/components/documents/DocumentRequestCard.tsx`** — Same

Keeps things minimal — just a background tint and a one-shot animation on the chevron.

