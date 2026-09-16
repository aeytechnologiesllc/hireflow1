#!/usr/bin/env node
/**
 * Local test runner for canDeleteMissingJobAsTeamMemberFromMembership, the
 * pure decision behind google-indexing's hard-deleted-job fallback -- plain
 * assertions, no framework. See
 * supabase/functions/_shared/deletedJobTeamMemberAccess.ts for why this
 * exists as a separate, directly-tested function: a reviewer showed that
 * scripts/guards/team-scope-siblings.mjs's old loose substring checks
 * ("can_delete_jobs" and "assigned_job_ids" appear somewhere in the file)
 * still passed after patching the fallback's return to
 * `return !!membership && membership.can_delete_jobs === true;` -- dropping
 * assigned_job_ids scoping entirely and reintroducing the exact cross-job
 * leak this task exists to fix. Testing the real decision function here,
 * and having the guard require the call site to call it (rather than
 * reimplementing the check inline), closes that hole for good.
 *
 * Run with: node scripts/deleted_job_team_member_access.test.mjs
 */
import { canDeleteMissingJobAsTeamMemberFromMembership } from "../supabase/functions/_shared/deletedJobTeamMemberAccess.ts";

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

console.log("canDeleteMissingJobAsTeamMemberFromMembership decision:\n");

check(
  "no membership row -> denied",
  canDeleteMissingJobAsTeamMemberFromMembership(null, "job-a") === false,
);

check(
  "membership present, can_delete_jobs false -> denied",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: false, assigned_job_ids: null },
    "job-a",
  ) === false,
);

check(
  "membership present, can_delete_jobs missing/undefined -> denied",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: undefined, assigned_job_ids: null },
    "job-a",
  ) === false,
);

check(
  "can_delete_jobs true, assigned_job_ids null (whole-employer access) -> allowed",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: true, assigned_job_ids: null },
    "job-a",
  ) === true,
);

check(
  "can_delete_jobs true, assigned_job_ids empty array (whole-employer access) -> allowed",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: true, assigned_job_ids: [] },
    "job-a",
  ) === true,
);

check(
  "can_delete_jobs true, assigned_job_ids includes this job -> allowed",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: true, assigned_job_ids: ["job-a", "job-b"] },
    "job-a",
  ) === true,
);

// The exact regression a reviewer found: a team member with can_delete_jobs
// = true but scoped ONLY to a different job must still be denied for this
// job. This is the case the old inline
// `!!membership && membership.can_delete_jobs === true` shortcut got wrong.
check(
  "can_delete_jobs true, assigned_job_ids set but does NOT include this job -> denied (cross-job leak guard)",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: true, assigned_job_ids: ["job-b", "job-c"] },
    "job-a",
  ) === false,
);

check(
  "can_delete_jobs true, assigned_job_ids is a non-array value -> treated as scoped, denied for a job not in it",
  canDeleteMissingJobAsTeamMemberFromMembership(
    { can_delete_jobs: true, assigned_job_ids: "not-an-array" },
    "job-a",
  ) === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
