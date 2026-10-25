import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Briefcase, Check, X, Loader2 } from "lucide-react";
import BrandLoader from "@/components/BrandLoader";
import { motion } from "framer-motion";
import { GOOGLE_AUTH_ENABLED } from "@/lib/googleAuth";
import { getErrorMessage } from "@/lib/utils";

interface InvitationData {
  invitee_email: string | null;
  invitee_name: string | null;
  department: string | null;
  permission_level: string;
  can_create_jobs: boolean;
  can_delete_jobs: boolean;
  can_message_candidates: boolean;
  can_manage_pipeline: boolean;
  can_schedule_interviews: boolean;
  can_send_documents: boolean;
  assigned_job_ids: string[];
  expires_at: string;
  inviter_profile?: {
    full_name: string;
    company_name: string;
  };
}

/**
 * Why a signed-in person could not join, from accept_team_invitation's
 * refusals (supabase/migrations/20261011185000_join_team_from_empty_business.sql).
 * Each is shown with a way out, never as a toast over a spinner that turns
 * forever.
 */
interface JoinProblem {
  title: string;
  text: string;
  /**
   * The way out: sign out and join as the invitee (this account can't join),
   * try again (something went wrong on the way), or nothing to do here.
   */
  next: "signOut" | "retry" | "none";
}

function joinProblemFor(message: string, inviteeEmail: string | null): JoinProblem {
  const invitee = inviteeEmail || "the email it was sent to";
  if (message.includes("different email")) {
    return { title: "This invitation is for another email", text: `It was sent to ${invitee}. You're signed in with a different account.`, next: "signOut" };
  }
  if (message.includes("runs its own hiring")) {
    return { title: "This account runs its own hiring", text: `An account that posts its own jobs can't also join another team. Join with ${invitee} instead.`, next: "signOut" };
  }
  if (message.includes("another hiring team")) {
    return { title: "This account is on another team", text: `An account can be on one hiring team. Join with ${invitee} instead.`, next: "signOut" };
  }
  if (message.includes("already been used")) {
    return { title: "This invitation was already used", text: "Someone has joined with it already. If that was you with another account, sign in with that one. Otherwise, ask whoever invited you for a new link.", next: "signOut" };
  }
  if (message.includes("expired")) {
    return { title: "This invitation has expired", text: "Ask whoever invited you for a new link.", next: "none" };
  }
  return { title: "We couldn't add you to the team", text: message || "Something went wrong. Try again in a moment.", next: "retry" };
}

export default function JoinTeam() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The link no longer opens an invitation (used, expired or not one): who is
  // signed in decides what that means (see the effect below).
  const [linkClosed, setLinkClosed] = useState(false);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signup");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      if (!code) {
        setError("Invalid invitation link");
        setLoading(false);
        return;
      }

      try {
        // Server-side, code-gated lookup: only ever returns the one row
        // whose invite_code exactly matches, and only while it's still
        // pending and unexpired. Callable while signed out (the invitee
        // hasn't created an account yet), and never lists other invitations.
        const { data: rows, error: inviteError } = await supabase.rpc(
          "get_team_invitation_by_code",
          { p_code: code },
        );

        if (inviteError) throw inviteError;

        const inviteData = rows?.[0];
        if (!inviteData) {
          // Only pending, unexpired invitations come back, so this cannot yet
          // tell "used" from "expired" or "never was". The effect below asks
          // on behalf of whoever is signed in.
          setLinkClosed(true);
          setLoading(false);
          return;
        }

        setInvitation({
          ...inviteData,
          inviter_profile: inviteData.company_name || inviteData.inviter_name
            ? { full_name: inviteData.inviter_name, company_name: inviteData.company_name }
            : undefined,
        });

        // Pre-fill email if specified
        if (inviteData.invitee_email) {
          setEmail(inviteData.invitee_email);
        }
        if (inviteData.invitee_name) {
          setFullName(inviteData.invitee_name);
        }
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load invitation"));
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [code]);

  // A link that opens no invitation. For someone signed in, accepting again
  // answers it exactly: the person who used this invitation is told "yes"
  // again (the function's replay rule) and goes to their team; anyone else
  // hears used, expired or not found. Signed out, it is said plainly with a
  // way to sign in.
  useEffect(() => {
    // Waits for the session too, so a signed-in visitor never sees the
    // signed-out answer flash first.
    if (!linkClosed || loading || authLoading) return;
    if (!user) {
      setError("This invitation link has already been used, has expired, or isn't valid. If you already joined this team, sign in to get to it. Otherwise, ask whoever invited you for a new link.");
      return;
    }
    // Signed in just now (from the form below): ask again, behind the loader.
    setError(null);
    let cancelled = false;
    void (async () => {
      const { error: acceptError } = await supabase.rpc("accept_team_invitation", { p_code: code! });
      if (cancelled) return;
      if (!acceptError) {
        window.location.replace("/team-portal");
        return;
      }
      const message = acceptError.message || "";
      setError(
        message.includes("already been used")
          ? "This invitation was already used by another account. If you joined with a different email, sign out and sign in with that one."
          : message.includes("expired")
            ? "This invitation has expired. Ask whoever invited you for a new link."
            : "This invitation link isn't valid. Ask whoever invited you for a new link.",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [linkClosed, loading, authLoading, user, code]);

  // Handle if user is already logged in
  useEffect(() => {
    if (user && invitation) {
      handleAcceptInvitation();
    }
    // handleAcceptInvitation isn't added: it's unmemoized, and on any of its
    // non-navigating failure paths (email mismatch, already used, generic
    // error) it only sets the problem and isSubmitting — user/invitation stay truthy, so
    // that re-render would give this effect a "changed" dependency and call
    // it again, forever, on every one of those failures. It only leaves via
    // window.location.replace on success, which tears the page down anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invitation]);

  const handleAcceptInvitation = async () => {
    if (!user || !invitation) return;

    setIsSubmitting(true);
    setJoinProblem(null);
    try {
      // Everything that matters -- the pending/unexpired check, the invitee
      // email match, and copying permissions/assigned_job_ids -- happens
      // server-side inside this RPC, off the invitation row it looks up
      // itself. The client never supplies permissions, and can't accept on
      // someone else's behalf.
      const { error: acceptError } = await supabase.rpc("accept_team_invitation", {
        p_code: code!,
      });

      if (acceptError) {
        // Shown on the page with a way out (sign out and join as the
        // invitee), in place of "Joining team...". An already-used
        // invitation never reaches here for the person who used it: the
        // function answers them "yes" again.
        setJoinProblem(joinProblemFor(acceptError.message || "", invitation.invitee_email));
        setIsSubmitting(false);
        return;
      }

      // Add team_member role if not already present
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .eq("role", "team_member")
        .maybeSingle();

      if (!existingRole) {
        await supabase.from("user_roles").insert({
          user_id: user.id,
          role: "team_member",
        });
      }

      toast({
        title: "Welcome to the Team!",
        description: "You've successfully joined the team.",
      });

      // Force a fresh app bootstrap so auth + team membership state picks up
      // the newly inserted team_members row before rendering the shell.
      window.location.replace("/team-portal");
    } catch (err) {
      setJoinProblem(joinProblemFor(getErrorMessage(err, ""), invitation.invitee_email));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Signs out so the invitee can sign in or create their account right here. */
  const handleSignOutToJoin = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setJoinProblem(null);
      setIsSigningOut(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and password",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
    // If successful, the useEffect above will handle accepting the invitation
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // The same rule as every other new password (Auth.tsx; Supabase Auth
    // enforces 8 as well): said here before the server has to refuse it.
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const { error } = await signUp(email, password, fullName, "team_member");

    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
    // If successful, the useEffect above will handle accepting the invitation
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const redirectUrl = `${window.location.origin}/join-team/${code}`;
    const { error } = await signInWithGoogle(redirectUrl, "team_member");
    if (error) {
      toast({
        title: "Google Sign In Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

  // A closed link waits for its answer (asked for whoever is signed in).
  if (loading || (linkClosed && !error)) {
    return (
      <div className="dark">
        <BrandLoader message="Loading invitation..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[hsl(220,18%,10%)] text-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 rounded-full bg-destructive/10 w-fit mb-4">
              <X className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>{linkClosed ? "This invitation can't be used" : "Invalid Invitation"}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Someone who already joined signs in here and goes to their team. */}
            {linkClosed && !user && (
              <form onSubmit={handleSignIn} className="space-y-3" data-join-signin>
                <div className="space-y-2">
                  <Label htmlFor="closed-signin-email">Email</Label>
                  <Input id="closed-signin-email" type="email" autoComplete="email" placeholder="john@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closed-signin-password">Password</Label>
                  <Input id="closed-signin-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            )}
            {linkClosed && user && (
              <Button className="w-full" onClick={() => void handleSignOutToJoin()} disabled={isSigningOut}>
                {isSigningOut ? "Signing out..." : "Sign out and use another account"}
              </Button>
            )}
            <div className="text-center">
              <Button onClick={() => navigate("/")} variant="outline">
                Go to Homepage
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) return null;

  const permissionLabel =
    invitation.permission_level === "full_admin"
      ? "Full Admin"
      : invitation.permission_level === "limited"
      ? "Team Member"
      : "View Only";

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-[hsl(220,18%,10%)] text-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              {invitation.inviter_profile?.full_name || "Someone"} has invited you to join{" "}
              {invitation.inviter_profile?.company_name || "their team"} on HireFlow
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Invitation Details */}
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Your Access Level</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Permission Level</span>
                <Badge
                  variant="outline"
                  className={
                    invitation.permission_level === "full_admin"
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : invitation.permission_level === "limited"
                      ? "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20"
                      : "bg-primary/10 text-primary border-primary/20"
                  }
                >
                  {permissionLabel}
                </Badge>
              </div>
              {invitation.department && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span className="text-sm">{invitation.department}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Job Access</span>
                <span className="text-sm">
                  {invitation.assigned_job_ids.length > 0
                    ? `${invitation.assigned_job_ids.length} specific job(s)`
                    : "All jobs"}
                </span>
              </div>
            </div>

            {/* Permissions Preview */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: "Message Candidates", allowed: invitation.can_message_candidates },
                { label: "Manage Pipeline", allowed: invitation.can_manage_pipeline },
                { label: "Schedule Interviews", allowed: invitation.can_schedule_interviews },
                { label: "Send Documents", allowed: invitation.can_send_documents },
                { label: "Create Jobs", allowed: invitation.can_create_jobs },
                { label: "Delete Jobs", allowed: invitation.can_delete_jobs },
              ].map((perm) => (
                <div key={perm.label} className="flex items-center gap-2">
                  {perm.allowed ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={perm.allowed ? "" : "text-muted-foreground"}>{perm.label}</span>
                </div>
              ))}
            </div>

            {/* Auth Forms */}
            {!user && (
              <div className="space-y-4">
                {/* Google Sign-In Button */}
                {/* The provider is disabled, and this redirect is absolute, so the
                    invitee was actually navigated to raw Supabase JSON:
                    {"code":400,...,"msg":"Unsupported provider"}. */}
                {GOOGLE_AUTH_ENABLED && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isSubmitting}
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="signup">Create Account</TabsTrigger>
                    <TabsTrigger value="signin">Sign In</TabsTrigger>
                  </TabsList>

                <TabsContent value="signup" className="space-y-4 mt-4">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        autoComplete="name"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        autoComplete="email"
                        type="email"
                        placeholder="john@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={!!invitation.invitee_email}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Joining Team...
                        </>
                      ) : (
                        "Create Account & Join Team"
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signin" className="space-y-4 mt-4">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        autoComplete="email"
                        type="email"
                        placeholder="john@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={!!invitation.invitee_email}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        autoComplete="current-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Signing In...
                        </>
                      ) : (
                        "Sign In & Join Team"
                      )}
                    </Button>
                  </form>
                </TabsContent>
                </Tabs>
              </div>
            )}

            {user && joinProblem && (
              <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert" data-join-problem>
                <p className="font-medium">{joinProblem.title}</p>
                <p className="text-sm text-muted-foreground">{joinProblem.text}</p>
                <div className="flex flex-col gap-2">
                  {joinProblem.next === "signOut" && (
                    <Button onClick={() => void handleSignOutToJoin()} disabled={isSigningOut}>
                      {isSigningOut ? "Signing out..." : invitation.invitee_email ? `Sign out and join with ${invitation.invitee_email}` : "Sign out and use another account"}
                    </Button>
                  )}
                  {joinProblem.next === "retry" && (
                    <Button variant="outline" onClick={() => void handleAcceptInvitation()} disabled={isSubmitting}>
                      Try again
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => navigate("/")}>
                    Go to Homepage
                  </Button>
                </div>
              </div>
            )}

            {user && !joinProblem && (
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Joining team...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
