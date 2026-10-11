import { isStaffRole, type HostRole } from "@/lib/hosts";

/**
 * Which documents and interviews a screen shows (useDocuments, useInterviews).
 *
 * The database already returns only what the person may see. This picks the
 * side they are looking from:
 *   - a business owner: their own business's applicants;
 *   - a team member: their team's applicants (the jobs they are on), never
 *     their own applications elsewhere. They used to get only their own, so
 *     a team member's Documents and Interviews showed the wrong business
 *     (the 2026-10-11 overview);
 *   - an applicant: their own.
 */
export function belongsToMyView(
  application: { candidate_id?: string | null; jobs?: { employer_id?: string | null } | null } | null | undefined,
  me: { userId: string; role: string | null | undefined; isTeamMember: boolean },
): boolean {
  if (!application) return false;
  if (me.role === "employer" && !me.isTeamMember) return application.jobs?.employer_id === me.userId;
  if (me.isTeamMember || isStaffRole((me.role ?? null) as HostRole)) return application.candidate_id !== me.userId;
  return application.candidate_id === me.userId;
}
