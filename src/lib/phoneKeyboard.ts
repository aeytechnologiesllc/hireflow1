/**
 * The keyboard never covers what is being typed (the owner, 2026-11-04:
 * the iPhone app, Android and a phone's browser alike).
 *
 * - Android (Chrome and the rest): the page shrinks with the keyboard
 *   (index.html's viewport: interactive-widget=resizes-content), so the app
 *   sits above it as a native app does.
 * - The iPhone app: the web view itself shrinks (@capacitor/keyboard,
 *   resize "native", capacitor.config.json).
 * - iPhone Safari and Chrome do neither: the keyboard covers the bottom of
 *   the page and Safari slides the whole page up to show the box, taking the
 *   header off the top. There the app is made as tall as what the keyboard
 *   leaves and sits where Safari slid the screen to (--hf-app-h and
 *   --hf-app-top on <html>, from the visual viewport; the cockpit shell
 *   reads both), so a message box at the bottom sits on the keyboard and
 *   the header stays, as in Messages on an iPhone.
 * - Everywhere on a phone: while a text box has the keyboard, the tab bar
 *   steps aside (html.hf-typing, src/styles/phone.css).
 */

const TEXT_FIELD =
  'textarea, [contenteditable=""], [contenteditable="true"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="password"], input[type="number"]';

function isTextField(el: unknown): boolean {
  return el instanceof HTMLElement && el.matches(TEXT_FIELD) && !el.matches("[readonly], :disabled");
}

export function installPhoneKeyboard(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const root = document.documentElement;
  const coarse = window.matchMedia("(pointer: coarse)");
  const viewport = window.visualViewport;
  let frame = 0;
  let blurTimer = 0;
  let shown: Element | null = null;

  /** Once the screen has made room, the box being typed in is in view
   *  (once for each box, so typing never jumps the page). */
  const showField = () => {
    const field = document.activeElement;
    if (!isTextField(field) || field === shown) return;
    const box = (field as HTMLElement).getBoundingClientRect();
    const visible = viewport ? viewport.height : window.innerHeight;
    if (box.top >= 0 && box.bottom <= visible - 8) return;
    shown = field;
    (field as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const fit = () => {
    frame = 0;
    window.setTimeout(showField, 80);
    if (!viewport) return;
    const covered = window.innerHeight - viewport.height;
    if (coarse.matches && covered > 120 && isTextField(document.activeElement)) {
      root.style.setProperty("--hf-app-h", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--hf-app-top", `${Math.round(viewport.pageTop)}px`);
    } else {
      root.style.removeProperty("--hf-app-h");
      root.style.removeProperty("--hf-app-top");
    }
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(fit);
  };
  const onFocusIn = (e: FocusEvent) => {
    if (!coarse.matches || !isTextField(e.target)) return;
    window.clearTimeout(blurTimer);
    root.classList.add("hf-typing");
    schedule();
  };
  const onFocusOut = () => {
    window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      if (isTextField(document.activeElement)) return;
      shown = null;
      root.classList.remove("hf-typing");
      schedule();
    }, 120);
  };

  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  // The iPhone app's web view and Android's page shrink: the window itself resizes.
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  return () => {
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    window.clearTimeout(blurTimer);
    if (frame) window.cancelAnimationFrame(frame);
    root.classList.remove("hf-typing");
    root.style.removeProperty("--hf-app-h");
    root.style.removeProperty("--hf-app-top");
  };
}
