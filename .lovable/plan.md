

## Plan: Premium Switch Component Redesign

### Problem
In dark mode, the switch thumb (`bg-background` = 7% lightness) blends into the track (`bg-input` = 16% lightness). The unchecked state is nearly invisible. The overall look is generic and doesn't match the elevated dark theme.

### Design
A larger, higher-contrast switch with:
- **Bigger tap target**: `h-7 w-12` (up from `h-6 w-11`) for easier mobile interaction
- **Unchecked track**: Semi-transparent white border + darker fill for clear visibility
- **Checked track**: Primary green with subtle inner glow
- **Thumb**: Pure white with a soft shadow, ensuring it's always visible against both states
- **Smooth transition**: 200ms spring-like transform + color transition

### Changes — `src/components/ui/switch.tsx`

**Track (Root):**
- Size: `h-7 w-[52px]`
- Unchecked: `bg-muted-foreground/20 border border-muted-foreground/30` — visible grey track
- Checked: `bg-primary` with `shadow-[inset_0_0_12px_rgba(0,0,0,0.1)]`
- Transition: `transition-all duration-200`

**Thumb:**
- Size: `h-5.5 w-5.5` → `h-[22px] w-[22px]`
- Color: Always `bg-white` (not `bg-background`)
- Shadow: `shadow-md` for depth
- Checked translate: `translate-x-[26px]`
- Unchecked translate: `translate-x-[2px]`

### Files
- `src/components/ui/switch.tsx` — styling overhaul only

