/**
 * A phone's bottom sheet slides away when it closes (the owner, 2026-11-04:
 * "nicer animation, opening, closing"). The standard dialogs already leave
 * by their own animation (src/styles/phone.css, .hf-modal-pop closed); a
 * cockpit pop-up (.ck-modal) and a ⋯ action sheet ([data-action-sheet]) are
 * simply taken out of the page when they close, so the sheet vanished
 * between two frames.
 *
 * Each of them is drawn straight into <body> (createPortal), so one watcher
 * on <body>'s own children sees it go: the moment the app takes it out, it
 * is put back as a picture that cannot be touched or read (inert), its card
 * slides down from wherever it is (a sheet pulled half-way down goes on from
 * there) while its dim fades, and then it is gone for good. The app has
 * already moved on: nothing in it waits for this.
 *
 * Phones only (under 640px), and never with reduced motion.
 */

const LEAVING = "data-hf-leaving";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const MS = 280;

function leavingParts(node: HTMLElement): { card: HTMLElement; scrim: HTMLElement | null } | null {
  if (node.matches(".ck-modal")) {
    const card = node.querySelector<HTMLElement>(':scope > [role="dialog"]');
    if (!card) return null;
    const first = node.firstElementChild;
    return { card, scrim: first instanceof HTMLElement && first !== card ? first : null };
  }
  if (node.matches("[data-action-sheet]")) {
    const card = node.querySelector<HTMLElement>(".hf-action-sheet");
    return card ? { card, scrim: node.querySelector<HTMLElement>(".hf-action-scrim") } : null;
  }
  return null;
}

function slideAway(node: HTMLElement) {
  const parts = leavingParts(node);
  if (!parts) return;
  // Read before it goes back in: a pull (src/lib/sheetDrag.ts) leaves its
  // place on the card's own style; a sheet at rest has none.
  const from = parts.card.style.transform || "translate3d(0, 0, 0)";
  // Put back as it was: its own entrance animations count as long over
  // (src/styles/phone.css, [data-hf-leaving]), so nothing in it plays again.
  node.setAttribute(LEAVING, "");
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  node.style.pointerEvents = "none";
  document.body.appendChild(node);
  const done = () => node.remove();
  const timer = window.setTimeout(done, MS + 200);
  try {
    const slide = parts.card.animate([{ transform: from }, { transform: "translate3d(0, 100%, 0)" }], { duration: MS, easing: EASE, fill: "forwards" });
    parts.scrim?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MS, easing: "ease", fill: "forwards" });
    slide.onfinish = () => {
      window.clearTimeout(timer);
      done();
    };
  } catch {
    window.clearTimeout(timer);
    done();
  }
}

export function installSheetExit(): () => void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined" || !document.body) return () => undefined;
  const phone = window.matchMedia?.("(max-width: 639px)");
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const observer = new MutationObserver((records) => {
    if (!phone?.matches || still?.matches) return;
    for (const record of records) {
      record.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement) || node.hasAttribute(LEAVING) || node.isConnected) return;
        if (node.matches(".ck-modal, [data-action-sheet]")) slideAway(node);
      });
    }
  });
  observer.observe(document.body, { childList: true });
  return () => observer.disconnect();
}
