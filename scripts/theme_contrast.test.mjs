#!/usr/bin/env node
/**
 * The app's colours read for everyone, Day and Night (WCAG AA): ink and
 * ivory with a brass accent, locked by the owner on 2026-10-25
 * (docs/LAUNCH-PLAN.md, Phase 3, task 2). Reads the tokens straight from
 * src/index.css, so a value changed there is checked here.
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
];

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
