import { useLayoutEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * Night for as long as the page is open, whatever the device says
 * (docs/LAUNCH-PLAN.md, Phase 3: the sign-up page stays dark because it is
 * the bridge from the dark front page; the app after it follows the device).
 *
 * next-themes owns the class on <html>; this holds "dark" there while the
 * page is mounted (re-adding it if the device flips mid-visit) and hands the
 * class back to the person's own theme on the way out. Nothing is stored, so
 * their own choice is untouched.
 */
export function useNightWhileOpen(): void {
  const { resolvedTheme } = useTheme();
  const theirs = useRef(resolvedTheme);
  theirs.current = resolvedTheme;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const hold = () => {
      if (root.classList.contains("light")) root.classList.remove("light");
      if (!root.classList.contains("dark")) root.classList.add("dark");
      if (root.style.colorScheme !== "dark") root.style.colorScheme = "dark";
    };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      watch.disconnect();
      const back = theirs.current === "light" ? "light" : "dark";
      root.classList.remove("light", "dark");
      root.classList.add(back);
      root.style.colorScheme = back;
    };
  }, []);
}
