import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { VERSION_CHECK_MS, entryScript, entryScriptOfUrl, isBusyPath, isNewerBuild, safeToReloadNow, shouldReloadFor } from "@/lib/newVersion";

const RELOADED_FOR = "hf-auto-updated-for";
/** Once a newer build is known, how often the tab looks for a safe moment. */
const LOOK_FOR_A_MOMENT_MS = 5_000;

/** The entry script this tab is running, read from the page itself. */
function runningEntry(): string | null {
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const found = entryScriptOfUrl(script.getAttribute("src"));
    if (found) return found;
  }
  return null;
}

/** Is the cursor in something that takes typing? */
function inAField(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (element as HTMLElement).isContentEditable === true;
}

/**
 * Keeps every tab on the current build, staff and applicant alike
 * (src/lib/newVersion.ts).
 *
 * It asks for the front page on arrival, every few minutes while the tab is
 * in view, and whenever the tab is looked at again. Once a newer build is
 * live it reloads at the first moment that throws nothing away: on arriving
 * at a page, when the tab is out of view, or after it has sat untouched for
 * a while. Never on a test step, in a call, while signing in or writing a
 * job; never over an open pop-up, a field in use, or anything typed on the
 * page. Once per build: if the reload still lands on the old one, the tab is
 * left alone rather than reloaded in a loop.
 */
export function useAutoUpdate(): void {
  const location = useLocation();
  const live = useRef<string | null>(null);
  const lastTouched = useRef(Date.now());
  const typedHere = useRef(false);
  const previousPath = useRef(location.pathname);

  const reloadIfSafe = useCallback((justArrived: boolean) => {
    if (import.meta.env.DEV || !live.current) return;
    let reloadedFor: string | null = null;
    try {
      reloadedFor = window.sessionStorage.getItem(RELOADED_FOR);
    } catch {
      // Storage blocked: without a memory of having reloaded, do not risk a loop.
      return;
    }
    if (!shouldReloadFor(runningEntry(), live.current, reloadedFor)) return;
    const safe = safeToReloadNow(window.location.pathname, {
      justArrived,
      visible: document.visibilityState === "visible",
      idleMs: Date.now() - lastTouched.current,
      dialogOpen: !!document.querySelector('[role="dialog"], [role="alertdialog"]'),
      typedHere: typedHere.current,
      fieldFocused: inAField(document.activeElement),
    });
    if (!safe) return;
    try {
      window.sessionStorage.setItem(RELOADED_FOR, live.current as string);
    } catch {
      return;
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const running = runningEntry();
    if (!running) return;
    let stopped = false;
    const ask = async () => {
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
    void ask();
    const asking = window.setInterval(ask, VERSION_CHECK_MS);
    const looking = window.setInterval(() => reloadIfSafe(false), LOOK_FOR_A_MOMENT_MS);
    const onVisible = () => void ask();
    const touched = () => {
      lastTouched.current = Date.now();
    };
    const typed = () => {
      typedHere.current = true;
      lastTouched.current = Date.now();
    };
    const touches = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    document.addEventListener("visibilitychange", onVisible);
    for (const name of touches) window.addEventListener(name, touched, { capture: true, passive: true });
    window.addEventListener("input", typed, { capture: true, passive: true });
    window.addEventListener("change", typed, { capture: true, passive: true });
    return () => {
      stopped = true;
      window.clearInterval(asking);
      window.clearInterval(looking);
      document.removeEventListener("visibilitychange", onVisible);
      for (const name of touches) window.removeEventListener(name, touched, { capture: true });
      window.removeEventListener("input", typed, { capture: true });
      window.removeEventListener("change", typed, { capture: true });
    };
  }, [reloadIfSafe]);

  // The page has just changed: nothing of theirs is on the new one yet. Not
  // when the page left was a busy one (a test just handed in, a job just
  // saved): what it sent may still be on its way, so that waits for a quiet
  // moment like any other.
  useEffect(() => {
    const from = previousPath.current;
    previousPath.current = location.pathname;
    typedHere.current = false;
    if (from !== location.pathname) reloadIfSafe(!isBusyPath(from));
  }, [location.pathname, reloadIfSafe]);
}
