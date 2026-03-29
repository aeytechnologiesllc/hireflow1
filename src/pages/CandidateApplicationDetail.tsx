import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { parseApplicationNotes, isPhaseSkipped as checkPhaseSkipped } from "@/utils/applicationNotes";
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
  FastForward,
  Hand,
  Mic,
  FileUp
} from "lucide-react";
import { toast } from "sonner";
import type { Tables, Json } from "@/integrations/supabase/types";
import { ImprovementBlueprintCard } from "@/components/ImprovementBlueprintCard";
import { useProfile } from "@/hooks/useProfile";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";

import { CandidateInterviewConfirmationCard } from "@/components/CandidateInterviewConfirmationCard";
import { useDocumentRequests, DocumentRequestWithDetails } from "@/hooks/useDocumentRequests";
import { DocumentRequestCard } from "@/components/documents/DocumentRequestCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { CandidateJourneyProgress } from "@/components/CandidateJourneyProgress";

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
  chat_interview: MessageSquare,
  sales_simulation: Briefcase,
  portfolio_upload: FileCheck,
  voice_interview: Video,
  review: Eye,
  interview: Users,
  hired: CheckCircle,
};

import { 
  candidatePhaseStatusLabels, 
  phaseActionMessages as terminologyPhaseActionMessages 
} from "@/lib/terminology";

const phaseStatusLabels: Record<string, { label: string; color: string; icon: any }> = {
  pending: { ...candidatePhaseStatusLabels.pending, icon: Clock },
  in_progress: { ...candidatePhaseStatusLabels.in_progress, icon: Play },
  completed: { ...candidatePhaseStatusLabels.completed, icon: CheckCircle },
  awaiting_action: { ...candidatePhaseStatusLabels.awaiting_action, icon: Play },
  under_review: { ...candidatePhaseStatusLabels.under_review, icon: Clock },
  employer_reviewing: { ...candidatePhaseStatusLabels.employer_reviewing, icon: Eye },
  rejected: { ...candidatePhaseStatusLabels.rejected, icon: AlertCircle },
};

// Use centralized phase action messages
const phaseActionMessages = terminologyPhaseActionMessages;

export default function CandidateApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [activePhaseAction, setActivePhaseAction] = useState<string | null>(null);
  const [uploadDialogRequest, setUploadDialogRequest] = useState<DocumentRequestWithDetails | null>(null);
  
  // Status screen state
  const [statusScreen, setStatusScreen] = useState<"rejected" | "interview_scheduled" | "hired" | "ava_interview_unlocked" | "reconsidered" | "interview_cancelled" | "interview_rescheduled" | null>(null);
  const [interviewDetails, setInterviewDetails] = useState<{ scheduledAt?: string; meetingLink?: string; durationMinutes?: number } | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  const previousPhaseRef = useRef<string | null>(null);
  const previousInterviewRef = useRef<{ scheduled_at: string; status: string } | null>(null);
  
  // Fetch document requests for this application
  const { data: documentRequests = [], refetch: refetchDocumentRequests } = useDocumentRequests();

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
    enabled: !!id && !!user && !authLoading,
  });

  // Fetch interview for this application (for candidate confirmation card)
  const { data: candidateInterview, refetch: refetchInterview } = useQuery({
    queryKey: ["candidate-interview", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .eq("application_id", id!)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user && !authLoading,
  });

  // Fetch interview details when needed (for status screen)
  const fetchInterviewDetails = async (applicationId: string) => {
    const { data } = await supabase
      .from("interviews")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      setInterviewDetails({
        scheduledAt: data.scheduled_at,
        meetingLink: data.meeting_link || undefined,
        durationMinutes: data.duration_minutes || undefined,
      });
    }
  };

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
          const newStatus = payload.new.status as string;
          // With REPLICA IDENTITY FULL, payload.old should now contain the full old record
          const oldStatus = payload.old?.status as string || previousStatusRef.current;
          const newPhase = payload.new.phase;
          const oldPhase = payload.old?.phase || previousPhaseRef.current;
          
          refetch();
          
          // Detect reconsideration (rejected → reviewing)
          if (newStatus === "reviewing" && oldStatus === "rejected") {
            setStatusScreen("reconsidered");
            previousStatusRef.current = newStatus;
            previousPhaseRef.current = newPhase as string;
            return; // Don't process other status changes
          }
          
          // Detect status changes and show appropriate screen
          const statusChanged = newStatus !== oldStatus;

          if (statusChanged) {
            if (newStatus === "rejected") {
              setStatusScreen("rejected");
            } else if (newStatus === "hired") {
              setStatusScreen("hired");
            } else if (newStatus === "interview") {
              fetchInterviewDetails(id);
              setStatusScreen("interview_scheduled");
            }
          }
          
          // Detect phase changes - specifically for Ava Interview unlock
          const phaseChanged = newPhase !== oldPhase && oldPhase;
          if (phaseChanged && !statusChanged) {
            // Check if advanced to voice_interview phase (Ava Interview)
            const checkVoiceInterview = async () => {
              const { data: app } = await supabase
                .from("applications")
                .select("jobs(workflow_steps)")
                .eq("id", id)
                .single();
              
              const workflowSteps = (app?.jobs as { workflow_steps?: WorkflowStep[] } | null)?.workflow_steps;
              const voiceInterviewStep = workflowSteps?.find((s: any) => s.type === 'voice_interview');
              
              if (voiceInterviewStep && newPhase === voiceInterviewStep.id) {
                setStatusScreen("ava_interview_unlocked");
              } else {
                toast.success(`You've been advanced to the ${newPhase} phase!`, {
                  description: "Check your next steps below.",
                });
              }
            };
            checkVoiceInterview();
          }
          
          // Always update refs after processing
          previousStatusRef.current = newStatus;
          previousPhaseRef.current = newPhase as string;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch]);

  // Subscribe to real-time updates for interview changes (cancel/reschedule detection)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`interview-candidate-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interviews",
          filter: `application_id=eq.${id}`,
        },
        (payload) => {
          refetchInterview();
          
          const newData = payload.new as Record<string, unknown>;
          const oldData = payload.old as Record<string, unknown>;
          const prevInterview = previousInterviewRef.current;
          
          // Detect cancellation: status changed to "cancelled"
          if (newData?.status === "cancelled" && (oldData?.status === "scheduled" || prevInterview?.status === "scheduled")) {
            setStatusScreen("interview_cancelled");
          }
          // Detect reschedule: scheduled_at changed while still scheduled
          else if (
            newData?.status === "scheduled" && 
            prevInterview?.status === "scheduled" &&
            newData?.scheduled_at !== prevInterview?.scheduled_at
          ) {
            // Update interview details with new time
            setInterviewDetails({
              scheduledAt: newData.scheduled_at,
              meetingLink: newData.meeting_link || undefined,
              durationMinutes: newData.duration_minutes || undefined,
            });
            setStatusScreen("interview_rescheduled");
          }
          
          // Update the ref with latest interview data
          if (newData) {
            previousInterviewRef.current = {
              scheduled_at: newData.scheduled_at,
              status: newData.status,
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchInterview]);

  // Check on initial load if status or phase changed recently (within last 30 seconds)
  useEffect(() => {
    if (!application) return;
    
    const updatedAt = new Date(application.updated_at);
    const now = new Date();
    const timeDiff = now.getTime() - updatedAt.getTime();
    const isRecent = timeDiff < 30000; // 30 seconds
    
    const statusChanged = previousStatusRef.current !== application.status;
    const phaseChanged = previousPhaseRef.current !== application.phase;
    
    // Always show the rejected experience when opening a rejected application.
    if (previousStatusRef.current === null && application.status === "rejected") {
      setStatusScreen("rejected");
    }

    // Only show other celebratory/transition screens if this is first load and change was recent
    if (previousStatusRef.current === null && isRecent) {
      if (application.status === "hired") {
        setStatusScreen("hired");
      } else if (application.status === "interview") {
        fetchInterviewDetails(application.id);
        setStatusScreen("interview_scheduled");
      }
    }
    
    // Check for Ava Interview unlock on initial load
    if (previousPhaseRef.current === null && isRecent && application.phase) {
      const workflowSteps = application.jobs?.workflow_steps as WorkflowStep[] | undefined;
      const voiceInterviewStep = workflowSteps?.find((s: any) => s.type === 'voice_interview');
      
      if (voiceInterviewStep && application.phase === voiceInterviewStep.id) {
        // Check if we haven't completed the voice interview yet
        const hasVoiceInterviewResult = !!application.voice_interview_result;
        if (!hasVoiceInterviewResult) {
          setStatusScreen("ava_interview_unlocked");
        }
      }
    }
    
    previousStatusRef.current = application.status;
    previousPhaseRef.current = application.phase;
  }, [application]);

  // Initialize previous interview ref when interview data loads
  useEffect(() => {
    if (candidateInterview && !previousInterviewRef.current) {
      previousInterviewRef.current = {
        scheduled_at: candidateInterview.scheduled_at,
        status: candidateInterview.status,
      };
    }
  }, [candidateInterview]);

  // Build phases from workflow
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = application?.jobs?.quiz_questions as Json[] | undefined;
    
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

    // No explicit Review phase - employer reviews/approves before Ava Interview or Interview
    
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
  // Uses safe parser that handles string, object, or null and never loses data
  const notes = useMemo(() => {
    return parseApplicationNotes(application?.notes);
  }, [application?.notes]);
  
  // Check if a phase was employer-skipped (checks both id and type for backward compat)
  const isEmployerSkipped = useCallback((phaseId: string, phaseType?: string) => {
    return checkPhaseSkipped(notes, phaseId, phaseType);
  }, [notes]);
  
  // Helper to check if a phase has submission data
  const hasPhaseData = useCallback((phaseId: string, phaseType: string) => {
    if (phaseType === "application") {
      return !!(notes.applicationAnswers && notes.applicationAnswers.length > 0);
    } else if (phaseType === "typing_test") {
      return !!notes.typingTestResult;
    } else if (phaseType === "chat_simulation") {
      return !!notes.chatSimulationResult;
    } else if (phaseType === "chat_interview") {
      return !!notes.chatInterviewResult;
    } else if (phaseType === "sales_simulation") {
      return !!notes.salesSimulationResult;
    } else if (phaseType === "quiz") {
      const stepData = notes[phaseId];
      return !!(stepData?.completedAt || notes.quizResult);
    } else if (phaseType === "video_intro" || phaseType === "video_message") {
      const stepData = notes[phaseId];
      return !!notes.videoIntroUrl || !!(stepData?.videoUrl || stepData?.completed);
    } else if (phaseType === "portfolio_upload") {
      return !!notes.portfolioResult;
    } else if (phaseType === "voice_interview") {
      return !!application?.voice_interview_result;
    } else if (phaseType === "review" || phaseType === "interview" || phaseType === "hired" || phaseType === "journey_start") {
      return true; // Employer-driven phases don't have candidate data
    }
    return !!notes[phaseId];
  }, [notes, application?.voice_interview_result]);

  // Helper to check if a phase is implicitly skipped (behind current, no data, candidate-facing)
  const isImplicitlySkipped = useCallback((phaseIndex: number, phaseId: string, phaseType: string) => {
    // If phase is at or after current, not skipped
    if (phaseIndex >= effectivePhaseIndex) return false;
    // Employer-driven phases can't be "skipped" in this sense
    if (phaseType === "review" || phaseType === "interview" || phaseType === "hired" || phaseType === "journey_start") return false;
    // If it has data, it was completed not skipped
    if (hasPhaseData(phaseId, phaseType)) return false;
    // If explicitly skipped, not implicitly
    if (isEmployerSkipped(phaseId, phaseType)) return false;
    // It's behind current, has no data, and wasn't explicitly marked - implicitly skipped
    return true;
  }, [effectivePhaseIndex, hasPhaseData, isEmployerSkipped]);

  // Determine phase status for each step
  const getPhaseStatus = (phaseIndex: number) => {
    const phase = phases[phaseIndex];
    const isManualMode = application?.jobs?.processing_mode === "manual";
    
    // If this phase was skipped by employer (explicitly or implicitly), mark as completed
    if ((isEmployerSkipped(phase.id, phase.type) || isImplicitlySkipped(phaseIndex, phase.id, phase.type)) && phaseIndex < effectivePhaseIndex) {
      return "completed";
    }
    
    if (phaseIndex < effectivePhaseIndex) return "completed";
    if (phaseIndex === effectivePhaseIndex) {
      // If application is rejected, show current phase as rejected
      if (application?.status === "rejected") {
        return "rejected";
      }
      
      // Check if phase data exists (use type-specific keys)
      let hasPhaseData = false;
      
      if (phase.type === "application") {
        // Check if application form was submitted (applicationAnswers exist in notes)
        hasPhaseData = !!(notes.applicationAnswers && notes.applicationAnswers.length > 0);
      } else if (phase.type === "typing_test") {
        hasPhaseData = !!notes.typingTestResult;
      } else if (phase.type === "chat_simulation") {
        hasPhaseData = !!notes.chatSimulationResult;
      } else if (phase.type === "chat_interview") {
        hasPhaseData = !!notes.chatInterviewResult;
      } else if (phase.type === "sales_simulation") {
        hasPhaseData = !!notes.salesSimulationResult;
      } else if (phase.type === "quiz") {
        // Check step-specific storage (notes[phase.id].completedAt) OR quizResult
        const stepData = notes[phase.id];
        hasPhaseData = !!(stepData?.completedAt || notes.quizResult);
      } else if (phase.type === "video_intro" || phase.type === "video_message") {
        // Check both legacy videoIntroUrl and stepId-based storage
        const stepData = notes[phase.id];
        hasPhaseData = !!notes.videoIntroUrl || !!(stepData?.videoUrl || stepData?.completed);
      } else if (phase.type === "portfolio_upload") {
        hasPhaseData = !!notes.portfolioResult;
      } else if (phase.type === "voice_interview") {
        // Voice interview results are stored in dedicated column, not notes
        hasPhaseData = !!application?.voice_interview_result;
      } else {
        hasPhaseData = !!notes[phase.id];
      }
      
      if (hasPhaseData) {
        // In Manual Mode, show "Employer Reviewing" - employer must manually advance
        // In Auto Mode, show "Pending Review" - system will auto-advance
        return isManualMode ? "employer_reviewing" : "pending";
      }
      
      return "awaiting_action"; // Needs to complete this phase
    }
    return "upcoming";
  };

  // Calculate completed phase indexes for journey progress
  const completedPhaseIndexes = useMemo(() => {
    const completed: number[] = [];
    for (let i = 0; i < effectivePhaseIndex; i++) {
      const phase = phases[i];
      // A phase is completed if it's before current AND has data (or was skipped)
      if (hasPhaseData(phase.id, phase.type) || isEmployerSkipped(phase.id, phase.type)) {
        completed.push(i);
      }
    }
    return completed;
  }, [phases, effectivePhaseIndex, hasPhaseData, isEmployerSkipped]);

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
      case "application":
        navigate(`/applications/${id}/application/${phaseId}`);
        break;
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

  if (authLoading || isLoading) {
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
    <>
      {/* Status Screen Overlay */}
      <CandidateStatusScreen
        state={statusScreen}
        jobTitle={job?.title}
        companyName={job?.department}
        interviewDetails={interviewDetails || undefined}
        onClose={() => setStatusScreen(null)}
        interviewId={candidateInterview?.id}
        applicationId={id}
        candidateResponse={candidateInterview?.candidate_response}
        onInterviewConfirmed={() => refetchInterview()}
        onRescheduleRequested={() => refetchInterview()}
      />

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
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-bold text-foreground [overflow-wrap:anywhere]">{job?.title}</h1>
              <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">{job?.department || "Company"}</p>
              
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Journey Progress - shows step X of Y and estimated time */}
      {!isRejected && !isHired && phases.length > 0 && (
        <CandidateJourneyProgress
          phases={phases}
          currentPhaseIndex={effectivePhaseIndex}
          completedPhases={completedPhaseIndexes}
        />
      )}

      {/* Interview Confirmation Card - for candidate to confirm/reschedule */}
      {candidateInterview && (
        <CandidateInterviewConfirmationCard
          interview={candidateInterview}
          applicationId={id!}
        />
      )}

      {/* Application Status - Rejected (simplified, details in modal) */}
      {isRejected && (
        <Card className="bg-destructive/10 border-destructive/40">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">Application Closed</h3>
                <p className="text-sm text-muted-foreground">
                  This opportunity wasn't the right match this time.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setStatusScreen("rejected")}
              className="shrink-0"
            >
              View Details
            </Button>
          </CardContent>
        </Card>
      )}

      {isHired && (
        <>
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

          {/* Document Requests Section for Hired Candidates */}
          {(() => {
            const applicationDocRequests = documentRequests.filter(
              (req) => req.application_id === id
            );
            const pendingRequests = applicationDocRequests.filter(
              (req) => req.status === "pending" || req.status === "rejected"
            );
            const completedRequests = applicationDocRequests.filter(
              (req) => req.status === "submitted" || req.status === "reviewed" || req.status === "approved"
            );
            
            if (applicationDocRequests.length === 0) return null;
            
            return (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileUp className="h-5 w-5 text-primary" />
                    Required Documents
                    {pendingRequests.length > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {pendingRequests.length} pending
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingRequests.length > 0 && (
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                      <p className="text-sm text-foreground">
                        <strong>Action Required:</strong> Please upload the following documents to complete your onboarding.
                      </p>
                    </div>
                  )}
                  
                  {applicationDocRequests.map((request) => (
                    <DocumentRequestCard
                      key={request.id}
                      request={request}
                      isEmployer={false}
                      onUpload={() => setUploadDialogRequest(request)}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}

      {/* Progress Overview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Phase Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">Progress</span>
              <span className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
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
                  className={`flex flex-col gap-4 rounded-lg p-4 transition-all sm:flex-row sm:items-center ${
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
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3
                        className={`min-w-0 break-words font-semibold leading-tight [overflow-wrap:anywhere] ${
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
                        (isEmployerSkipped(phase.id, phase.type) || isImplicitlySkipped(index, phase.id, phase.type)) ? (
                          <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                            <FastForward className="h-3 w-3 mr-1" />
                            Skipped
                          </Badge>
                        ) : (
                          <Badge className="bg-success/20 text-success border-success/30">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        )
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

                  {/* Action Button - show for actionable phases that are awaiting action */}
                  {isCurrent &&
                    status === "awaiting_action" &&
                    application.status !== "rejected" &&
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

                  {isCurrent && status === "pending" && !isRejected && (
                    <div className="flex shrink-0 items-center gap-2 text-yellow-500 sm:ml-auto">
                      <Clock className="h-5 w-5" />
                      <span className="text-sm font-medium">Awaiting Review</span>
                    </div>
                  )}

                  {isCompleted && (
                    <CheckCircle className="h-6 w-6 flex-shrink-0 text-success sm:ml-auto" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      </div>

      {/* Document Upload Dialog */}
      <DocumentUploadDialog
        open={!!uploadDialogRequest}
        onOpenChange={(open) => {
          if (!open) {
            setUploadDialogRequest(null);
            refetchDocumentRequests();
          }
        }}
        request={uploadDialogRequest}
      />
    </>
  );
}
