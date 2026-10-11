/**
 * src/lib/staffView.ts: a team member's Documents and Interviews show their
 * team's applicants, not their own applications elsewhere (the 2026-10-11
 * overview); an owner sees their business's; an applicant their own.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "staff-view-"));
const outfile = resolve(dir, "staffView.mjs");
await build({
  entryPoints: [resolve(root, "src/lib/staffView.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
  alias: { "@": resolve(root, "src") },
});
const { belongsToMyView } = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const check = (name, ok) => (ok ? passed++ : (failed++, console.log(`FAIL ${name}`)));

const OWNER = "owner", TEAM = "team", ANA = "ana";
const zuluApp = { candidate_id: ANA, jobs: { employer_id: OWNER } };
const teamOwnApp = { candidate_id: TEAM, jobs: { employer_id: "elsewhere" } };

check("an owner sees their business's applicant", belongsToMyView(zuluApp, { userId: OWNER, role: "employer", isTeamMember: false }));
check("…not another business's", !belongsToMyView(teamOwnApp, { userId: OWNER, role: "employer", isTeamMember: false }));
check("a team member sees the team's applicant", belongsToMyView(zuluApp, { userId: TEAM, role: "team_member", isTeamMember: true }));
check("…even with an employer role on file", belongsToMyView(zuluApp, { userId: TEAM, role: "employer", isTeamMember: true }));
check("…but not their own application elsewhere", !belongsToMyView(teamOwnApp, { userId: TEAM, role: "team_member", isTeamMember: true }));
check("an applicant sees their own", belongsToMyView(zuluApp, { userId: ANA, role: "candidate", isTeamMember: false }));
check("…and nobody else's", !belongsToMyView(teamOwnApp, { userId: ANA, role: "candidate", isTeamMember: false }));
check("nothing without an application", !belongsToMyView(null, { userId: OWNER, role: "employer", isTeamMember: false }));
for (const hook of ["src/hooks/useDocuments.ts", "src/hooks/useInterviews.ts"]) {
  const code = readFileSync(resolve(root, hook), "utf8");
  check(`${hook} uses the shared rule and keys its cache on team membership`, /belongsToMyView\(/.test(code) && /isTeamMember\]/.test(code) && !/if \(role === "employer"\) \{/.test(code));
}

console.log(`staff view: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
