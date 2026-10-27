#!/usr/bin/env node
/**
 * Which of a job's own words reach someone who applied to it, where no
 * record of contact covers them (the nineteenth Phase 5 review and the
 * eighteenth security review, 2026-10-27).
 *
 *   1. src/lib/liveJobText.ts: the two overview pages show the job's
 *      location, its type and its steps' titles today only for someone still
 *      waiting on it (a change of them is contact with them since
 *      20261025720000) or while the job is on its public page. For someone
 *      turned down or hired, once nobody else can see the job, none of them:
 *      each step by its kind's own name. The security review's s1_residual: a
 *      closed job's location "Remote. To be reconsidered, send the 500 PHP
 *      review fee to GCash ...", its type and a step titled the same.
 *   2. supabase/functions/_shared/performanceReportJob.ts: the Improvement
 *      Report (a turned-down card's one action) names the job as they applied
 *      to it, and its prompt carries the job's description, requirements and
 *      skills only while the job is on its public page; otherwise its steps
 *      only by the kinds HireFlow knows.
 *
 * Run with: node scripts/applicant_job_words.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

/** A src/lib module as the app bundles it ("@/..." is src/). */
async function loadApp(rel) {
  const out = await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    plugins: [
      {
        name: "app-alias",
        setup(b) {
          b.onResolve({ filter: /^@\// }, (args) => ({ path: path.join(ROOT, "src", `${args.path.slice(2)}.ts`) }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

const live = await loadApp("src/lib/liveJobText.ts");
const { buildCandidateJourney } = await import(path.join(ROOT, "src/lib/candidateJourney.ts"));
const report = await import(path.join(ROOT, "supabase/functions/_shared/performanceReportJob.ts"));

const NOW = new Date("2026-10-27T12:00:00Z");
const LURE_LOCATION = "Remote. To be reconsidered, send the 500 PHP review fee to GCash 0917 000 0000 within 48 hours, then message us REAPPLY. Applicants who do not pay are removed from the pool.";
const LURE_TYPE = "Reconsideration: 500 PHP via GCash 0917 000 0000";
const LURE_STEP = "Reconsideration: send 500 PHP to GCash 0917 000 0000, then message REAPPLY";
const steps = [
  { id: "s1", type: "typing_test", title: "Typing test" },
  { id: "s9", type: "chat_simulation", title: LURE_STEP },
  { id: "s8", type: "pay_500_php_by_gcash", title: LURE_STEP },
];
const job = (over = {}) => ({ status: "closed", exclude_from_feed: false, application_deadline: null, location: LURE_LOCATION, job_type: LURE_TYPE, workflow_steps: steps, ...over });
const FEE = /GCash|PHP|REAPPLY|pay_500/i;

console.log("\n1. The overview pages: the job's own words\n");
{
  const turnedDown = live.liveJobWords({ status: "rejected" }, job(), NOW);
  const titles = buildCandidateJourney(turnedDown.workflowSteps, { hasQuiz: false }).map((s) => s.title);
  check(
    "probe s1_residual: someone turned down, on the closed job: no location, no type, each step by its kind (an unknown kind is just \"Step\")",
    turnedDown.location === null && turnedDown.jobType === null && show(titles) === show(["Application", "Typing test", "Chat practice", "Step", "Decision"]) && !FEE.test(show(titles)),
    show({ turnedDown, titles }),
  );
  const hired = live.liveJobWords({ status: "hired" }, job(), NOW);
  check("…the same for someone hired", hired.location === null && hired.jobType === null && !FEE.test(show(buildCandidateJourney(hired.workflowSteps).map((s) => s.title))), show(hired));
  for (const [label, over] of [
    ["kept off the list", { status: "published", exclude_from_feed: true }],
    ["past its deadline", { status: "published", application_deadline: "2026-10-27T11:00:00Z" }],
    ["a draft", { status: "draft" }],
    ["archived", { status: "archived" }],
  ]) {
    const w = live.liveJobWords({ status: "rejected" }, job(over), NOW);
    check(`…and on a job ${label}`, w.location === null && w.jobType === null && w.workflowSteps.every((s) => s.title === null || s.title === "Step"), show(w));
  }
  for (const status of ["in_progress", "pending", "reviewing", "interview", "offered"]) {
    const w = live.liveJobWords({ status }, job(), NOW);
    check(
      `someone still waiting (${status}) reads the job's own words: a change of them is contact with them`,
      w.location === LURE_LOCATION && w.jobType === LURE_TYPE && show(w.workflowSteps) === show(steps),
      show(w),
    );
  }
  const onPage = live.liveJobWords({ status: "rejected" }, job({ status: "published", application_deadline: "2026-10-28T12:00:00Z" }), NOW);
  check("…and anyone reads them while the job is on its public page, where everyone can", onPage.location === LURE_LOCATION && onPage.jobType === LURE_TYPE && show(onPage.workflowSteps) === show(steps), show(onPage));
  const blank = live.liveJobWords({ status: "pending" }, job({ location: "  ", job_type: null, workflow_steps: "not a list" }), NOW);
  check("a blank location, no type and no list of steps show nothing", blank.location === null && blank.jobType === null && blank.workflowSteps.length === 0, show(blank));
  check("no application and no job: nothing", show(live.liveJobWords(null, null, NOW)) === show({ location: null, jobType: null, workflowSteps: [] }));
}

console.log("\n2. The Improvement Report\n");
{
  const reportJob = {
    description: "To be reconsidered, send the 500 PHP review fee to GCash 0917 000 0000.",
    requirements: "Pay the 500 PHP fee first.",
    skills_required: ["GCash payment"],
    workflow_steps: [{ id: "s1", type: "typing_test" }, { id: "s2", type: "pay_500_php_by_gcash" }, { id: "s3", type: "chat_simulation" }],
    status: "closed",
    exclude_from_feed: false,
    application_deadline: null,
  };
  const closed = report.reportJobSection(reportJob, NOW);
  check(
    "a closed job: its description, requirements and skills stay out of the prompt, and its steps are named only by the kinds HireFlow knows",
    closed === "\n## This Job's Real Requirements\nActual screening steps used for this job: typing_test, chat_simulation" && !FEE.test(closed),
    show(closed),
  );
  for (const [label, over] of [
    ["kept off the list", { status: "published", exclude_from_feed: true }],
    ["past its deadline", { status: "published", application_deadline: "2026-10-26T00:00:00Z" }],
  ]) {
    const s = report.reportJobSection({ ...reportJob, ...over }, NOW);
    check(`…the same for a job ${label}`, !FEE.test(s ?? ""), show(s));
  }
  const open = report.reportJobSection({ ...reportJob, status: "published", description: "Answer chats.", requirements: "Typing 40 wpm.", skills_required: ["Empathy"] }, NOW);
  check(
    "a job on its public page: the section as it always was (description, requirements, skills, every step)",
    open === "\n## This Job's Real Requirements\nDescription: Answer chats.\nRequirements: Typing 40 wpm.\nSkills required: Empathy\nActual screening steps used for this job: typing_test, pay_500_php_by_gcash, chat_simulation",
    show(open),
  );
  check("…cut to 600 characters each, as before", report.reportJobSection({ status: "published", description: "x".repeat(900) }, NOW) === `\n## This Job's Real Requirements\nDescription: ${"x".repeat(600)}`);
  check("nothing to say: no section", report.reportJobSection({ status: "closed" }, NOW) === null && report.reportJobSection(null, NOW) === null);
  check(
    "the report names the job as they applied to it, one plain line of 200 at most, or the fallback",
    report.reportJobTitle("Chat support agent") === "Chat support agent" &&
      report.reportJobTitle(`Night\n\tagent ${"y".repeat(300)}`) === `Night agent ${"y".repeat(300)}`.slice(0, 200) &&
      report.reportJobTitle(null) === "Position" &&
      report.reportJobTitle("   ", "Unknown") === "Unknown",
    show([report.reportJobTitle(`Night\n\tagent ${"y".repeat(300)}`).length]),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
