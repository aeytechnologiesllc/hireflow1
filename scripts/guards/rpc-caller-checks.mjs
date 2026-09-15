/**
 * Nine SECURITY DEFINER helpers (subscription_plan_for_limits, get_user_role,
 * job_limit_for_user, team_member_limit_for_user,
 * document_workflow_limit_for_user, document_workflow_count_for_user,
 * is_team_member, get_team_member_permissions) were EXECUTE-granted to
 * PUBLIC/anon/authenticated with no argument check at all, and six more
 * (has_role, can_create_jobs_for_user, can_create_document_workflows_for_user,
 * can_invite_team_members, can_view_applicant_profile,
 * did_candidate_apply_to_job) are called directly inside RLS policies with
 * the real (authenticated/anon) caller's privileges, so anyone could POST
 * /rest/v1/rpc/get_user_role {"_user_id":"<victim>"} (etc.) and learn a
 * stranger's billing plan, role, job/document/team-member limits or team
 * permissions.
 *
 * Fixed by supabase/migrations/20260915131000_rpc_caller_checks.sql: the
 * first eight are fully revoked from PUBLIC/anon/authenticated (confirmed
 * live: none is referenced by any RLS policy, any other function, or the
 * app -- they're only ever called from other SECURITY DEFINER functions,
 * which run as their `postgres` owner and so are unaffected by revoking
 * other roles); the other six keep their grants (RLS needs to evaluate them
 * as the real caller) but gained a caller check in the function body itself
 * -- the argument that names a user must equal auth.uid(), the caller must
 * be an active team member of that employer (the one other shape live
 * policies use), or the caller is service_role. See the migration's header
 * comment for the full reasoning and a PGlite proof at
 * scripts/rpc_caller_checks.pglite.test.mjs (run it directly; it needs a
 * real Postgres engine, so it is not wired into these static guards).
 *
 * These guards are static text checks over the migration itself -- cheap and
 * fast, but not a substitute for the PGlite proof. Run that separately:
 *   node scripts/rpc_caller_checks.pglite.test.mjs
 */

const MIGRATION = "supabase/migrations/20260915131000_rpc_caller_checks.sql";

export default [
  {
    id: "rpc-caller-checks-migration-exists",
    why:
      `${MIGRATION} must exist and revoke PUBLIC/anon/authenticated EXECUTE on all eight internal-only ` +
      "helpers -- without it, anyone can still RPC any user's billing plan, role, or limits by id.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];
      const leaves = [
        ["subscription_plan_for_limits(uuid)", "subscription_plan_for_limits"],
        ["get_user_role(uuid)", "get_user_role"],
        ["job_limit_for_user(uuid)", "job_limit_for_user"],
        ["team_member_limit_for_user(uuid)", "team_member_limit_for_user"],
        ["document_workflow_limit_for_user(uuid)", "document_workflow_limit_for_user"],
        ["document_workflow_count_for_user(uuid)", "document_workflow_count_for_user"],
        ["is_team_member(uuid, uuid)", "is_team_member"],
        ["get_team_member_permissions(uuid, uuid)", "get_team_member_permissions"],
      ];
      for (const [sig, label] of leaves) {
        const re = new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${sig.replace(/[().]/g, "\\$&")} FROM PUBLIC, anon, authenticated;`,
        );
        if (!re.test(sql)) {
          bad.push(`missing exact "REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;"`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "rpc-caller-checks-kept-functions-guarded",
    why:
      "The six functions RLS calls directly must keep their grants but gain a caller check in the body " +
      "(target = auth.uid(), an active team-member relation, or service_role) -- without it, a direct RPC " +
      "call with an arbitrary id still returns the real answer even though the grant looks tightened.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];

      const fnBody = (name) => {
        const re = new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$;`,
        );
        const m = re.exec(sql);
        return m ? m[1] : null;
      };

      const hasRole = fnBody("has_role");
      if (!hasRole) bad.push("has_role(...) body not found");
      else if (!/_user_id\s*=\s*auth\.uid\(\)/.test(hasRole) || !/auth\.role\(\)\s*=\s*'service_role'/.test(hasRole)) {
        bad.push("has_role no longer checks _user_id = auth.uid() (or service_role)");
      }

      const canCreateJobs = fnBody("can_create_jobs_for_user");
      if (!canCreateJobs) bad.push("can_create_jobs_for_user(...) body not found");
      else {
        if (!/target_user_id\s*=\s*auth\.uid\(\)/.test(canCreateJobs)) bad.push("can_create_jobs_for_user no longer checks target_user_id = auth.uid()");
        if (!/tm\.employer_id\s*=\s*target_user_id/.test(canCreateJobs)) bad.push("can_create_jobs_for_user no longer allows an active team member of target_user_id (breaks 'Team members can create jobs if permitted')");
        if (!/auth\.role\(\)\s*=\s*'service_role'/.test(canCreateJobs)) bad.push("can_create_jobs_for_user no longer allows service_role");
      }

      const canCreateDocs = fnBody("can_create_document_workflows_for_user");
      if (!canCreateDocs) bad.push("can_create_document_workflows_for_user(...) body not found");
      else {
        if (!/target_user_id\s*=\s*auth\.uid\(\)/.test(canCreateDocs)) bad.push("can_create_document_workflows_for_user no longer checks target_user_id = auth.uid()");
        if (!/tm\.employer_id\s*=\s*target_user_id/.test(canCreateDocs)) bad.push("can_create_document_workflows_for_user no longer allows an active team member of target_user_id");
      }

      const canInvite = fnBody("can_invite_team_members");
      if (!canInvite) bad.push("can_invite_team_members(...) body not found");
      else if (!/target_user_id\s*=\s*auth\.uid\(\)/.test(canInvite)) {
        bad.push("can_invite_team_members no longer checks target_user_id = auth.uid()");
      }

      const canView = fnBody("can_view_applicant_profile");
      if (!canView) bad.push("can_view_applicant_profile(...) body not found");
      else if (!/p_viewer_id\s*=\s*auth\.uid\(\)/.test(canView)) {
        bad.push("can_view_applicant_profile no longer checks p_viewer_id = auth.uid()");
      }
      if (!/REVOKE EXECUTE ON FUNCTION public\.can_view_applicant_profile\(uuid, uuid\) FROM anon;/.test(sql)) {
        bad.push("missing REVOKE EXECUTE ON FUNCTION public.can_view_applicant_profile(uuid, uuid) FROM anon;");
      }

      const didApply = fnBody("did_candidate_apply_to_job");
      if (!didApply) bad.push("did_candidate_apply_to_job(...) body not found");
      else if (!/p_user_id\s*=\s*auth\.uid\(\)/.test(didApply)) {
        bad.push("did_candidate_apply_to_job no longer checks p_user_id = auth.uid()");
      }
      if (!/REVOKE EXECUTE ON FUNCTION public\.did_candidate_apply_to_job\(uuid, uuid\) FROM anon;/.test(sql)) {
        bad.push("missing REVOKE EXECUTE ON FUNCTION public.did_candidate_apply_to_job(uuid, uuid) FROM anon;");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
