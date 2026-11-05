/**
 * Taps you can feel (the owner, 2026-11-04: "tactile press feedback ... more
 * iPhone style", and the same on Android and in a phone's browser, not only
 * in the App Store app).
 *
 * One call, three kinds of phone:
 * - the HireFlow iPhone app: Apple's own taps (@capacitor/haptics: a light
 *   or medium impact, the selection click, success / warning / error);
 * - Android (Chrome, Samsung Internet, the Play app): a short buzz
 *   (navigator.vibrate);
 * - iPhone Safari and Chrome: no vibration API, but a tap on a hidden
 *   `<input type="checkbox" switch>` plays iOS's own switch click (iOS 18
 *   and later). It only plays inside a tap's own handler, so on an iPhone
 *   browser only taps are felt, never a save that finishes later.
 * A computer never feels anything. Two taps closer than 40 ms are one.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

/** The HireFlow iPhone app (its web view names itself; src/lib/nativePush.ts). */
function inApp(): boolean {
  return typeof navigator !== "undefined" && /HireFlowApp\/\d/.test(navigator.userAgent) && Capacitor.isPluginAvailable("Haptics");
}

function isIPhoneBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let lastAt = 0;
function ready(): boolean {
  const now = Date.now();
  if (now - lastAt < 40) return false;
  lastAt = now;
  return true;
}

/** iOS's switch click from a browser: a hidden switch, tapped and taken away. */
function switchClick(): void {
  if (typeof document === "undefined") return;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.dataset.hfHaptic = "";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.head.appendChild(label);
  try {
    label.click();
  } finally {
    label.remove();
  }
}

type Feel = "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error";

const BUZZ: Record<Feel, number | number[]> = {
  selection: 8,
  light: 10,
  medium: 18,
  heavy: 30,
  success: [12, 60, 18],
  warning: [22, 50, 22],
  error: [30, 30, 30, 30, 30],
};

function feel(kind: Feel): void {
  if (!isTouchDevice() || !ready()) return;
  if (inApp()) {
    const done = () => undefined;
    if (kind === "selection") {
      void Haptics.selectionStart()
        .then(() => Haptics.selectionChanged())
        .then(() => Haptics.selectionEnd())
        .catch(done);
    } else if (kind === "success" || kind === "warning" || kind === "error") {
      const type = kind === "success" ? NotificationType.Success : kind === "warning" ? NotificationType.Warning : NotificationType.Error;
      void Haptics.notification({ type }).catch(done);
    } else {
      const style = kind === "light" ? ImpactStyle.Light : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Heavy;
      void Haptics.impact({ style }).catch(done);
    }
    return;
  }
  if (canVibrate && !isIPhoneBrowser()) {
    try {
      navigator.vibrate(BUZZ[kind]);
    } catch {
      /* a browser that refuses: nothing to feel */
    }
    return;
  }
  if (isIPhoneBrowser()) switchClick();
}

/** The lightest click: a tab, a switch, a choice in a list. */
export function hapticSelection(): void {
  feel("selection");
}

/** A button or a row pressed. */
export function hapticLight(): void {
  feel("light");
}

/** Something that moved: a pull that will refresh, a sheet let go. */
export function hapticMedium(): void {
  feel("medium");
}

export function hapticHeavy(): void {
  feel("heavy");
}

/** Saved, sent, done. */
export function hapticSuccess(): void {
  feel("success");
}

/** About to do something that cannot be undone. */
export function hapticWarning(): void {
  feel("warning");
}

/** It did not work. */
export function hapticError(): void {
  feel("error");
}

/** Android only: a pattern of buzzes and pauses, in milliseconds. */
export function hapticPattern(pattern: number[]): void {
  if (canVibrate && isTouchDevice() && !isIPhoneBrowser() && !inApp()) navigator.vibrate(pattern);
}
