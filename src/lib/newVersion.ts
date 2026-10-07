/**
 * newVersion.ts: has a newer build of the site gone live since this tab loaded?
 *
 * A tab left open keeps running the code it loaded. On 2026-10-07 the
 * owner's staff tab had been open since before a fix shipped; two and a half
 * hours later it set up an interview with the old code, and the invitation
 * email that the fix had repaired was not sent. Nothing told him, or the
 * tab, that it was out of date (the app only reloads when a page's code can
 * no longer be fetched at all).
 *
 * The site's front page names the build's entry script
 * (/assets/index-<hash>.js), and the hash changes with every build. So a tab
 * can ask for the front page afresh and compare.
 *
 * Pure: the asking and the reloading are src/hooks/useStaffAutoUpdate.ts.
 */

/** The entry script a page of this site names, or null when it names none (the dev server, an error page). */
export function entryScript(html: string | null | undefined): string | null {
  if (typeof html !== "string") return null;
  const match = /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(html);
  return match ? match[0] : null;
}

/** The same, from the address of a script the tab is running. */
export function entryScriptOfUrl(src: string | null | undefined): string | null {
  return entryScript(src);
}

/**
 * Is `live` a different build from the one `running`? Unknown on either side
 * is "no": a tab is never reloaded on a guess.
 */
export function isNewerBuild(running: string | null | undefined, live: string | null | undefined): boolean {
  return !!running && !!live && running !== live;
}

/**
 * Reload now? Only when a newer build is live, and only once for that build:
 * if the reload still lands on the old one (a cache in between), the tab is
 * left alone rather than reloaded in a loop.
 */
export function shouldReloadFor(running: string | null | undefined, live: string | null | undefined, alreadyReloadedFor: string | null | undefined): boolean {
  return isNewerBuild(running, live) && alreadyReloadedFor !== live;
}

/** How often an open staff tab asks. */
export const VERSION_CHECK_MS = 5 * 60_000;
