/**
 * Pull a phone's bottom sheet down to close it (src/styles/phone.css; the
 * owner, 2026-11-04: "drawer style things ... a mobile first AAA app").
 *
 * One listener for the whole app, so every sheet gets it without each pop-up
 * knowing: the standard dialogs (.hf-modal-pop) and every cockpit pop-up
 * (.ck-modal > [role="dialog"]). A pull starts on the sheet's top strip (its
 * handle and title) while the sheet is scrolled to its top, follows the
 * finger, and closes the sheet when pulled far enough or flicked; otherwise
 * it springs back. Closing goes the way each sheet already closes: Escape
 * for the standard dialogs, a tap on its scrim for a cockpit pop-up (a pop-up
 * that is busy, saving or sending, ignores both and springs back).
 *
 * Phones only (under 640px, touch). A desktop never sees any of it.
 */

import { hapticLight } from "./haptics";

const SHEET = '.hf-modal-pop[data-state="open"], .ck-modal > [role="dialog"]';
/** How tall the strip a pull can start on is, from the sheet's top edge. */
const HANDLE_PX = 64;
/** Pulled this far, it closes; or a flick. */
const CLOSE_PX = 110;
const FLICK_PX_PER_MS = 0.55;

interface Pull {
  el: HTMLElement;
  startY: number;
  startAt: number;
  dy: number;
  moving: boolean;
}

function settle(el: HTMLElement, to: string, then?: () => void) {
  el.classList.remove("hf-sheet-dragging");
  el.classList.add("hf-sheet-settling");
  el.style.transform = to;
  window.setTimeout(() => {
    then?.();
    window.setTimeout(() => {
      // Still here (a busy pop-up, or the spring back): as it was.
      if (el.isConnected) {
        el.classList.remove("hf-sheet-settling");
        el.style.transform = "";
      }
    }, 320);
  }, 230);
}

function closeSheet(el: HTMLElement) {
  settle(el, "translate3d(0, 100%, 0)", () => {
    if (el.classList.contains("hf-modal-pop")) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      return;
    }
    // A cockpit pop-up closes from its scrim, the layer under the card.
    const scrim = el.parentElement?.firstElementChild;
    if (scrim instanceof HTMLElement && scrim !== el) scrim.click();
  });
}

export function installSheetDrag(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const phone = window.matchMedia("(max-width: 639px)");
  let pull: Pull | null = null;

  const onStart = (e: TouchEvent) => {
    if (!phone.matches || e.touches.length !== 1) return;
    const target = e.target instanceof Element ? e.target : null;
    const el = target?.closest<HTMLElement>(SHEET);
    if (!el || el.scrollTop > 0) return;
    // Fields keep their own touch (a text box, a slider).
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    const y = e.touches[0].clientY;
    if (y - el.getBoundingClientRect().top > HANDLE_PX) return;
    pull = { el, startY: y, startAt: performance.now(), dy: 0, moving: false };
  };

  const onMove = (e: TouchEvent) => {
    if (!pull) return;
    const dy = e.touches[0].clientY - pull.startY;
    if (!pull.moving && dy < 6) {
      if (dy < -6) pull = null; // an upward swipe is the sheet's own scroll
      return;
    }
    pull.moving = true;
    pull.dy = Math.max(0, dy);
    e.preventDefault(); // the sheet moves, not the page under it
    pull.el.classList.add("hf-sheet-dragging");
    pull.el.style.transform = `translate3d(0, ${pull.dy}px, 0)`;
  };

  const onEnd = () => {
    const done = pull;
    pull = null;
    if (!done?.moving) return;
    const speed = done.dy / Math.max(1, performance.now() - done.startAt);
    if (done.dy > CLOSE_PX || (done.dy > 36 && speed > FLICK_PX_PER_MS)) {
      hapticLight();
      closeSheet(done.el);
    } else settle(done.el, "translate3d(0, 0, 0)");
  };

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd, { passive: true });
  document.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);
  };
}
