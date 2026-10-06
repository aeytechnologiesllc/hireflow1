import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// SSR-safe initial check to prevent hydration mismatch
function getInitialMobileState(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getInitialMobileState);

  React.useLayoutEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Set initial value before paint (prevents layout shift on mobile)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/** True from `px` of window width up, by the same media query the rest of the
 *  app decides its widths with. Read before the first paint (useSyncExternalStore
 *  reads the query during render), so a layout never flashes in as the other
 *  one. The Applicants list and the full profile share it. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
