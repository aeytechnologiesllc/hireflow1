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
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (redirectTo?: string, role?: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      // If the client has a session cached but the server says it doesn't exist anymore,
      // we must clear local auth state to avoid infinite "User not authenticated" loops.
      if (error || !user) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setRole(null);
        setIsTeamMember(false);
      }

      return { user, error };
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
            fetchUserRole(verifiedUser.id);
            checkTeamMembership(verifiedUser.id);
          }
        }, 0);
      } else {
        setRole(null);
        setIsTeamMember(false);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const { user: verifiedUser } = await validateSession();
        if (verifiedUser) {
          await Promise.all([
            fetchUserRole(verifiedUser.id),
            checkTeamMembership(verifiedUser.id),
          ]);
        }
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching user role:", error);
        return;
      }

      // Handle multiple roles - prioritize developer > employer > team_member > candidate
      const roles = (data ?? []).map(r => r.role as AppRole);
      const resolved: AppRole | null = 
        roles.includes("developer") ? "developer" :
        roles.includes("employer") ? "employer" :
        roles.includes("team_member") ? "team_member" :
        roles.includes("candidate") ? "candidate" :
        null;

      setRole(resolved);
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

  const signUp = async (email: string, password: string, fullName: string, userRole: AppRole) => {
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          role: userRole,
        },
      },
    });

    return { error: error as Error | null, needsConfirmation: !!data?.user && !data?.session };
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { error: error as Error };
      }

      // After successful OAuth, assign role if needed
      if (role) {
        setTimeout(async () => {
          await supabase.rpc("assign_user_role", { p_role: role });
        }, 0);
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

  return (
    <AuthContext.Provider value={{ user, session, role, isTeamMember, loading, signUp, signIn, signInWithGoogle, signOut }}>
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
