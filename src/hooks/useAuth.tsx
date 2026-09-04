import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "employer" | "candidate" | "team_member" | "developer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isTeamMember: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole, companyName?: string) => Promise<{ error: Error | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (redirectTo?: string, role?: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * Re-read the role from the database right now. The role is otherwise only
   * fetched when the session first appears, so anything that writes a
   * user_roles row afterwards (AuthCallback's assign_user_role for a brand-new
   * OAuth account) has to call this, or the person renders in the wrong shell
   * until the next token refresh or a reload.
   */
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getFallbackRoleFromUser(user: User | null): AppRole | null {
  const rawRole = user?.user_metadata?.role;

  if (rawRole === "employer" || rawRole === "candidate" || rawRole === "team_member" || rawRole === "developer") {
    return rawRole;
  }

  return null;
}

function isDuplicateRoleAssignmentError(error: unknown) {
  const maybeError = error as { code?: string | number; message?: string } | null;
  const message = maybeError?.message?.toLowerCase() ?? "";

  return maybeError?.code === "23505" || maybeError?.code === 23505 || message.includes("duplicate key");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety watchdog: no matter what happens during auth bootstrap, never
    // leave the app stuck on the "Preparing your dashboard..." spinner.
    // If initialization hasn't resolved within a few seconds, release the
    // loading gate so route guards can render (and surface any real error)
    // instead of hanging forever.
    const loadingWatchdog = setTimeout(() => {
      setLoading(false);
    }, 8000);

    const validateSession = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        // If the client has a session cached but the server says it doesn't exist anymore,
        // we must clear local auth state to avoid infinite "User not authenticated" loops.
        if (error || !user) {
          await supabase.auth.signOut({ scope: "local" });
          setUser(null);
          setSession(null);
          setRole(null);
          setIsTeamMember(false);
        }

        return { user, error };
      } catch (error) {
        // Network/lock failures must not bubble up and skip setLoading(false).
        console.error("Error validating session:", error);
        return { user: null, error: error as Error };
      }
    };

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Defer all additional auth-dependent calls to avoid deadlocks
      if (session?.user) {
        setTimeout(async () => {
          const { user: verifiedUser } = await validateSession();
          if (verifiedUser) {
            fetchUserRole(verifiedUser.id, getFallbackRoleFromUser(verifiedUser));
            checkTeamMembership(verifiedUser.id);
          }
        }, 0);
      } else {
        setRole(null);
        setIsTeamMember(false);
      }
    });

    // THEN check for existing session.
    // CRITICAL: `setLoading(false)` MUST run in a `finally` — if any awaited
    // step (getUser, role/team lookups) throws, skipping it would trap the
    // app on the infinite loading screen.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            // Seed the role from user metadata immediately so route guards can
            // resolve even if the role/team lookups are slow or fail.
            setRole((prev) => prev ?? getFallbackRoleFromUser(session.user));

            const { user: verifiedUser } = await validateSession();
            if (verifiedUser) {
              await Promise.all([
                fetchUserRole(verifiedUser.id, getFallbackRoleFromUser(verifiedUser)),
                checkTeamMembership(verifiedUser.id),
              ]);
            }
          }
        } catch (error) {
          console.error("Error during auth initialization:", error);
        } finally {
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Error retrieving session:", error);
        setLoading(false);
      });

    return () => {
      clearTimeout(loadingWatchdog);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserRole = async (userId: string, fallbackRole: AppRole | null = null) => {
    try {
      const readResolvedRole = async () => {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (error) {
          throw error;
        }

        const roles = (data ?? []).map((r) => r.role as AppRole);
        const resolved: AppRole | null =
          roles.includes("developer") ? "developer" :
          roles.includes("employer") ? "employer" :
          roles.includes("team_member") ? "team_member" :
          roles.includes("candidate") ? "candidate" :
          null;

        return resolved;
      };

      let resolved = await readResolvedRole();
      let assignmentAttempted = false;

      if (!resolved && (fallbackRole === "employer" || fallbackRole === "candidate")) {
        // First-time accounts can momentarily authenticate before their role row exists.
        // Use the intended portal role immediately, then persist it if needed.
        assignmentAttempted = true;
        setRole(fallbackRole);

        const { error } = await supabase.rpc("assign_user_role", { p_role: fallbackRole });
        if (error && !isDuplicateRoleAssignmentError(error)) {
          // The usual causes are transient — a momentarily stale JWT, a 429, a
          // dropped request — so it is worth one more attempt before giving up.
          console.error("Error assigning fallback role, retrying:", error);
          const retry = await supabase.rpc("assign_user_role", { p_role: fallbackRole });
          if (retry.error && !isDuplicateRoleAssignmentError(retry.error)) {
            console.error("Role assignment failed twice:", retry.error);
          }
        }

        // No early return here. Bailing out used to leave the optimistic
        // setRole(fallbackRole) above standing with NO user_roles row behind
        // it, so the app believed the person was a candidate while the database
        // did not. Apply then sailed past every role check and died on the
        // INSERT policy, which reports "Failed to start application. Please try
        // again." — advice that could never work, on an account that looked
        // fine. Re-read instead and believe the database.
        resolved = await readResolvedRole();
      }

      // Only trust the intent when we never tried to persist it; once we have,
      // the absence of a row is the answer, not something to paper over.
      setRole(resolved ?? (assignmentAttempted ? null : fallbackRole) ?? null);
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
  };

  const checkTeamMembership = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        console.error("Error checking team membership:", error);
        return;
      }

      setIsTeamMember(!!data);
    } catch (error) {
      console.error("Error checking team membership:", error);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, userRole: AppRole, companyName?: string) => {
    const redirectUrl = new URL("/auth/callback", window.location.origin);
    redirectUrl.searchParams.set("role", userRole);

    const trimmedCompanyName = companyName?.trim();

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl.toString(),
        data: {
          full_name: fullName,
          role: userRole,
          // Employer-only. Carried as auth metadata so the `handle_new_user`
          // DB trigger can persist it straight into profiles.company_name at
          // account creation — the only point that used to leave it null for
          // every employer forever (see the 2026-08-30 migration).
          ...(trimmedCompanyName ? { company_name: trimmedCompanyName } : {}),
        },
      },
    });

    if (error) {
      return { error: error as Error, needsConfirmation: false };
    }

    if (data?.session) {
      return { error: null, needsConfirmation: false };
    }

    if (data?.user) {
      // Some hosted auth setups create the user first and require a follow-up
      // password sign-in before the browser session is established.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError) {
        return { error: null, needsConfirmation: false };
      }

      const needsConfirmation =
        /confirm/i.test(signInError.message) || /verified/i.test(signInError.message);

      return {
        error: needsConfirmation ? null : (signInError as Error),
        needsConfirmation,
      };
    }

    return {
      error: new Error("Sign up completed without an authenticated session."),
      needsConfirmation: false,
    };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signInWithGoogle = async (redirectTo?: string, role?: AppRole) => {
    try {
      // Resolve against the origin so a relative path ("/candidate/continue")
      // is accepted. Without the base, `new URL` throws "Invalid URL" before
      // Supabase is ever called, and the caller surfaces that raw browser
      // message as the sign-in error. An absolute URL ignores the base.
      const callbackUrl = new URL(redirectTo || "/auth/callback", window.location.origin);
      if (role) {
        callbackUrl.searchParams.set("role", role);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        return { error: error as Error };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsTeamMember(false);
  };

  const refreshRole = async () => {
    // getSession is local — no network — and is the same source the initial
    // bootstrap trusts, so this cannot disagree with it about who is signed in.
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    const currentUser = currentSession?.user;
    if (!currentUser) return;

    await Promise.all([
      fetchUserRole(currentUser.id, getFallbackRoleFromUser(currentUser)),
      checkTeamMembership(currentUser.id),
    ]);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, isTeamMember, loading, signUp, signIn, signInWithGoogle, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
