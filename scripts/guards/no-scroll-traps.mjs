/**
 * No box on a page may hold a finger's swipe to itself unless it is an
 * overlay (a dialog, a sheet, a menu) or the shell's own scroller.
 *
 * What happened (2026-10-09): the owner, on his Android phone: "the biggest
 * bug on the phone, the messaging tab. You can't scroll, doesn't work." The
 * chat's message area wore `.ck-scroll`, which set
 * `overscroll-behavior-y: contain` ("do not pass a swipe on to what is behind
 * me"). On a wide screen that area has a fixed height and scrolls. On a phone
 * the chat card is as tall as the conversation and the PAGE scrolls, so the
 * area has nothing of its own to scroll. Since Chrome 144 (January 2026) a
 * scroll box holds swipes even when it has nothing to scroll, so a finger
 * that started on a message, which is most of the screen, moved nothing.
 *
 * The sweep that followed found the same cause on the applicant sign-in page
 * and the employer sign-in page (`.scroll-perf` on a wrapper as tall as its
 * content) and on "New job". It had already happened once, on `.cand-root`
 * (2026-10-04: "I cannot scroll the page"). Three times is a pattern, so the
 * rule is written down here rather than fixed a fourth time.
 *
 * The same sweep found a second way `.ck-scroll` hurts on a phone: it is made
 * for a box that scrolls up and down (`overflow-x: hidden`, and it only takes
 * up-and-down swipes), and the Team page put it on a table that needed to
 * scroll sideways, which cut the table off after its third column.
 *
 * So:
 *  - `.ck-scroll` and `.scroll-perf` themselves never set overscroll-behavior;
 *  - every place that does set it is listed below with why it is safe there,
 *    and a new one fails until it is added on purpose;
 *  - nothing wears `.ck-scroll` or `.scroll-perf` together with a sideways
 *    scroller's class;
 *  - the two unused helper classes that hold swipes stay unused.
 */

/** Where holding a swipe is allowed, how many times, and why it is safe there. */
const ALLOWED = {
  "src/cockpit/cockpit.css": {
    count: 1,
    why: "main.ck-scroll (the shell's own scroller: nothing behind it scrolls) and a dialog's body (what is behind a dialog must not move)",
  },
  "src/index.css": {
    count: 2,
    why: "html/body on phones (the root: stops the browser's bounce, traps nothing) and the unused .scroll-contain helper",
  },
  "src/cockpit/components/ApplicantFilters.tsx": {
    count: 2,
    why: "the filter menu and the filter sheet: overlays, the page behind them must not move",
  },
  "src/components/InterviewSchedulingWizard.tsx": {
    count: 1,
    why: "the time wheel: a fixed-height picker inside a dialog that always has more to scroll",
  },
};

/** Helper classes that hold swipes; nothing uses them and nothing should start to. */
const UNUSED_HOLDERS = ["scroll-mobile-safe", "scroll-contain"];

/** Tailwind's own names for the same thing. */
const TAILWIND_HOLD = /(?<![\w-])overscroll-(?:[xy]-)?(?:contain|none)(?![\w-])/;

/** A declaration (CSS or inline style) that holds swipes. Comments are stripped first. */
const HOLD = /overscroll-behavior(?:-[xy]|-block|-inline)?\s*:\s*(?:contain|none)|overscrollBehavior[XY]?\s*:\s*["'`](?:contain|none)/g;

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The body of the first plain `.name { ... }` rule in a stylesheet. */
function ruleBody(css, selector) {
  const at = css.search(new RegExp(`(^|\\n)\\s*\\${selector}\\s*\\{`));
  if (at < 0) return null;
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

export default [
  {
    id: "no-scroll-traps",
    why:
      "A box that holds swipes (overscroll-behavior: contain or none) holds them even when it has nothing to scroll " +
      "(Chrome 144+). On a phone that makes a page impossible to scroll wherever a finger lands on it: Messages on " +
      "2026-10-09, the applicant pages on 2026-10-04. Only an overlay or the shell's own scroller may hold swipes; " +
      "see scripts/guards/no-scroll-traps.mjs before adding one.",
    async run({ read, walk }) {
      const bad = [];
      const files = [...(await walk("src", [".css", ".tsx", ".ts"]))];
      if (files.length === 0) return { ok: false, detail: ["no files found under src"] };

      const seen = {};
      for (const rel of files) {
        const raw = (await read(rel)) ?? "";
        const text = stripComments(raw);
        const holds = (text.match(HOLD) ?? []).length;
        if (holds) seen[rel] = holds;
        if (rel.endsWith(".css")) continue;
        // class names in markup
        if (TAILWIND_HOLD.test(text)) bad.push(`${rel}: uses a Tailwind overscroll-contain/none class. Hold swipes only on an overlay, and list it in this guard.`);
        for (const name of UNUSED_HOLDERS) {
          if (new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(text)) bad.push(`${rel}: uses .${name}, a helper that holds swipes. It traps a phone's scroll on any box that is not taller than its content.`);
        }
        for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          const cls = m[1] ?? m[2] ?? "";
          if (/(?<![\w-])(ck-scroll|scroll-perf)(?![\w-])/.test(cls) && /(?<![\w:-])overflow-x-(auto|scroll)(?![\w-])/.test(cls)) {
            bad.push(`${rel}: a sideways scroller wears .ck-scroll/.scroll-perf ("${cls.slice(0, 70)}"). Those classes set overflow-x: hidden and take only up-and-down swipes: on a phone the content is cut off with no way to reach it. Drop the class.`);
          }
        }
      }

      for (const [rel, n] of Object.entries(seen)) {
        const allowed = ALLOWED[rel];
        if (!allowed) bad.push(`${rel}: sets overscroll-behavior to contain/none ${n} time(s) and is not on this guard's list. If it is an overlay (dialog, sheet, menu), add it with the reason; if it is part of a page, remove it.`);
        else if (n !== allowed.count) bad.push(`${rel}: sets overscroll-behavior to contain/none ${n} time(s); this guard expects ${allowed.count} (${allowed.why}). Check the new one is an overlay, then update the count.`);
      }
      for (const rel of Object.keys(ALLOWED)) {
        if (!seen[rel]) bad.push(`${rel} is listed as holding swipes but no longer does: take it off the list`);
      }

      // The two shared classes themselves must stay clean, and the one allowed
      // cockpit rule must still be scoped to the shell's main and to dialogs.
      const cockpit = stripComments((await read("src/cockpit/cockpit.css")) ?? "");
      const motion = stripComments((await read("src/styles/motion.css")) ?? "");
      const ck = ruleBody(cockpit, ".ck-scroll");
      const perf = ruleBody(motion, ".scroll-perf");
      if (ck == null) bad.push("src/cockpit/cockpit.css: no plain .ck-scroll rule found: this guard is reading nothing");
      else if (/overscroll-behavior/.test(ck)) bad.push("src/cockpit/cockpit.css: .ck-scroll itself sets overscroll-behavior again. Every box wearing it would hold swipes; the phone chat cannot be scrolled.");
      if (perf == null) bad.push("src/styles/motion.css: no plain .scroll-perf rule found: this guard is reading nothing");
      else if (/overscroll-behavior/.test(perf)) bad.push("src/styles/motion.css: .scroll-perf itself sets overscroll-behavior again. The sign-in pages cannot be scrolled on a phone.");
      if (!/main\.ck-scroll\s*,\s*\[role="dialog"\]\s*\.ck-scroll\s*\{[^}]*overscroll-behavior-y:\s*contain/.test(cockpit)) {
        bad.push('src/cockpit/cockpit.css: the one allowed rule should read `main.ck-scroll, [role="dialog"] .ck-scroll { overscroll-behavior-y: contain; }`');
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
