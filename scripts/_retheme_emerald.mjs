// TEMP: retheme Deep Jade (brass on jade-green) -> Deep Emerald (#1aa06a on blackish-green)
// across index.css tokens + hardcoded hexes in components. Greens/amber/red/ink are kept.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MAP = [
  ["#cba36a", "#1aa06a"], // brass -> emerald (primary/ring/sidebar/--brass)
  ["#b3853f", "#1aa06a"], // light-mode brass -> emerald
  ["#d8b783", "#2ec88a"], // brass-light (gradient) -> emerald-light
  ["#0e2a22", "#070f0b"], // jade bg -> blackish-green
  ["#143329", "#0e1813"], // jade card
  ["#14352a", "#101b15"], // jade popover
  ["#0b241c", "#0a160f"], // jade sidebar
  ["#16382c", "#0c1c14"], // radial light stop
  ["#0a2019", "#050b07"], // radial dark stop
  ["#18402f", "#13241c"], // secondary
  ["#163a2e", "#12211a"], // muted / sidebar-accent
  ["#1f5e49", "#185640"], // accent fill (deep)
  ["#1f7d5c", "#1f8a60"], // light accent
  ["#1a2c20", "#042619"], // text-on-brass -> text-on-emerald
  ["#93a89e", "#86a094"], // muted foreground
  ["203, 163, 106", "26, 160, 106"], // brass rgba (spaced)
  ["203,163,106", "26,160,106"],     // brass rgba (tight)
];

function apply(s) {
  let out = s;
  for (const [a, b] of MAP) {
    out = out.split(a).join(b);
    if (a.startsWith("#")) out = out.split(a.toUpperCase()).join(b);
  }
  return out;
}
function walk(d, acc = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|css)$/.test(e)) acc.push(p);
  }
  return acc;
}
let n = 0;
for (const f of walk("src")) {
  const src = readFileSync(f, "utf8");
  const out = apply(src);
  if (out !== src) { writeFileSync(f, out); n++; }
}
console.log("retheme: updated " + n + " files");
