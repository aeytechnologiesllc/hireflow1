/**
 * Same bug class as scripts/guards/dossier-team-scope.mjs (see that file's
 * header for the full story): three more edge functions decided
 * employer-side team-member access with a service-role (or otherwise
 * unscoped) `team_members` query filtered only by user_id + employer_id +
 * status='active' -- with no assigned_job_ids check. The live RLS policy on
 * `applications` ("Team members can view applications for assigned jobs")
 * scopes that same relationship via
 * public.is_active_team_member_for_job(job_id, auth.uid()), which requires
 * assigned_job_ids to be null (whole-employer access) OR contain the job.
 * Each of these let a team member scoped to job A act on job B at the same
 * employer:
 *
 *   - supabase/functions/interview-rooms/index.ts: could join job B's
 *     interview room (Daily video call) just by holding
 *     can_schedule_interviews at the shared employer.
 *   - supabase/functions/trigger-ava-analysis/index.ts: could trigger/read
 *     AI analysis for job B's application.
 *   - supabase/functions/google-indexing/index.ts (canAccessEmployer): could
 *     fire Google Indexing API pings (URL_UPDATED/URL_DELETED) for job B.
 *
 * Fixed the same way as generate-applicant-dossier: each site now calls
 * is_active_team_member_for_job(p_job_id, p_user_id) via the caller-JWT
 * client (so the RPC's own `p_user_id = auth.uid()` check passes), and maps
 * the raw { data, error } result through the shared, tested
 * isScopedTeamMemberFromRpc(...) in
 * supabase/functions/_shared/teamMemberRpcAccess.ts -- never a hand-rolled
 * boolean at the call site (see dossier-team-scope.mjs's header for why
 * that specific shortcut is dangerous). interview-rooms additionally keeps
 * its can_schedule_interviews permission check, since the RPC has no flag
 * for that permission -- the fix combines the job-scoped RPC with a
 * separate team_members lookup for that one flag, so this guard allows (and
 * requires) exactly one non-job-scoped team_members query there, not zero.
 *
 * google-indexing's hard-deleted-job fallback (canDeleteMissingJobAsTeamMember)
 * can't use the RPC at all (its `jobs` join can never match once the job
 * row is gone), so it re-checks the same can_delete_jobs + assigned_job_ids
 * condition directly against team_members. A reviewer showed that this
 * guard originally checked only that the substrings "can_delete_jobs" and
 * "assigned_job_ids" appeared *somewhere* in the file -- not that the
 * fallback's actual return value depended on them -- so patching the
 * fallback's return to `!!membership && membership.can_delete_jobs ===
 * true` (dropping assigned_job_ids scoping, the exact cross-job leak this
 * task exists to fix) still passed, because the now-dead
 * `.select("can_delete_jobs, assigned_job_ids")` line and comments still
 * contained both substrings. The fix pulls that decision into a pure,
 * separately-tested function -- canDeleteMissingJobAsTeamMemberFromMembership
 * in supabase/functions/_shared/deletedJobTeamMemberAccess.ts (see
 * scripts/deleted_job_team_member_access.test.mjs) -- and this guard now
 * requires the fallback to import it and return it directly, the same
 * call-site-shape check already used for isScopedTeamMemberFromRpc.
 */

const RPC_ACCESS_FN = "supabase/functions/_shared/teamMemberRpcAccess.ts";

const IMPORT_RE =
  /import\s*\{[^}]*\bisScopedTeamMemberFromRpc\b[^}]*\}\s*from\s*["']\.\.\/_shared\/teamMemberRpcAccess\.ts["']/;

function requireSharedMapping(src, fn, bad) {
  if (!IMPORT_RE.test(src)) {
    bad.push(
      `${fn} must import isScopedTeamMemberFromRpc from ../_shared/teamMemberRpcAccess.ts -- the RPC ` +
      "error/data -> access mapping must not be reimplemented inline, where a dropped fail-closed check " +
      "can hide behind an unrelated '.error' reference elsewhere in the file (see dossier-team-scope.mjs)"
    );
  }
  if (!/is_active_team_member_for_job/.test(src)) {
    bad.push(
      `${fn}: no is_active_team_member_for_job(...) call -- employer-side team-member access must be ` +
      "scoped to THIS job the same way the live RLS policy on applications scopes it (assigned_job_ids), " +
      "not a plain team_members row check by employer_id alone"
    );
  }
  if (!/\.rpc\(\s*["']is_active_team_member_for_job["']/.test(src)) {
    bad.push(`${fn}: is_active_team_member_for_job must be called as an rpc(...)`);
  }
}

export default [
  {
    id: "interview-rooms-team-member-access-scoped-to-job",
    why:
      "supabase/functions/interview-rooms/index.ts must scope employer-side team-member access to the " +
      "interview's job via is_active_team_member_for_job(...) -- without it, a team member scoped to " +
      "job A can join job B's interview room just by sharing an employer and can_schedule_interviews.",
    run: async ({ read }) => {
      const FN = "supabase/functions/interview-rooms/index.ts";
      const src = await read(FN);
      const rpcAccessSrc = await read(RPC_ACCESS_FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      if (!rpcAccessSrc) return { ok: false, detail: [`${RPC_ACCESS_FN} not found`] };
      const bad = [];

      requireSharedMapping(src, FN, bad);

      // Must use the caller-JWT client (supabaseUser), not the service-role
      // client, so the RPC's own `p_user_id = auth.uid()` check passes.
      if (!/supabaseUser\.rpc\(\s*["']is_active_team_member_for_job["']/.test(src)) {
        bad.push(
          `${FN}: is_active_team_member_for_job must be called via supabaseUser (the caller-JWT client), ` +
          "not the service-role client -- the live RPC only answers true when p_user_id = auth.uid()"
        );
      }

      if (!/p_job_id:\s*job\.id/.test(src)) {
        bad.push(`${FN}: the RPC call must pass p_job_id: job.id -- this interview's own job, not a caller-supplied value`);
      }

      if (!/isScopedTeamMember\s*=\s*isScopedTeamMemberFromRpc\(\s*teamMemberRpc\s*\)/.test(src)) {
        bad.push(
          `${FN}: isScopedTeamMember must be assigned exactly isScopedTeamMemberFromRpc(teamMemberRpc) -- ` +
          "not an inline boolean expression"
        );
      }

      // The RPC has no can_schedule_interviews flag, so the fix must keep a
      // separate permission check for it -- job scoping alone isn't enough
      // to join a video interview.
      if (!/can_schedule_interviews/.test(src)) {
        bad.push(`${FN}: must still require can_schedule_interviews -- the RPC has no flag for this permission`);
      }
      if (!/isTeamMember\s*=\s*isScopedTeamMember\s*&&\s*membership\?\.can_schedule_interviews\s*===\s*true/.test(src)) {
        bad.push(
          `${FN}: isTeamMember must require BOTH isScopedTeamMember and membership.can_schedule_interviews === ` +
          "true -- job-scoping alone doesn't grant interview-scheduling permission, and vice versa"
        );
      }

      if (!/status:\s*403/.test(src)) {
        bad.push(`${FN}: unauthorized callers must get a 403, not a silent pass-through`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "trigger-ava-analysis-team-member-access-scoped-to-job",
    why:
      "supabase/functions/trigger-ava-analysis/index.ts must scope employer-side team-member access to " +
      "the application's job via is_active_team_member_for_job(...) -- without it, a team member scoped " +
      "to job A can trigger/read AI analysis for job B's application.",
    run: async ({ read }) => {
      const FN = "supabase/functions/trigger-ava-analysis/index.ts";
      const src = await read(FN);
      const rpcAccessSrc = await read(RPC_ACCESS_FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      if (!rpcAccessSrc) return { ok: false, detail: [`${RPC_ACCESS_FN} not found`] };
      const bad = [];

      requireSharedMapping(src, FN, bad);

      if (/\.from\(["']team_members["']\)/.test(src)) {
        bad.push(
          `${FN}: querying team_members directly re-implements the job-scoping rule and risks missing ` +
          "assigned_job_ids -- call the is_active_team_member_for_job(...) RPC instead"
        );
      }

      // Must use the caller-JWT client (supabaseUserClient), not the
      // service-role client, so the RPC's own `p_user_id = auth.uid()`
      // check passes.
      if (!/supabaseUserClient\.rpc\(\s*["']is_active_team_member_for_job["']/.test(src)) {
        bad.push(
          `${FN}: is_active_team_member_for_job must be called via supabaseUserClient (the caller-JWT ` +
          "client), not the service-role client -- the live RPC only answers true when p_user_id = auth.uid()"
        );
      }

      if (!/p_job_id:\s*application\.job_id/.test(src)) {
        bad.push(`${FN}: the RPC call must pass p_job_id: application.job_id -- the applicationId's own job, not a caller-supplied value`);
      }

      if (!/isScopedTeamMember\s*=\s*isScopedTeamMemberFromRpc\(\s*teamMemberRpc\s*\)/.test(src)) {
        bad.push(
          `${FN}: isScopedTeamMember must be assigned exactly isScopedTeamMemberFromRpc(teamMemberRpc) -- ` +
          "not an inline boolean expression"
        );
      }

      if (!/isCandidateOwner\s*&&\s*!isEmployerOwner\s*&&\s*!isScopedTeamMember\s*&&\s*!developerRole/.test(src)) {
        bad.push(
          `${FN}: the final authorization check must require candidate owner, employer owner, scoped ` +
          "team member, or developer -- not the old unscoped teamMembership"
        );
      }

      if (!/status:\s*403/.test(src)) {
        bad.push(`${FN}: unauthorized callers must get a 403, not a silent pass-through`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "google-indexing-team-member-access-scoped-to-job",
    why:
      "supabase/functions/google-indexing/index.ts's canAccessEmployer(...) must scope employer-side " +
      "team-member access to the job being pinged via is_active_team_member_for_job(...) -- without it, " +
      "a team member scoped to job A can fire Google Indexing API pings for job B just by sharing an employer.",
    run: async ({ read }) => {
      const FN = "supabase/functions/google-indexing/index.ts";
      const DECISION_FN = "supabase/functions/_shared/deletedJobTeamMemberAccess.ts";
      const src = await read(FN);
      const rpcAccessSrc = await read(RPC_ACCESS_FN);
      const decisionSrc = await read(DECISION_FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      if (!rpcAccessSrc) return { ok: false, detail: [`${RPC_ACCESS_FN} not found`] };
      if (!decisionSrc) return { ok: false, detail: [`${DECISION_FN} not found`] };
      const bad = [];

      requireSharedMapping(src, FN, bad);

      // The RPC's own query joins against `jobs`, so once a job row is hard
      // deleted it can never grant access to anyone but the owner -- even a
      // team member who legitimately deleted their own assigned job under
      // the live "Team members can delete assigned jobs if permitted" RLS
      // policy (can_delete_jobs = true, scoped by assigned_job_ids). The fix
      // must fall back to that same condition, checked directly against
      // team_members (the RPC can't be used here -- there's no job row left
      // for it to join against), for the hard-deleted-job fallback branch
      // only. Any other direct team_members query would re-implement the
      // job-scoping rule and risk missing assigned_job_ids, so require this
      // exact, scoped fallback shape rather than banning team_members
      // queries outright.
      if (/\.from\(["']team_members["']\)/.test(src)) {
        if (!/canDeleteMissingJobAsTeamMember\b/.test(src)) {
          bad.push(
            `${FN}: a direct team_members query was found but not inside a canDeleteMissingJobAsTeamMember-style ` +
            "fallback -- direct team_members queries must stay scoped to the hard-deleted-job fallback and check " +
            "both can_delete_jobs and assigned_job_ids, not re-implement a looser employer-only check"
          );
        }

        // Pin the DECISION, not just that the substrings appear somewhere in
        // the file: canDeleteMissingJobAsTeamMember must import and directly
        // return canDeleteMissingJobAsTeamMemberFromMembership(...) -- the
        // pure, separately-tested function in deletedJobTeamMemberAccess.ts
        // -- rather than reimplementing the can_delete_jobs/assigned_job_ids
        // check inline, where a regressed boolean expression can hide behind
        // an unrelated `.select("can_delete_jobs, assigned_job_ids")` line
        // or comment still containing both substrings (see this guard's
        // file header for the exact regression a reviewer found).
        const DECISION_IMPORT_RE =
          /import\s*\{[^}]*\bcanDeleteMissingJobAsTeamMemberFromMembership\b[^}]*\}\s*from\s*["']\.\.\/_shared\/deletedJobTeamMemberAccess\.ts["']/;
        if (!DECISION_IMPORT_RE.test(src)) {
          bad.push(
            `${FN}: must import canDeleteMissingJobAsTeamMemberFromMembership from ` +
            "../_shared/deletedJobTeamMemberAccess.ts -- the can_delete_jobs/assigned_job_ids decision must not " +
            "be reimplemented inline, where a dropped assigned_job_ids check can hide behind an unrelated " +
            "reference to that column elsewhere in the file"
          );
        }

        if (!/return\s+canDeleteMissingJobAsTeamMemberFromMembership\(\s*membership\s*,\s*jobId\s*\)/.test(src)) {
          bad.push(
            `${FN}: canDeleteMissingJobAsTeamMember must return exactly ` +
            "canDeleteMissingJobAsTeamMemberFromMembership(membership, jobId) for the non-error case -- not an " +
            "inline can_delete_jobs/assigned_job_ids expression, which a guard regex checking substring presence " +
            "cannot tell apart from a weakened version that drops assigned_job_ids scoping"
          );
        }

        if (!/export function canDeleteMissingJobAsTeamMemberFromMembership/.test(decisionSrc)) {
          bad.push(`${DECISION_FN}: must export canDeleteMissingJobAsTeamMemberFromMembership`);
        }
        if (!/assignedJobIds\.includes\(jobId\)/.test(decisionSrc) || !/can_delete_jobs\s*!==\s*true/.test(decisionSrc)) {
          bad.push(
            `${DECISION_FN}: canDeleteMissingJobAsTeamMemberFromMembership must check both can_delete_jobs === true ` +
            "and assigned_job_ids.includes(jobId) (or empty/null for whole-employer access) -- this is the actual " +
            "decision every guard check above is pinning the call site to, so it must not be weakened here either"
          );
        }
      } else {
        bad.push(
          `${FN}: no team_members fallback found -- the hard-deleted-job branch needs a direct, scoped ` +
          "team_members check (can_delete_jobs + assigned_job_ids) because the RPC can never match once the job row is gone"
        );
      }

      // canAccessEmployer must take a jobId parameter and use it, and must
      // be called via the caller-JWT client (supabaseUser), not the
      // service-role client.
      if (!/async function canAccessEmployer\(\s*supabaseUser[\s\S]{0,200}?jobId:\s*string/.test(src)) {
        bad.push(`${FN}: canAccessEmployer(...) must take (supabaseUser, userId, employerId, jobId) -- job scoping needs the job id`);
      }
      if (!/supabaseUser\.rpc\(\s*\n?\s*["']is_active_team_member_for_job["']/.test(src)) {
        bad.push(
          `${FN}: is_active_team_member_for_job must be called via supabaseUser (the caller-JWT client), ` +
          "not the service-role client -- the live RPC only answers true when p_user_id = auth.uid()"
        );
      }
      if (!/p_job_id:\s*jobId/.test(src)) {
        bad.push(`${FN}: the RPC call must pass p_job_id: jobId -- the job actually being pinged, not a caller-supplied employerId alone`);
      }

      // Both call sites (job found, and the hard-deleted-job fallback) must
      // pass a job id through to canAccessEmployer.
      if (!/canAccessEmployer\(supabaseUser,\s*user\.id,\s*employerId,\s*jobId\)/.test(src)) {
        bad.push(`${FN}: the hard-deleted-job fallback branch must call canAccessEmployer(supabaseUser, user.id, employerId, jobId)`);
      }
      if (!/canAccessEmployer\(supabaseUser,\s*user\.id,\s*job\.employer_id,\s*job\.id\)/.test(src)) {
        bad.push(`${FN}: the found-job branch must call canAccessEmployer(supabaseUser, user.id, job.employer_id, job.id)`);
      }

      if (!/return\s+isScopedTeamMemberFromRpc\(\s*teamMemberRpc\s*\)/.test(src)) {
        bad.push(
          `${FN}: canAccessEmployer must return isScopedTeamMemberFromRpc(teamMemberRpc) for the ` +
          "non-owner case -- not an inline boolean expression"
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
