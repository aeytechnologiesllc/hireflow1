import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Pull down to refresh on a phone (the owner, 2026-11-04: "a mobile first AAA
 * app"). On the shell's own scroller: at its top, a downward pull shows the
 * spinner, and letting go past the mark refetches everything the page shows
 * (every active query), with the spinner turning until it is back.
 *
 * Never while something inside the page is itself scrolled (a chat's history,
 * a long list in a card): that pull is its own scroll. Never sideways. Touch
 * screens only; a mouse never sees it.
 */
const TRIGGER_PX = 64;
const MAX_PX = 112;
const HOLD_PX = 52;

function innerScrolled(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== root) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function usePullToRefresh(scroller: RefObject<HTMLElement>, enabled: boolean) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled || !window.matchMedia?.("(pointer: coarse)").matches) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let distance = 0;

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || el.scrollTop > 0) return;
      if (innerScrolled(e.target, el)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      distance = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (distance === 0 && (dy <= 4 || dx > dy)) {
        if (dy < 0 || dx > 8) tracking = false;
        return;
      }
      if (el.scrollTop > 0) {
        tracking = false;
        setPull(0);
        return;
      }
      e.preventDefault();
      // Resistance: the further it goes, the harder it pulls.
      distance = Math.min(MAX_PX, dy * 0.5);
      setPull(distance);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (distance < TRIGGER_PX) {
        distance = 0;
        setPull(0);
        return;
      }
      distance = 0;
      busyRef.current = true;
      setBusy(true);
      setPull(HOLD_PX);
      const started = Date.now();
      void queryClient
        .refetchQueries({ type: "active" })
        .catch(() => undefined)
        .then(() => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 650 - (Date.now() - started)))))
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
          setPull(0);
        });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scroller, enabled, queryClient]);

  return { pull, busy, ready: pull >= TRIGGER_PX };
}
