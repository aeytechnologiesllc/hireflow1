#!/usr/bin/env node
/**
 * Local test runner for the generate-applicant-dossier team-scoping fix --
 * plain assertions, no framework. Exercises the exact authorization
 * decision the edge function calls, `canAccessDossier` from
 * supabase/functions/_shared/dossierAccess.ts, over every caller shape that
 * matters.
 *
 * `isScopedTeamMember` below stands in for the result of calling the live
 * RPC public.is_active_team_member_for_job(job_id, callerId) -- the cases
 * named "team member assigned to this job", "team member with null
 * assigned_job_ids", "team member assigned only to a different job" and
 * "inactive team member" set that boolean to whatever the RPC would return
 * for that scenario (see supabase/migrations/20260915141000_job_owner_rpc_caller_checks.sql
 * and its proof, scripts/job_owner_rpc_caller_checks.pglite.test.mjs, for
 * the RPC's own job-scoping behavior). "RPC error" models the edge
 * function's fail-closed handling: any error from the RPC call must be
 * treated as isScopedTeamMember: false before canAccessDossier is ever
 * called, never as true.
 *
 * Run with: node scripts/dossier_access.test.mjs
 */
import { canAccessDossier } from "../supabase/functions/_shared/dossierAccess.ts";

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

const NONE = { isCandidateOwner: false, isEmployerOwner: false, isScopedTeamMember: false, isDeveloper: false };

console.log("Applicant dossier access decision:\n");

check(
  "candidate owner is allowed",
  canAccessDossier({ ...NONE, isCandidateOwner: true }) === true,
);

check(
  "employer owner is allowed",
  canAccessDossier({ ...NONE, isEmployerOwner: true }) === true,
);

check(
  "team member assigned to this job is allowed (RPC returned true)",
  canAccessDossier({ ...NONE, isScopedTeamMember: true }) === true,
);

check(
  "team member with null assigned_job_ids (all jobs) is allowed (RPC returned true)",
  canAccessDossier({ ...NONE, isScopedTeamMember: true }) === true,
);

check(
  "team member assigned only to a different job is DENIED (RPC returned false)",
  canAccessDossier({ ...NONE, isScopedTeamMember: false }) === false,
);

check(
  "inactive team member is DENIED (RPC returned false)",
  canAccessDossier({ ...NONE, isScopedTeamMember: false }) === false,
);

check(
  "an RPC error must fail closed -- treated as isScopedTeamMember: false, still DENIED",
  canAccessDossier({ ...NONE, isScopedTeamMember: false }) === false,
);

check(
  "developer is allowed",
  canAccessDossier({ ...NONE, isDeveloper: true }) === true,
);

check(
  "a total stranger (not candidate, not employer-side, not developer) is DENIED",
  canAccessDossier(NONE) === false,
);

check(
  "candidate owner also being flagged employer-side (edge case) is still allowed",
  canAccessDossier({ ...NONE, isCandidateOwner: true, isScopedTeamMember: true }) === true,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
