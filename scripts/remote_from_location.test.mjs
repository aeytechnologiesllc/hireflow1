#!/usr/bin/env node
/**
 * A job's place decides remote work too (the second Phase 7 product audit):
 * the builder's Type field starts on "Full-time · On-site", and a store that
 * typed only "Remote" as its location got an on-site job with no connection
 * check (src/lib/avaEngine/playbook.ts briefFromForm). And "Manila,
 * Philippines" had no country (src/lib/jobLocation.ts), so the job left the
 * feeds and got no currency. "Edit job" re-decided remote work from the
 * description too, where "our dental office" made a remote job on-site
 * (src/lib/jobLocation.ts isFullyRemoteText).
 *
 * Run with: node scripts/remote_from_location.test.mjs
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const bundle = await build({
  stdin: {
    contents:
      'export { briefFromForm } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { inferCountryCode, isFullyRemoteText } from "./src/lib/jobLocation.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const brief = (location, type = "Full-time · On-site", workMode) =>
  M.briefFromForm({ role: "Customer Support Agent", location, type, workMode, pay: "$15/hr", start: "ASAP", work: "Answer customer chats for our dental office" });
check("Location \"Remote\" with the Type field left on On-site is a remote job", brief("Remote").workMode === "remote");
check("…and \"Work from home (Philippines)\", \"Fully remote\", \"WFH\"", ["Work from home (Philippines)", "Fully remote", "WFH - any timezone"].every((l) => brief(l).workMode === "remote"));
check("a place that says hybrid stays hybrid or on-site, as the Type says", brief("Remote / hybrid in Makati").workMode === "onsite" && brief("Makati", "Full-time · Hybrid").workMode === "hybrid");
check("an office place stays on-site", brief("Austin, TX").workMode === "onsite");
check("the Type field still decides when it says remote", brief("Austin, TX", "Full-time · Remote").workMode === "remote");
for (const [text, code] of [["Manila, Philippines", "PH"], ["Makati City", "PH"], ["Cebu", "PH"], ["Quezon City, Metro Manila", "PH"], ["Singapore", "SG"], ["Austin, TX", "US"], ["Lahore, Pakistan", "PK"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

const R = M.isFullyRemoteText;
check("place \"Remote\" with \"dental office\" in the description stays remote", R("Remote", "full-time", "Answer calls and chats for our dental office.") === true);
check("…and \"Work from home\" with \"office manager\" in it", R("Work from home (Philippines)", "full-time", "Support our office manager with patient emails.") === true);
check("a description that puts the work in the office makes it not remote", R("Remote", "full-time", "You will work in our office in Makati three days a week.") === false && R("Remote", "full-time", "This is a hybrid role.") === false);
check("an office place is not remote", R("Austin, TX", "full-time", "Answer customer chats.") === false && R("Makati office", "full-time", "") === false);
check("a description that says work from home makes an unplaced job remote", R("Philippines", "full-time", "Fully remote, work from home.") === true);
check("hybrid in the place is never fully remote", R("Remote / hybrid in Makati", "full-time", "") === false && R("Work from home, hybrid", "full-time", "") === false);
check("nothing written is not remote", R("", "", "") === false);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
