/**
 * supabase/functions/generate-applicant-dossier/index.ts granted
 * employer-side dossier access with a service-role query on `team_members`
 * filtered only by user_id + employer_id + status='active' -- with no
 * assigned_job_ids check. The live RLS policy on `applications` ("Team
 * members can view applications for assigned jobs") uses
 * public.is_active_team_member_for_job(job_id, auth.uid()), which requires
 * assigned_job_ids to be null OR contain the job. So a team member scoped
 * to job A could call this function with an applicationId from job B at the
 * same employer and read that candidate's private dossier.
 *
 * Fixed in supabase/functions/generate-applicant-dossier/index.ts: the
 * team_members query is replaced with a call to
 * is_active_team_member_for_job(p_job_id, p_user_id) via the caller-JWT
 * client (supabaseUserClient, already created in this file from the anon
 * key + Authorization header) -- the same SECURITY DEFINER function the
 * applications RLS policy uses, so team-member access is scoped to THIS
 * job exactly as it is everywhere else. Any RPC error is treated as
 * isScopedTeamMember: false (fail closed), never as access granted.
 *
 * The authorization decision itself lives in
 * supabase/functions/_shared/dossierAccess.ts (no Deno-only imports, so
 * it's unit-tested with plain node at scripts/dossier_access.test.mjs --
 * run directly: `node scripts/dossier_access.test.mjs`); these are cheap
 * static checks over the source, not a substitute for that test.
 *
 * The fail-closed RPC-error check below used to be a regex over this
 * file's raw text (roughly: "does the substring `teamMemberRpc.error`
 * appear anywhere, or does some looser `isScopedTeamMember = !...error`
 * pattern match"). A reviewer showed that was too weak: dropping
 * `!teamMemberRpc.error &&` from the `isScopedTeamMember` assignment still
 * passed, because the standalone `console.error('...', teamMemberRpc.error)`
 * log line right above it still contained the substring `teamMemberRpc.error`
 * -- satisfying the first branch of the check without the assigned boolean
 * actually depending on it at all. A regex over a call site can always be
 * fooled this way, because it can't tell "referenced" from "depended on".
 *
 * Fixed by moving the RPC-error -> access-decision mapping out of this
 * file entirely, into a small pure function,
 * isScopedTeamMemberFromRpc(...) in
 * supabase/functions/_shared/teamMemberRpcAccess.ts, that's covered
 * directly by scripts/team_member_rpc_access.test.mjs (including the exact
 * "RPC error present, data true anyway" case the reviewer's regression
 * would have produced). The guard below now checks two things instead of
 * grepping this call site for a fail-closed pattern it can't verify: (a)
 * this file calls that shared function -- not a hand-rolled boolean
 * expression a future edit could weaken unnoticed -- and (b) the shared
 * function's own body is still the fail-closed expression. Weakening
 * either one fails a check that doesn't depend on an incidental nearby
 * string.
 */

const FN = "supabase/functions/generate-applicant-dossier/index.ts";
const ACCESS_FN = "supabase/functions/_shared/dossierAccess.ts";
const RPC_ACCESS_FN = "supabase/functions/_shared/teamMemberRpcAccess.ts";

export default [
  {
    id: "dossier-team-member-access-scoped-to-job",
    why:
      `${FN} must scope employer-side team-member access to the application's job via ` +
      "is_active_team_member_for_job(...), the same SECURITY DEFINER function the live " +
      "applications RLS policy uses -- without it, a team member scoped to one job can read " +
      "another job's candidate dossiers just by employer_id.",
    run: async ({ read }) => {
      const src = await read(FN);
      const accessSrc = await read(ACCESS_FN);
      const rpcAccessSrc = await read(RPC_ACCESS_FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      if (!accessSrc) return { ok: false, detail: [`${ACCESS_FN} not found`] };
      if (!rpcAccessSrc) return { ok: false, detail: [`${RPC_ACCESS_FN} not found`] };
      const bad = [];

      if (/\.from\(['"]team_members['"]\)/.test(src)) {
        bad.push(
          "querying team_members directly re-implements the job-scoping rule and risks missing " +
          "assigned_job_ids -- call the is_active_team_member_for_job(...) RPC (same function the " +
          "applications RLS policy uses) instead"
        );
      }

      if (!/is_active_team_member_for_job/.test(src)) {
        bad.push(
          "no is_active_team_member_for_job(...) call -- employer-side team-member access must be " +
          "scoped to THIS job the same way the live RLS policy on applications scopes it " +
          "(assigned_job_ids), not a plain team_members row check by employer_id alone"
        );
      }

      if (!/\.rpc\(\s*['"]is_active_team_member_for_job['"]/.test(src)) {
        bad.push("is_active_team_member_for_job must be called as an rpc(...)");
      }

      if (!/p_job_id:\s*application\.job_id/.test(src)) {
        bad.push("the RPC call must pass p_job_id: application.job_id -- the applicationId's own job, not a caller-supplied value");
      }

      // Must use the caller-JWT client (supabaseUserClient), not the service-role client,
      // so the RPC's own `p_user_id = auth.uid()` check passes for a real human caller.
      if (!/supabaseUserClient\.rpc\(\s*['"]is_active_team_member_for_job['"]/.test(src)) {
        bad.push(
          "is_active_team_member_for_job must be called via supabaseUserClient (the caller-JWT " +
          "client), not the service-role client -- the live RPC only answers true when " +
          "p_user_id = auth.uid()"
        );
      }

      // The RPC-error -> access-decision mapping must come from the shared,
      // tested pure function, not be reimplemented inline here. An inline
      // boolean expression can have its fail-closed half quietly deleted
      // while an unrelated `.error` reference elsewhere in the file (e.g.
      // a console.error log line) keeps a naive "does '.error' appear
      // somewhere" regex happy -- that's the exact regression a reviewer
      // found in an earlier version of this guard.
      if (!/import\s*\{[^}]*\bisScopedTeamMemberFromRpc\b[^}]*\}\s*from\s*["']\.\.\/_shared\/teamMemberRpcAccess\.ts["']/.test(src)) {
        bad.push(
          `${FN} must import isScopedTeamMemberFromRpc from ../_shared/teamMemberRpcAccess.ts -- the ` +
          "RPC error/data -> access mapping must not be reimplemented inline, where a dropped fail-closed " +
          "check can hide behind an unrelated '.error' reference elsewhere in the file"
        );
      }
      if (!/isScopedTeamMember\s*=\s*isScopedTeamMemberFromRpc\(\s*teamMemberRpc\s*\)/.test(src)) {
        bad.push(
          "isScopedTeamMember must be assigned exactly isScopedTeamMemberFromRpc(teamMemberRpc) -- not an " +
          "inline boolean expression, which a future edit could weaken without any guard noticing"
        );
      }

      // The mapping itself is only allowed to live in one place -- pin its
      // actual fail-closed body down directly, rather than trusting every
      // call site to have used it correctly.
      if (!/return\s+!result\.error\s*&&\s*result\.data\s*===\s*true\s*;/.test(rpcAccessSrc)) {
        bad.push(
          `${RPC_ACCESS_FN} isScopedTeamMemberFromRpc must return "!result.error && result.data === true" -- ` +
          "any RPC error, or a data value other than the literal true, must deny access"
        );
      }

      if (!/function\s+canAccessDossier/.test(accessSrc)) {
        bad.push(`${ACCESS_FN} missing exported canAccessDossier(...) decision function`);
      }
      if (!/canAccessDossier/.test(src)) {
        bad.push(`${FN} no longer imports/calls canAccessDossier(...)`);
      }
      if (!/isCandidateOwner\s*\|\|\s*isEmployerOwner\s*\|\|\s*isScopedTeamMember\s*\|\|\s*isDeveloper/.test(accessSrc)) {
        bad.push("canAccessDossier must allow candidate owner, employer owner, scoped team member, or developer");
      }

      if (!/status:\s*403/.test(src)) {
        bad.push("unauthorized callers must get a 403, not a silent pass-through");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
