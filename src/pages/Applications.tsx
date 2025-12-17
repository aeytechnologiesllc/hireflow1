import { useAuth } from "@/hooks/useAuth";
import { useCandidateApplications } from "@/hooks/useApplications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, Filter, FileText, MapPin, Briefcase, Calendar, ChevronRight, 
  Play, Clock, Keyboard, Video, MessageSquare, ClipboardList,
  Users, Mic, Trash2, Download, Sparkles, PartyPopper
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationWithJob } from "@/hooks/useApplications";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
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
const phaseActionConfig: Record<string, { icon: React.ElementType; label: string; description: string; route: string }> = {
  quiz: { icon: ClipboardList, label: "Take Assessment", description: "Complete your skills assessment", route: "quiz" },
  typing_test: { icon: Keyboard, label: "Start Typing Test", description: "Ready for your typing test", route: "typing-test" },
  video_intro: { icon: Video, label: "Record Video", description: "Record your video introduction", route: "video-intro" },
  video_message: { icon: Video, label: "Record Video", description: "Record your video message", route: "video-intro" },
  chat_simulation: { icon: MessageSquare, label: "Start Chat Sim", description: "Begin customer support simulation", route: "chat-simulation" },
  chat_interview: { icon: Users, label: "Start Interview", description: "Ready for your interview", route: "chat-interview" },
  sales_simulation: { icon: Mic, label: "Start Sales Pitch", description: "Begin your sales simulation", route: "sales-simulation" },
  voice_interview: { icon: Mic, label: "Start Voice Interview", description: "Begin your voice interview", route: "voice-interview" },
  portfolio_upload: { icon: FileText, label: "Upload Portfolio", description: "Submit your portfolio", route: "portfolio-upload" },
};

interface ApplicationCardProps {
  application: ApplicationWithJob;
}

function getPhaseType(phase: string, workflowSteps?: any[]): string {
  // Prefer explicit type from job workflow configuration when available
  if (workflowSteps && Array.isArray(workflowSteps)) {
    const step = workflowSteps.find((s: any) => s?.id === phase || s?.key === phase || s?.slug === phase);
    if (step && typeof step.type === "string") {
      return step.type;
    }
  }

  // Fallback normalization for legacy/non-configured phases
  if (phase === "typing_test") return "typing_test";
  if (phase === "video_intro") return "video_intro";
  if (phase === "chat_simulation") return "chat_simulation";
  if (phase === "chat_interview") return "chat_interview";
  if (phase === "sales_simulation") return "sales_simulation";
  if (phase === "voice_interview") return "voice_interview";
  if (phase === "portfolio_upload") return "portfolio_upload";
  // Only treat as quiz if phase explicitly contains "quiz" - removed startsWith("step") which incorrectly caught voice_interview
  if (phase.includes("quiz")) return "quiz";
  return phase;
}
 
function ApplicationCard({ application, onDelete }: ApplicationCardProps & { onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const job = application.jobs;
  const phase = application.phase || "application";
  const phaseType = getPhaseType(phase, (job as any)?.workflow_steps as any[]);
  
  // Parse notes to check if phase has been submitted
  let notes: Record<string, any> = {};
  try {
    notes = application.notes ? JSON.parse(application.notes as string) : {};
  } catch {
    // ignore
  }
  
  // Check if the current phase has been completed/submitted
  const hasPhaseData = (() => {
    if (phaseType === "quiz") return !!notes.quizAnswers?.[phase] || !!notes.quizAnswers;
    if (phaseType === "typing_test") return !!notes.typingTestResult;
    if (phaseType === "video_intro") return !!notes.videoIntroUrl;
    if (phaseType === "chat_simulation") return !!notes.chatSimulationResult;
    if (phaseType === "chat_interview") return !!notes.chatInterviewResult;
    if (phaseType === "sales_simulation") return !!notes.salesSimulationResult;
    // Voice interview result is stored in a dedicated column, not notes JSON
    if (phaseType === "voice_interview") return !!application.voice_interview_result;
    return false;
  })();
  
  // Determine states
  const isWaitingPhase = ["application", "review", "interview", "hired"].includes(phase);
  const actionConfig = phaseActionConfig[phaseType];
  const hasActionRequired = !isWaitingPhase && actionConfig && !hasPhaseData;
  const isPendingReview = !isWaitingPhase && hasPhaseData && application.status !== "rejected" && application.status !== "hired";

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", application.id);
      
      if (error) throw error;
      toast.success("Application withdrawn successfully");
      onDelete(application.id);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to withdraw application");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card 
      className={`bg-card border-border transition-all cursor-pointer group ${
        hasActionRequired 
          ? "border-primary/50 hover:border-primary shadow-lg shadow-primary/5" 
          : "hover:border-primary/50"
      }`}
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
              {/* Status badges with special styling */}
              {application.status === "hired" && (
                <Badge className="bg-success/20 text-success border-success/30 gap-1.5 animate-pulse">
                  <PartyPopper className="h-3.5 w-3.5" />
                  {statusLabels[application.status]}
                </Badge>
              )}
              {application.status === "rejected" && (
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Get Feedback Report
                </Badge>
              )}
              {application.status === "offered" && (
                <Badge className={statusColors[application.status]}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {statusLabels[application.status]}
                </Badge>
              )}
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

              {/* Action Indicator - Clickable button to jump to phase */}
              <div className="flex items-center gap-3">
                {hasActionRequired && actionConfig && (
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground gap-2 px-4 py-1.5 text-sm font-medium animate-pulse hover:bg-primary/90 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Build the route based on phase type
                      const stepId = phase; // Use the actual phase ID for step-based routes
                      const route = actionConfig.route;
                      if (["quiz", "video-intro", "chat-simulation", "chat-interview", "sales-simulation", "voice-interview", "portfolio-upload"].includes(route)) {
                        navigate(`/applications/${application.id}/${route}/${stepId}`);
                      } else {
                        navigate(`/applications/${application.id}/${route}`);
                      }
                    }}
                  >
                    <actionConfig.icon className="h-4 w-4" />
                    {actionConfig.label}
                  </Button>
                )}
                {isPendingReview && phaseType === "voice_interview" && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 px-3 py-1">
                    <Mic className="h-3.5 w-3.5" />
                    Interview Complete - Under Review
                  </Badge>
                )}
                {isPendingReview && phaseType !== "voice_interview" && (
                  <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1.5 px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Awaiting Review
                  </Badge>
                )}
                {phase === "review" && (
                  <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 gap-1.5 px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Under Review
                  </Badge>
                )}
                {phase === "interview" && (
                  <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30 gap-1.5 px-3 py-1">
                    <Users className="h-3.5 w-3.5" />
                    Interview Stage
                  </Badge>
                )}
                
                {/* Delete button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Withdraw Application?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your application for "{job?.title}". 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Withdrawing..." : "Withdraw Application"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
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
  const queryClient = useQueryClient();
  const { data: applications, isLoading, refetch } = useCandidateApplications();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const handleDeleteApplication = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
  };

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
            <ApplicationCard key={application.id} application={application} onDelete={handleDeleteApplication} />
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
