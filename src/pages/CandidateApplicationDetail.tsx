import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  FileCheck, 
  ClipboardList, 
  Keyboard, 
  Video, 
  MessageSquare, 
  Eye, 
  Users, 
  CheckCircle, 
  Sparkles,
  Clock,
  Play,
  Loader2,
  FileText,
  MapPin,
  Briefcase,
  Calendar,
  AlertCircle,
  Hand,
  Mic
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, any>;
}

interface ApplicationDetails extends Tables<"applications"> {
  jobs: (Tables<"jobs"> & { workflow_steps?: WorkflowStep[] }) | null;
}

// Map workflow step types to icons
const stepTypeIcons: Record<string, any> = {
  application: FileCheck,
  quiz: ClipboardList,
  video_intro: Video,
  video_message: Video,
  typing_test: Keyboard,
  chat_simulation: MessageSquare,
  chat_interview: Users,
  sales_simulation: Briefcase,
  portfolio_upload: FileCheck,
  voice_interview: Mic,
  review: Eye,
  interview: Users,
  hired: CheckCircle,
};

const phaseStatusLabels: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending Review", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/20 text-blue-500 border-blue-500/30", icon: Play },
  completed: { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
  awaiting_action: { label: "Ready for You", color: "bg-primary/20 text-primary border-primary/30", icon: Play },
  under_review: { label: "Under Review", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30", icon: Clock },
};

// Friendly action messages for each phase type
const phaseActionMessages: Record<string, { buttonText: string; description: string }> = {
  quiz: { buttonText: "Take Assessment", description: "Complete your skills assessment to continue" },
  typing_test: { buttonText: "Start Typing Test", description: "Ready to test your typing speed and accuracy" },
  video_intro: { buttonText: "Record Video", description: "Record a short video introducing yourself" },
  video_message: { buttonText: "Record Video", description: "Record a 60-second video about yourself" },
  chat_simulation: { buttonText: "Start Chat Simulation", description: "Demonstrate your customer support skills" },
  chat_interview: { buttonText: "Begin Interview", description: "Start your interview with Ava" },
  sales_simulation: { buttonText: "Start Sales Pitch", description: "Show off your sales skills" },
  portfolio_upload: { buttonText: "Upload Portfolio", description: "Share samples of your work" },
  voice_interview: { buttonText: "Start Ava Interview", description: "Have a voice conversation with Ava" },
};

export default function CandidateApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [activePhaseAction, setActivePhaseAction] = useState<string | null>(null);

  // Fetch application with job details
  const { data: application, isLoading, refetch } = useQuery({
    queryKey: ["candidate-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(*)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Subscribe to real-time updates for this application
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`application-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("Application updated:", payload);
          refetch();
          
          // Show toast notification for phase changes
          const newPhase = payload.new.phase;
          const oldPhase = payload.old?.phase;
          
          if (newPhase !== oldPhase) {
            toast.success(`You've been advanced to the ${newPhase} phase!`, {
              description: "Check your next steps below.",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch]);

  // Build phases from workflow
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = application?.jobs?.quiz_questions as any[] | undefined;
    
    const allPhases: { id: string; title: string; icon: any; type: string }[] = [
      { id: "application", title: "Application", icon: FileCheck, type: "application" },
    ];

    // Add Quiz phase if quiz_questions exist
    if (quizQuestions && quizQuestions.length > 0) {
      allPhases.push({
        id: "quiz",
        title: "Timed Quiz",
        icon: ClipboardList,
        type: "quiz",
      });
    }

    // Extract voice_interview step (goes after Review)
    const voiceInterviewStep = workflowSteps?.find(s => s.type === 'voice_interview');
    
    if (workflowSteps && workflowSteps.length > 0) {
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter(s => s.type !== 'voice_interview').forEach((step) => {
        allPhases.push({
          id: step.id,
          title: step.title,
          icon: stepTypeIcons[step.type] || ClipboardList,
          type: step.type,
        });
      });
    }

    // Add Review phase - only in Autopilot mode
    const isAutoPilotMode = application?.jobs?.processing_mode === "auto";
    if (isAutoPilotMode) {
      allPhases.push(
        { id: "review", title: "Final Review", icon: Eye, type: "review" }
      );
    }
    
    // Add Ava Interview AFTER review if it exists in workflow
    if (voiceInterviewStep) {
      allPhases.push({
        id: voiceInterviewStep.id,
        title: "Ava Interview",
        icon: Mic,
        type: "voice_interview",
      });
    }
    
    allPhases.push(
      { id: "interview", title: "Interview", icon: Users, type: "interview" },
      { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" }
    );

    return allPhases;
  })();

  // Find current phase index
  const currentPhaseIndex = phases.findIndex(
    (p) => p.id === application?.phase || p.type === application?.phase
  );
  const effectivePhaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : 0;

  // Parse notes to check for phase data and employer-skipped phases
  const notes = (() => {
    try {
      return application?.notes ? JSON.parse(application.notes) : {};
    } catch {
      return {};
    }
  })();
  
  // Check if a phase was employer-skipped (candidate shouldn't be penalized)
  const isEmployerSkipped = (phaseId: string) => {
    return notes.employerSkippedPhases?.includes(phaseId) || false;
  };
  
  // Determine phase status for each step
  const getPhaseStatus = (phaseIndex: number) => {
    const phase = phases[phaseIndex];
    
    // If this phase was skipped by employer, mark as completed
    if (isEmployerSkipped(phase.id) && phaseIndex < effectivePhaseIndex) {
      return "completed";
    }
    
    if (phaseIndex < effectivePhaseIndex) return "completed";
    if (phaseIndex === effectivePhaseIndex) {
      // Special handling for "review" phase - employer is reviewing, not candidate action
      if (phase.type === "review" || phase.id === "review") {
        return "under_review";
      }
      
      // For manual mode, show pending review if phase is current but employer hasn't advanced yet
      const isManualMode = application?.jobs?.processing_mode === "manual";
      
      if (phase.type === "application") {
        // Application is always completed if we're past it
        return phaseIndex === effectivePhaseIndex ? "awaiting_action" : "completed";
      }
      
      // Check if phase data exists (use type-specific keys)
      let hasPhaseData = false;
      if (phase.type === "typing_test") {
        hasPhaseData = !!notes.typingTestResult;
      } else if (phase.type === "chat_simulation") {
        hasPhaseData = !!notes.chatSimulationResult;
      } else if (phase.type === "chat_interview") {
        hasPhaseData = !!notes.chatInterviewResult;
      } else if (phase.type === "sales_simulation") {
        hasPhaseData = !!notes.salesSimulationResult;
      } else if (phase.type === "quiz") {
        hasPhaseData = !!(notes.quizAnswers?.[phase.id] || notes.quizAnswers);
      } else if (phase.type === "video_intro" || phase.type === "video_message") {
        // Check both legacy videoIntroUrl and stepId-based storage
        const stepData = notes[phase.id];
        hasPhaseData = !!notes.videoIntroUrl || !!(stepData?.videoUrl || stepData?.completed);
      } else if (phase.type === "portfolio_upload") {
        hasPhaseData = !!notes.portfolioResult;
      } else {
        hasPhaseData = !!notes[phase.id];
      }
      
      if (hasPhaseData && isManualMode) {
        return "pending"; // Submitted, waiting for employer review
      }
      
      return "awaiting_action"; // Needs to complete this phase
    }
    return "upcoming";
  };

  // Calculate progress percentage
  const progressPercentage = ((effectivePhaseIndex + 1) / phases.length) * 100;

  const job = application?.jobs;
  const isManualMode = job?.processing_mode === "manual";
  const passingScore = job?.passing_score || 60;

  // Handle starting a phase action (quiz, typing test, etc.)
  const handleStartPhase = (phaseId: string, phaseType: string) => {
    setActivePhaseAction(phaseId);
    
    // Navigate to the appropriate phase completion page
    switch (phaseType) {
      case "quiz":
        navigate(`/applications/${id}/quiz/${phaseId}`);
        break;
      case "typing_test":
        navigate(`/applications/${id}/typing-test/${phaseId}`);
        break;
      case "video_intro":
      case "video_message":
        navigate(`/applications/${id}/video-intro/${phaseId}`);
        break;
      case "chat_simulation":
        navigate(`/applications/${id}/chat-simulation/${phaseId}`);
        break;
      case "chat_interview":
        navigate(`/applications/${id}/chat-interview/${phaseId}`);
        break;
      case "sales_simulation":
        navigate(`/applications/${id}/sales-simulation/${phaseId}`);
        break;
      case "portfolio_upload":
        navigate(`/applications/${id}/portfolio/${phaseId}`);
        break;
      case "voice_interview":
        navigate(`/applications/${id}/voice-interview/${phaseId}`);
        break;
      default:
        toast.info("This phase type is not yet implemented");
        setActivePhaseAction(null);
    }
  };

  if (role === "employer") {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate View Only</h2>
            <p className="text-muted-foreground">
              This page is for candidates. Use the Applicants section to manage applications.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Application Not Found</h2>
            <p className="text-muted-foreground">The application you're looking for doesn't exist.</p>
            <Button onClick={() => navigate("/applications")} className="mt-4">
              Back to Applications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPhase = phases[effectivePhaseIndex];
  const applicationStatus = application.status;
  const isRejected = applicationStatus === "rejected";
  const isHired = applicationStatus === "hired";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate("/applications")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Applications
        </Button>
      </div>

      {/* Job Info Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{job?.title}</h1>
              <p className="text-muted-foreground mt-1">{job?.department || "Company"}</p>
              
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Status */}
      {isRejected && (
        <Card className="bg-destructive/10 border-destructive/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <h3 className="font-semibold text-destructive">Application Rejected</h3>
              <p className="text-sm text-muted-foreground">
                Based on your latest assessment results, this application has been closed. You can still
                review your previous phases, but no further steps are required.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isHired && (
        <Card className="bg-success/10 border-success/40">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-success mt-0.5" />
            <div>
              <h3 className="font-semibold text-success">You&apos;re Hired!</h3>
              <p className="text-sm text-muted-foreground">
                Congratulations! This application has been marked as hired. The employer will contact you
                with next steps.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Overview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Your Application Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-foreground">
                {effectivePhaseIndex + 1} of {phases.length} phases
              </span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
          </div>

          {/* Phase Timeline */}
          <div className="space-y-3">
            {phases.map((phase, index) => {
              const status = getPhaseStatus(index);
              const Icon = phase.icon;
              const statusInfo = phaseStatusLabels[status] || phaseStatusLabels.pending;
              const StatusIcon = statusInfo.icon;
              const isCurrent = index === effectivePhaseIndex;
              const isCompleted = index < effectivePhaseIndex;

              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                    isCurrent
                      ? "bg-primary/10 border-2 border-primary"
                      : isCompleted
                      ? "bg-success/5 border border-success/20"
                      : "bg-muted/30 border border-border"
                  }`}
                >
                  {/* Phase Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isCompleted
                        ? "bg-success/20"
                        : isCurrent
                        ? "bg-primary/20"
                        : "bg-muted"
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${
                        isCompleted
                          ? "text-success"
                          : isCurrent
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>

                  {/* Phase Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`font-semibold ${
                          isCurrent ? "text-primary" : isCompleted ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {phase.title}
                      </h3>
                      {isCurrent && (
                        <Badge className={statusInfo.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      )}
                      {isCompleted && (
                        <Badge className="bg-success/20 text-success border-success/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                    </div>
                    
                    {isCurrent && status === "awaiting_action" && phase.type !== "application" && phase.type !== "review" && phase.type !== "interview" && phase.type !== "hired" && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {phaseActionMessages[phase.type]?.description || "Complete this phase to continue your application journey."}
                      </p>
                    )}
                    
                    {isCurrent && status === "pending" && isManualMode && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Your submission is being reviewed by the employer.
                      </p>
                    )}
                  </div>

                  {/* Action Button */}
                  {isCurrent &&
                    status === "awaiting_action" &&
                    application.status !== "rejected" &&
                    phase.type !== "application" &&
                    phase.type !== "review" &&
                    phase.type !== "interview" &&
                    phase.type !== "hired" && (
                      <Button
                        onClick={() => handleStartPhase(phase.id, phase.type)}
                        disabled={activePhaseAction === phase.id}
                        className="gap-2 animate-pulse"
                        size="lg"
                      >
                        {activePhaseAction === phase.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {phaseActionMessages[phase.type]?.buttonText || "Start"}
                      </Button>
                    )}

                  {isCurrent && status === "pending" && (
                    <div className="flex items-center gap-2 text-yellow-500">
                      <Clock className="h-5 w-5" />
                      <span className="text-sm font-medium">Awaiting Review</span>
                    </div>
                  )}

                  {isCompleted && (
                    <CheckCircle className="h-6 w-6 text-success flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>


      {/* AI Score Display */}
      {application.ai_score && (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Your Application Score</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-32 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      application.ai_score >= passingScore ? "bg-success" : "bg-yellow-500"
                    }`}
                    style={{ width: `${application.ai_score}%` }}
                  />
                </div>
                <span className={`text-2xl font-bold ${
                  application.ai_score >= passingScore ? "text-success" : "text-yellow-500"
                }`}>
                  {application.ai_score}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
