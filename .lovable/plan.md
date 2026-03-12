

## Plan: Replace Sidebar Logo with New App Icon

### Change
Copy the uploaded app icon to `src/assets/` and update the logo `<img>` in `AppSidebar.tsx` to use it instead of the current `hireflow-logo.png`.

### Steps

1. **Copy file**: `user-uploads://app_icon.png` → `src/assets/app-icon-new.png`
2. **Update `src/components/AppSidebar.tsx`**: Change the import from `hireflow-logo.png` to the new icon, update the `<img>` reference.

No other files affected.

