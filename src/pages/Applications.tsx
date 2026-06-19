import { useAuth } from "@/hooks/useAuth";
import { useCandidateApplications } from "@/hooks/useApplications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, Filter, FileText, MapPin, Briefcase, Calendar, ChevronRight, 
  Play, Clock, Keyboard, Video, MessageSquare, ClipboardList,
  Users, Mic, Trash2, Download, PartyPopper, Eye, AlertCircle, Check, Lock
} from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyStateCard } from "@/components/EmptyStateCard";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ImprovementBlueprintCard } from "@/components/ImprovementBlueprintCard";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { 
  getApplicationDisplayState, 
  statusColors, 
  statusLabels, 
  phaseActionConfig 
} from "@/utils/getApplicationDisplayState";

interface ApplicationCardProps {
  application: ApplicationWithJob;
  onOpenBlueprint?: (applicationId: string) => void;
}
 
function ApplicationCard({ application, onDelete, onOpenBlueprint }: ApplicationCardProps & { onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const job = application.jobs;
  const phase = application.phase || "application";
  
  // Use shared display state utility - SINGLE SOURCE OF TRUTH
  const displayState = getApplicationDisplayState(application);
  const actionConfig = phaseActionConfig[displayState.phaseType];

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

  // Determine if tile should be locked (no navigation)
  const isLocked = displayState.isPendingReview || displayState.isWaitingPhase;

  return (
    <Card 
      className={`bg-card border-border transition-all group relative overflow-hidden ${
        displayState.isRejected
          ? "border-border/60 cursor-pointer hover:border-destructive/40"
          : isLocked
          ? "border-border/50 opacity-80 cursor-default"
          : displayState.showActionButton 
            ? "border-primary/50 hover:border-primary shadow-lg shadow-primary/5 cursor-pointer" 
            : "hover:border-primary/50 cursor-pointer"
      }`}
      onClick={() => {
        if (!isLocked) {
          navigate(`/applications/${application.id}`);
        }
      }}
    >
      {/* Rejected stamp overlay */}
      {displayState.isRejected && (
        <div className="absolute top-4 right-4 z-10 rotate-12 pointer-events-none">
          <div className="px-3 py-1.5 rounded border-2 border-destructive/60 bg-destructive/10 backdrop-blur-sm">
            <span className="text-destructive font-bold text-sm tracking-wider uppercase">
              Rejected
            </span>
          </div>
        </div>
      )}
      
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className={`text-lg font-semibold transition-colors ${displayState.isRejected ? "text-muted-foreground" : "text-foreground group-hover:text-primary"}`}>
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
              {application.status === "offered" && (
                <Badge className={statusColors[application.status]}>
                  <AvaGlyph className="h-3.5 w-3.5 mr-1" />
                  {statusLabels[application.status]}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {job?.location && (
                <div className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="break-words [overflow-wrap:anywhere]">{job.location}</span>
                </div>
              )}
              {job?.job_type && (
                <div className="flex min-w-0 items-center gap-1">
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span className="break-words [overflow-wrap:anywhere]">{job.job_type}</span>
                </div>
              )}
              <div className="flex min-w-0 items-center gap-1">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="break-words [overflow-wrap:anywhere]">Applied {format(new Date(application.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
              </div>

              {/* Action Indicator - Clickable button to jump to phase */}
              <div className="flex flex-wrap items-center justify-end gap-3">
                {displayState.showActionButton && actionConfig && (
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground gap-2 px-4 py-1.5 text-sm font-medium animate-pulse hover:bg-primary/90 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Build the route based on phase type
                      const stepId = phase; // Use the actual phase ID for step-based routes
                      const route = actionConfig.route;
                      // All phase routes use the stepId pattern
                      if (["application", "quiz", "video-intro", "chat-simulation", "chat-interview", "sales-simulation", "voice-interview", "portfolio"].includes(route)) {
                        navigate(`/applications/${application.id}/${route}/${stepId}`);
                      } else {
                        navigate(`/applications/${application.id}/${route}`);
                      }
                    }}
                  >
                    {displayState.phaseType === "voice_interview" ? (
                      displayState.voiceInterviewVideoEnabled ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <actionConfig.icon className="h-4 w-4" />
                      )
                    ) : (
                      <actionConfig.icon className="h-4 w-4" />
                    )}
                    {displayState.actionLabel}
                  </Button>
                )}
                {displayState.isVoiceInterviewComplete && (
                  <Badge className="bg-success/20 text-success border-success/30 gap-1.5 px-3 py-1">
                    <Mic className="h-3.5 w-3.5" />
                    Interview Complete - Under Review
                  </Badge>
                )}
                {displayState.isPendingReview && !displayState.isVoiceInterviewComplete && (
                  <Badge className="bg-warning/20 text-warning border-warning/30 gap-1.5 px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Awaiting Review
                  </Badge>
                )}
                
                {/* Interview status badges - show when in interview phase */}
                {displayState.isWaitingPhase && application.status === "interview" && displayState.interviewNeedsConfirmation && (
                  <Badge className="bg-warning/20 text-warning border-warning/30 gap-1.5 px-3 py-1 animate-pulse">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Interview Action Required
                  </Badge>
                )}
                {displayState.isWaitingPhase && application.status === "interview" && displayState.interviewRescheduleRequested && (
                  <Badge className="bg-warning/20 text-warning border-warning/30 gap-1.5 px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Reschedule Pending
                  </Badge>
                )}
                {displayState.isWaitingPhase && application.status === "interview" && displayState.interviewConfirmed && (
                  <Badge className="bg-success/20 text-success border-success/30 gap-1.5 px-3 py-1">
                    <Check className="h-3.5 w-3.5" />
                    Interview Confirmed
                  </Badge>
                )}
                
                {/* Employer reviewing - only show when not in interview status or no interview scheduled */}
                {displayState.isWaitingPhase && application.status !== "rejected" && application.status !== "hired" && application.status !== "offered" && application.status !== "interview" && (
                  <Badge className="bg-warning/20 text-warning border-warning/30 gap-1.5 px-3 py-1">
                    <Eye className="h-3.5 w-3.5" />
                    Employer Reviewing
                  </Badge>
                )}
                
                {/* Rejected - show unlock blueprint button */}
                {displayState.isRejected && onOpenBlueprint && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs border-warning/50 text-warning hover:bg-warning/10 hover:text-warning"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBlueprint(application.id);
                    }}
                  >
                    <Download className="h-3 w-3" />
                    Get Feedback Report
                  </Button>
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
                
                {displayState.isRejected ? (
                  <Eye className="h-5 w-5 text-muted-foreground group-hover:text-destructive transition-colors" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
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
  const navigate = useNavigate();
  const { data: applications, isLoading, refetch } = useCandidateApplications();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showBlueprintDialog, setShowBlueprintDialog] = useState(false);
  const [blueprintApplicationId, setBlueprintApplicationId] = useState<string | null>(null);
  const [rejectedAnnouncement, setRejectedAnnouncement] = useState<{
    applicationId: string;
    jobTitle?: string | null;
    companyName?: string | null;
  } | null>(null);

  const handleDeleteApplication = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
  };
  
  const handleOpenBlueprintDialog = (applicationId: string) => {
    setBlueprintApplicationId(applicationId);
    setShowBlueprintDialog(true);
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
          const newStatus = payload.new.status as string | undefined;
          const oldStatus = payload.old?.status as string | undefined;

          if (newStatus === "rejected" && oldStatus !== "rejected") {
            const updatedApplicationId = payload.new.id as string;
            const existingApplication = applications?.find((application) => application.id === updatedApplicationId);

            setRejectedAnnouncement({
              applicationId: updatedApplicationId,
              jobTitle: existingApplication?.jobs?.title,
              companyName: existingApplication?.jobs?.department,
            });
          }

          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isEmployer, refetch, applications]);

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
      <CandidateStatusScreen
        state={rejectedAnnouncement ? "rejected" : null}
        jobTitle={rejectedAnnouncement?.jobTitle ?? undefined}
        companyName={rejectedAnnouncement?.companyName ?? undefined}
        applicationId={rejectedAnnouncement?.applicationId}
        onClose={() => setRejectedAnnouncement(null)}
      />

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">My Applications</h2>
        <p className="text-muted-foreground mt-1">Track the status of your job applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Applied</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-warning">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold text-primary">{stats.active}</p>
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
            <ApplicationCard 
              key={application.id} 
              application={application} 
              onDelete={handleDeleteApplication}
              onOpenBlueprint={handleOpenBlueprintDialog}
            />
          ))
        ) : (
          <EmptyStateCard
            icon={AvaGlyph}
            title="Ready to Start Your Job Search?"
            description="To apply for a position on HireFlow, you'll need a job application code from an employer. Once you have one, click below to get started."
            action={{
              label: "Enter Job Code",
              onClick: () => navigate("/apply"),
              icon: Briefcase,
            }}
            tip="Job codes are typically shared by employers via email, job postings, or during initial contact. Ask the employer if you haven't received one yet."
          />
        )}
      </div>
      
      {/* Blueprint Dialog */}
      <Dialog open={showBlueprintDialog} onOpenChange={setShowBlueprintDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your Improvement Blueprint</DialogTitle>
          </DialogHeader>
          {blueprintApplicationId && (
            <ImprovementBlueprintCard applicationId={blueprintApplicationId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
