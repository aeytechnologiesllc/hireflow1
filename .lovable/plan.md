

## Redesign FeatureDiscoveryTooltip — Smart Positioning + Premium Styling

### Root Cause
The tooltip uses `position: absolute` with CSS transforms (`left-1/2 -translate-x-1/2`) and no viewport awareness. On a 390px mobile screen, the 256px tooltip overflows.

### Solution
Rewrite `FeatureDiscoveryTooltip` to use **Radix Popover** (already installed) for desktop and a **centered fixed overlay** for mobile. Same props API — no changes needed in consumers (`Applicants.tsx`, `Dashboard.tsx`).

### Changes — `src/components/FeatureDiscoveryTooltip.tsx`

**Desktop (>768px):** Use Radix `Popover` in controlled mode (`open={isVisible}`). `PopoverTrigger asChild` wraps children. `PopoverContent` with `collisionPadding={16}` handles flipping/clamping automatically. Remove the manual arrow div — Radix handles positioning.

**Mobile (<=768px):** Render a fixed centered card overlay:
- `fixed inset-0 z-50 flex items-center justify-center` backdrop
- Card: `max-w-[320px] w-[calc(100vw-48px)]` centered
- Tap backdrop or "Got it" to dismiss

**Premium styling (both modes):**
```
bg-[rgba(12,18,32,0.88)] backdrop-blur-xl
border border-primary/15
rounded-2xl shadow-2xl shadow-black/40
```

**Animation:** Framer Motion `opacity: 0→1, scale: 0.96→1, duration: 0.18s`

**Content layout:**
- Optional icon + title (`font-semibold text-sm`) + description (`text-xs opacity-75`)
- "Got it" button full-width, outline variant
- Remove the X close button (redundant)

**Keep unchanged:** localStorage dismiss logic, auto-dismiss timer, `resetFeatureDiscovery` exports, component props API.

### Files Modified
- `src/components/FeatureDiscoveryTooltip.tsx` — full rewrite of rendering logic

### No changes needed
- `src/pages/Applicants.tsx` — same API
- `src/pages/Dashboard.tsx` — same API

