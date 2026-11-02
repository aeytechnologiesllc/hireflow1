#!/usr/bin/env node
/**
 * The Dashboard once a live job has applicants (src/cockpit/components/LiveJobDashboard.tsx;
 * the owner, 2026-11-02: "they want to see what's going on ... who's the best",
 * not "Applicants 237 all time", and the pipeline mixed his closed job's steps
 * into the live one's).
 *
 * Run with: node scripts/live_job_dashboard.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const L = await import(path.join(ROOT, "src/cockpit/lib/liveJobCounts.ts"));

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

const now = Date.parse("2026-11-02T22:00:00Z");
const row = (over) => ({ appliedAt: "2026-11-01T10:00:00Z", finished: false, score: null, tab: "taking-tests", liveNow: false, onForm: false, decided: false, ...over });
const counts = L.liveJobCounts(
  [
    row({ appliedAt: "2026-11-02T20:00:00Z", finished: true, score: 83, tab: "needs-review" }),
    row({ finished: true, score: 64, tab: "needs-review" }),
    row({ finished: true, score: 91, tab: "interview", decided: true }),
    row({ liveNow: true }),
    row({ appliedAt: "2026-11-02T21:50:00Z", liveNow: true, onForm: true, tab: "part-way" }),
  ],
  now,
);
check("applied counts everyone on the job, today's apart", counts.applied === 5 && counts.appliedToday === 2, JSON.stringify(counts));
check("finished every test, and 70 or more among them", counts.finished === 3 && counts.seventyUp === 2);
check("waiting on you is the list's Needs review", counts.waiting === 2);
check("taking tests now and on the form now are the live ones, apart", counts.takingNow === 1 && counts.onFormNow === 1);

const dash = await readFile(path.join(ROOT, "src/cockpit/pages/Dashboard.tsx"), "utf8");
const live = dash.slice(dash.indexOf(") : liveView ? ("), dash.indexOf(") : (\n        <>\n          {/* ── The numbers, always."));
check("the live view is its own branch, after the first-hire guide", live.length > 0 && dash.indexOf("guideStage ? (") < dash.indexOf(") : liveView ? ("));
check("it leads with the live job's card, the busiest job first", /<LiveJobCard/.test(live) && /\.sort\(\(a, b\) => b\.rows\.length - a\.rows\.length\)/.test(dash));
check("its steps are that job's alone (never the closed job's)", /buildJourneyPipeline\(\s*applications\.filter\(\(a\) => \(a as \{ job_id\?: string \| null \}\)\.job_id === job\.id\),\s*raw \? \[raw\] : \[\],?\s*\)/.test(dash));
check("no all-time tiles, no Visits, no Messages card in it", !/StatTile|Visits|unreadMessages|"messages"/.test(live) && /renderNeeds\(\{ decision: false, messages: false, emptyLine: false \}\)/.test(live));
check("best so far: finished, still in the running, 50 or more", /r\.finished && r\.status !== "rejected" && r\.status !== "hired" && r\.score != null && r\.score >= 50/.test(dash) && /<SealedRow/.test(live));
check("happening now is there, beside it", /<HappeningNow/.test(live));
check("the numbers on the card open the list they count", /where=finished&score=70-up/.test(await readFile(path.join(ROOT, "src/cockpit/components/LiveJobDashboard.tsx"), "utf8")));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
