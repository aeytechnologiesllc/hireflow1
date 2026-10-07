/**
 * "I just did that myself": a short-lived note that the applicant has just
 * answered an interview on this browser (picked a time, moved it, confirmed
 * it). The application page listens for changes to the interview so it can
 * tell them when the TEAM moves or cancels it; without this note it also
 * announced their own pick back to them as "your interview was rescheduled".
 */
const KEY = (interviewId: string) => `hf-own-interview-change:${interviewId}`;
const WINDOW_MS = 20_000;
const thisVisit = new Map<string, number>();

export function markOwnInterviewChange(interviewId: string | null | undefined, now: number = Date.now()): void {
  if (!interviewId) return;
  thisVisit.set(interviewId, now);
  try {
    window.sessionStorage.setItem(KEY(interviewId), String(now));
  } catch {
    // Storage blocked: remembered for this page only.
  }
}

export function isOwnInterviewChange(interviewId: string | null | undefined, now: number = Date.now()): boolean {
  if (!interviewId) return false;
  let at = thisVisit.get(interviewId) ?? 0;
  try {
    at = Math.max(at, Number(window.sessionStorage.getItem(KEY(interviewId))) || 0);
  } catch {
    // Storage blocked.
  }
  return at > 0 && now - at >= 0 && now - at < WINDOW_MS;
}
