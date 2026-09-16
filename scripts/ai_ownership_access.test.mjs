#!/usr/bin/env node
/**
 * Local test runner for the ai-shortlist / ai-analyze ownership fix — plain
 * assertions, no framework.
 *
 * Exercises the real, pure decision functions in
 * supabase/functions/_shared/aiAccess.ts (imported directly — Node 24+
 * strips the type annotations natively, no build step) over the caller
 * shapes that matter: job owner, active team member with/without the right
 * permission flag, team member scoped away by assigned_job_ids, developer
 * support access, the trusted internal service-role caller, and a stranger
 * with no relationship to the job at all — for every ai-analyze "type".
 *
 * Run with: node scripts/ai_ownership_access.test.mjs
 */
import { canAccessJobPipeline, isAiAnalyzeCallAuthorized } from "../supabase/functions/_shared/aiAccess.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const NONE = { isOwner: false, isPermittedTeamMember: false, isDeveloper: false };
const OWNER = { isOwner: true, isPermittedTeamMember: false, isDeveloper: false };
const PERMITTED_TEAM_MEMBER = { isOwner: false, isPermittedTeamMember: true, isDeveloper: false };
const DEVELOPER = { isOwner: false, isPermittedTeamMember: false, isDeveloper: true };

console.log("canAccessJobPipeline — ai-shortlist's gate:\n");

check("job owner is allowed", canAccessJobPipeline(OWNER) === true);
check(
  "an active team member with the right permission flag, already resolved, is allowed",
  canAccessJobPipeline(PERMITTED_TEAM_MEMBER) === true,
);
check("a developer/support account is allowed", canAccessJobPipeline(DEVELOPER) === true);
check(
  "a stranger with none of owner/permitted-team-member/developer is denied",
  canAccessJobPipeline(NONE) === false,
);
check(
  // The edge function is responsible for only setting isPermittedTeamMember=true
  // once it has checked status='active', the specific permission column, AND
  // assigned_job_ids scoping — this just proves the gate trusts that flag as-is,
  // i.e. a view-only or wrongly-scoped team member must never reach this as true.
  "a view-only team member (can_manage_pipeline=false) must be resolved as isPermittedTeamMember=false upstream, and is then denied",
  canAccessJobPipeline({ isOwner: false, isPermittedTeamMember: false, isDeveloper: false }) === false,
);

console.log("\nisAiAnalyzeCallAuthorized — ai-analyze's per-type matrix:\n");

// resume / application: service-role only, regardless of any job facts.
for (const type of ["resume", "application"]) {
  check(
    `${type}: the internal service-role caller is authorized`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: true, job: null }) === true,
  );
  check(
    `${type}: the job's own owner, calling with their own user JWT (not service role), is still denied`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: OWNER }) === false,
  );
  check(
    `${type}: a caller with no job facts at all is denied`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: null }) === false,
  );
}

// interview / job-bias / phase: employer-side, job-pipeline access required.
for (const type of ["interview", "job-bias", "phase"]) {
  check(
    `${type}: the job owner is authorized`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: OWNER }) === true,
  );
  check(
    `${type}: a permitted team member is authorized`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: PERMITTED_TEAM_MEMBER }) === true,
  );
  check(
    `${type}: a developer is authorized`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: DEVELOPER }) === true,
  );
  check(
    `${type}: a signed-in stranger unrelated to the job is denied`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: NONE }) === false,
  );
  check(
    `${type}: a missing/unresolvable job id (job: null) is denied, not treated as open`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: null }) === false,
  );
  check(
    `${type}: the service-role caller is authorized too (trusted internal path)`,
    isAiAnalyzeCallAuthorized({ type, isServiceRole: true, job: null }) === true,
  );
}

// A candidate (never owner/team-member/developer for a job they applied to)
// must not be able to reach interview-question generation about themselves.
check(
  "interview: a candidate who merely applied to the job (no owner/team/developer relationship) is denied",
  isAiAnalyzeCallAuthorized({ type: "interview", isServiceRole: false, job: NONE }) === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
