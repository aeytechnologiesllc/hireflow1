/**
 * The six switches a business sets for each person on its hiring team
 * (team_members.can_*: the invite wizard and Edit team member), and what the
 * app says when one is off.
 *
 * The database is the guard: row-level security and the RPCs refuse a team
 * member whose switch is off. But a refused update comes back as "nothing
 * changed" (no error at all), and the screens read that as "already hired",
 * "had already moved on" or "Try again". These words make the refusal read as
 * what it is, and name the switch the owner can turn on.
 */

export type TeamPermission =
  | "canCreateJobs"
  | "canDeleteJobs"
  | "canMessageCandidates"
  | "canManagePipeline"
  | "canScheduleInterviews"
  | "canSendDocuments";

/** The switch as the owner sees it on the Team page. */
export const TEAM_PERMISSION_NAMES: Record<TeamPermission, string> = {
  canCreateJobs: "Create jobs",
  canDeleteJobs: "Delete jobs",
  canMessageCandidates: "Message candidates",
  canManagePipeline: "Manage pipeline",
  canScheduleInterviews: "Schedule interviews",
  canSendDocuments: "Send documents",
};

/** "Your team role can't move applicants. Ask the owner to turn on Manage pipeline." */
export function teamRoleCant(doing: string, permission: TeamPermission): string {
  return `Your team role can't ${doing}. Ask the owner to turn on ${TEAM_PERMISSION_NAMES[permission]}.`;
}

/** The pipeline refusal, said the same way wherever an applicant is moved. */
export const CANT_MOVE_APPLICANTS = teamRoleCant("move applicants", "canManagePipeline");

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * An update that changed no row. `.single()` on an update the database
 * refused (or on a row that is gone) comes back as PostgREST's "no row"
 * error, never as a permission error.
 */
export function isNoRowChanged(error: unknown): boolean {
  return (error as DbError)?.code === "PGRST116";
}

/**
 * A write that changed nothing, thrown with words ready to show. An update
 * without a returned row cannot tell a refusal from success, so the screens
 * ask for the row back and throw this when none comes.
 */
export class NothingChanged extends Error {}

/** A row-level-security or function refusal (an insert, or an RPC that raises 42501). */
export function isRefused(error: unknown): boolean {
  const e = error as DbError;
  return e?.code === "42501" || /row-level security|permission denied/i.test(e?.message ?? "");
}
