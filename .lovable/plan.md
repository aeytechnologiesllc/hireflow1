

## Plan: Fix FirstJobTooltip — Remove Icon, Fix Mobile Overflow

### Problem
The Ava orb icon looks stretched on mobile, and the tooltip's `absolute` positioning with `left-1/2 -translate-x-1/2` causes it to overflow outside the viewport on small screens (390px wide). The `min-w-[280px]` combined with centering on a narrow card pushes it off-screen.

### Changes — `src/components/FirstJobTooltip.tsx`

1. **Remove the Ava orb image** entirely (import + `<motion.img>`)
2. **Fix positioning for mobile** — switch from `absolute` centering to a viewport-safe approach:
   - Use `right-0` anchoring instead of `left-1/2 -translate-x-1/2` to keep it within bounds
   - Replace `min-w-[280px] max-w-[320px]` with `w-[calc(100vw-48px)] max-w-[300px]` for safe mobile sizing
   - Move arrow to align with the "Take Control" button area instead of dead center
3. **Bump version** to `1.1.1` in `package.json`

### Files
- `src/components/FirstJobTooltip.tsx` — remove icon, fix overflow
- `package.json` — version bump

