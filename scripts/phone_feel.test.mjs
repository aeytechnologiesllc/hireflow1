#!/usr/bin/env node
/**
 * The phone feels like an app (src/styles/phone.css; the owner, 2026-11-04:
 * "fix the mobile UX and polish it absolutely to the best with the sticky
 * user experience, nice animation, drawer style things, dialogues ... so it
 * feels like the mobile first AAA app").
 *
 * Checked in the iPhone Simulator the same day, by hand:
 * - a ⋯ menu rises as an action sheet;
 * - a confirm rises as a bottom sheet over the whole app, and pulling its
 *   handle down closes it;
 * - the title shrinks onto frosted glass when the page scrolls;
 * - the tab highlight glides to the tapped tab;
 * - pulling the page down refreshes it;
 * - a swipe from the left edge goes back.
 * And the second pass (below), the same day.
 *
 * Run with: node scripts/phone_feel.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const css = await read("src/styles/phone.css");
check("the phone's styles are loaded with the app", (await read("src/main.tsx")).includes('import "./styles/phone.css";'));
check("under 640px a standard dialog is a bottom sheet (full width, rounded top, above the home indicator)", /@media \(max-width: 639px\)[\s\S]*\.hf-modal-pop\[data-state\] \{[\s\S]*bottom: 0;[\s\S]*border-radius: 24px 24px 0 0;[\s\S]*env\(safe-area-inset-bottom/.test(css));
check("…and every cockpit pop-up too (its card)", /\.ck-modal > \[role="dialog"\] \{[\s\S]*border-radius: 24px 24px 0 0 !important;/.test(css) && /\.ck-modal \{\s*align-items: flex-end !important;/.test(css));
check("…rising from the bottom, and leaving the same way", /@keyframes hf-sheet-up/.test(css) && /\.hf-modal-pop\[data-state="closed"\] \{\s*animation: hf-sheet-down/.test(css));
check("…with a grab handle drawn on every sheet", /\.hf-modal-pop\[data-state\]::before,\s*\.ck-modal > \[role="dialog"\]::before \{/.test(css));

const dialogs = ["RequestDocumentsDialog", "TeamDocumentSheet", "ResumeViewerDialog", "OfferLetterDialog", "PassByScoreDialog", "InterviewGuideDialog", "HireDialog", "NoShowDialog", "NewJobDialog", "ActionDialog", "ShareKitDialog", "DocumentPreviewDialog", "InterviewOutcomeDialog"];
const missing = [];
const notPortalled = [];
for (const name of dialogs) {
  // The letter's sheet is drawn by the signing screens' desk (src/components/documents/PaperDesk.tsx, 2026-11-05).
  const own = await read(`src/cockpit/components/${name}.tsx`);
  const src = name === "TeamDocumentSheet" && /<PaperDesk\b/.test(own) ? await read("src/components/documents/PaperDesk.tsx") : own;
  if (!/className="ck-modal fixed inset-0/.test(src)) missing.push(name);
  if (!/return createPortal\(\s*(?:\{\/\*[\s\S]*?\*\/\}\s*|\/\/[^\n]*\n\s*)*<div className="ck-modal/.test(src)) notPortalled.push(name);
}
check("all 13 cockpit pop-ups are marked as phone sheets", missing.length === 0, missing.join(", "));
check("…and drawn on top of the whole app, not inside the page (there the tab bar covered the sheet)", notPortalled.length === 0, notPortalled.join(", "));

const drag = await read("src/lib/sheetDrag.ts");
check("a pull down on a sheet's handle closes it, from one listener for the whole app", /export function installSheetDrag\(\)/.test(drag) && /useEffect\(\(\) => installSheetDrag\(\), \[\]\);/.test(await read("src/App.tsx")));
check("…the standard dialogs by Escape, a cockpit pop-up by its scrim (a busy one stays)", /new KeyboardEvent\("keydown", \{ key: "Escape"/.test(drag) && /scrim\.click\(\)/.test(drag));
check("…only from its top strip while it is scrolled to its top, never from a text box", /el\.scrollTop > 0/.test(drag) && /HANDLE_PX = 64/.test(drag) && /input, textarea, select/.test(drag));

const menu = await read("src/cockpit/components/ApplicantRowMenu.tsx");
check("on a phone a ⋯ menu is an action sheet: big rows, and Cancel on its own", /const asSheet = open && typeof window !== "undefined" && !!window\.matchMedia\?\.\("\(max-width: 639px\)"\)\.matches;/.test(menu) && /data-action-sheet/.test(menu) && /min-h-\[56px\]/.test(menu) && />\s*Cancel\s*<\/button>/.test(menu));

const shell = await read("src/cockpit/Shell.tsx");
check("the title bar shrinks onto frosted glass once the page scrolls", /onScroll=\{\(e\) => setPageScrolled\(e\.currentTarget\.scrollTop > 8\)\}/.test(shell) && /\.hf-topbar\[data-scrolled\] \{[\s\S]*backdrop-filter/.test(css) && /\.hf-topbar\[data-scrolled\] \.hf-topbar-title \{\s*transform: scale\(0\.78\);/.test(css));
check("the tab bar is frosted, and one highlight glides to the active tab", /className="hf-tabbar /.test(shell) && /<span aria-hidden className="hf-tabbar-glide" \/>/.test(shell) && /transition: left 380ms/.test(css));
check("pull down at the top to refresh, never in the job builder", /usePullToRefresh\(mainRef, !fillsFrame\)/.test(shell) && /refetchQueries\(\{ type: "active" \}\)/.test(await read("src/cockpit/hooks/usePullToRefresh.ts")));
check("…and never while something inside the page is itself scrolled (a chat's history)", /function innerScrolled\(/.test(await read("src/cockpit/hooks/usePullToRefresh.ts")));
check("touch: no grey tap flash, and cards press in", /-webkit-tap-highlight-color: transparent;/.test(css) && /\.ck-press:active/.test(css));

const vc = await read("ios/App/App/MainViewController.swift");
check("the iPhone app: a swipe from the left edge goes back a page", /allowsBackForwardNavigationGestures = true/.test(vc) && /customClass="MainViewController"/.test(await read("ios/App/App/Base.lproj/Main.storyboard")) && /MainViewController\.swift in Sources/.test(await read("ios/App/App.xcodeproj/project.pbxproj")));


// ── The second pass (the owner, 2026-11-04: "more iPhone style ... opening,
// closing, feedback, tactile press feedback", and the same in a phone's
// browser and on Android). Driven on a headless iPhone and Android phone the
// same day: push, pop with the back arrow, the phone's own back, a tab
// switch, the tab again to the top, a ⋯ sheet and a confirm sliding away,
// the tab bar stepping aside while typing.
const haptics = await read("src/lib/haptics.ts");
check("a tap is felt: Apple's own taps in the app, a buzz on Android, iOS's switch click in an iPhone browser", /from "@capacitor\/haptics"/.test(haptics) && /navigator\.vibrate\(BUZZ\[kind\]\)/.test(haptics) && /input\.setAttribute\("switch", ""\)/.test(haptics));
const tap = await read("src/lib/tapFeel.ts");
check("…from one listener, on a real tap only (never a scroll, never a click the code makes)", /document\.addEventListener\("click", onClick, true\)/.test(tap) && /if \(!e\.isTrusted\) return;/.test(tap) && /useEffect\(\(\) => installTapFeel\(\), \[\]\);/.test(await read("src/App.tsx")));
check("…and no button buzzes on the touch that starts a scroll", !/onPointerDown=\{hapticLight\}/.test(await read("src/components/InterviewSchedulingWizard.tsx")) && !/hapticLight/.test(await read("src/components/ui/button.tsx")));
check("…a pass or decline confirm is the warning; a notification its own feel", /data-haptic=\{dangerStyle \? "warning" : undefined\}/.test(await read("src/cockpit/components/ActionDialog.tsx")) && /function ToastFeel\(\)/.test(await read("src/components/ui/sonner.tsx")));
const motion = await read("src/cockpit/lib/pageMotion.ts");
check("pages slide like an iPhone's: deeper slides in from the right, back slides away, a tab fades", /if \(b > a\) return "push";/.test(motion) && /if \(b < a\) return "pop";/.test(motion) && /markTabSwitch\(\)/.test(shell) && /\.ck-page\[data-page-motion="tab"\]/.test(css));
check("…never twice after the phone's own back swipe (the iPhone draws that itself)", /if \(navType === "POP" && !context\.tapped\) return context\.iPhone \? "none" : "pop";/.test(motion));
check("…the incoming page solid to the last frame, so the old one never shows through", /backgroundColor: ground, boxShadow: "0 0 0 rgba\(0, 0, 0, 0\)"/.test(motion));
check("…back to a list opens it where it was left; anywhere new at its top", /el\.scrollTop = navType === "POP" \? positions\.current\.get\(locationKey\) \?\? 0 : 0;/.test(motion));
check("the tab you are on, tapped again, goes to the top; in the app, so does a tap on the clock", /if \(active && pathname === tab\.to\) return onReselect\(\);/.test(shell) && /addEventListener\("statusTap"/.test(shell));
const exit = await read("src/lib/sheetExit.ts");
check("a sheet slides away when it closes, not only when pulled", /observer\.observe\(document\.body, \{ childList: true \}\)/.test(exit) && /\.ck-modal, \[data-action-sheet\]/.test(exit) && /node\.setAttribute\("inert", ""\)/.test(exit));
const keyboard = await read("src/lib/phoneKeyboard.ts");
check("the keyboard never covers the box: Android shrinks the page, the app its web view, an iPhone browser fits the screen left", /interactive-widget=resizes-content/.test(await read("index.html")) && /"Keyboard": \{\s*"resize": "native"/.test(await read("capacitor.config.json")) && /--hf-app-h/.test(keyboard) && /h-\[var\(--hf-app-h,100dvh\)\]/.test(shell));
check("…and while typing the tab bar (and a page's own bottom bar) steps aside", /html\.hf-typing \.hf-tabbar,\s*html\.hf-typing \[data-phone-bar\] \{/.test(css));
check("notifications drop in as iPhone banners under the clock", /mobileOffset=\{\{ top: "calc\(env\(safe-area-inset-top, 0px\) \+ 10px\)"/.test(await read("src/components/ui/sonner.tsx")) && /backdrop-filter: saturate\(1\.8\) blur\(22px\)/.test(await read("src/styles/toasts.css")));

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
