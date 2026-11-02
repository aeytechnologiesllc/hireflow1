/**
 * loadRecovery.ts — a page whose code did not load whole reloads itself.
 *
 * Live, 2026-11-02 (the second Zulu hiring run): an applicant on Safari, on
 * a connection that kept dropping ("Load failed"), opened Your applications
 * and got "Something went wrong" fourteen times in four minutes, the error
 * "Cannot access uninitialized variable": a part of the app's code that
 * Safari had only half-loaded. They pressed Refresh until a load came through
 * whole, then carried on. Before this, the app reloaded only when a page's own
 * download failed, and only once a visit (lazyWithReload's flag stayed set),
 * so the second drop on a bad connection always ended on the error screen.
 *
 * Now any of these failures reloads the page by itself, at most once a
 * minute, so a dead connection can never loop it: the error screen shows only
 * when a reload in the last minute already failed the same way.
 *
 * Pure: the reloading is ErrorBoundary.tsx and lazyWithReload.ts.
 */

/** A failure to load the app's own code, not a bug in what it does. */
const LOAD_FAILURE =
  /cannot access uninitialized variable|before initialization|importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|unable to preload css|^load failed$|chunkloaderror|loading chunk \S+ failed/i;

export function isLoadFailure(message: string | null | undefined): boolean {
  return typeof message === "string" && LOAD_FAILURE.test(message.trim());
}

/** The last automatic reload, in sessionStorage (ms since 1970). */
export const RELOAD_AT_KEY = "hf-load-reload-at";
/** How long after one automatic reload another may happen. */
export const RELOAD_GAP_MS = 60_000;

/** May the page reload itself now? Not within a minute of the last time. */
export function mayReloadAgain(lastAt: string | null | undefined, now: number): boolean {
  const last = Number(lastAt);
  return !Number.isFinite(last) || last <= 0 || now - last >= RELOAD_GAP_MS;
}

/**
 * Reload the page for a load failure, once a minute at most. Returns true when
 * a reload was started (the caller shows "Reloading…" meanwhile), false when
 * one already happened in the last minute (the caller shows its error).
 */
export function reloadForLoadFailure(win: Pick<Window, "location" | "sessionStorage"> | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win) return false;
  let lastAt: string | null = null;
  try {
    lastAt = win.sessionStorage.getItem(RELOAD_AT_KEY);
  } catch {
    // No storage (a private window): still reload, once, below.
  }
  const now = Date.now();
  if (!mayReloadAgain(lastAt, now)) return false;
  try {
    win.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    // Without storage the reload still happens; the next failure shows the error.
    if (lastAt === null && (win as { __hfReloaded?: boolean }).__hfReloaded) return false;
    (win as { __hfReloaded?: boolean }).__hfReloaded = true;
  }
  win.location.reload();
  return true;
}
