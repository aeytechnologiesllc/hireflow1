/**
 * iPhone-style page motion on a phone (the owner, 2026-11-04: "more
 * animated, more iPhone style ... opening, closing"), in the app, on Android
 * and in a phone's browser alike.
 *
 * - Going deeper (a list → one applicant, More → Settings): the new page
 *   slides in from the right edge over the old one, which drifts a third to
 *   the left under a shade, as an iPhone pushes a screen.
 * - Going back with the page's own back arrow: the old page slides off to
 *   the right and the one under it comes back from the left.
 * - Going back with the phone's own back swipe (the iPhone app and iPhone
 *   Safari draw that motion themselves): nothing more is drawn, so the page
 *   does not move twice. Told apart by whether a finger tapped the page just
 *   before (src/lib/tapFeel.ts).
 * - A tab in the tab bar, or a move sideways: a quick fade.
 * - Back to a list opens it where it was left; anywhere new opens at its top.
 *
 * The page that leaves is a picture of itself (its last frame, put back for
 * the 440 ms of the slide, inert and hidden from screen readers), because the
 * app has already swapped the page by the time anything can move. On a
 * computer, and with reduced motion, every change is the old quiet page turn
 * (.ck-page in cockpit.css).
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { NavigationType } from "react-router-dom";
import { tappedWithin } from "@/lib/tapFeel";

export type PageMotion = "push" | "pop" | "tab" | "none" | "turn";

/** Close to an iPhone's own push: quick away, long gentle settle. */
const EASE = "cubic-bezier(0.25, 0.9, 0.3, 1)";
const MS = 440;
/** A back arrow tapped this recently made the back move. */
const TAP_MS = 700;

let tabSwitchAt = 0;
/** The tab bar says the next move is a tab switch (a fade, never a slide). */
export function markTabSwitch(): void {
  tabSwitchAt = Date.now();
}

function phoneMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 639px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function iPhoneOrIPad(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(root + "/");
}

/** How deep a page sits: its path's parts, and one more under More. */
export function pageLevel(path: string, moreChildren: readonly string[]): number {
  const parts = path.split("/").filter(Boolean).length;
  return parts + (moreChildren.some((root) => under(path, root)) ? 1 : 0);
}

export function pageMotionFor(
  from: string,
  to: string,
  navType: NavigationType,
  context: { moreChildren: readonly string[]; phone: boolean; tapped: boolean; tabSwitch: boolean; iPhone: boolean },
): PageMotion {
  if (!context.phone) return "turn";
  if (navType === "POP" && !context.tapped) return context.iPhone ? "none" : "pop";
  if (context.tabSwitch || navType === "REPLACE") return "tab";
  const a = pageLevel(from, context.moreChildren);
  const b = pageLevel(to, context.moreChildren);
  if (b > a) return "push";
  if (b < a) return "pop";
  return "tab";
}

/** The page that leaves, as a picture of its last frame, laid over (or
 *  under) the scroller exactly where it was. */
function pictureOf(page: HTMLElement, scroller: HTMLElement, ground: string, over: boolean): HTMLElement | null {
  const host = scroller.parentElement;
  if (!host) return null;
  const box = scroller.getBoundingClientRect();
  const at = page.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const frame = document.createElement("div");
  frame.className = "hf-page-ghost";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("inert", "");
  Object.assign(frame.style, {
    position: "absolute",
    top: `${box.top - hostBox.top}px`,
    left: `${box.left - hostBox.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: over ? "2" : "0",
    background: over ? ground : "transparent",
    willChange: "transform",
  });
  const copy = page.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("iframe, video, audio, object, embed").forEach((el) => el.remove());
  copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  copy.removeAttribute("id");
  Object.assign(copy.style, {
    position: "absolute",
    top: `${at.top - box.top}px`,
    left: `${at.left - box.left}px`,
    width: `${at.width}px`,
    margin: "0",
    transform: "none",
  });
  frame.appendChild(copy);
  const shade = document.createElement("div");
  Object.assign(shade.style, { position: "absolute", inset: "0", background: "rgba(0, 0, 0, 0.1)", opacity: "0" });
  frame.appendChild(shade);
  host.appendChild(frame);
  return frame;
}

interface Moving {
  ghost: HTMLElement | null;
  anims: Animation[];
}

function stop(moving: Moving | null) {
  if (!moving) return;
  moving.anims.forEach((a) => a.cancel());
  moving.ghost?.remove();
}

/**
 * The cockpit shell's page motion. `onLeave` goes to the page's own layer
 * (it is called with the leaving page while it is still on screen);
 * `motion` is this render's move, for the page's data-page-motion.
 */
export function usePageMotion(options: {
  pathname: string;
  locationKey: string;
  navType: NavigationType;
  scroller: RefObject<HTMLElement>;
  moreChildren: readonly string[];
}) {
  const { pathname, locationKey, navType, scroller, moreChildren } = options;
  const committed = useRef<{ path: string; key: string } | null>(null);
  const positions = useRef(new Map<string, number>());
  const moving = useRef<Moving | null>(null);
  const changed = committed.current !== null && committed.current.path !== pathname;
  const motion: PageMotion | null = changed
    ? pageMotionFor(committed.current!.path, pathname, navType, {
        moreChildren,
        phone: phoneMotion(),
        tapped: tappedWithin(TAP_MS),
        tabSwitch: Date.now() - tabSwitchAt < TAP_MS,
        iPhone: iPhoneOrIPad(),
      })
    : null;
  const latest = useRef({ pathname, motion });
  latest.current = { pathname, motion };

  const onLeave = useCallback(
    (page: HTMLElement) => {
      const was = committed.current;
      const el = scroller.current;
      if (!was || !el || latest.current.pathname === was.path) return;
      positions.current.set(was.key, el.scrollTop);
      if (positions.current.size > 60) positions.current.delete(positions.current.keys().next().value as string);
      stop(moving.current);
      moving.current = null;
      const move = latest.current.motion;
      if (move !== "push" && move !== "pop") return;
      const shell = el.closest<HTMLElement>("[data-cockpit-shell]");
      const ground = shell ? getComputedStyle(shell).backgroundColor : "transparent";
      moving.current = { ghost: pictureOf(page, el, ground, move === "pop"), anims: [] };
    },
    [scroller],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    const was = committed.current;
    committed.current = { path: pathname, key: locationKey };
    // The same page under a new address (a filter in its query): nothing moves.
    if (!el || !was || was.path === pathname) return;
    // Back to a list: where it was left. Anywhere new: its top.
    el.scrollTop = navType === "POP" ? positions.current.get(locationKey) ?? 0 : 0;
    const move = latest.current.motion;
    const now = moving.current;
    if (!now?.ghost || (move !== "push" && move !== "pop")) return;
    const ghost = now.ghost;
    const shade = ghost.lastElementChild as HTMLElement | null;
    const shell = el.closest<HTMLElement>("[data-cockpit-shell]");
    const ground = shell ? getComputedStyle(shell).backgroundColor : "transparent";
    const timing: KeyframeAnimationOptions = { duration: MS, easing: EASE };
    try {
      if (move === "push") {
        // The new page over the picture of the old one (a flex item takes a z-index).
        el.style.zIndex = "1";
        now.anims.push(
          el.animate(
            [
              // Solid ground to the last frame, so the old page never shows
              // through the gaps between cards; it is gone with the picture.
              { transform: "translate3d(100%, 0, 0)", backgroundColor: ground, boxShadow: "-12px 0 32px rgba(0, 0, 0, 0.12)" },
              { transform: "translate3d(0, 0, 0)", backgroundColor: ground, boxShadow: "0 0 0 rgba(0, 0, 0, 0)" },
            ],
            timing,
          ),
          ghost.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(-30%, 0, 0)" }], timing),
        );
        if (shade) now.anims.push(shade.animate([{ opacity: 0 }, { opacity: 1 }], timing));
      } else {
        ghost.style.boxShadow = "-12px 0 32px rgba(0, 0, 0, 0.12)";
        now.anims.push(
          ghost.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }], timing),
          el.animate([{ transform: "translate3d(-30%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }], timing),
        );
      }
    } catch {
      stop(now);
      moving.current = null;
      return;
    }
    const first = now.anims[0];
    const end = () => {
      if (moving.current === now) moving.current = null;
      el.style.zIndex = "";
      ghost.remove();
    };
    first.onfinish = end;
    first.oncancel = end;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, locationKey]);

  return { motion, onLeave };
}
