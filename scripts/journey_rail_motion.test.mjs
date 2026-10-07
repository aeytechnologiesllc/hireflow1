#!/usr/bin/env node
/**
 * How the applicant profile's journey rail moves (docs/APPLICANT-PROFILE.md,
 * "How the journey rail moves"): one glide when a profile opens, then still.
 *
 * What it proves, and what it cannot. The motion itself was measured in a
 * real browser (frame by frame, fixture data) before it shipped; a plain Node
 * test cannot watch pixels. What it can do is run the timing rules (the real
 * src/cockpit/lib/gemRail.ts) and hold the source to the decisions the owner
 * approved, so a later edit that brings back a loop, a replay on every pager
 * move, or the mid-walk jump fails here by name.
 *
 * Run with: node scripts/journey_rail_motion.test.mjs
 */
import { readFile } from "node:fs/promises";
import { GLIDE_EASING, OPENING_HOLD_MS, glideMs, glideTimeAt } from "../src/cockpit/lib/gemRail.ts";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const src = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

console.log("\nThe glide's timing:\n");
check("it is the cockpit's own curve", GLIDE_EASING.join() === "0.4,0,0.2,1");
check("one gem on a laptop takes about two thirds of a second", glideMs(180) === 672 && glideMs(0) === 660);
check("a longer run takes longer, never over 1.2 s", glideMs(540) === 816 && glideMs(900) === 960 && glideMs(1500) === 1200 && glideMs(9000) === 1200);
check("a broken measurement still gives a time", glideMs(NaN) === 660 && glideMs(-50) === 660);
check("the rail rests briefly before it starts", OPENING_HOLD_MS === 140);
// The easing forwards: at time t (0..1), how much of the distance is covered.
const [x1, , x2] = GLIDE_EASING;
function coveredAt(t) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const s = (lo + hi) / 2;
    const u = 1 - s;
    if (3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s < t) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return s * s * (3 - 2 * s);
}
check("a gem inks when the line reaches it: glideTimeAt undoes the easing", [0.05, 0.2, 0.35, 0.5, 0.75, 0.95].every((t) => Math.abs(glideTimeAt(coveredAt(t)) - t) < 1e-4));
check("it starts at 0 and ends at 1", glideTimeAt(0) === 0 && glideTimeAt(-1) === 0 && glideTimeAt(NaN) === 0 && glideTimeAt(1) === 1 && glideTimeAt(2) === 1);
const steps = Array.from({ length: 21 }, (_, i) => glideTimeAt(i / 20));
check("gems further along ink later", steps.every((t, i) => i === 0 || t > steps[i - 1]));
check("three gems behind them: the line reaches them at 29% and 43% of the glide", Math.abs(glideTimeAt(1 / 3) - 0.2875) < 0.001 && Math.abs(glideTimeAt(2 / 3) - 0.4278) < 0.001);

const gemRail = await src("src/components/rail/GemRail.tsx");
const css = await src("src/cockpit/cockpit.css");
const journeyRail = await src("src/cockpit/components/ApplicantJourneyRail.tsx");
const profile = await src("src/cockpit/pages/CandidateDetail.tsx");
const careers = await src("src/pages/Index.tsx");
const createFlow = await src("src/components/ava/createFlow/shared.tsx");

console.log("\nWhere it applies:\n");
check("the profile's rail is the calm one", /motion="calm"\s*\n\s*entrance=\{entrance\}/.test(journeyRail));
check("both of the profile's rails are told whether to draw", (profile.match(/entrance=\{railEntrance\}/g) ?? []).length === 2);
check("the pager's move says it was the pager", /const PAGER_MOVE = \{ pagerMove: true \} as const;/.test(profile) && /navigate\(`\/applicants\/\$\{target\}`, \{ replace: true, state: PAGER_MOVE \}\)/.test(profile));
check("a profile the pager turned to does not draw itself; one opened from the list does", /pagerMove === true;/.test(profile) && /railEntrance=\{turnedTo \? "none" : "draw"\}/.test(profile));
check("the careers page and the create-job flow keep the walk", !/motion=/.test(careers) && !/motion=/.test(createFlow) && /motion = "walk",/.test(gemRail));

console.log("\nThe component:\n");
check("calm: the gems show the record from the first frame", /const shown = calm \? target : visualIndex;/.test(gemRail) && !/setVisualIndex\(target\);\s*\n\s*if \(!openedRef/.test(gemRail));
check("the opening is skipped under reduced motion and when the caller says none", /if \(entrance === "draw" && !reducedMotion\(\)\) startOpening\(\);/.test(gemRail));
check("nobody to draw toward: no opening from the first gem", /if \(!root \|\| at <= 0 \|\| !pts\[at\]\) return;/.test(gemRail));
check("each gem is told when the line reaches it", /glideTimeAt\(covered\)/.test(gemRail) && /"--rail-at"/.test(gemRail));
check("the opening removes itself", /delete root\.dataset\.entrance;/.test(gemRail) && /window\.setTimeout\(endOpening, openingMsRef\.current\)/.test(gemRail));
check("a result that makes the band taller no longer cuts a glide short (the 188px jump)", /const moved =/.test(gemRail) && /return moved;/.test(gemRail) && /else if \(measure\(\)\) applyVisual\(visualIndexRef\.current, true\);/.test(gemRail) && /if \(key === placedRef\.current\) return;/.test(gemRail));
check("calm: the seal does not stamp on open; the verdict does when it lands", /className=\{calm \? "ck-seal" : "ck-seal ck-seal-press"\}/.test(gemRail) && /if \(sealedRef\.current === false && sealedNow\) setStampBeat/.test(gemRail));

console.log("\nThe stylesheet:\n");
const start = css.indexOf("/* ── CALM: how the rail moves on the applicant profile");
const end = css.indexOf('/* ── MINI GEM RAIL — Dashboard, "Pipeline at a glance"');
const calm = start >= 0 && end > start ? css.slice(start, end) : "";
const rules = calm.replace(/\/\*[\s\S]*?\*\//g, "");
check("the calm block is where the test expects it", calm.length > 2000);
check("nothing in it loops", !/infinite/.test(rules));
check("the halo is there and still", /\.ck-rail-calm \.ck-rail-node\.is-current \.ck-rail-dot::after \{ opacity: 0\.22; animation: none; \}/.test(rules));
check("the line's colours are fixed: one gradient, not sized or slid", /\.ck-rail-calm \.ck-rail-ink \{[^}]*linear-gradient\(90deg, var\(--gem-jade\), var\(--gem-mint\), var\(--gem-teal\), var\(--gem-gold\)\)[^}]*\}/.test(rules) && !/background-size|background-position/.test(rules));
const travel = ["fill", "ink", "chip"].map((part) => (rules.match(new RegExp(`\\.ck-rail-calm \\.ck-rail-${part} \\{([^}]*)\\}`)) ?? [])[1] ?? "");
check("the line and the initials travel by transform only, on one curve", travel.every((body) => /transition: transform var\(--rail-move, 660ms\) cubic-bezier\(0\.4, 0, 0\.2, 1\);/.test(body)));
const openers = ["window", "ink", "ride"].map((name) => (rules.match(new RegExp(`@keyframes ck-rail-open-${name} \\{([\\s\\S]*?)\\n\\}`)) ?? [])[1] ?? "");
check("the opening's travel is transform only", openers.every((body) => body.includes("transform:") && !/(left|width|background|clip-path)\s*:/.test(body)));
check("every part of the opening starts from one attribute, on the same hold", (rules.match(/\.ck-rail-calm\[data-entrance\] [^{]+\{\s*animation: ck-rail-open-(window|ink|ride) var\(--rail-run, 800ms\) cubic-bezier\(0\.4, 0, 0\.2, 1\) var\(--rail-hold, 140ms\) both;/g) ?? []).length === 3);
check("the arrival ring plays once", /\.ck-rail-calm \.ck-rail-node\[data-arrive\] \.ck-rail-dot::before \{\s*animation: ck-rail-arrive 0\.7s cubic-bezier\(0\.2, 0\.6, 0\.3, 1\) var\(--rail-at, 0ms\);/.test(rules));
check("the track is never drawn a frame late under reduced motion", /\.ck-rail-track,\s*\n\.ck-rail-calm \.ck-rail-fill-clip \{ transition-property: none; \}/.test(rules));
check("reduced motion: no transitions and no animations on the calm rail", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ck-rail-calm \.ck-rail-chip,[\s\S]*animation: none !important;/.test(rules));
check("the walk's own rules are untouched", /\.ck-rail-track-fill \{\s*\n\s*background: linear-gradient\(90deg, var\(--gem-jade\), var\(--gem-mint\), var\(--gem-teal\), var\(--gem-gold\)\);\s*\n\s*background-size: 240% 100%;\s*\n\s*animation: ck-rail-flow 8s linear infinite;/.test(css));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
