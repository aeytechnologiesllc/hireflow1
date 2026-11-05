/**
 * Every tap on a phone is felt (src/lib/haptics.ts; the owner, 2026-11-04:
 * "tactile press feedback"). One listener for the whole app, so no button
 * has to know:
 * - a tab, a switch, a choice in a list or a menu: the selection click;
 * - a button, a card or a row that opens something: a light tap;
 * - a button marked data-haptic="warning" (a pass, a decline, a delete):
 *   the warning;
 * - data-haptic="none" turns it off, and data-haptic names any other feel.
 * On a real tap only (the click a finger makes, never one the code makes,
 * never a scroll that started on a button) and only on a touch screen.
 *
 * It also remembers when the last tap was, so the page motion can tell the
 * app's own back arrow from the phone's own back swipe
 * (src/cockpit/lib/pageMotion.ts).
 */
import { hapticHeavy, hapticLight, hapticMedium, hapticSelection, hapticSuccess, hapticWarning, hapticError } from "./haptics";

const SELECTION =
  '[role="tab"], [role="switch"], [role="radio"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], [role="checkbox"], input[type="checkbox"], input[type="radio"], label:has(> input[type="checkbox"]), label:has(> input[type="radio"])';
const PRESS = 'button, [role="button"], a.ck-btn, a.ck-card, a[data-haptic], summary, [data-thread-row]';

const FEELS: Record<string, () => void> = {
  selection: hapticSelection,
  light: hapticLight,
  medium: hapticMedium,
  heavy: hapticHeavy,
  success: hapticSuccess,
  warning: hapticWarning,
  error: hapticError,
};

let lastTapAt = 0;

/** Whether a finger tapped the page in the last `ms` milliseconds. */
export function tappedWithin(ms: number): boolean {
  return Date.now() - lastTapAt < ms;
}

export function installTapFeel(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const coarse = window.matchMedia?.("(pointer: coarse)");
  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    lastTapAt = Date.now();
    if (!coarse?.matches) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest("[data-hf-haptic]")) return;
    const marked = target.closest<HTMLElement>("[data-haptic]");
    const control = target.closest<HTMLElement>(`${SELECTION}, ${PRESS}`);
    const el = marked ?? control;
    if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
    const named = marked?.dataset.haptic;
    if (named === "none") return;
    if (named && FEELS[named]) return FEELS[named]();
    if (el.matches(SELECTION)) hapticSelection();
    else hapticLight();
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
