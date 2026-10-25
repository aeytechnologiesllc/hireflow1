#!/usr/bin/env node
/**
 * "Your first hire" on the dashboard (the owner, 2026-10-21): one card that
 * moves with the business, decided from real data and never from a click.
 *
 * The rules (src/cockpit/lib/firstHireStage.ts) and where the card is
 * mounted (src/cockpit/pages/Dashboard.tsx). These checks prove:
 *  - each stage is the one the data says: no live job, a live job with
 *    nobody, people applying, someone finished and scored, then done;
 *  - any decision (interview, offer, hire, pass) ends it, a closed job does
 *    too, and the cluttered blocks only come back once it is done;
 *  - the alerts step is there only when this device can have alerts;
 *  - a team member never sees the guide, and it never speaks of the team,
 *    of any job board by name (they come from shareTargets()), or of "AI".
 *
 * Run with: node scripts/first_hire_guide.test.mjs
 */
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/firstHireStage.ts")).href);
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
const show = (v) => JSON.stringify(v);

const job = (id, status = "live", title = `Job ${id}`) => ({ id, title, status });
const person = (id, jobId, over = {}) => ({
  id,
  jobId,
  name: `Person ${id}`,
  status: "pending",
  onForm: false,
  finished: false,
  score: null,
  stepsDone: 0,
  stepsTotal: 6,
  ...over,
});
const stageOf = (jobs, applicants = []) => G.firstHireStage({ jobs, applicants });

console.log("\nStage 1: no live job");
check("no jobs at all is the first step", stageOf([]).stage === "post" && stageOf([]).draft === null);
{
  const s = stageOf([job("d1", "draft", "Cashier")]);
  check("only a draft is the first step, naming the draft", s.stage === "post" && s.draft?.id === "d1");
}
check("a closed job and nothing else has nothing left to guide", stageOf([job("c1", "closed")]).stage === "done");

console.log("\nStage 2: a live job, nobody applied");
{
  const s = stageOf([job("j1"), job("d1", "draft")]);
  check("a live job with no applicants is the share step, naming the job", s.stage === "share" && s.job.id === "j1");
  const two = stageOf([job("j1"), job("j2")]);
  check("with two live jobs it names the first in the list", two.stage === "share" && two.job.id === "j1");
}

console.log("\nStage 3: people applied, nobody finished and scored");
{
  const s = stageOf([job("j1")], [person("a", "j1", { onForm: true })]);
  check("one person on the form is stage 3, not stage 2", s.stage === "applying" && s.counts.applied === 1 && s.counts.onForm === 1, show(s));
  check("…and says so in words", G.appliedHeadline(s.counts) === "Someone is applying right now.");
  const four = stageOf(
    [job("j1")],
    [
      person("a", "j1", { onForm: true }),
      person("b", "j1", { stepsDone: 1 }),
      person("c", "j1", { stepsDone: 4 }),
      person("d", "j1", { finished: true, stepsDone: 6 }),
    ],
  );
  check("a person who finished but is not scored yet is still being read, not ready", four.stage === "applying" && four.counts.reading === 1, show(four));
  check("counts: four applied, one on the form, two taking tests, one being read", four.counts.applied === 4 && four.counts.onForm === 1 && four.counts.testing === 2);
  check("the list is three people, furthest along first, the form last", four.people.length === 3 && four.people.map((p) => p.id).join() === "d,c,b", four.people.map((p) => p.id).join());
  check("the headline and the line under it", G.appliedHeadline(four.counts) === "4 people applied." && /^2 are taking the tests now\. 1 has finished and is being read\. 1 is still on the form\.$/.test(G.appliedDetail(four.counts)), G.appliedDetail(four.counts));
  const three = stageOf([job("j1")], [person("a", "j1", { stepsDone: 2 }), person("b", "j1", { stepsDone: 3 }), person("c", "j1")]);
  check("three people, all in the tests: '3 people applied.' '3 are taking the tests now.'", G.appliedHeadline(three.counts) === "3 people applied." && G.appliedDetail(three.counts) === "3 are taking the tests now.");
  check("one person is 'person', and 'is taking'", G.appliedHeadline({ applied: 1, onForm: 0, testing: 1, reading: 0 }) === "1 person applied." && G.appliedDetail({ applied: 1, onForm: 0, testing: 1, reading: 0 }) === "1 is taking the tests now.");
  const jobs2 = [job("j1"), job("j2")];
  const spread = stageOf(jobs2, [person("a", "j2"), person("b", "j2"), person("c", "j1")]);
  check("the job named is the one with the most people", spread.stage === "applying" && spread.job.id === "j2");
}

console.log("\nStage 4: someone finished and scored, no decision yet");
{
  const s = stageOf(
    [job("j1")],
    [
      person("a", "j1", { finished: true, score: 71 }),
      person("b", "j1", { finished: true, score: 88 }),
      person("c", "j1", { stepsDone: 3 }),
      person("d", "j1", { finished: true, score: 64 }),
      person("e", "j1", { finished: true, score: 90 }),
    ],
  );
  check("it is the ready stage", s.stage === "ready", show(s));
  check("the top three, best first, anyone not finished left out", s.top.map((p) => p.id).join() === "e,b,a", s.top.map((p) => p.id).join());
  check("four are ready; the headline says three", s.readyCount === 4 && G.readyHeadline(4) === "Your best three are ready.");
  check("fewer than three is said as it is", G.readyHeadline(2) === "Your best two are ready." && G.readyHeadline(1) === "Your first applicant is ready.");
  const notScored = stageOf([job("j1")], [person("a", "j1", { finished: true, score: null })]);
  check("finished but not scored is not ready", notScored.stage === "applying");
  const zero = stageOf([job("j1")], [person("a", "j1", { finished: true, score: 0 })]);
  check("a real score of 0 is a score", zero.stage === "ready" && zero.top[0].score === 0);
  const form = stageOf([job("j1")], [person("a", "j1", { onForm: true, finished: true, score: 80 })]);
  check("someone on the form is never ready", form.stage === "applying");
  const two = stageOf([job("j1"), job("j2")], [person("a", "j1", { finished: true, score: 60 }), person("b", "j2", { finished: true, score: 70 }), person("c", "j2", { finished: true, score: 75 })]);
  check("with two jobs, it names the one with the most ready and lists only its people", two.stage === "ready" && two.job.id === "j2" && two.top.map((p) => p.id).join() === "c,b");
}

console.log("\nDone: a decision, whatever it is");
for (const status of ["interview", "offered", "hired", "rejected"]) {
  const s = stageOf([job("j1")], [person("a", "j1", { finished: true, score: 80 }), person("b", "j1", { status })]);
  check(`"${status}" on anyone ends the guide`, s.stage === "done");
}
check("a pass on someone who never finished ends it too", stageOf([job("j1")], [person("a", "j1", { status: "rejected" })]).stage === "done");
check("…on a business with no live job as well", stageOf([job("d1", "draft")], [person("a", "d1", { status: "hired" })]).stage === "done");
check("someone still on the form, or in review, is not a decision", !["in_progress", "pending", "reviewing", null, undefined, ""].some((s) => G.isDecisionStatus(s)));
check("the four decisions are the ones the Applicants list calls decided", ["rejected", "interview", "offered", "hired"].every((s) => G.isDecisionStatus(s)) && G.DECISION_STATUSES.length === 4);
{
  const applicants = Array.from({ length: 12 }, (_, i) => person(`p${i}`, "j1", { finished: true, score: 50 + i }));
  check("many people, nobody decided: still the ready stage, three listed", stageOf([job("j1")], applicants).top.length === 3);
}

console.log("\nThe steps across the top");
const keysOf = (steps) => steps.map((s) => `${s.key}:${s.state}`).join(" ");
check("stage 1, no alerts: post is current, the rest wait", keysOf(G.guideSteps("post", null)) === "post:active share:todo best:todo", keysOf(G.guideSteps("post", null)));
check("stage 1 with alerts available: the alerts step is open, never current", keysOf(G.guideSteps("post", "off")) === "post:active share:todo alerts:open best:todo");
check("stage 2: post done, share current", keysOf(G.guideSteps("share", "off")) === "post:done share:active alerts:open best:todo");
check("stage 3: post and share done, meeting the best is current", keysOf(G.guideSteps("applying", "off")) === "post:done share:done alerts:open best:active");
check("stage 4 with alerts on: all but the last are ticked", keysOf(G.guideSteps("ready", "on")) === "post:done share:done alerts:done best:active");
check("'unsupported' leaves the alerts step out", keysOf(G.guideSteps("share", "unsupported")) === "post:done share:active best:todo");
check("a blocked or home-screen status keeps the step, with its own words to come", ["blocked", "needs-home-screen"].every((s) => G.guideSteps("post", s).some((x) => x.key === "alerts")));

console.log("\nPhone alerts, in words");
check("off: asks, with a Turn on button", G.alertsWords("off", "apply")?.button === "Turn on" && /phone alert/.test(G.alertsWords("off", "apply").text));
check("off, once somebody applied: asks about the first one finishing", /first one finishes/.test(G.alertsWords("off", "finish").text));
check("needs the home screen: says so, with its own button", /Home Screen/.test(G.alertsWords("needs-home-screen", "apply").text) && G.alertsWords("needs-home-screen", "apply").button === "Show me how");
check("blocked: says so, and offers no button that cannot work", /blocked/.test(G.alertsWords("blocked", "apply").text) && G.alertsWords("blocked", "apply").button === null);
check("on and unsupported say nothing (the step is ticked, or not there)", G.alertsWords("on", "apply") === null && G.alertsWords("unsupported", "apply") === null);

console.log("\nOn the dashboard");
const dash = await read("src/cockpit/pages/Dashboard.tsx");
const guideFiles = await readdir(path.join(ROOT, "src/cockpit/components/journey")).catch(() => []);
check("the guide's components live under components/journey", guideFiles.some((f) => /FirstHireGuide\.tsx$/.test(f)), guideFiles.join());
check("the dashboard asks the rules for the stage", /firstHireStage\(/.test(dash));
check("only an owner is ever shown it: a team member, or the old demo schema, never", /role === "employer" && !isTeamMember/.test(dash) && /schemaMode !== "showcase"/.test(dash));
check("it waits for the jobs and applicants to load, so a failed load never reads as 'post your first job'", /const guideLoaded = !isLoading && !jobsLoading && !candidatesFailed && !jobsFailed;/.test(dash));
check("the old welcome card and share hero are gone", !/function FirstStepsGuide/.test(dash) && !/<ShareJobHero/.test(dash) && !/data-first-steps/.test(dash));
check("the guide replaces the numbers, the pipeline, the record, the activity and the share card until it is done", /\{guideStage \? \(\s*\/\*[^*]*\*\/\s*<FirstHireGuide[^>]*\/>\s*\) : \(\s*<>\s*\{\/\*[^]*?<section aria-label="At a glance"/.test(dash));
check("the 'You're set up' line is the first thing after it", /\{showSetUp && <SetUpNote/.test(dash) && /guideFlags\.seen && !guideFlags\.away/.test(dash));
check("an owner's first applicant is the guide's moment, not a second card", /candidates\.length === 1 && !guideEligible/.test(dash));
check("'What needs you today' is untouched for everyone else", /What needs you today/.test(dash) && /awaitingDecision > 0/.test(dash));
check("the first job's own button replaces '+ New job' while it is the loudest thing", /guideStage\?\.stage !== "post"/.test(dash));
check("the Share Kit is fetched when opened, not with the dashboard", /lazy\(\(\) => import\("\.\.\/ShareKitDialog"\)/.test(await read("src/cockpit/components/journey/FirstHireGuide.tsx")));
check("the Applicants list is read only once somebody has applied", /props\.light\.stage === "applying"\) return <GuideWithApplicants/.test(await read("src/cockpit/components/journey/FirstHireGuide.tsx")));
check("phone alerts are asked for by the notifications hook's seam, never by the guide", /useGuideNotifications\(\)/.test(dash) && !/Notification\.requestPermission|serviceWorker|pushManager/i.test(await read("src/cockpit/components/journey/FirstHireGuide.tsx")));
const journey = (await Promise.all(guideFiles.map((f) => read(`src/cockpit/components/journey/${f}`)))).join("\n");
check("it never says AI", !/\bAI\b/.test(journey) && !/\bAI\b/.test(await read("src/cockpit/lib/firstHireStage.ts").then((t) => t.replace(/\/\*[\s\S]*?\*\//g, ""))));
check("it hard-codes no job board: the places to share come from shareTargets() (docs/LAUNCH-PLAN.md, Phase 2, task 6)", /shareTargets\(/.test(journey) && !/onlinejobs|indeed|linkedin|ziprecruiter|monster|facebook|craigslist/i.test(journey.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
check("it never offers to invite the team", !/Invite your team/i.test(journey) && !/navigate\("\/team"\)/.test(journey));
check("it reads no decision from a click: no localStorage in the stage rules", !/localStorage|sessionStorage/.test(await read("src/cockpit/lib/firstHireStage.ts")));

console.log(`\nfirst hire guide: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
