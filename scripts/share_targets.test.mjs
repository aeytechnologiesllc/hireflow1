#!/usr/bin/env node
/**
 * Where a business can post its job (src/lib/shareTargets.ts;
 * docs/LAUNCH-PLAN.md, Phase 2, task 6).
 *
 * Run with: node scripts/share_targets.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const S = await import(path.join(ROOT, "src/lib/shareTargets.ts"));

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

const link = "https://hireflownow.com/j/front-desk";
const targets = S.shareTargets(link);
check("four places, OnlineJobs.ph one of them, not the only one", targets.map((t) => t.id).join(",") === "facebook,linkedin,indeed,onlinejobs");
const fb = new URL(targets[0].href);
check("Facebook shares the job's own link, tagged facebook", fb.origin === "https://www.facebook.com" && fb.searchParams.get("u") === `${link}?utm_source=facebook&utm_medium=job_share`);
const li = new URL(targets[1].href);
check("LinkedIn shares the job's own link, tagged linkedin", li.origin === "https://www.linkedin.com" && li.searchParams.get("url") === `${link}?utm_source=linkedin&utm_medium=job_share`);
check("Indeed and OnlineJobs.ph open the place to post (they take a pasted post)", targets[2].href === "https://employers.indeed.com/" && targets[3].href === "https://www.onlinejobs.ph/");
check("OnlineJobs.ph says it is for the Philippines", /Philippines/.test(targets[3].hint));
check("every place is an https address", targets.every((t) => t.href.startsWith("https://")));
check("tags a link that already has a query", S.taggedLink("https://hireflownow.com/jobs/AB12?ref=x", "linkedin") === "https://hireflownow.com/jobs/AB12?ref=x&utm_source=linkedin&utm_medium=job_share");
check("keeps tags it already has", S.taggedLink("https://hireflownow.com/j/x?utm_source=mine", "facebook") === "https://hireflownow.com/j/x?utm_source=mine&utm_medium=job_share");
check("something that is not a web address is left alone", S.taggedLink("javascript:alert(1)", "facebook") === "javascript:alert(1)" && S.taggedLink("not a url", "facebook") === "not a url");
check("a link with a quote or ampersand stays inside the share address", new URL(S.shareTargets("https://hireflownow.com/j/a&b=\"c\"")[0].href).searchParams.get("u").startsWith("https://hireflownow.com/j/a&b="));
check("no owner's voice, player or Zulu wording", !/\bwe hire\b|our own|player|zulu/i.test(JSON.stringify(targets)));
for (const file of ["src/cockpit/components/ShareKitDialog.tsx", "src/cockpit/components/journey/GuideStages.tsx"]) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  check(`${file}: shows the list, not one board`, /shareTargets\(/.test(src) && !/where we\s+hire our own/i.test(src) && !/Open OnlineJobs\.ph/.test(src));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
