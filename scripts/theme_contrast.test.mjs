#!/usr/bin/env node
/**
 * The app's colours read for everyone, Day and Night (WCAG AA). Day is
 * Sage paper since 2026-10-30 (the owner's choice: jade on sage grounds and
 * warm paper cards, the front page's green ink); Night is warm ink with the
 * ivory as the text (docs/LAUNCH-PLAN.md, Phase 3, task 2). Reads the tokens
 * straight from src/index.css, so a value changed there is checked here.
 *
 * Run with: node scripts/theme_contrast.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const css = readFileSync(path.join(ROOT, "src/index.css"), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) if (!(m[1] in out)) out[m[1]] = m[2].trim();
  return out;
}
const dayStart = css.indexOf(":root {");
const nightStart = css.indexOf(".dark {");
const day = tokens(css.slice(dayStart, nightStart));
const nightOwn = css.slice(nightStart);
const night = { ...day, ...tokens(nightOwn.slice(0, nightOwn.indexOf("\n  }\n"))) };

/** [r, g, b] from #rrggbb, rgba() laid over `under`, or a bare "H S% L%". */
function rgb(value, under) {
  if (value === "transparent") return under ?? null;
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (rgba && under) {
    const a = Number(rgba[4]);
    return [1, 2, 3].map((i, k) => Math.round(Number(rgba[i]) * a + under[k] * (1 - a)));
  }
  const hsl = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(value);
  if (hsl) {
    const [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
  }
  return null;
}
const lum = (c) => {
  const [r, g, b] = c.map((x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text on the grounds it sits on: 4.5 for words; 3 for the action colour as
// a shape (a filled button, the row's edge) and for the faint label on the
// deepest surface.
const PAIRS = [
  ["ink", "ground", 4.5], ["ink", "surface", 4.5],
  ["ink-2", "ground", 4.5], ["ink-2", "surface", 4.5],
  ["ink-3", "ground", 4.5], ["ink-3", "surface", 4.5], ["ink-3", "surface-2", 3],
  ["btn-fg", "action", 4.5], ["action", "ground", 3], ["action", "surface", 3],
  ["action-soft-fg", "action-soft", 4.5], ["action-soft-fg", "ground", 4.5],
  ["brass", "ground", 4.5], ["brass", "surface", 4.5],
  ["amber-fg", "ground", 4.5], ["crit", "ground", 4.5], ["crit", "surface", 4.5],
  ["slab-ink", "slab", 4.5], ["slab-ink-2", "slab", 4.5], ["slab-action", "slab", 4.5],
  ["foreground", "background", 4.5], ["primary-foreground", "primary", 4.5],
  ["muted-foreground", "background", 4.5], ["muted-foreground", "card", 4.5],
  ["accent-foreground", "accent", 4.5], ["card-foreground", "card", 4.5],
  ["ck-brass", "background", 4.5], ["ck-brass-bright", "background", 4.5], ["ck-brass-bright", "card", 4.5],
  // 2026-10-30: the colour of "good" and the copper of "under its bar" are words too.
  ["good", "ground", 4.5], ["good", "surface", 4.5], ["good-fg", "good-soft", 4.5], ["good-fg", "ground", 4.5],
  ["under", "ground", 4.5], ["under", "surface", 4.5],
  ["success", "background", 4.5], ["success", "card", 4.5],
  // 2026-10-30, Sage paper: the sidebar is one step deeper than the ground,
  // so its words are measured on it, and the table heads and chips on --ground-2.
  ["ink", "sidebar", 4.5], ["ink-2", "sidebar", 4.5], ["ink-3", "sidebar", 4.5],
  ["sidebar-foreground", "sidebar-background", 4.5], ["ck-cream", "ck-sidebar", 4.5], ["ck-sub", "ck-sidebar", 4.5],
  ["ink-3", "ground-2", 4.5], ["muted-foreground", "muted", 4.5],
  // The builder's words on the page itself ("Ava found …", "Live").
  ["ck-action-bright", "background", 4.5],
];

// Words on the tints the screens actually stack, worked out the way the
// browser paints them. A colour is a token ("crit"; a var() is followed), a
// tint laid over another ({ over: [under, token, alpha] }: hsl(var(--x) / a)
// or a translucent token), or a mix ({ mix: [token, share, into] }:
// color-mix(in srgb, var(--token) share, var(--into)); a share may be a
// token, as --initials-share is). The journey's gem stops come from
// src/cockpit/cockpit.css.
const cockpitCss = readFileSync(path.join(ROOT, "src/cockpit/cockpit.css"), "utf8");
const blocks = (re) => [...cockpitCss.matchAll(re)].reduce((acc, m) => ({ ...tokens(m[1]), ...acc }), {});
const gemsDay = blocks(/^:root \{([\s\S]*?)^\}/gm);
const gemsNight = { ...gemsDay, ...blocks(/^\.dark \{([\s\S]*?)^\}/gm) };
const dayAll = { ...gemsDay, ...day };
const nightAll = { ...gemsNight, ...night };

function resolve(t, name, seen = 0) {
  const v = t[name];
  const ref = v && /^var\(--([\w-]+)\)$/.exec(v);
  return ref && seen < 8 ? resolve(t, ref[1], seen + 1) : v;
}
function paint(t, spec) {
  const ground = rgb(resolve(t, "ground"));
  if (typeof spec === "string") {
    const v = resolve(t, spec);
    return v == null ? null : rgb(v, ground);
  }
  if (spec.over) {
    const [under, token, alpha] = spec.over;
    const base = paint(t, under);
    const top = paint(t, token);
    return base && top ? top.map((x, k) => x * alpha + base[k] * (1 - alpha)) : null;
  }
  if (spec.mix) {
    const [token, share, into] = spec.mix;
    const pct = typeof share === "number" ? share : parseFloat(resolve(t, share)) / 100;
    const a = paint(t, token);
    const b = paint(t, into);
    return a && b && Number.isFinite(pct) ? a.map((x, k) => x * pct + b[k] * (1 - pct)) : null;
  }
  return null;
}
const over = (under, ...tints) => tints.reduce((acc, [token, alpha]) => ({ over: [acc, token, alpha] }), under);
const initials = (n) => [{ mix: [`gem-${n}`, "initials-share", "ink"] }, { mix: [`gem-${n}`, 0.26, "surface"] }];

// [what it is, need, Day's [words, ground], Night's [words, ground]].
// Each side as that theme draws it (some Day fixes leave Night's classes
// as they were, with `dark:`).
const LAYERED = [
  // "Ava suggests" beside the score (ApplicantHeaderBand.tsx): a solid tint
  // of its tone mixed into --tint-ground (the paper by Day, the ink at Night).
  ["\"Ava suggests\": decline", 4.5, ["crit", { mix: ["crit", 0.13, "tint-ground"] }], ["crit", { mix: ["crit", 0.13, "tint-ground"] }]],
  ["\"Ava suggests\": take a closer look", 4.5, ["amber-fg", { mix: ["amber-fg", 0.14, "tint-ground"] }], ["amber-fg", { mix: ["amber-fg", 0.14, "tint-ground"] }]],
  ["\"Ava suggests\": move ahead", 4.5, ["good-fg", { mix: ["good", 0.14, "tint-ground"] }], ["good-fg", { mix: ["good", 0.14, "tint-ground"] }]],
  // The applicants' and teammates' sidebar (AppSidebar.tsx): the active item,
  // one jade tint by Day, Night's two as before; the "Candidate" badge.
  ["the sidebar's active item", 4.5, ["action-soft-fg", over("sidebar-background", ["primary", 0.15])], ["primary", over("sidebar-background", ["primary", 0.15], ["primary", 0.1])]],
  ["the sidebar's \"Candidate\" badge", 4.5, ["action-soft-fg", over("sidebar-background", ["primary", 0.1])], ["primary", over("sidebar-background", ["primary", 0.1])]],
  // The job editor's step you are on (CreateJob.tsx).
  ["the job editor's active step", 4.5, ["action-soft-fg", over("background", ["primary", 0.1])], ["primary", over("background", ["primary", 0.1])]],
  // The job builder's chips (AvaCreateJob.tsx): words in --ck-action-bright.
  ["the job builder's \"Tailored to …\" chip", 4.5, ["ck-action-bright", over("background", ["primary", 0.1])], ["ck-action-bright", over("background", ["primary", 0.1])]],
  ["the job builder's \"Your role is live\" chip", 4.5, ["ck-action-bright", over("background", ["ck-action", 0.16])], ["ck-action-bright", over("background", ["ck-action", 0.16])]],
  ["the job builder's words on its cards", 4.5, ["ck-action-bright", "card"], ["ck-action-bright", "card"]],
  // Initials circles (initialsTint.ts), each gem stop.
  ...[1, 2, 3, 4].map((n) => [`initials on gem stop ${n}`, 4.5, initials(n), initials(n)]),
];

for (const [theme, t] of [["Day", dayAll], ["Night", nightAll]]) {
  for (const [name, need, daySide, nightSide] of LAYERED) {
    const [fgSpec, bgSpec] = theme === "Day" ? daySide : nightSide;
    const back = paint(t, bgSpec);
    const front = back && paint(t, fgSpec);
    if (!back || !front) {
      check(`${theme}: ${name} can be read`, false, "a colour did not resolve");
      continue;
    }
    const r = ratio(front.map(Math.round), back.map(Math.round));
    check(`${theme}: ${name} is ${r.toFixed(2)}:1 (at least ${need})`, r >= need);
  }
}

// ...and the screens still draw them the way they are measured above.
const source = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const sidebar = source("src/components/AppSidebar.tsx");
check(
  "the sidebar's active item and badge are drawn as measured (deep jade, one tint by Day)",
  /"bg-primary\/15 text-\[var\(--action-soft-fg\)\] dark:text-primary nav-item-active-glow"/.test(sidebar) &&
    /isActive && "dark:bg-primary\/10 /.test(sidebar) &&
    /isActive && "text-\[var\(--action-soft-fg\)\] dark:text-primary font-semibold"/.test(sidebar) &&
    /"border-primary\/30 text-\[var\(--action-soft-fg\)\] dark:text-primary bg-primary\/10"/.test(sidebar),
);
check(
  "the job editor's active step is drawn as measured",
  /\? "bg-primary\/10 text-\[var\(--action-soft-fg\)\] dark:text-primary"/.test(source("src/pages/CreateJob.tsx")),
);
const band = source("src/cockpit/components/ApplicantHeaderBand.tsx");
check(
  "\"Ava suggests\" mixes its tints into --tint-ground, as measured",
  ["good) 14%", "amber-fg) 14%", "crit) 13%"].every((m) => band.includes(`color-mix(in srgb, var(--${m}, var(--tint-ground))`)),
);
check(
  "initials take --initials-share of their gem stop, as measured",
  source("src/cockpit/lib/initialsTint.ts").includes("color-mix(in srgb, var(--gem-${stop}) var(--initials-share, 55%), var(--ink))") &&
    source("src/cockpit/lib/initialsTint.ts").includes("color-mix(in srgb, var(--gem-${stop}) 26%, var(--surface))"),
);

for (const [theme, t] of [["Day", day], ["Night", night]]) {
  const ground = rgb(t.ground);
  for (const [fg, bg, need] of PAIRS) {
    const back = t[bg] != null ? rgb(t[bg], ground) : null;
    const front = t[fg] != null && back ? rgb(t[fg], back) : null;
    if (!back || !front) {
      check(`${theme}: --${fg} on --${bg} can be read`, false, `${t[fg]} on ${t[bg]}`);
      continue;
    }
    const r = ratio(front, back);
    check(`${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1 (at least ${need})`, r >= need, `${t[fg]} on ${t[bg]}`);
  }
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
