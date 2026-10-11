import { navigatorLock } from "@supabase/supabase-js";

/**
 * The sign-in lock, with a limit on how long it waits (2026-10-11).
 *
 * Supabase keeps every sign-in step (reading the session, refreshing it,
 * signing in, signing out) one at a time across every copy of the app open
 * in the same browser, using the browser's shared lock. It waits for that
 * lock forever. On a phone, a copy of the app left in the background (the
 * installed app and a Chrome tab of the same site, or a tab the phone has
 * frozen mid-refresh) can hold it and never let go. Then the copy in front
 * waits forever: the owner's installed app sat on "loading", showed the
 * sign-in page after the 8-second watchdog in useAuth, took his password
 * (twice, both accepted) and then hung again, without asking the server for
 * anything (edge logs, 2026-10-11 17:03-17:04 UTC: two successful password
 * sign-ins, no /auth/v1/user and no data request after them).
 *
 * So a step that would wait forever waits AUTH_LOCK_WAIT_MS, then takes the
 * lock over (`steal`), which releases it from whichever copy was holding it.
 * Two copies refreshing at once is safe: Supabase accepts a refresh token
 * used twice within a few seconds. Steps that set their own limit (the
 * background refresh tick asks with 0: "only if free") behave exactly as
 * before.
 */
export const AUTH_LOCK_WAIT_MS = 5000;

/** Called when a step had to take the lock over (for the crash reports). */
let onTakeOver: ((name: string) => void) | null = null;
export function whenAuthLockTakenOver(callback: ((name: string) => void) | null): void {
  onTakeOver = callback;
}

export async function authLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks = globalThis.navigator?.locks;
  // No shared lock in this browser: Supabase itself would run the step
  // straight away.
  if (!locks) return await fn();
  if (acquireTimeout !== -1) return await navigatorLock(name, acquireTimeout, fn);

  // Wait up to AUTH_LOCK_WAIT_MS for the lock. Only a wait that ran out
  // before the step began counts as "held elsewhere": anything the step
  // itself throws (a network error, a refused sign-in) goes back to its
  // caller as ever, and a step never runs twice.
  let started = false;
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), AUTH_LOCK_WAIT_MS);
  try {
    return await locks.request(name, { mode: "exclusive", signal: giveUp.signal }, async () => {
      clearTimeout(timer);
      started = true;
      return await fn();
    });
  } catch (error) {
    clearTimeout(timer);
    if (started || !giveUp.signal.aborted) throw error;
    try {
      onTakeOver?.(name);
    } catch {
      // Reporting must never stand in the way of signing in.
    }
    return await locks.request(name, { mode: "exclusive", steal: true }, async () => await fn());
  }
}
