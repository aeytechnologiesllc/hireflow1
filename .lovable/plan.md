

# Global Layout Containment Hardening

## Problem
Tooltips, popovers, dropdowns, dialogs, and other floating elements can overflow or get clipped at viewport edges, especially on mobile and narrow screens. This needs a systematic fix across all Radix UI primitives and global CSS.

## Solution

Two-pronged approach: (1) global CSS containment rules, and (2) component-level collision padding and viewport constraints on every Radix floating primitive.

---

## Changes

### 1. Global CSS (`src/index.css`)

Add a new containment layer targeting all Radix portal content and flex layout safety:

```text
/* Floating element containment */
[data-radix-popper-content-wrapper] {
  max-width: calc(100vw - 16px) !important;
}

/* Text safety for all floating elements */
[data-radix-menu-content],
[data-radix-popper-content-wrapper] *,
[role="dialog"] * {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* Flex overflow prevention */
.flex {
  min-width: 0;
}
```

Remove the existing aggressive `@media (max-width: 640px) .flex { flex-wrap: wrap; }` rule -- this causes unintended wrapping on flex containers that should stay inline (like button icon+text). Replace with a targeted utility.

### 2. Tooltip (`src/components/ui/tooltip.tsx`)

Add `collisionPadding={8}` prop to `TooltipPrimitive.Content`. This enables Radix's built-in flip+shift collision detection with 8px viewport padding. Also add `max-w-[calc(100vw-24px)]` to the className to cap width on small screens.

### 3. Popover (`src/components/ui/popover.tsx`)

Add `collisionPadding={8}` prop to `PopoverPrimitive.Content`. Add `max-w-[calc(100vw-24px)]` to className.

### 4. Dropdown Menu (`src/components/ui/dropdown-menu.tsx`)

Add `collisionPadding={8}` to `DropdownMenuContent`. Add `max-w-[calc(100vw-24px)]` and `max-h-[calc(100vh-24px)] overflow-y-auto` to className. Same for `DropdownMenuSubContent`.

### 5. Context Menu (`src/components/ui/context-menu.tsx`)

Add `collisionPadding={8}` to `ContextMenuContent`. Add `max-w-[calc(100vw-24px)]` to className. Same for sub-content.

### 6. Select (`src/components/ui/select.tsx`)

The Select content already uses Radix portal. Add `max-w-[calc(100vw-24px)]` and `max-h-[calc(100vh-24px)]` constraints to `SelectContent` className.

### 7. Menubar (`src/components/ui/menubar.tsx`)

Add `collisionPadding={8}` to `MenubarContent`. Add `max-w-[calc(100vw-24px)]` to className.

### 8. Hover Card (`src/components/ui/hover-card.tsx`)

Add `collisionPadding={8}` to `HoverCardPrimitive.Content`. Add `max-w-[calc(100vw-24px)]` to className.

### 9. Dialog (`src/components/ui/dialog.tsx`)

Already has `w-[calc(100vw-2rem)]` and `max-h-[calc(100vh-2rem)]` -- these are correct. Add `overflow-wrap: break-word` via className for long text safety (already handled by global CSS rule above).

### 10. Alert Dialog (`src/components/ui/alert-dialog.tsx`)

Add mobile viewport safety: `w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg` to match Dialog's existing pattern.

### 11. Sheet (`src/components/ui/sheet.tsx`)

Already uses `w-3/4 sm:max-w-sm` -- safe. Add `overflow-y-auto` to content to prevent tall content from extending past viewport.

### 12. Toast (`src/components/ui/toast.tsx`)

Already constrained via viewport component (`md:max-w-[420px]`). Add `max-w-[calc(100vw-2rem)]` to the Toast component itself to prevent overflow on very small screens.

---

## Files Changed

1. `src/index.css` -- Global containment CSS rules
2. `src/components/ui/tooltip.tsx` -- collisionPadding + max-width
3. `src/components/ui/popover.tsx` -- collisionPadding + max-width
4. `src/components/ui/dropdown-menu.tsx` -- collisionPadding + max-width on content + sub-content
5. `src/components/ui/context-menu.tsx` -- collisionPadding + max-width on content + sub-content
6. `src/components/ui/select.tsx` -- viewport constraints
7. `src/components/ui/menubar.tsx` -- collisionPadding + max-width on content + sub-content
8. `src/components/ui/hover-card.tsx` -- collisionPadding + max-width
9. `src/components/ui/alert-dialog.tsx` -- mobile viewport safety
10. `src/components/ui/sheet.tsx` -- overflow-y-auto
11. `src/components/ui/toast.tsx` -- mobile max-width

## What stays unchanged
- Dialog -- already has correct containment
- Drawer -- already has max-h-[90vh] and overflow handling
- Responsive Dialog -- delegates to Dialog/Drawer, inherits fixes
- All component consumers -- zero changes needed, fixes are at the primitive level

## Key Technical Detail

Radix's `collisionPadding` prop (available on Tooltip, Popover, DropdownMenu, ContextMenu, HoverCard, and Menubar content) activates the built-in Floating UI collision detection. Setting it to `8` means the element will flip sides and shift position to stay at least 8px from any viewport edge. This is the proper way to handle repositioning -- no custom JS needed.

