import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { VERSION_CHECK_MS, entryScript, entryScriptOfUrl, isNewerBuild, shouldReloadFor } from "@/lib/newVersion";

const RELOADED_FOR = "hf-auto-updated-for";

/** The entry script this tab is running, read from the page itself. */
function runningEntry(): string | null {
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const found = entryScriptOfUrl(script.getAttribute("src"));
    if (found) return found;
  }
  return null;
}

/**
 * Keeps a staff tab on the current build (src/lib/newVersion.ts).
 *
 * It asks for the front page now and then (on arrival, every five minutes,
 * and whenever the tab is looked at again). Once a newer build is live, the
 * NEXT move to another page is a full load of that page. Never in the middle
 * of something: a reload only ever happens as the page changes anyway, so an
 * open dialog or a half-written message is not thrown away.
 *
 * Staff only. An applicant may be in the middle of a timed test, and their
 * visits are short: their tabs are left alone.
 */
export function useStaffAutoUpdate(enabled: boolean): void {
  const location = useLocation();
  const live = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || import.meta.env.DEV) return;
    const running = runningEntry();
    if (!running) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/?fresh=${Date.now()}`, { cache: "no-store", headers: { Accept: "text/html" } });
        if (!response.ok) return;
        const found = entryScript(await response.text());
        if (!stopped && isNewerBuild(running, found)) live.current = found;
      } catch {
        // Offline, or the site is mid-deploy: ask again later.
      }
    };
    void check();
    const timer = window.setInterval(check, VERSION_CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  // The page has just changed: if a newer build is live, load it here.
  useEffect(() => {
    if (!enabled || import.meta.env.DEV || !live.current) return;
    let reloadedFor: string | null = null;
    try {
      reloadedFor = window.sessionStorage.getItem(RELOADED_FOR);
    } catch {
      // Storage blocked: without a memory of having reloaded, do not risk a loop.
      return;
    }
    if (!shouldReloadFor(runningEntry(), live.current, reloadedFor)) return;
    try {
      window.sessionStorage.setItem(RELOADED_FOR, live.current as string);
    } catch {
      return;
    }
    window.location.reload();
  }, [enabled, location.pathname]);
}
