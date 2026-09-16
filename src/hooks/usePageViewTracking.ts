import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * SPA route-change page-view tracking — the client-side-navigation half of
 * public/beacon.js. beacon.js's own IIFE already reports the very first
 * page load (whatever URL the browser actually requested); this hook
 * reports every subsequent React Router navigation, since those never
 * trigger a fresh page load for beacon.js to run again on its own.
 *
 * Mounted once, near the top of the router tree (see src/App.tsx) so it
 * sees every route change in the app, not just one section's routes.
 */
export function usePageViewTracking(): void {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // beacon.js itself already reported this exact path on initial load;
    // skip the redundant duplicate report the very first time this effect
    // runs for that same path.
    if (lastPath.current === null) {
      lastPath.current = location.pathname;
      return;
    }
    if (location.pathname === lastPath.current) return;
    lastPath.current = location.pathname;

    try {
      const beacon = (window as unknown as { __hfBeacon?: { track: (path: string) => void } }).__hfBeacon;
      beacon?.track(location.pathname);
    } catch {
      // Telemetry must never break navigation.
    }
  }, [location.pathname]);
}
