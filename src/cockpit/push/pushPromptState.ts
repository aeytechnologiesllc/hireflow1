/**
 * The first-time "turn on notifications" card: what it remembers and where it
 * may appear (2026-10-21; docs/PUSH-NOTIFICATIONS.md). No React in this file, so
 * scripts/push_prompt.test.mjs can check the rules; PushPrompt.tsx draws it.
 *
 * It is offered once per person per device, and the answer is remembered in
 * that browser, keyed by the person (a second account on the same phone is
 * asked on its own):
 *   - "Turn on notifications", or the phone's own "Don't allow", or "Got it"
 *     on the iPhone instructions: answered, never again;
 *   - "Not now": hidden for 7 days; a second "Not now": never again.
 * Anything else (closing the app, not answering) leaves it to come back.
 */

export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_NOT_NOW = 2;

export type PromptMemory = { notNow: number; hiddenUntil: number; done: boolean };

export const NOTHING_YET: PromptMemory = { notNow: 0, hiddenUntil: 0, done: false };

export const promptKey = (userId: string) => `hf-push-prompt:${userId}`;

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function readMemory(storage: Reader | null | undefined, userId: string): PromptMemory {
  try {
    const raw = storage?.getItem(promptKey(userId));
    if (!raw) return NOTHING_YET;
    const parsed = JSON.parse(raw) as Partial<PromptMemory> | null;
    const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return { notNow: number(parsed?.notNow), hiddenUntil: number(parsed?.hiddenUntil), done: parsed?.done === true };
  } catch {
    return NOTHING_YET;
  }
}

export function writeMemory(storage: Writer | null | undefined, userId: string, memory: PromptMemory): void {
  try {
    storage?.setItem(promptKey(userId), JSON.stringify(memory));
  } catch {
    /* private browsing: it may come back next visit, which is harmless */
  }
}

/** May the card be offered right now? */
export function canOffer(memory: PromptMemory, now: number): boolean {
  return !memory.done && now >= memory.hiddenUntil;
}

/** "Not now": 7 days, and the second time for good. */
export function afterNotNow(memory: PromptMemory, now: number): PromptMemory {
  const notNow = memory.notNow + 1;
  return notNow >= MAX_NOT_NOW ? { notNow, hiddenUntil: 0, done: true } : { notNow, hiddenUntil: now + SNOOZE_MS, done: false };
}

/** Turned on, refused in the phone's own box, or "Got it": answered. */
export function afterAnswered(memory: PromptMemory): PromptMemory {
  return { ...memory, done: true };
}

/**
 * Pages where a card in the corner (or across the bottom of a phone) would sit
 * on top of something being used: the message box, the decision bar, a job
 * being written. The row in Settings is the other way in, so not there either.
 */
export function promptPageOk(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/settings") return false;
  if (path === "/messages" || path.startsWith("/messages/")) return false;
  if (path.startsWith("/applicants/")) return false;
  // A person opened from inside a job (/jobs/:jobId/applicants/:id) has the same decision bar.
  if (/^\/jobs\/[^/]+\/applicants\//.test(path)) return false;
  if (path.startsWith("/interviews/")) return false;
  if (path === "/jobs/create" || /^\/jobs\/[^/]+\/(edit|create)/.test(path)) return false;
  return true;
}
