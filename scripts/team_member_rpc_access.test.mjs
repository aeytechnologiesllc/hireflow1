#!/usr/bin/env node
/**
 * Local test runner for the shared is_active_team_member_for_job RPC ->
 * access-decision mapping used by generate-applicant-dossier,
 * trigger-ava-analysis, interview-rooms and google-indexing -- plain
 * assertions, no framework. Exercises `isScopedTeamMemberFromRpc` from
 * supabase/functions/_shared/teamMemberRpcAccess.ts directly, over every
 * raw RPC result shape that matters.
 *
 * This exists because the fail-closed rule used to be reimplemented inline
 * at each call site (`!teamMemberRpc.error && teamMemberRpc.data === true`),
 * and a reviewer showed that dropping `!teamMemberRpc.error &&` from that
 * assignment still passed scripts/guards/dossier-team-scope.mjs, because
 * the guard's regex only checked that the substring `teamMemberRpc.error`
 * appeared *somewhere* in the file, not that the assigned boolean actually
 * depended on it (a nearby `console.error(..., teamMemberRpc.error)` log
 * line was enough to satisfy it). Testing the real mapping function here,
 * and having every guard require call sites to use this function instead
 * of reimplementing the check, closes that hole for good.
 *
 * Run with: node scripts/team_member_rpc_access.test.mjs
 */
import { isScopedTeamMemberFromRpc } from "../supabase/functions/_shared/teamMemberRpcAccess.ts";

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

console.log("is_active_team_member_for_job RPC -> access decision mapping:\n");

check(
  "RPC success, data true -> allowed",
  isScopedTeamMemberFromRpc({ data: true, error: null }) === true,
);

check(
  "RPC success, data false (scoped to a different job) -> denied",
  isScopedTeamMemberFromRpc({ data: false, error: null }) === false,
);

check(
  "RPC success, data null -> denied",
  isScopedTeamMemberFromRpc({ data: null, error: null }) === false,
);

check(
  "RPC success, data undefined -> denied",
  isScopedTeamMemberFromRpc({ data: undefined, error: null }) === false,
);

// The exact regression a reviewer found: an RPC error paired with a
// truthy/`true` data field (e.g. a stale or malformed client stub, or a
// future supabase-js version that stops nulling `data` on error) MUST
// still be denied. This is the case the old inline
// `!teamMemberRpc.error && teamMemberRpc.data === true` line handled
// correctly but that the guard failed to actually pin down.
check(
  "RPC error present, data true anyway -> still denied (fail closed)",
  isScopedTeamMemberFromRpc({ data: true, error: new Error("boom") }) === false,
);

check(
  "RPC error present, data null -> denied (fail closed)",
  isScopedTeamMemberFromRpc({ data: null, error: new Error("boom") }) === false,
);

check(
  "RPC error present as a truthy non-Error value (e.g. a Postgrest error object) -> denied",
  isScopedTeamMemberFromRpc({ data: true, error: { message: "permission denied", code: "42501" } }) === false,
);

check(
  "RPC success, data is a non-boolean truthy value -> denied (must be exactly true)",
  isScopedTeamMemberFromRpc({ data: "true", error: null }) === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
