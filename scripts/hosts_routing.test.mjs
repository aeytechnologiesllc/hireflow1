/**
 * hostRedirect — which front door a request belongs to (src/lib/hosts.ts).
 *
 *   hireflownow.com         candidates
 *   staff.hireflownow.com   the hiring team: "/" opens sign-in (or the dashboard)
 *
 * Imported live, never re-implemented.   node scripts/hosts_routing.test.mjs
 */
import { hostRedirect, isStaffHost, isStaffOnlyPath, isCandidateOnlyPath } from "../src/lib/hosts.ts";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) { passed += 1; console.log(`  ok  - ${name}`); }
  else { failed += 1; console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`); }
}

const origins = { candidate: "https://hireflownow.com", staff: "https://staff.hireflownow.com" };
const base = { rest: "", splitOn: false, authLoading: false, signedIn: false, role: null };
const go = (o) => hostRedirect({ ...base, ...o }, origins);

check("staff.* is the staff host", isStaffHost("staff.hireflownow.com") && isStaffHost("staff.localhost"));
check("the main host is not", !isStaffHost("hireflownow.com") && !isStaffHost("www.hireflownow.com") && !isStaffHost("localhost"));

// staff host: the doorway
check("staff / signed out → sign-in", go({ hostname: "staff.hireflownow.com", path: "/" }) === "/auth");
check("staff / signed in as employer → dashboard", go({ hostname: "staff.hireflownow.com", path: "/", signedIn: true, role: "employer" }) === "/dashboard");
check("staff / as team member → dashboard", go({ hostname: "staff.hireflownow.com", path: "/", signedIn: true, role: "team_member" }) === "/dashboard");
check("staff / as a candidate → sign-in, not their dashboard", go({ hostname: "staff.hireflownow.com", path: "/", signedIn: true, role: "candidate" }) === "/auth");
check("staff / waits while auth loads", go({ hostname: "staff.hireflownow.com", path: "/", authLoading: true }) === null);
check("staff /auth stays", go({ hostname: "staff.hireflownow.com", path: "/auth" }) === null);
check("staff /dashboard stays", go({ hostname: "staff.hireflownow.com", path: "/dashboard", signedIn: true, role: "employer" }) === null);

// staff host: candidate pages go home, carrying query + hash
check("staff /candidate/auth → main host", go({ hostname: "staff.hireflownow.com", path: "/candidate/auth", rest: "?redirect=%2Fapplications" }) === "https://hireflownow.com/candidate/auth?redirect=%2Fapplications");
check("staff /applications/x → main host", go({ hostname: "staff.hireflownow.com", path: "/applications/abc" }) === "https://hireflownow.com/applications/abc");
check("staff /apply → main host", go({ hostname: "staff.hireflownow.com", path: "/apply" }) === "https://hireflownow.com/apply");
check("staff public job page stays (employer preview)", go({ hostname: "staff.hireflownow.com", path: "/candidate/job/123" }) === null);
check("staff /messages as candidate → main host", go({ hostname: "staff.hireflownow.com", path: "/messages", signedIn: true, role: "candidate" }) === "https://hireflownow.com/messages");
check("staff /messages as employer stays", go({ hostname: "staff.hireflownow.com", path: "/messages", signedIn: true, role: "employer" }) === null);

// main host before the split: nothing moves
for (const path of ["/", "/auth", "/dashboard", "/jobs", "/applicants/1", "/candidate/auth", "/messages"]) {
  check(`main ${path} stays while the split is off`, go({ hostname: "hireflownow.com", path, signedIn: true, role: "employer" }) === null);
}

// main host after the split
const on = { hostname: "hireflownow.com", splitOn: true };
check("split on: main /auth → staff (token hash kept)", go({ ...on, path: "/auth", rest: "?reset=true#access_token=t&type=recovery" }) === "https://staff.hireflownow.com/auth?reset=true#access_token=t&type=recovery");
check("split on: main /dashboard → staff", go({ ...on, path: "/dashboard" }) === "https://staff.hireflownow.com/dashboard");
check("split on: main /jobs/create → staff", go({ ...on, path: "/jobs/create" }) === "https://staff.hireflownow.com/jobs/create");
check("split on: main /join-team/X → staff", go({ ...on, path: "/join-team/ABC" }) === "https://staff.hireflownow.com/join-team/ABC");
check("split on: main / stays (the careers page)", go({ ...on, path: "/" }) === null);
check("split on: main /candidate/auth stays", go({ ...on, path: "/candidate/auth" }) === null);
check("split on: main /auth/callback stays", go({ ...on, path: "/auth/callback" }) === null);
check("split on: main /settings as employer → staff", go({ ...on, path: "/settings", signedIn: true, role: "employer" }) === "https://staff.hireflownow.com/settings");
check("split on: main /settings as candidate stays", go({ ...on, path: "/settings", signedIn: true, role: "candidate" }) === null);
check("split on: main /settings waits while auth loads", go({ ...on, path: "/settings", authLoading: true }) === null);

// the path lists never overlap
for (const p of ["/auth", "/dashboard", "/jobs", "/applicants", "/interviews", "/team", "/developer/users", "/candidate", "/candidate/auth", "/applications", "/apply", "/my-documents"]) {
  check(`"${p}" is on exactly one side`, isStaffOnlyPath(p) !== isCandidateOnlyPath(p));
}
check("/applications is not swallowed by /apply", isCandidateOnlyPath("/applications") && !isStaffOnlyPath("/applications"));
check("/auth/callback is neither side", !isStaffOnlyPath("/auth/callback") && !isCandidateOnlyPath("/auth/callback"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
