/**
 * Pure mapping from the raw result of calling the SECURITY DEFINER RPC
 * public.is_active_team_member_for_job(p_job_id, p_user_id) to the
 * "isScopedTeamMember" access decision every caller of that RPC
 * (generate-applicant-dossier, trigger-ava-analysis, interview-rooms,
 * google-indexing) is supposed to use.
 *
 * Kept separate from the Deno/Supabase-specific edge function code, with no
 * Deno/network imports, so the fail-closed rule can be unit-tested directly
 * under plain Node instead of only being checked by a guard regex over each
 * call site's source text -- see scripts/team_member_rpc_access.test.mjs
 * (run directly: `node scripts/team_member_rpc_access.test.mjs`).
 *
 * Why this exists as a shared function instead of an inline expression at
 * each call site: an earlier version of generate-applicant-dossier/index.ts
 * computed this inline as
 *   `const isScopedTeamMember = !teamMemberRpc.error && teamMemberRpc.data === true;`
 * and a reviewer showed that dropping `!teamMemberRpc.error &&` from that
 * assignment still passed the guard meant to catch it
 * (scripts/guards/dossier-team-scope.mjs) -- the guard's regex only checked
 * that the substring `teamMemberRpc.error` appeared *somewhere* in the file
 * (it did, in the console.error(...) log line right above the assignment),
 * not that the boolean actually assigned depended on it. Centralizing the
 * mapping here lets every guard check "does this file call
 * isScopedTeamMemberFromRpc(...) instead of reimplementing the check
 * inline" -- a call-site check that can't be spoofed by an unrelated
 * `.error` reference elsewhere in the file -- while the mapping itself is
 * covered once, directly, by a real test.
 */
export interface TeamMemberRpcResult {
  /**
   * teamMemberRpc.data -- must be the literal boolean `true` to grant
   * access. Typed `unknown` (not `boolean | null | undefined`) because the
   * different Supabase client instantiations across these edge functions
   * don't all carry the same generic type parameters, so `.rpc(...)`'s
   * inferred `data` type varies by call site (`any` at some, `unknown` at
   * others where the client is passed through a generically-typed
   * parameter) -- the `=== true` check below is exact regardless.
   */
  data: unknown;
  /** teamMemberRpc.error -- any truthy value here must deny access, never grant it. */
  error: unknown;
}

/**
 * True only when the RPC call succeeded (no error) and returned exactly
 * `true`. Any error -- network failure, RLS/permission error, malformed
 * response -- and any data value other than `true` (including `false`,
 * `null`, `undefined`, or a non-boolean) must deny access. This is the one
 * place that rule is allowed to live; nothing else should re-derive it.
 */
export function isScopedTeamMemberFromRpc(result: TeamMemberRpcResult): boolean {
  return !result.error && result.data === true;
}
