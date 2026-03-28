import { supabase } from "@/integrations/supabase/client";

export type AppRole = "employer" | "candidate" | "team_member" | "developer";
export type PortalRole = Extract<AppRole, "employer" | "candidate">;

const ROLE_PRIORITY: AppRole[] = ["developer", "employer", "team_member", "candidate"];

function isDuplicateRoleAssignmentError(error: unknown) {
  const maybeError = error as { code?: string | number; message?: string } | null;
  const message = maybeError?.message?.toLowerCase() ?? "";

  return maybeError?.code === "23505" || maybeError?.code === 23505 || message.includes("duplicate key");
}

export function resolveHighestPriorityRole(roles: Array<{ role: string }> | string[] | null | undefined): AppRole | null {
  const roleValues = (roles ?? [])
    .map((role) => (typeof role === "string" ? role : role.role))
    .filter((role): role is AppRole => ROLE_PRIORITY.includes(role as AppRole));

  return ROLE_PRIORITY.find((role) => roleValues.includes(role)) ?? null;
}

export async function fetchResolvedUserRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return resolveHighestPriorityRole(data);
}

export async function resolvePostAuthDestination({
  userId,
  portalRole,
  redirectTo,
}: {
  userId: string;
  portalRole: PortalRole;
  redirectTo?: string | null;
}): Promise<{ role: AppRole; route: string }> {
  let role = await fetchResolvedUserRole(userId);

  if (!role) {
    const { error } = await supabase.rpc("assign_user_role", { p_role: portalRole });

    if (error && !isDuplicateRoleAssignmentError(error)) {
      throw error;
    }

    role = (await fetchResolvedUserRole(userId)) ?? portalRole;
  }

  return {
    role,
    route: getPostAuthRoute(role, redirectTo),
  };
}

export function getPostAuthRoute(role: AppRole, redirectTo?: string | null): string {
  if (role === "developer") {
    return "/developer";
  }

  if (role === "candidate") {
    return "/apply";
  }

  if (role === "employer" && redirectTo === "createJob") {
    return "/jobs/create";
  }

  return "/dashboard";
}

export function getSignedOutRoute(role: AppRole | null): string {
  return role === "candidate" ? "/candidate" : "/auth";
}
