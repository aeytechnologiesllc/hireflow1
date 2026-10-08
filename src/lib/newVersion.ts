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
 * At first only staff tabs did this, and only as they moved to another page.
 * The same evening the owner sat on one applicant's page while a new set-up
 * screen went live, opened it without changing page, and got the old one.
 * His words: "you also need to make sure that it will force reload ... all
 * the applicants applying, they're not going to see a new version unless you
 * do a hard refresh." So every tab does it now, staff and applicant, at the
 * first moment that throws nothing away (safeToReloadNow below): never in a
 * test or a call, never over an open pop-up or something being typed.
 *
 * Pure: the asking and the reloading are src/hooks/useAutoUpdate.ts.
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

/** How often an open tab asks, while it is being looked at. */
export const VERSION_CHECK_MS = 3 * 60_000;

/** How long a tab in view must have been left untouched before it reloads under the person's eyes. */
export const IDLE_BEFORE_RELOAD_MS = 45_000;

/**
 * Pages a reload must never interrupt, whoever is on them: an applicant's
 * test step or interview room (everything below their application's own
 * page), the team's interview room, signing in or coming back from it, the
 * short application forms, and writing a job.
 */
export function isBusyPath(pathname: string | null | undefined): boolean {
  const path = typeof pathname === "string" ? pathname : "";
  return (
    /^\/applications\/[^/]+\/./.test(path) ||
    /^\/interviews\/[^/]+\/room(\/|$)/.test(path) ||
    /^\/jobs\/(create|create-legacy|edit)(\/|$)/.test(path) ||
    /^\/(auth|oauth|join-team)(\/|$)/.test(path) ||
    /^\/candidate\/(auth|apply|continue)(\/|$)/.test(path)
  );
}

/** What the tab is doing at this moment. */
export interface ReloadMoment {
  /** The page has just changed (and the one left was not a busy one). */
  justArrived: boolean;
  /** The tab is in view. */
  visible: boolean;
  /** How long since the person last touched it. */
  idleMs: number;
  /** A pop-up is open. */
  dialogOpen: boolean;
  /** Something was typed, chosen or uploaded on this page since arriving. */
  typedHere: boolean;
  /** The cursor is in a field. */
  fieldFocused: boolean;
}

/**
 * Is this a moment a reload throws nothing away?
 *  - never on a busy page;
 *  - on arriving at a page: yes, nothing of theirs is on it yet;
 *  - otherwise only with no pop-up open, nothing typed here and no field in
 *    use, and then when the tab is out of view, or has been left untouched
 *    for IDLE_BEFORE_RELOAD_MS.
 */
export function safeToReloadNow(pathname: string | null | undefined, moment: ReloadMoment): boolean {
  if (isBusyPath(pathname)) return false;
  if (moment.justArrived) return true;
  if (moment.dialogOpen || moment.typedHere || moment.fieldFocused) return false;
  return !moment.visible || moment.idleMs >= IDLE_BEFORE_RELOAD_MS;
}
