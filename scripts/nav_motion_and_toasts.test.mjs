#!/usr/bin/env node
/**
 * Two designs the owner approved from a mock-up on 2026-10-11 ("I love
 * everything ... number one, number two, just go"):
 *
 * 1. Notifications are a warm card (src/components/ui/sonner.tsx, the older
 *    src/components/ui/toast.tsx, src/styles/toasts.css): the raised surface,
 *    a mark at the left, "Undo" as an action-coloured word, a line that runs out once.
 *    Never the black box with a white button again.
 * 2. Each menu icon has its own motion, once per pointing
 *    (src/cockpit/components/NavIcon.tsx, cockpit.css .ck-navicon), drawn
 *    from the same Lucide shapes the menu always used.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};

/* ── 1. Notifications ─────────────────────────────────────────────────── */

const sonner = await read("src/components/ui/sonner.tsx");
const css = await read("src/styles/toasts.css");
const radix = await read("src/components/ui/toast.tsx");
const radixToaster = await read("src/components/ui/toaster.tsx");

check("the old black card is gone (no bg-background on a notification)", !/group-\[\.toaster\]:bg-background/.test(sonner) && !/bg-background text-foreground/.test(radix));
check("the old white action slab is gone", !/actionButton:\s*"group-\[\.toast\]:bg-primary/.test(sonner));
check("the old red slab for errors is gone", !/bg-destructive text-destructive-foreground/.test(radix));
check("every notification wears the warm card's classes", /toast: "hf-toast"/.test(sonner) && /actionButton: "hf-toast-action"/.test(sonner) && /closeButton: "hf-toast-close"/.test(sonner) && /className="toaster group hf-toaster"/.test(sonner));
check("the card is the raised surface with the app's line and a 16px corner", /\[data-sonner-toast\]\.hf-toast\[data-styled="true"\] \{[^}]*background: var\(--hf-surface-raised\);[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 16px;/.test(css));
check("\"Undo\" is an action-coloured word on a clear ground", /\[data-button\]\.hf-toast-action,[\s\S]*?\{[^}]*background: transparent;[^}]*color: var\(--action\);/.test(css));
check("a mark for each kind: check, error, warning, info, loading", ["ok", "crit", "warn", "info", "busy"].every((t) => sonner.includes(`<Mark tone="${t}" />`)));
check("an error's mark is the soft red one", /\.hf-toast-mark\[data-tone="crit"\] \{[^}]*var\(--crit\)/.test(css));
check("the close button hides when the card has its own action", /\.hf-toast:has\(\[data-button\]\) \[data-close-button\] \{\s*display: none;/.test(css));
check("the line runs once, for each card's own time", /animation: hf-toast-time var\(--hf-toast-ms, 4000ms\) linear 1 forwards;/.test(css) && /useSonner\(\)/.test(sonner) && /data-index="\$\{index\}"\] \{ \$\{value\} \}/.test(sonner));
check("a card that stays until closed has no line", /--hf-toast-line: none;/.test(sonner) && /display: var\(--hf-toast-line, block\);/.test(css));
check("the line waits while the pointer is over the notifications", /\[data-expanded="true"\] \.hf-toast-time \{\s*animation-play-state: paused;/.test(css));
check("the shadow is a token, defined for both themes", ((await read("src/index.css")).match(/--hf-toast-shadow:/g) ?? []).length === 2 && /box-shadow: var\(--hf-toast-shadow\);/.test(css));
check("no colour in the notification styles outside the app's tokens", !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the older notifications are the same card, with a mark and the line", /"hf-rtoast group/.test(radix) && /className="hf-toast-mark shrink-0" data-tone=\{tone\}/.test(radixToaster) && /className="hf-toast-time/.test(radixToaster));
check("the older notifications' action is an action-coloured word too", /text-\[var\(--action\)\] transition-colors hover:bg-\[var\(--action-soft\)\]/.test(radix));
check("reduce motion: no drawing check and no line", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.hf-toast-time \{\s*display: none;/.test(css));

/* ── 2. The menu's icons ──────────────────────────────────────────────── */

const icon = await read("src/cockpit/components/NavIcon.tsx");
const shell = await read("src/cockpit/Shell.tsx");
const ck = await read("src/cockpit/cockpit.css");

// The same shapes as Lucide's own icons, every path and circle of them.
const LUCIDE = { dashboard: "house", applicants: "users", jobs: "briefcase", interviews: "calendar-days", messages: "message-square", documents: "file-text", analytics: "chart-column", more: "ellipsis" };
for (const [name, file] of Object.entries(LUCIDE)) {
  const src = await read(`node_modules/lucide-react/dist/esm/icons/${file}.js`).catch(() => "");
  const shapes = [...src.matchAll(/\[\s*"(path|circle|rect)",\s*\{([^}]*)\}/g)].map(([, tag, attrs]) => {
    const pairs = [...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)].map(([, k, v]) => [k, v]).filter(([k]) => k !== "key");
    return { tag, pairs };
  });
  const block = icon.slice(icon.indexOf(`  ${name}: (`), icon.indexOf("\n  ),", icon.indexOf(`  ${name}: (`)));
  const missing = shapes.filter(({ tag, pairs }) => !pairs.every(([k, v]) => block.includes(`${k}="${v}"`)) || !block.includes(`<${tag}`));
  check(`${name}: the same shapes as Lucide's ${file}`, shapes.length > 0 && missing.length === 0, missing.map((m) => m.tag).join(","));
}

check("the menu draws NavIcon for every row", /<NavIcon name=\{item\.icon\} className="h-\[18px\] w-\[18px\] shrink-0" \/>/.test(shell) && !/<Icon className/.test(shell));
check("pointing at a row (or focusing it) plays its icon", /onMouseEnter=\{\(e\) => \{ prefetchForPath\(item\.to\); playNavIcon\(e\); \}\}/.test(shell) && /onFocus=\{\(e\) => \{ prefetchForPath\(item\.to\); playNavIcon\(e\); \}\}/.test(shell));
check("a phone tab plays its icon when tapped", /onPointerDown=\{playNavIcon\}/.test(shell) && /<NavIcon name=\{tab\.icon\} className="h-\[22px\] w-\[22px\]"/.test(shell));
check("the menu keeps its order and names", /\{ label: "Dashboard", to: "\/dashboard", icon: "dashboard" \},[\s\S]*\{ label: "Applicants", to: "\/applicants", icon: "applicants" \},[\s\S]*\{ label: "Jobs", to: "\/jobs", icon: "jobs" \},[\s\S]*\{ label: "Interviews", to: "\/interviews", icon: "interviews" \},[\s\S]*\{ label: "Messages", to: "\/messages", icon: "messages" \},[\s\S]*\{ label: "Documents", to: "\/documents", icon: "documents" \},[\s\S]*\{ label: "Analytics", to: "\/analytics", icon: "analytics" \}/.test(shell));
const motion = ck.slice(ck.indexOf("── The menu's icons"));
const rules = [...motion.matchAll(/\.ck-navicon\[data-play\] \.(ni-[a-z0-9-]+) \{ [^}]*animation: ([^;]+);/g)];
check("every moving part plays exactly once", rules.length >= 12 && rules.every(([, , a]) => /\b1\b/.test(a) && !/infinite/.test(a)), rules.filter(([, , a]) => !/\b1\b/.test(a)).map(([, n]) => n).join(","));
for (const [name, part] of [["dashboard", "ni-lift"], ["applicants", "ni-front"], ["jobs", "ni-swing"], ["interviews", "ni-day"], ["messages", "ni-bubble"], ["documents", "ni-line"], ["analytics", "ni-bar"], ["more", "ni-hop"]]) {
  check(`${name} has its own motion (${part})`, icon.includes(`"${part}`) || icon.includes(` ${part}`) ? new RegExp(`\\.ck-navicon\\[data-play\\] \\.${part} \\{`).test(motion) : false);
}
check("each motion ends where it began (keyframes return to rest)", [...motion.matchAll(/@keyframes (ni-[a-z]+) \{([^\n]*)\}/g)].every(([, n, body]) => /100% \{ transform: none; \}|0%, 100% \{ transform: none; \}|to \{ (opacity: 1|stroke-dashoffset: 0|transform: none); \}|100% \{ opacity: 0; \}/.test(body)));
check("the icon lets go when every part has finished", /onAnimationEnd=\{settle\}/.test(icon) && /if \(!running\) icon\.removeAttribute\("data-play"\)/.test(icon));
check("a second pointing starts it again from the first frame", /icon\.removeAttribute\("data-play"\);\s*\/\/[^\n]*\n\s*void icon\.getBoundingClientRect\(\);\s*icon\.setAttribute\("data-play", ""\);/.test(icon));
check("reduce motion keeps the icons still", /@media \(prefers-reduced-motion: reduce\) \{\s*\.ck-navicon\[data-play\] \* \{ animation: none !important; \}/.test(motion));
check("the typing dots rest hidden, so the bubble at rest is Lucide's", /\.ck-navicon \.ni-dot \{ opacity: 0; \}/.test(motion));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
