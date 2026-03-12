
I reviewed the current implementation in `src/pages/Settings.tsx` and confirmed the toggle component itself is already fixed-size (`46x26`) and non-shrinking, but the row/container spacing is still too tight on small viewports, which can make the right side look clipped.

## Implementation plan

1. Update **Notification** and **Privacy** cards to enforce safer horizontal content padding on mobile.
   - Increase card-content horizontal inset from 16px to 20px where toggle rows live.
   - Keep existing desktop spacing unchanged.

2. Standardize each toggle row with a resilient layout pattern.
   - `flex items-center justify-between`
   - consistent gap between text and toggle
   - ensure full-width row alignment
   - add a small mobile-only right padding safeguard (`max-width: 480px`) so toggles never visually touch the card edge.

3. Harden switch placement in rows without changing switch design.
   - Keep text block as `min-w-0 flex-1` (so text wraps instead of pushing controls).
   - Keep switch `shrink-0` and add a small left offset (`ml-3`) for stable separation from text.

4. Apply the same row/padding pattern to all toggles in the account tab.
   - 6 notification rows + 2 privacy rows use identical structure so right-edge alignment forms one clean vertical column.

5. Do **not** touch `src/components/ui/switch.tsx`.
   - Neon gradient, glow, animation, and dimensions remain exactly as-is.

## Files to modify

- `src/pages/Settings.tsx` only

## Acceptance checks after implementation

- At 320, 360, 390, 414, 480, 768, and desktop widths:
  - toggles are fully visible
  - no clipping on the right side
  - all toggles align to the same right column
  - equal visual spacing from card edge
  - current premium toggle styling remains unchanged
