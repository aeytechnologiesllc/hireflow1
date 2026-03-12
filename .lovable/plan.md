

## Plan: Add App Version Display + Fix Sidebar Bottom Styling

### Problems Identified
1. **No version displayed** — Users (and you) have no way to see the current app version.
2. **Sidebar bottom is cut off** — The sidebar background doesn't extend to the bottom of the screen on mobile. The green gradient/sidebar background stops abruptly, revealing the black background underneath.

### Changes

**1. Add version to `package.json`**
- Update version from `"0.0.0"` to `"1.0.0"` (first Play Store release).

**2. Update `AppSidebar.tsx` — version display + bottom fix**
- Add a subtle version label (e.g., `v1.0.0`) below the Settings nav item in the bottom section. When collapsed on desktop, show as a tooltip.
- Import the version from `package.json` so it stays in sync automatically.
- Add `pb-[env(safe-area-inset-bottom,8px)]` padding to the sidebar's bottom section so it extends fully on notched/mobile devices and doesn't get cut off.
- Ensure the sidebar `aside` element has proper bottom padding so the background color fills the entire height.

### Visual Result
- Sidebar will show "v1.0.0" in small muted text at the very bottom, below Settings.
- On mobile, the sidebar background will extend all the way down with safe-area padding, eliminating the black cutoff.
- On desktop collapsed mode, the version shows as a centered small label.

