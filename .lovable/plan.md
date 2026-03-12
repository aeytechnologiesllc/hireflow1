

## Fix Visual Hierarchy: Differentiate Static vs Clickable Cards on Mobile

### Problem
Looking at the screenshot, **all cards look the same** — the stat cards (Total, Pending, Reviewing, Interview, Hired) and the clickable applicant card have identical borders and styling. There's no visual distinction between "display-only" and "tappable" elements. The chevron is showing but the stat cards above dilute its signal.

### Solution
Two-pronged approach:

1. **Tone down stat cards** — make them feel like embedded data, not buttons. Remove the card border and use a subtle background fill instead, so they recede visually.

2. **Strengthen clickable card affordance** — increase the `card-interactive` inner glow from `0.1` to `0.15` opacity, and add a subtle left accent border (primary color) to clickable cards on mobile, making them unmistakably tappable.

### Changes

**`src/pages/Applicants.tsx`** — Change stat cards from bordered cards to borderless metric tiles:
- Replace `border-border` with `border-transparent bg-secondary/50` so they look like embedded stats, not interactive cards

**`src/index.css`** — Boost `card-interactive` visibility on mobile:
- Increase inner glow to `0.15` opacity
- Add a left border accent: `border-l-2 border-l-primary/30` on mobile only

**`src/pages/Dashboard.tsx`** — Same treatment for dashboard stat cards (non-clickable ones get `border-transparent`)

This creates a clear visual hierarchy: stat tiles are flat/embedded, clickable cards have a glowing border + chevron + left accent strip.

### Files
- `src/index.css` — stronger mobile `card-interactive` with left accent
- `src/pages/Applicants.tsx` — stat cards use muted style
- `src/pages/Dashboard.tsx` — same for dashboard stats

