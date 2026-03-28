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
import { StaggeredBarsLoader } from "@/components/animations/StaggeredBarsLoader";
import { motion } from "framer-motion";

interface InvitationData {
  id: string;
  invite_code: string;
  inviter_id: string;
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
  status: string;
  expires_at: string;
  inviter_profile?: {
    full_name: string;
    company_name: string;
  };
}

export default function JoinTeam() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, signIn, signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        const { data: inviteData, error: inviteError } = await supabase
          .from("team_invitations")
          .select("*")
          .eq("invite_code", code)
          .maybeSingle();

        if (inviteError) throw inviteError;

        if (!inviteData) {
          setError("Invitation not found");
          setLoading(false);
          return;
        }

        // Check if expired
        if (new Date(inviteData.expires_at) < new Date()) {
          setError("This invitation has expired");
          setLoading(false);
          return;
        }

        // Check if already accepted
        if (inviteData.status !== "pending") {
          setError("This invitation has already been used");
          setLoading(false);
          return;
        }

        // Fetch inviter profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, company_name")
          .eq("user_id", inviteData.inviter_id)
          .maybeSingle();

        setInvitation({
          ...inviteData,
          inviter_profile: profileData || undefined,
        });

        // Pre-fill email if specified
        if (inviteData.invitee_email) {
          setEmail(inviteData.invitee_email);
        }
        if (inviteData.invitee_name) {
          setFullName(inviteData.invitee_name);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load invitation");
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [code]);

  // Handle if user is already logged in
  useEffect(() => {
    if (user && invitation) {
      handleAcceptInvitation();
    }
  }, [user, invitation]);

  const handleAcceptInvitation = async () => {
    if (!user || !invitation) return;

    setIsSubmitting(true);
    try {
      // Check if email matches (if restricted)
      if (invitation.invitee_email && user.email !== invitation.invitee_email) {
        toast({
          title: "Email Mismatch",
          description: `This invitation is for ${invitation.invitee_email}. Please sign in with that email.`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Create team member record
      const { error: memberError } = await supabase.from("team_members").insert({
        user_id: user.id,
        employer_id: invitation.inviter_id,
        invitation_id: invitation.id,
        name: invitation.invitee_name || user.user_metadata?.full_name || "",
        email: user.email || "",
        department: invitation.department,
        permission_level: invitation.permission_level,
        can_create_jobs: invitation.can_create_jobs,
        can_delete_jobs: invitation.can_delete_jobs,
        can_message_candidates: invitation.can_message_candidates,
        can_manage_pipeline: invitation.can_manage_pipeline,
        can_schedule_interviews: invitation.can_schedule_interviews,
        can_send_documents: invitation.can_send_documents,
        assigned_job_ids: invitation.assigned_job_ids,
        onboarding_completed: false,
      });

      if (memberError) {
        if (memberError.code === "23505") {
          toast({
            title: "Already a Team Member",
            description: "You're already a member of this team.",
            variant: "destructive",
          });
        } else {
          throw memberError;
        }
        setIsSubmitting(false);
        return;
      }

      // Update invitation status
      const { error: updateError } = await supabase
        .from("team_invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      if (updateError) {
        console.error("Failed to update invitation status:", updateError);
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
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to accept invitation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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

  if (loading) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[hsl(220,18%,10%)] text-white">
        <div className="flex flex-col items-center gap-4">
          <StaggeredBarsLoader size="lg" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
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
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")} variant="outline">
              Go to Homepage
            </Button>
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
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : invitation.permission_level === "limited"
                      ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                      : "bg-blue-500/10 text-blue-500 border-blue-500/20"
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
                    <Check className="h-4 w-4 text-green-500" />
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

            {user && (
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
