type AuthUserWithAppMetadata = {
  app_metadata?: Record<string, unknown> | null;
};

export function userHasSubscriptionBypass(
  user: AuthUserWithAppMetadata | null | undefined,
): boolean {
  return user?.app_metadata?.subscription_bypass === true;
}

interface SupabaseAuthAdminLike {
  auth: {
    admin: {
      getUserById: (
        userId: string,
      ) => Promise<{ data: { user: AuthUserWithAppMetadata | null } | null; error: { message: string } | null }>;
    };
  };
}

export async function hasSubscriptionBypassForUser(
  supabaseAdmin: SupabaseAuthAdminLike,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) {
    console.error("[subscription-bypass] Failed to read Auth app metadata", {
      userId,
      error: error.message,
    });
    throw new Error("Unable to verify subscription access");
  }

  return userHasSubscriptionBypass(data?.user);
}
