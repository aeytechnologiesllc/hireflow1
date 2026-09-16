/**
 * Authorization decisions shared by ai-shortlist and ai-analyze.
 *
 * Both functions spend real OpenAI credits and, without a check, would let
 * any authenticated account (or, for ai-analyze, anyone holding the public
 * anon key — verify_jwt=true only checks the JWT *signature*, not that it
 * belongs to a real signed-in user) analyze a job/application pipeline they
 * have no relationship to. These are pure, dependency-free functions — no
 * Deno/network imports — so the decision logic is unit-testable directly
 * under plain Node. See scripts/ai_ownership_access.test.mjs.
 *
 * The DB lookups that produce these facts live in each function's index.ts
 * (they need a Postgres client); only the "given these facts, is this call
 * allowed" decision lives here.
 */

export interface JobAccessFacts {
  /** requestingUserId === the job's employer_id */
  isOwner: boolean;
  /**
   * requestingUserId is an active team_members row for the job's employer,
   * with the ONE permission flag this specific action requires already true
   * (e.g. can_manage_pipeline for shortlisting, can_schedule_interviews for
   * interview prep), and scoped to this job by assigned_job_ids (an empty/
   * null assigned_job_ids means "all jobs", matching the live RLS policies
   * in supabase/migrations/20260715014000_break_jobs_applications_rls_recursion.sql).
   */
  isPermittedTeamMember: boolean;
  /** platform support/developer role (user_roles.role = 'developer') */
  isDeveloper: boolean;
}

/** True if these facts describe someone allowed to act on this job's pipeline. */
export function canAccessJobPipeline(facts: JobAccessFacts): boolean {
  return facts.isOwner || facts.isPermittedTeamMember || facts.isDeveloper;
}

export type AiAnalyzeType = "application" | "job-bias" | "interview" | "phase" | "resume";

export interface AiAnalyzeCallerFacts {
  type: AiAnalyzeType;
  /** the request's bearer token is exactly the project's service_role key */
  isServiceRole: boolean;
  /**
   * Ownership facts for the job/application this call names, resolved
   * server-side from a required id in the payload — null when no such id
   * was resolvable (missing id, or the id doesn't exist), which always
   * denies for a human caller.
   */
  job: JobAccessFacts | null;
}

/**
 * Who may call each ai-analyze "type":
 *
 *  - "resume" / "application": internal only. trigger-ava-analysis already
 *    verifies the requesting human (candidate owner, employer owner, active
 *    team member, or developer) before it invokes ai-analyze itself with the
 *    service role key — see its serve() handler. No human JWT may reach
 *    these types directly; doing so would let anyone spend OpenAI credits on
 *    arbitrary attacker-supplied "resume" text with no job/application tie.
 *  - "interview": employer side only — candidates never see AI/Ava, and
 *    interview questions (with grading criteria) must never reach the
 *    candidate they're about. Caller must own the job, or be an active team
 *    member with can_schedule_interviews for that job (the same permission
 *    that gates creating the interview row itself), or a developer.
 *  - "job-bias" / "phase": employer side only, same job-pipeline access as
 *    everything else in the cockpit. Neither type currently has a caller in
 *    src/ or any other edge function, so this is a closed-by-default rule
 *    for a currently-dead code path rather than a documented live flow.
 */
export function isAiAnalyzeCallAuthorized(facts: AiAnalyzeCallerFacts): boolean {
  if (facts.type === "resume" || facts.type === "application") {
    return facts.isServiceRole;
  }
  if (facts.isServiceRole) return true; // internal server-to-server calls are always trusted
  return facts.job !== null && canAccessJobPipeline(facts.job);
}
