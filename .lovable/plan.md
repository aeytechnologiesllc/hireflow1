

## Plan: Redesign Switch to Premium Minimal Style

### Problem
The current toggle is oversized with a loud bright green checked state that looks cheap on the dark theme.

### Design Direction
iOS/Linear-inspired — smaller, muted, sophisticated:

- **Track size**: Slim down to `h-[22px] w-[40px]` — compact and elegant
- **Unchecked**: `bg-muted-foreground/25` with `border border-border/50` — subtle grey pill
- **Checked**: `bg-primary/85` (slightly muted green, not full saturation) with no border — clean transition
- **Thumb**: `h-[16px] w-[16px]`, always `bg-white`, with a refined `shadow-sm` (not heavy `shadow-md`)
- **Translation**: `translate-x-[3px]` unchecked → `translate-x-[20px]` checked
- **Transition**: `duration-150 ease-in-out` — snappy, not sluggish

### File
- `src/components/ui/switch.tsx` — styling only

