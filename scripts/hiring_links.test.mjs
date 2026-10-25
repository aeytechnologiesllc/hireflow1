#!/usr/bin/env node
/**
 * "Hiring? Post a job free" (src/lib/hiringLink.ts; docs/LAUNCH-PLAN.md,
 * Phase 3, task 6): tagged links back to HireFlow from the pages other
 * businesses' applicants see, and the flyer.
 *
 * Run with: node scripts/hiring_links.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const H = await import(path.join(ROOT, "src/lib/hiringLink.ts"));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

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

check("the link goes to the front page, tagged with where it came from", H.hiringLink("job_page") === "https://hireflownow.com/?utm_source=job_page&utm_medium=hiring_link");
check("the words", H.HIRING_LINK_WORDS === "Hiring? Post a job free");
check("a business's careers page footer", /href=\{hiringLink\("careers_page"\)\}/.test(read("src/pages/BusinessCareers.tsx")));
check("the open-jobs page's link (the Phase 7 growth audit: it went untagged)", /href=\{hiringLink\("open_jobs"\)\}/.test(read("src/pages/OpenJobs.tsx")));
check("the job page, for applicants (not the business's own preview)", /\{job && !isEmployer && \(\s*<p[^>]*>\s*<a href=\{hiringLink\("job_page"\)\}/.test(read("src/pages/JobDetails.tsx")));
check("the 'You've finished every step' screen", /href=\{hiringLink\("application_done"\)\}/.test(read("src/components/EvaluationScreen.tsx")));
// The printed flyer names the plain address: a tagged link printed in capitals
// looked broken, and typed as printed its tags never registered (the Phase 7
// growth review).
check("the printed flyer carries the plain address", /Powered by HireFlow · hireflownow\.com</.test(read("src/cockpit/components/ShareKitDialog.tsx")) && !/hiringLink\("flyer"\)/.test(read("src/cockpit/components/ShareKitDialog.tsx")));
check("the front page carries the tags on to sign-up (so Admin → Growth sees them)", /utm_source/.test(read("public/carry-source.js")) && /staff\.hireflownow\.com\/auth/.test(read("public/carry-source.js")));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
