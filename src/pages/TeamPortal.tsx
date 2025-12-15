import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Briefcase, 
  Users, 
  MessageSquare, 
  Calendar, 
  FileText, 
  Eye,
  Shield,
  Building
} from "lucide-react";
import { motion } from "framer-motion";

interface TeamMembership {
  id: string;
  employer_id: string;
  name: string;
  email: string;
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
  joined_at: string;
  employer_profile?: {
    full_name: string;
    company_name: string;
    company_logo: string;
  };
}

interface Stats {
  totalJobs: number;
  totalApplicants: number;
  pendingInterviews: number;
  pendingDocuments: number;
}

export default function TeamPortal() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [membership, setMembership] = useState<TeamMembership | null>(null);
  const [stats, setStats] = useState<Stats>({ totalJobs: 0, totalApplicants: 0, pendingInterviews: 0, pendingDocuments: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    if (user) {
      fetchMembership();
    }
  }, [user, authLoading, navigate]);

  const fetchMembership = async () => {
    if (!user) return;

    try {
      // Fetch team membership
      const { data: memberData, error: memberError } = await supabase
        .from("team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (memberError) throw memberError;

      if (!memberData) {
        // Not a team member, redirect to dashboard
        navigate("/dashboard");
        return;
      }

      // Fetch employer profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, company_name, company_logo")
        .eq("user_id", memberData.employer_id)
        .maybeSingle();

      setMembership({
        ...memberData,
        employer_profile: profileData || undefined,
      });

      // Fetch stats based on assigned jobs
      await fetchStats(memberData);
    } catch (error) {
      console.error("Error fetching membership:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (member: TeamMembership) => {
    try {
      // Build job filter
      let jobQuery = supabase
        .from("jobs")
        .select("id", { count: "exact" })
        .eq("employer_id", member.employer_id);

      if (member.assigned_job_ids && member.assigned_job_ids.length > 0) {
        jobQuery = jobQuery.in("id", member.assigned_job_ids);
      }

      const { count: jobCount } = await jobQuery;

      // Get job IDs for filtering applications
      let applicationQuery = supabase
        .from("applications")
        .select("id, job_id", { count: "exact" });

      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id")
        .eq("employer_id", member.employer_id);

      const jobIds = member.assigned_job_ids?.length > 0 
        ? member.assigned_job_ids 
        : (jobsData?.map(j => j.id) || []);

      if (jobIds.length > 0) {
        const { count: appCount } = await supabase
          .from("applications")
          .select("id", { count: "exact" })
          .in("job_id", jobIds);

        // Count pending interviews
        const { count: interviewCount } = await supabase
          .from("interviews")
          .select("id, application_id", { count: "exact" })
          .eq("status", "scheduled");

        setStats({
          totalJobs: jobCount || 0,
          totalApplicants: appCount || 0,
          pendingInterviews: interviewCount || 0,
          pendingDocuments: 0,
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!membership) {
    return null;
  }

  const permissionLabel =
    membership.permission_level === "full_admin"
      ? "Full Admin"
      : membership.permission_level === "limited"
      ? "Team Member"
      : "View Only";

  const quickActions = [
    {
      icon: Briefcase,
      label: "View Jobs",
      description: `${stats.totalJobs} active job${stats.totalJobs !== 1 ? "s" : ""}`,
      onClick: () => navigate("/jobs"),
      enabled: true,
    },
    {
      icon: Users,
      label: "View Applicants",
      description: `${stats.totalApplicants} applicant${stats.totalApplicants !== 1 ? "s" : ""}`,
      onClick: () => navigate("/applicants"),
      enabled: true,
    },
    {
      icon: MessageSquare,
      label: "Messages",
      description: "Chat with candidates",
      onClick: () => navigate("/messages"),
      enabled: membership.can_message_candidates,
    },
    {
      icon: Calendar,
      label: "Interviews",
      description: `${stats.pendingInterviews} scheduled`,
      onClick: () => navigate("/interviews"),
      enabled: membership.can_schedule_interviews,
    },
    {
      icon: FileText,
      label: "Documents",
      description: "View documents",
      onClick: () => navigate("/documents"),
      enabled: membership.can_send_documents,
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold">Team Portal</h1>
            <p className="text-muted-foreground">
              Welcome back, {membership.name || user?.email}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`w-fit ${
              membership.permission_level === "full_admin"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : membership.permission_level === "limited"
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                : "bg-blue-500/10 text-blue-500 border-blue-500/20"
            }`}
          >
            <Shield className="h-3 w-3 mr-1" />
            {permissionLabel}
          </Badge>
        </motion.div>

        {/* Company Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-xl bg-background border">
                {membership.employer_profile?.company_logo ? (
                  <img
                    src={membership.employer_profile.company_logo}
                    alt="Company"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <Building className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {membership.employer_profile?.company_name || "Company"}
                </h2>
                <p className="text-muted-foreground">
                  {membership.department ? `${membership.department} • ` : ""}
                  Joined {new Date(membership.joined_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (index + 3) }}
              >
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    action.enabled
                      ? "hover:border-primary/50"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                  onClick={action.enabled ? action.onClick : undefined}
                >
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <action.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{action.label}</h4>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    {!action.enabled && (
                      <Badge variant="outline" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        View Only
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Permissions Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Your Permissions
              </CardTitle>
              <CardDescription>
                What you can do in this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "View Jobs & Applicants", allowed: true },
                  { label: "Message Candidates", allowed: membership.can_message_candidates },
                  { label: "Manage Pipeline", allowed: membership.can_manage_pipeline },
                  { label: "Schedule Interviews", allowed: membership.can_schedule_interviews },
                  { label: "Send Documents", allowed: membership.can_send_documents },
                  { label: "Create Jobs", allowed: membership.can_create_jobs },
                  { label: "Delete Jobs", allowed: membership.can_delete_jobs },
                ].map((perm) => (
                  <div
                    key={perm.label}
                    className={`flex items-center gap-2 p-3 rounded-lg ${
                      perm.allowed ? "bg-green-500/10" : "bg-muted"
                    }`}
                  >
                    {perm.allowed ? (
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                    )}
                    <span
                      className={`text-sm ${
                        perm.allowed ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {perm.label}
                    </span>
                  </div>
                ))}
              </div>

              {membership.assigned_job_ids && membership.assigned_job_ids.length > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-muted/50 border">
                  <p className="text-sm text-muted-foreground">
                    <strong>Note:</strong> Your access is limited to{" "}
                    {membership.assigned_job_ids.length} specific job
                    {membership.assigned_job_ids.length > 1 ? "s" : ""} assigned to you.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
}
