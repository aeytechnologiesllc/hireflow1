#!/usr/bin/env node
/**
 * Applicants: Pass by score (docs/APPLICANTS-LIST.md, "Pass by score";
 * src/cockpit/lib/passByScore.ts, src/cockpit/components/PassByScoreDialog.tsx).
 *
 * The owner, 2026-10-09: "there should be a way for us to pretty much reject
 * applicants in bulk. You could maybe select a score ... it'll show like a
 * clear transparency how many people will be and ask me to confirm and then
 * that's it ... and then they would be notified."
 *
 * It emails every person it reaches and cannot be undone, so these checks
 * pin, above all, who it can never reach:
 *  - nobody without a FINAL score (still testing, or scored "so far");
 *  - nobody on the shortlist, invited to interview, holding an offer, hired,
 *    already declined or blocked;
 *  - nobody at or above the line;
 * and then: the counts shown are counts of rows, the picture, the words, two
 * presses before anything is sent, and that the sending is the bulk Pass's
 * own, unchanged.
 *
 * Run with: node scripts/pass_by_score.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href;
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(base + suffix, context);
        } catch {
          // try the next spelling
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const P = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/passByScore.ts")).href);

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
const show = (v) => JSON.stringify(v);
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let n = 0;
const row = (over = {}) => {
  n += 1;
  return { id: `app-${n}`, candidateId: `cand-${n}`, name: `Person ${String(n).padStart(2, "0")}`, jobTitle: "Team Leader", status: "reviewing", tab: "review", finished: true, score: 40, scoreKind: "final", ...over };
};
const ids = (plan) => plan.pass.targets.map((t) => t.applicationId);

console.log("\nWho it reaches");
{
  const low = row({ score: 22 });
  const mid = row({ score: 49 });
  const onLine = row({ score: 50 });
  const high = row({ score: 81 });
  const pending = row({ score: 10, status: "pending" });
  const plan = P.passByScorePlan([high, mid, onLine, low, pending], 50);
  check("everyone who finished, is waiting, and scored UNDER the line", show(ids(plan).sort()) === show([low.id, mid.id, pending.id].sort()), show(ids(plan)));
  check("someone exactly on the line stays", !ids(plan).includes(onLine.id) && plan.staying === 2);
  check("they are listed lowest score first, with their scores", show(plan.reached.map((r) => r.score)) === show([10, 22, 49]) && plan.reached[0].name === pending.name);
  check("the plan it hands to the bulk Pass names the job and each person's own ids", plan.pass.jobTitle === "Team Leader" && plan.pass.targets[0].candidateId === pending.candidateId && plan.pass.left === 0 && plan.pass.unfinished === 0);
  check("moving the line changes who it reaches, and nothing else", ids(P.passByScorePlan([high, mid, onLine, low, pending], 51)).length === 4 && ids(P.passByScorePlan([high, mid, onLine, low, pending], 23)).length === 2 && ids(P.passByScorePlan([high, mid, onLine, low, pending], 10)).length === 0);
  check("the same row given twice is one person", ids(P.passByScorePlan([low, low, low], 50)).length === 1);
}

console.log("\nWho it can never reach");
{
  const never = [
    ["someone still on the form", row({ score: null, scoreKind: "none", status: "in_progress", finished: false })],
    ["someone still testing with a low score so far", row({ score: 12, scoreKind: "so_far", finished: false, status: "pending" })],
    ["someone who finished but is scored only 'so far'", row({ score: 12, scoreKind: "so_far", finished: true })],
    ["someone who finished and has no score yet", row({ score: null, scoreKind: "none", finished: true })],
    ["someone whose tests are not finished, even with a final-looking score", row({ score: 12, scoreKind: "final", finished: false })],
    ["someone on the shortlist", row({ score: 5, shortlisted: true })],
    ["someone invited to interview", row({ score: 5, status: "interview" })],
    ["someone holding an offer", row({ score: 5, status: "offered" })],
    ["someone hired", row({ score: 5, status: "hired" })],
    ["someone already declined", row({ score: 5, status: "rejected" })],
    ["someone blocked", row({ score: 5, blocked: true })],
    ["someone on the Blocked tab", row({ score: 5, tab: "blocked" })],
    ["someone who scored 100", row({ score: 100 })],
  ];
  for (const [what, r] of never) {
    const reached = ids(P.passByScorePlan([r], 100));
    check(`${what} is never reached, even with the line at 100`, reached.length === 0, show(reached));
  }
  const all = never.map(([, r]) => r);
  const plan = P.passByScorePlan(all, 100);
  check("with all of them on the list and the line at its highest: nobody", ids(plan).length === 0 && plan.reached.length === 0);
  check("each kind is counted, so it can be said on the screen", plan.kept.shortlisted === 1 && plan.kept.interview === 1 && plan.noFinalScore === 5 && plan.staying === 1, show({ kept: plan.kept, noFinalScore: plan.noFinalScore, staying: plan.staying }));
  check("the line is a whole number from 1 to 100, whatever is typed", P.clampScoreLine(0) === 1 && P.clampScoreLine(-5) === 1 && P.clampScoreLine(250) === 100 && P.clampScoreLine(49.6) === 50 && P.clampScoreLine(NaN) === P.PASS_BY_SCORE_DEFAULT && P.passByScorePlan([row({ score: 0 })], 0).under === 1);
  check("a score of 0 is a real score: under any line", ids(P.passByScorePlan([row({ score: 0 })], 1)).length === 1);
}

console.log("\nThe numbers and the picture");
{
  const rows = [3, 9, 10, 34, 35, 49, 50, 50, 72, 99, 100].map((score) => row({ score }));
  rows.push(row({ score: 20, shortlisted: true }), row({ score: 15, status: "interview" }), row({ score: null, scoreKind: "none", status: "in_progress", finished: false }));
  const plan = P.passByScorePlan(rows, 50);
  check("every number on the screen adds up to the people on the list", plan.pass.targets.length === 6 && plan.kept.shortlisted === 1 && plan.kept.interview === 1 && plan.staying === 5 && plan.noFinalScore === 1 && plan.pass.targets.length + plan.kept.shortlisted + plan.kept.interview + plan.staying + plan.noFinalScore === rows.length);
  const bars = P.scoreBars(plan.scores);
  check("the picture has ten bars, and counts everyone who finished and is waiting (the shortlisted too)", bars.length === 10 && bars.reduce((a, b) => a + b, 0) === 12 && show(bars) === show([2, 1, 1, 2, 1, 2, 0, 1, 0, 2]), show(bars));
  check("100 sits in the last bar, not past it", P.scoreBars([100, 100, 95])[9] === 3 && P.scoreBars([-4, 0])[0] === 2);
  const words = P.passByScoreWords(plan);
  console.log(`   ${words.headline} ${words.effect}`);
  words.left.forEach((l) => console.log(`   • ${l}`));
  check("the headline says how many and under what", words.headline === "6 applicants scored under 50.");
  check("it says what happens to them", /Each is declined in your name, comes off your list, and gets this note by email:/.test(words.effect));
  check("it says who is left alone, with counts", words.left.length === 4 && /^1 under 50 is on your shortlist: left as it is\.$/.test(words.left[0]) && /^1 under 50 is already invited to interview: left as it is\.$/.test(words.left[1]) && /^5 scored 50 or more and stay on your list\.$/.test(words.left[2]) && /^1 has not finished the tests, so there is no final score yet: not included\.$/.test(words.left[3]), show(words.left));
  check("two presses, and the second says exactly what it does", words.arm === "Pass on 6" && words.confirm === "Yes, pass on 6 and email each one" && words.warning === "This emails 6 applicants and cannot be undone.");
  const one = P.passByScoreWords(P.passByScorePlan([row({ score: 3 })], 50));
  check("one person reads as one person", one.headline === "1 applicant scored under 50." && one.confirm === "Yes, pass on 1 and email them" && /They are declined in your name/.test(one.effect));
  const none = P.passByScoreWords(P.passByScorePlan([row({ score: 90 })], 50));
  check("nobody under the line says so, and offers nothing to press", none.headline === "Nobody who has finished scored under 50." && /Move the line/.test(none.effect));
}

console.log("\nThe wiring");
{
  const lib = code(await read("src/cockpit/lib/passByScore.ts"));
  check("the plan is plain arithmetic: it imports the bulk Pass's plan and nothing that could send", (lib.match(/^import /gm) ?? []).length === 1 && /from "@\/cockpit\/lib\/bulkPass";/.test(lib) && !/supabase|fetch\(|functions\.invoke|rpc\(/.test(lib));
  const dialog = code(await read("src/cockpit/components/PassByScoreDialog.tsx"));
  check("the sending is the bulk Pass's own hook, called once, with the plan's own people", /const \{ passMany, progress, busy \} = useBulkPass\(\);/.test(dialog) && (dialog.match(/passMany\(/g) ?? []).length === 1 && /const targets = plan\.pass\.targets;\s*const result = await passMany\(targets\);/.test(dialog) && !/supabase|\.update\(|functions\.invoke/.test(dialog));
  const run = /const run = async \(\) => \{([\s\S]*?)\n  \};/.exec(dialog)?.[1] ?? "";
  check("the first press only arms it: nothing is sent before the second", /if \(busy \|\| count === 0\) return;\s*if \(!armed\) \{\s*setArmed\(true\);\s*return;\s*\}/.test(run) && run.indexOf("setArmed(true)") < run.indexOf("passMany("), run.slice(0, 160));
  check("moving the line, by typing, stepping or dragging, takes the second press back", (dialog.match(/setArmed\(false\)/g) ?? []).length >= 4 && /const moveTo = \(value: number\) => \{[\s\S]*?setArmed\(false\);\s*\};/.test(dialog) && /setTyped\(digits\);\s*setArmed\(false\);/.test(dialog));
  check("every opening starts unarmed, at the default line", /if \(!open\) return;\s*setLine\(PASS_BY_SCORE_DEFAULT\);\s*setTyped\(String\(PASS_BY_SCORE_DEFAULT\)\);\s*setArmed\(false\);/.test(dialog));
  check("it shows every person it reaches by name and score, the note, and who is left alone", dialog.includes("data-pass-who") && /plan\.reached\.map\(\(person\) =>/.test(dialog) && /<DeclineNotePreview jobTitle=\{plan\.pass\.jobTitle\} \/>/.test(dialog) && dialog.includes("data-pass-left"));
  check("it cannot be closed half-way through a run", /if \(e\.key === "Escape" && !busy\) onClose\(\);/.test(dialog) && /if \(!busy\) onClose\(\);/.test(dialog) && /disabled=\{busy \|\| count === 0\}/.test(dialog));
  check("the outcome is told in the bulk Pass's own words", /const said = bulkPassDoneWords\(result\);/.test(dialog) && /bulkPassProgressWords\(progress\.done, progress\.total\)/.test(dialog));
  const page = code(await read("src/cockpit/pages/Applicants.tsx"));
  check("the list gives it everyone for the job in view (not the tab, not the search, never the blocked)", /const people = view\.scoped\.filter\(\(r\) => r\.tab !== "blocked"\);/.test(page) && /<PassByScoreDialog\s+open=\{passByScoreOpen\}\s+rows=\{people\}/.test(page));
  check("the button is beside the search, once anyone has applied", /\{people\.length > 0 && \(\s*<button[^>]*onClick=\{\(\) => setPassByScoreOpen\(true\)\}[^>]*>\s*Pass by score\s*<\/button>/.test(page));
  const pass = code(await read("src/cockpit/hooks/useBulkPass.ts"));
  check("the bulk Pass still changes only an application that is still being decided on", /\.in\("status", \[\.\.\.PASSABLE_STATUSES\] as never\)/.test(pass));
  const doc = await read("docs/APPLICANTS-LIST.md");
  check("docs/APPLICANTS-LIST.md explains it and names this test", doc.includes("## 10. Pass by score") && doc.includes("scripts/pass_by_score.test.mjs") && /Two presses/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
