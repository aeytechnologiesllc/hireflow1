import { useAuth } from "@/hooks/useAuth";
import { useCandidateApplications } from "@/hooks/useApplications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, Filter, FileText, MapPin, Briefcase, Calendar, ChevronRight, 
  Play, Clock, Sparkles, Hand, Keyboard, Video, MessageSquare, ClipboardList,
  Users, Mic
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationWithJob } from "@/hooks/useApplications";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  reviewing: "bg-blue-500/20 text-blue-500",
  interview: "bg-purple-500/20 text-purple-500",
  offered: "bg-primary/20 text-primary",
  hired: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pending Review",
  reviewing: "Under Review",
  interview: "Interview Scheduled",
  offered: "Offer Extended",
  hired: "Hired",
  rejected: "Not Selected",
};

// Map phase types to icons and action labels
const phaseActionConfig: Record<string, { icon: React.ElementType; label: string; description: string }> = {
  quiz: { icon: ClipboardList, label: "Take Assessment", description: "Complete your skills assessment" },
  typing_test: { icon: Keyboard, label: "Start Typing Test", description: "Ready for your typing test" },
  video_intro: { icon: Video, label: "Record Video Intro", description: "Record your video introduction" },
  chat_simulation: { icon: MessageSquare, label: "Start Chat Simulation", description: "Begin customer support simulation" },
  chat_interview: { icon: Users, label: "Start AI Interview", description: "Ready for your AI interview" },
  sales_simulation: { icon: Mic, label: "Start Sales Pitch", description: "Begin your sales simulation" },
};

interface ApplicationCardProps {
  application: ApplicationWithJob;
}

function getPhaseType(phase: string): string {
  // Normalize phase names to types
  if (phase.includes("quiz") || phase.startsWith("step")) return "quiz";
  if (phase === "typing_test") return "typing_test";
  if (phase === "video_intro") return "video_intro";
  if (phase === "chat_simulation") return "chat_simulation";
  if (phase === "chat_interview") return "chat_interview";
  if (phase === "sales_simulation") return "sales_simulation";
  return phase;
}

function ApplicationCard({ application }: ApplicationCardProps) {
  const navigate = useNavigate();
  const job = application.jobs;
  const isManualMode = job?.processing_mode === "manual";
  const phase = application.phase || "application";
  const phaseType = getPhaseType(phase);
  
  // Determine if action is required (not in waiting phases)
  const isWaitingPhase = ["application", "review", "interview", "hired"].includes(phase);
  const actionConfig = phaseActionConfig[phaseType];
  const hasActionRequired = !isWaitingPhase && actionConfig;

  return (
    <Card 
      className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group"
      onClick={() => navigate(`/applications/${application.id}`)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  {job?.title || "Unknown Position"}
                </h3>
                <p className="text-sm text-muted-foreground">{job?.department || "Company"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={statusColors[application.status]}>
                  {statusLabels[application.status] || application.status}
                </Badge>
                {isManualMode ? (
                  <Badge variant="outline" className="gap-1">
                    <Hand className="h-3 w-3" />
                    Manual
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Auto
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {job?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{job.location}</span>
                </div>
              )}
              {job?.job_type && (
                <div className="flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  <span>{job.job_type}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Applied {format(new Date(application.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {application.phase && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Current Phase: </span>
                    <span className="text-foreground font-medium capitalize">{application.phase}</span>
                  </div>
                )}

                {application.ai_score && (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-muted-foreground">Score:</div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-16 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${application.ai_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-primary">{application.ai_score}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Indicator */}
              <div className="flex items-center gap-2">
                {hasActionRequired && actionConfig && (
                  <Badge className="bg-primary text-primary-foreground gap-1.5 px-3 py-1 animate-pulse">
                    <actionConfig.icon className="h-3.5 w-3.5" />
                    {actionConfig.label}
                  </Badge>
                )}
                {!hasActionRequired && application.status === "pending" && (
                  <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1">
                    <Clock className="h-3 w-3" />
                    Awaiting Review
                  </Badge>
                )}
                {application.status === "reviewing" && (
                  <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 gap-1">
                    <Clock className="h-3 w-3" />
                    Under Review
                  </Badge>
                )}
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Applications() {
  const { role, user } = useAuth();
  const isEmployer = role === "employer";
  const { data: applications, isLoading, refetch } = useCandidateApplications();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Subscribe to real-time updates for all candidate applications
  useEffect(() => {
    if (!user || isEmployer) return;

    const channel = supabase
      .channel("candidate-applications")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("Application updated:", payload);
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isEmployer, refetch]);

  const filteredApplications = applications?.filter((app) => {
    const matchesSearch = app.jobs?.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || app.status === statusFilter;
    return matchesSearch !== false && matchesStatus;
  });

  const stats = applications?.reduce(
    (acc, app) => {
      acc.total++;
      if (app.status === "pending") acc.pending++;
      if (app.status === "reviewing" || app.status === "interview") acc.active++;
      if (app.status === "hired" || app.status === "offered") acc.success++;
      return acc;
    },
    { total: 0, pending: 0, active: 0, success: 0 }
  ) || { total: 0, pending: 0, active: 0, success: 0 };

  if (isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate Access Only</h2>
            <p className="text-muted-foreground">
              This page is for job seekers. Use the Applicants section to view applications to your jobs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">My Applications</h2>
        <p className="text-muted-foreground mt-1">Track the status of your job applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Applied</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold text-blue-500">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Offers/Hired</p>
            <p className="text-2xl font-bold text-primary">{stats.success}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search applications..." 
            className="pl-10 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filter by Status
        </Button>
      </div>

      {/* Application List */}
      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : filteredApplications && filteredApplications.length > 0 ? (
          filteredApplications.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No applications yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Start applying to jobs to track your applications here.
              </p>
              <Button asChild>
                <Link to="/find-jobs">Browse Jobs</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
