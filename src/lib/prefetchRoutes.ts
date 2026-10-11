// Central registry of lazy-route import() thunks.
//
// App.tsx wraps each of these in lazyWithReload() to build the route's
// component; Shell.tsx and AppSidebar.tsx fire the same thunk on
// mouseenter/pointerdown/focus of the matching nav link so the chunk is
// already warm by the time the click lands. Defining each import() call once
// here — instead of once in App.tsx's lazy() and again wherever we want to
// prefetch it — keeps there being exactly one string naming each chunk's
// module path.
//
// Only routes that are both (a) lazy-loaded and (b) reachable from a nav
// item need an entry here — the rest of App.tsx's lazy pages (deep phase
// routes, dev-only pages, etc.) aren't things a user hovers before clicking.
export const routeImporters = {
  // The hiring team's core pages (App.tsx). See warmStaffPages below for
  // when the staff site fetches them on its own.
  "/dashboard": () => import("@/pages/Dashboard"),
  "/jobs": () => import("@/pages/Jobs"),
  "/applicants": () => import("@/pages/Applicants"),
  "/messages": () => import("@/pages/Messages"),
  "/documents": () => import("@/pages/Documents"),
  "/more": () => import("@/cockpit/pages/More"),
  "/interviews": () => import("@/pages/Interviews"),
  "/team": () => import("@/pages/Team"),
  "/analytics": () => import("@/pages/Analytics"),
  "/settings": () => import("@/pages/Settings"),
  "/profile": () => import("@/pages/Profile"),
  "/notifications": () => import("@/pages/Notifications"),
  "/team-portal": () => import("@/pages/TeamPortal"),
  "/apply": () => import("@/pages/ApplyWithCode"),
  "/applications": () => import("@/pages/Applications"),
  "/my-documents": () => import("@/pages/MyDocuments"),
} satisfies Record<string, () => Promise<unknown>>;

type RoutePrefix = keyof typeof routeImporters;

// Module promises are already cached by the browser/bundler once import()
// has been called for a given specifier, so calling an importer twice is
// harmless — but we still guard with a Set to skip the redundant call
// entirely on repeat hover/focus events on the same link.
const warmed = new Set<RoutePrefix>();

/** Warm a lazy route's chunk ahead of navigation. Safe to call repeatedly. */
export function prefetchRoute(prefix: RoutePrefix) {
  if (warmed.has(prefix)) return;
  warmed.add(prefix);
  routeImporters[prefix]().catch(() => {
    // A failed prefetch (offline, a blocked/404'd chunk) shouldn't stick —
    // let a later hover retry it, and the real navigation's
    // lazyWithReload() will still handle a failure at click-time.
    warmed.delete(prefix);
  });
}

/**
 * Given a nav link's `to` path, warm the matching lazy chunk if there is
 * one. Exact matches cover every current nav item; the prefix fallback
 * guards a link ever pointing at a sub-route (e.g. "/applications/:id").
 */
export function prefetchForPath(to: string) {
  if (to in routeImporters) {
    prefetchRoute(to as RoutePrefix);
    return;
  }
  const match = (Object.keys(routeImporters) as RoutePrefix[]).find((prefix) =>
    to.startsWith(prefix + "/"),
  );
  if (match) prefetchRoute(match);
}

/** One applicant's page (/applicants/:id): not a nav item, so not keyed by path. */
export const applicantDetailsImporter = () => import("@/pages/ApplicantDetails");

/** The staff pages fetched in the quiet after the first screen. Documents is
 *  left to a hover or a tap: it carries the PDF tools (about 480 KB
 *  compressed), the heaviest download in the app. */
const STAFF_PAGES_LATER: RoutePrefix[] = ["/dashboard", "/applicants", "/jobs", "/messages", "/interviews", "/more"];

/**
 * The staff site's own page loading (2026-10-11, the performance check).
 * It used to fetch all seven staff pages the moment the app started,
 * Documents and its PDF tools included: about 600 KB compressed competing
 * with the dashboard on a phone, every time the app opened. Now the page
 * being opened (and the dashboard, where signing in leads) is fetched at
 * once, and the rest a few seconds after the first screen is up, when the
 * phone is idle, so moving around stays instant.
 */
export function warmStaffPages(pathname: string) {
  if (/^\/applicants\/[^/]+/.test(pathname)) applicantDetailsImporter().catch(() => {});
  else prefetchForPath(pathname);
  prefetchRoute("/dashboard");
  const later = () => {
    for (const prefix of STAFF_PAGES_LATER) prefetchRoute(prefix);
    applicantDetailsImporter().catch(() => {});
  };
  const schedule = () =>
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(later, { timeout: 4000 });
      else later();
    }, 3000);
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
