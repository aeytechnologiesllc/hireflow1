

## Plan: Fix Desktop Sidebar — Remove Bottom Anchoring for Notifications/Settings

### Problem
Notifications and Settings are in a separate bottom-anchored section (`shrink-0`), creating a large empty gap between Analytics and Notifications on desktop. The nav area uses `flex-1` which pushes the bottom section down.

### Solution
Move Notifications and Settings into the main nav list (inline with all other items). Only the version label stays at the bottom via `mt-auto`.

### Changes to `src/components/AppSidebar.tsx`

**1. Add Notifications and Settings to each nav items array** (lines 135-164)
- Append `{ icon: Bell, label: "Notifications", to: "/notifications", badge: unreadNotifications || 0 }` and `{ icon: Settings, label: "Settings", to: "/settings" }` to `employerNavItems`, `teamMemberNavItems`, and `candidateNavItems`.

**2. Replace the bottom section** (lines 309-342)
- Remove the separate Notifications/Settings NavItem renders.
- Keep only the version label, styled with `mt-auto` so it sits at the bottom of the flex column.
- Preserve the safe-area padding for mobile.

### Result

```text
Sidebar (flex-col, full height)
 ├ Logo
 ├ Role Badge
 ├ Divider
 ├ Collapse Toggle (desktop)
 ├ Nav (overflow-y-auto, no flex-1)
 │   Dashboard, Jobs, Applicants, Interviews,
 │   Messages, Documents, Team, Analytics,
 │   Notifications, Settings
 ├ (spacer via mt-auto)
 └ Version Label "HireFlow v1.0.0"
```

No changes to mobile behavior, animations, routing, or theme styling.

