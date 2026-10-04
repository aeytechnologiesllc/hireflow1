/**
 * Two front doors, one app (owner, 2026-10-04: "make hireflownow.com for
 * candidates … the staff side automatically takes you to the login screen").
 *
 *   hireflownow.com         candidates: the careers page, job pages, applying
 *   staff.hireflownow.com   the hiring team: straight to sign-in, then the dashboard
 *
 * Both hosts serve the same build; the staff host is recognised by its
 * "staff." prefix (so staff.localhost works in development too).
 *
 * Moving the hiring team's pages OFF the main host waits for the build flag
 * VITE_STAFF_SPLIT=on, set once staff.hireflownow.com resolves: until then
 * sending the team there would lock them out of their own dashboard.
 */

export type HostRole = "employer" | "candidate" | "team_member" | "developer" | null;

export const STAFF_SPLIT_ON = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_STAFF_SPLIT === "on";

export function isStaffHost(hostname: string = window.location.hostname): boolean {
  return hostname.startsWith("staff.");
}

function mainHostname(hostname: string): string {
  return hostname.replace(/^staff\./, "").replace(/^www\./, "");
}

function originFor(hostname: string): string {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}

/** The candidates' site — where every public link (a job, a job code, a
 *  document check) must point, whichever host built the link. */
export function candidateOrigin(): string {
  const { hostname } = window.location;
  return isStaffHost(hostname) ? originFor(mainHostname(hostname)) : window.location.origin;
}

/** The hiring team's site. */
export function staffOrigin(): string {
  const { hostname } = window.location;
  return isStaffHost(hostname) ? window.location.origin : originFor(`staff.${mainHostname(hostname)}`);
}

/** Origin for links the hiring team hands each other (team invites): the
 *  staff host once the split is live, otherwise wherever they are now. */
export function staffLinkOrigin(): string {
  return STAFF_SPLIT_ON ? staffOrigin() : window.location.origin;
}

/** Where "Team sign in" goes from the candidates' site. */
export function staffSignInHref(): string {
  if (isStaffHost() || !STAFF_SPLIT_ON) return "/auth";
  return `${staffOrigin()}/auth`;
}

export function isStaffRole(role: HostRole): boolean {
  return role === "employer" || role === "team_member" || role === "developer";
}

const STAFF_ONLY = [
  /^\/auth\/?$/,
  /^\/dashboard(\/|$)/,
  /^\/jobs(\/|$)/,
  /^\/applicants(\/|$)/,
  /^\/interviews(\/|$)/,
  /^\/documents(\/|$)/,
  /^\/more(\/|$)/,
  /^\/team(\/|$)/,
  /^\/team-portal(\/|$)/,
  /^\/analytics(\/|$)/,
  /^\/developer(\/|$)/,
  /^\/join-team(\/|$)/,
  /^\/oauth\/google\/callback(\/|$)/,
];

const CANDIDATE_ONLY = [
  /^\/candidate\/?$/,
  /^\/candidate\/auth(\/|$)/,
  /^\/candidate\/apply(\/|$)/,
  /^\/candidate\/continue(\/|$)/,
  /^\/applications(\/|$)/,
  /^\/apply\/?$/,
  /^\/my-documents(\/|$)/,
];

/** Signed-in pages both sides use; which host they belong on depends on who
 *  is signed in. */
const SHARED_PRIVATE = [/^\/messages(\/|$)/, /^\/notifications(\/|$)/, /^\/settings(\/|$)/, /^\/profile(\/|$)/];

export const isStaffOnlyPath = (path: string) => STAFF_ONLY.some((re) => re.test(path));
export const isCandidateOnlyPath = (path: string) => CANDIDATE_ONLY.some((re) => re.test(path));
export const isSharedPrivatePath = (path: string) => SHARED_PRIVATE.some((re) => re.test(path));

export interface HostDecisionInput {
  hostname: string;
  path: string;
  /** search + hash, carried over unchanged (password-reset and OAuth tokens live there). */
  rest: string;
  splitOn: boolean;
  authLoading: boolean;
  signedIn: boolean;
  role: HostRole;
}

/**
 * Where this request belongs, or null to stay. Pure, so the rule is tested
 * on its own (scripts/hosts_routing.test.mjs). Returns a path starting with
 * "/" for a same-host move, or a full URL for a cross-host one.
 */
export function hostRedirect(input: HostDecisionInput, origins: { candidate: string; staff: string }): string | null {
  const { hostname, path, rest, splitOn, authLoading, signedIn, role } = input;

  if (isStaffHost(hostname)) {
    if (path === "/") {
      if (authLoading) return null;
      return signedIn && isStaffRole(role) ? "/dashboard" : "/auth";
    }
    if (isCandidateOnlyPath(path)) return `${origins.candidate}${path}${rest}`;
    if (!authLoading && signedIn && role === "candidate" && isSharedPrivatePath(path)) {
      return `${origins.candidate}${path}${rest}`;
    }
    return null;
  }

  if (!splitOn) return null;
  if (isStaffOnlyPath(path)) return `${origins.staff}${path}${rest}`;
  if (!authLoading && signedIn && isStaffRole(role) && isSharedPrivatePath(path)) {
    return `${origins.staff}${path}${rest}`;
  }
  return null;
}
