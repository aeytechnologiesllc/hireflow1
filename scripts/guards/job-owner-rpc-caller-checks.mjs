/**
 * public.is_job_owner(p_job_id, p_user_id) and
 * public.is_active_team_member_for_job(p_job_id, p_user_id, ...) were
 * SECURITY DEFINER, exposed to anon/authenticated/service_role via
 * PostgREST RPC, with no check that p_user_id had anything to do with the
 * caller -- any signed-in stranger (anon too) could POST
 * /rest/v1/rpc/is_job_owner {"p_job_id":"<job>","p_user_id":"<victim>"} and
 * learn whether some other user owns a job or is an active team member of
 * it.
 *
 * Fixed by
 * supabase/migrations/20260915141000_job_owner_rpc_caller_checks.sql:
 *   1. The two policy branches that asked is_job_owner about someone other
 *      than the caller (messages "Counterparties can send messages"
 *      candidate branch, notifications "Related parties can insert
 *      notifications" branch (c)) are rewritten as an inline EXISTS join to
 *      jobs instead, so they don't need the RPC-exposed function to vouch
 *      for a third party.
 *   2. Both functions gain a caller check (p_user_id = auth.uid(), or
 *      service_role), and lose EXECUTE from anon/PUBLIC while keeping it
 *      for authenticated/service_role (every remaining live call site --
 *      applications policies, document_audit_logs, job_quiz_keys x4,
 *      get_job_quiz_keys, grant_quiz_retake, protect_application_columns,
 *      notify_new_application_submitted -- already only ever passes
 *      auth.uid()).
 *
 * See the migration's header comment for the full reasoning and a PGlite
 * proof at scripts/job_owner_rpc_caller_checks.pglite.test.mjs (run it
 * directly; it needs a real Postgres engine, so it is not wired into these
 * static guards).
 *
 * These guards are static text checks over the migration itself -- cheap
 * and fast, but not a substitute for the PGlite proof. Run that separately:
 *   node scripts/job_owner_rpc_caller_checks.pglite.test.mjs
 */

const MIGRATION = "supabase/migrations/20260915141000_job_owner_rpc_caller_checks.sql";

// Strip SQL line comments before scanning for actual code shapes -- the
// migration's header comment quotes the OLD (pre-fix) call text verbatim
// for context, which would otherwise false-positive as a live call site.
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

export default [
  {
    id: "job-owner-rpc-caller-checks-migration-exists",
    why:
      `${MIGRATION} must exist, add a caller check to both is_job_owner and ` +
      "is_active_team_member_for_job, and revoke their EXECUTE from anon -- without it, any signed-in " +
      "stranger (or anon) can still RPC whether an arbitrary user owns or manages a given job.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      return { ok: true };
    },
  },
  {
    id: "job-owner-rpc-caller-checks-functions-guarded",
    why:
      "is_job_owner and is_active_team_member_for_job must each check p_user_id = auth.uid() (or " +
      "service_role) before answering -- without it, a signed-in stranger passing someone else's id as " +
      "p_user_id still gets the real answer even though EXECUTE looks tightened.",
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

      const isJobOwner = fnBody("is_job_owner");
      if (!isJobOwner) bad.push("is_job_owner(...) body not found");
      else {
        if (!/p_user_id\s*=\s*auth\.uid\(\)/.test(isJobOwner)) bad.push("is_job_owner no longer checks p_user_id = auth.uid()");
        if (!/auth\.role\(\)\s*=\s*'service_role'/.test(isJobOwner)) bad.push("is_job_owner no longer allows service_role");
        if (!/j\.employer_id\s*=\s*p_user_id/.test(isJobOwner)) bad.push("is_job_owner no longer checks j.employer_id = p_user_id (the actual ownership answer)");
      }

      const isTeamMember = fnBody("is_active_team_member_for_job");
      if (!isTeamMember) bad.push("is_active_team_member_for_job(...) body not found");
      else {
        if (!/p_user_id\s*=\s*auth\.uid\(\)/.test(isTeamMember)) bad.push("is_active_team_member_for_job no longer checks p_user_id = auth.uid()");
        if (!/auth\.role\(\)\s*=\s*'service_role'/.test(isTeamMember)) bad.push("is_active_team_member_for_job no longer allows service_role");
        if (!/tm\.user_id\s*=\s*p_user_id/.test(isTeamMember)) bad.push("is_active_team_member_for_job no longer checks tm.user_id = p_user_id (the actual membership answer)");
      }

      if (!/REVOKE EXECUTE ON FUNCTION public\.is_job_owner\(uuid, uuid\) FROM PUBLIC, anon;/.test(sql)) {
        bad.push("missing REVOKE EXECUTE ON FUNCTION public.is_job_owner(uuid, uuid) FROM PUBLIC, anon;");
      }
      if (!/REVOKE EXECUTE ON FUNCTION public\.is_active_team_member_for_job\(uuid, uuid, boolean, boolean, boolean\) FROM PUBLIC, anon;/.test(sql)) {
        bad.push(
          "missing REVOKE EXECUTE ON FUNCTION public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC, anon;",
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "job-owner-rpc-caller-checks-non-auth-uid-branches-rewritten",
    why:
      "The messages/notifications policy branches that asked is_job_owner about someone other than the " +
      "caller (messages.receiver_id / notifications.user_id) must no longer call is_job_owner with a " +
      "non-caller id -- otherwise adding the caller check above would silently break candidate -> employer " +
      "messaging and notifications instead of just closing the RPC probe.",
    run: async ({ read }) => {
      const raw = await read(MIGRATION);
      if (!raw) return { ok: false, detail: [`${MIGRATION} not found`] };
      const sql = stripSqlComments(raw); // ignore the header comment's quoted OLD text
      const bad = [];

      if (/is_job_owner\(a\.job_id,\s*messages\.receiver_id\)/.test(sql)) {
        bad.push("messages policy still calls is_job_owner(a.job_id, messages.receiver_id) -- must be rewritten as an inline jobs EXISTS");
      }
      if (!/j\.employer_id\s*=\s*messages\.receiver_id/.test(sql)) {
        bad.push("messages policy is missing the inline replacement (j.employer_id = messages.receiver_id)");
      }

      if (/is_job_owner\(a\.job_id,\s*notifications\.user_id\)/.test(sql)) {
        bad.push("notifications policy still calls is_job_owner(a.job_id, notifications.user_id) -- must be rewritten as an inline jobs EXISTS");
      }
      if (!/j\.employer_id\s*=\s*notifications\.user_id/.test(sql)) {
        bad.push("notifications policy is missing the inline replacement (j.employer_id = notifications.user_id)");
      }

      // Every remaining CALL (not the function's own definition/REVOKE,
      // which name their uuid parameter/argument types) must pass
      // auth.uid() as p_user_id -- a quick sweep so a future edit can't
      // quietly add a new non-auth.uid() call site without this guard
      // noticing.
      const calls = sql.match(/is_job_owner\(([^)]*)\)/g) || [];
      for (const call of calls) {
        if (/uuid/i.test(call)) continue; // function signature / REVOKE, not a call
        if (!/auth\.uid\(\)/.test(call)) {
          bad.push(`found an is_job_owner(...) call that doesn't reference auth.uid(): ${call}`);
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
