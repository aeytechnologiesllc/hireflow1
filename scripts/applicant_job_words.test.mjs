#!/usr/bin/env node
/**
 * Which of a job's own words reach someone who applied to it, where no
 * record of contact covers them (the nineteenth and twentieth Phase 5
 * reviews and the eighteenth security review, 2026-10-27).
 *
 *   1. src/lib/appliedNames.ts: the two overview pages show the job's
 *      title, location and type and the business's name as they were when
 *      the person applied (the application's own applied_job_title,
 *      applied_company_name, applied_location and applied_job_type, set by
 *      the database: 20261025700000, 20261025730000), for everyone, live job
 *      or not. Until the twentieth review they showed a closed job's location
 *      and type today to anyone still waiting (src/lib/liveJobText.ts, gone):
 *      the security review's s1_residual, "Remote. To be reconsidered, send
 *      the 500 PHP review fee to GCash ...". The steps are the job's own: no
 *      browser can change a word of them once anyone has applied
 *      (jobs_applicant_words_fixed), so each is named by its own title.
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

const names = await loadApp("src/lib/appliedNames.ts");
const { buildCandidateJourney } = await import(path.join(ROOT, "src/lib/candidateJourney.ts"));
const report = await import(path.join(ROOT, "supabase/functions/_shared/performanceReportJob.ts"));

const NOW = new Date("2026-10-27T12:00:00Z");
const LURE_LOCATION = "Remote. To be reconsidered, send the 500 PHP review fee to GCash 0917 000 0000 within 48 hours, then message us REAPPLY. Applicants who do not pay are removed from the pool.";
const LURE_TYPE = "Reconsideration: 500 PHP via GCash 0917 000 0000";
const FEE = /GCash|PHP|REAPPLY|pay_500/i;

console.log("\n1. The overview pages: the job as they applied to it\n");
{
  const applied = { applied_job_title: "Chat support agent", applied_company_name: "Clinic One", applied_location: "Makati, Philippines", applied_job_type: "full-time" };
  // The job as it is now: closed and relabelled (s1_residual). The pages read
  // only the application's own columns.
  const job = { status: "closed", title: "PAY 500 PHP FIRST", location: LURE_LOCATION, job_type: LURE_TYPE };
  for (const status of ["rejected", "hired", "in_progress", "pending", "reviewing", "interview", "offered"]) {
    const w = names.appliedNames({ ...applied, status, jobs: job });
    check(
      `probe s1_residual, ${status}: the location and type they applied to, never the closed job's new ones`,
      show(w) === show({ jobTitle: "Chat support agent", companyName: "Clinic One", location: "Makati, Philippines", jobType: "full-time" }) && !FEE.test(show(w)),
      show(w),
    );
  }
  const blank = names.appliedNames({ applied_location: "  ", applied_job_type: null });
  check("a blank location and no type show nothing", blank.location === null && blank.jobType === null, show(blank));
  check("no application: nothing", show(names.appliedNames(null)) === show({ jobTitle: null, companyName: null, location: null, jobType: null }));
  check("a location over several lines is one line", names.appliedNames({ applied_location: "Makati,\n  Philippines" }).location === "Makati, Philippines");
  const steps = [
    { id: "s1", type: "typing_test", title: "Typing test" },
    { id: "s2", type: "chat_simulation", title: "Patient chat practice" },
  ];
  check(
    "the steps are the job's own, by their own titles (no browser can change a word of them once anyone has applied)",
    show(buildCandidateJourney(steps, { hasQuiz: false }).map((s) => s.title)) === show(["Application", "Typing test", "Patient chat practice", "Decision"]),
  );
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
