#!/usr/bin/env node
/**
 * "Where they are" as four milestones (src/cockpit/lib/milestones.ts;
 * docs/LAUNCH-PLAN.md, Phase 3, task 8): every application state lands on a
 * milestone with words under it, never a blank.
 *
 * Run with: node scripts/applicant_milestones.test.mjs
 */
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const M = await import(path.join(ROOT, "src/cockpit/lib/milestones.ts"));

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
const at = (input) => M.milestonesFor({ status: "in_progress", onForm: false, finished: false, testStates: [], ...input });
const show = (v) => JSON.stringify(v);

check("four milestones, in order", M.MILESTONE_LABELS.join(" → ") === "Applied → Tested → Interview → Hired");

const form = at({ status: "pending", onForm: true, testStates: ["todo", "todo"] });
check("filling in the form: at Applied, nothing lit yet", form.at === 0 && form.lit === 0 && form.detail === "Filling in the form", show(form));

const testing = at({ testStates: ["done", "below", "now", "todo", "todo"] });
check("taking the tests: at Tested, Applied lit, how far in words", testing.at === 1 && testing.lit === 1 && testing.detail === "Testing · 2 of 5", show(testing));
check("a skipped step counts as behind them", at({ testStates: ["skipped", "now"] }).detail === "Testing · 1 of 2");
check("waiting for a computer says so", at({ testStates: ["done", "now"], liveState: "waiting" }).detail === "Waiting for a computer · 1 of 2");
check("gone part-way says so", at({ testStates: ["done", "now", "todo"], liveState: "left" }).detail === "Left part-way · 1 of 3");

const review = at({ status: "reviewing", finished: true, testStates: ["done", "done"] });
check("every test done, waiting on the team: Tested lit", review.at === 1 && review.lit === 2 && review.detail === "Tested · waiting on you", show(review));
check("…also when the steps are all done before the status catches up", at({ testStates: ["done", "below"] }).lit === 2);

const interview = at({ status: "interview", finished: true, testStates: ["done"] });
check("interview: at Interview, the two before it lit", interview.at === 2 && interview.lit === 2 && interview.detail === "Interview", show(interview));
const offer = at({ status: "offered", finished: true, testStates: ["done"] });
check("offer made: at Hired, not lit yet", offer.at === 3 && offer.lit === 3 && offer.detail === "Offer made", show(offer));
const hired = at({ status: "hired", finished: true, testStates: ["done"] });
check("hired: all four lit, the one brass moment", hired.at === 3 && hired.lit === 4 && hired.tone === "won", show(hired));

const declinedAfter = at({ status: "rejected", finished: true, testStates: ["done", "done"] });
check("declined after the tests: stopped at Tested, Tested still lit", declinedAfter.at === 1 && declinedAfter.lit === 2 && declinedAfter.tone === "stopped" && declinedAfter.detail === "Declined", show(declinedAfter));
const declinedMid = at({ status: "rejected", testStates: ["done", "now", "todo"] });
check("declined part-way: stopped at Tested, not lit", declinedMid.at === 1 && declinedMid.lit === 1, show(declinedMid));
const declinedEarly = at({ status: "rejected", testStates: ["todo", "todo"] });
check("declined before any test: stopped at Applied", declinedEarly.at === 0 && declinedEarly.lit === 1, show(declinedEarly));
check("declined on the form: stopped at Applied, nothing lit", at({ status: "rejected", onForm: true, testStates: ["todo"] }).lit === 0);

const noTests = at({ status: "reviewing", finished: true, testStates: [] });
check("a job with no tests: Applied, waiting on the team", noTests.at === 0 && noTests.lit === 1 && noTests.detail === "Applied · waiting on you", show(noTests));
check("…and while they are still applying", at({ testStates: [] }).detail === "Applied");

for (const status of ["pending", "reviewing", "in_progress", "interview", "offered", "hired", "rejected", null, undefined, "made_up"]) {
  for (const onForm of [true, false]) {
    for (const finished of [true, false]) {
      for (const testStates of [[], ["todo"], ["now", "todo"], ["done", "done"]]) {
        const v = M.milestonesFor({ status, onForm, finished, testStates });
        const ok = Number.isInteger(v.at) && v.at >= 0 && v.at <= 3 && v.lit >= v.at && v.lit <= v.at + 1 && typeof v.detail === "string" && v.detail.trim().length > 0;
        if (!ok) check(`never blank or out of range: ${show({ status, onForm, finished, testStates })}`, false, show(v));
      }
    }
  }
}
check("every state × form × finished × steps lands on a milestone with words", true);
check("no green, player or Zulu wording in the words", !/jade|player|zulu/i.test(JSON.stringify([form, testing, review, interview, offer, hired, declinedAfter, noTests])));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
