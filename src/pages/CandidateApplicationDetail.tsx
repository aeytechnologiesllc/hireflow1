import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { parseApplicationNotes, isPhaseSkipped as checkPhaseSkipped } from "@/utils/applicationNotes";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileCheck,
  ClipboardList,
  Keyboard,
  Video,
  MessageSquare,
  Eye,
  Clock,
  Play,
  Loader2,
  MapPin,
  Briefcase,
  Calendar,
  AlertCircle,
  Mic,
  FileUp
} from "lucide-react";
import { toast } from "sonner";
import type { Tables, Json } from "@/integrations/supabase/types";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { GlyphLetter, GlyphCheckSeal } from "@/components/candidate/glyphs";

// A slim brass rule across the top of a card — the letterhead mark
// (Founder's Law: "the dialogues feel empty and boring").
const BRASS_RULE = (
  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
);

import { CandidateInterviewConfirmationCard } from "@/components/CandidateInterviewConfirmationCard";
import { useDocumentRequests, DocumentRequestWithDetails } from "@/hooks/useDocumentRequests";
import { DocumentRequestCard } from "@/components/documents/DocumentRequestCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { phaseDurationEstimates } from "@/lib/phaseDurations";
import { buildCandidateJourney, positionFor } from "@/lib/candidateJourney";

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
  voice_interview: Mic,
  // The one honest closing stage — "the hiring team decides" — replaces the
  // old synthetic review/interview/hired legs.
  decision: Eye,
};

import {
  candidatePhaseDisplayNames,
  phaseActionMessages as terminologyPhaseActionMessages
} from "@/lib/terminology";

// Use centralized phase action messages
const phaseActionMessages = terminologyPhaseActionMessages;

export default function CandidateApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
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
              
              const workflowSteps = (app?.jobs as unknown as { workflow_steps?: WorkflowStep[] } | null)?.workflow_steps;
              const voiceInterviewStep = workflowSteps?.find((s: any) => s.type === 'voice_interview');
              
              if (voiceInterviewStep && newPhase === voiceInterviewStep.id) {
                setStatusScreen("ava_interview_unlocked");
              } else {
                const stepTitle =
                  workflowSteps?.find((s: any) => s.id === newPhase)?.title ||
                  candidatePhaseDisplayNames[newPhase as string] ||
                  "the next step";
                toast.success(`You're on to ${stepTitle}.`, {
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
              scheduledAt: newData.scheduled_at as string,
              meetingLink: (newData.meeting_link as string) || undefined,
              durationMinutes: (newData.duration_minutes as number) || undefined,
            });
            setStatusScreen("interview_rescheduled");
          }
          
          // Update the ref with latest interview data
          if (newData) {
            previousInterviewRef.current = {
              scheduled_at: newData.scheduled_at as string,
              status: newData.status as string,
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

  // Build phases from the job's real workflow via the shared candidateJourney
  // builder, so this screen agrees with every other candidate screen — just
  // the real steps, plus the one honest closing "Decision" stage. Nothing
  // synthetic beyond that (no standalone Review/Interview/Hired legs).
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = application?.jobs?.quiz_questions as Json[] | undefined;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;

    return buildCandidateJourney(workflowSteps, { hasQuiz }).map((step) => ({
      ...step,
      icon: stepTypeIcons[step.type] || ClipboardList,
    }));
  })();

  // Find current phase index — falls back to `status` when `phase` is one of
  // the pre-journey literals ("review"/"interview"/"hired") still sitting on
  // older applications, so those honestly land on the closing Decision stage
  // instead of snapping back to step 1.
  const effectivePhaseIndex = positionFor(phases, {
    phase: application?.phase,
    status: application?.status,
  }).index;

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
    } else if (phaseType === "decision") {
      return true; // The closing, employer-driven stage has no candidate data
    }
    return !!notes[phaseId];
  }, [notes, application?.voice_interview_result]);

  // Helper to check if a phase is implicitly skipped (behind current, no data, candidate-facing)
  const isImplicitlySkipped = useCallback((phaseIndex: number, phaseId: string, phaseType: string) => {
    // If phase is at or after current, not skipped
    if (phaseIndex >= effectivePhaseIndex) return false;
    // The closing, employer-driven stage can't be "skipped" in this sense
    if (phaseType === "decision") return false;
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

  // Calculate progress percentage
  const progressPercentage = ((effectivePhaseIndex + 1) / phases.length) * 100;

  const job = application?.jobs;

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
      <div className="flex h-full items-center justify-center">
        <Card className="relative overflow-hidden bg-card border-border max-w-md">
          {BRASS_RULE}
          <CardContent className="p-8 text-center">
            <GlyphLetter size={44} className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-display mb-2 text-xl font-medium text-foreground">Candidate View Only</h2>
            <p className="text-sm text-muted-foreground">
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
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="relative overflow-hidden bg-card border-border max-w-md">
          {BRASS_RULE}
          <CardContent className="space-y-4 p-8 text-center">
            <GlyphLetter size={44} className="mx-auto text-muted-foreground" />
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-medium text-foreground">We can't find that application</h2>
              <p className="text-sm text-muted-foreground">
                It may have moved — head back and pick it up from your list.
              </p>
            </div>
            <Button onClick={() => navigate("/applications")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
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

  // GUIDED: the one status line that answers "what's happening right now" and,
  // where there's something to do, "what's the one next thing".
  const currentStatus = getPhaseStatus(effectivePhaseIndex);
  const isTerminalPhaseType = currentPhase.type === "decision";
  const isPendingHeld = currentStatus === "pending" || currentStatus === "employer_reviewing";
  const showCta = !isRejected && !isHired && currentStatus === "awaiting_action" && !isTerminalPhaseType;

  let guidanceMessage = "The hiring team will get back to you — everyone hears back.";
  let guidanceIcon: "clock" | null = null;
  if (!isPendingHeld && !isTerminalPhaseType) {
    const duration = phaseDurationEstimates[currentPhase.type];
    if (duration?.isCandidateAction) {
      guidanceMessage = `About ${duration.label.replace(/ min$/, " minutes")}.`;
      guidanceIcon = "clock";
    } else {
      guidanceMessage = "Take your time — you can't break anything.";
    }
  }

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
        {/* Quiet back link — navigation, not the moment on this screen */}
        <Button
          variant="ghost"
          onClick={() => navigate("/applications")}
          className="min-h-[44px] -ml-3 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applications
        </Button>

        {/* The one panel: who you applied to, and exactly where you stand — the letterhead moment */}
        <Card className="relative overflow-hidden bg-card border-border ck-reveal">
          {BRASS_RULE}
          <CardContent className="p-5 sm:p-6">
            <h1 className="font-display break-words text-2xl font-semibold text-foreground [overflow-wrap:anywhere]">
              {job?.title}
            </h1>
            <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {job?.department || "Company"}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {job?.location && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-words [overflow-wrap:anywhere]">{job.location}</span>
                </span>
              )}
              {job?.job_type && (
                <span className="flex min-w-0 items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-words [overflow-wrap:anywhere]">{job.job_type}</span>
                </span>
              )}
              <span className="flex min-w-0 items-center gap-1">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="break-words [overflow-wrap:anywhere]">
                  Applied {format(new Date(application.created_at), "MMM d, yyyy")}
                </span>
              </span>
            </div>

            {isRejected ? (
              <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-[var(--hair)] pt-5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--crit)]" />
                  <p className="min-w-0 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    This opportunity wasn&apos;t the right match this time.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatusScreen("rejected")}
                  className="shrink-0 text-foreground"
                >
                  View details
                </Button>
              </div>
            ) : isHired ? (
              <div className="mt-5 flex items-center gap-3 border-t border-[var(--hair)] pt-5">
                <GlyphCheckSeal size={26} className="ck-seal-press shrink-0 text-[var(--brass)]" />
                <div className="min-w-0">
                  <p className="font-display text-base font-medium text-foreground sm:text-lg">You&apos;re hired</p>
                  <p className="mt-0.5 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    Congratulations — the employer will be in touch with next steps.
                  </p>
                </div>
              </div>
            ) : phases.length > 0 ? (
              <div className="mt-5 border-t border-[var(--hair)] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <p className="font-display text-base font-medium text-foreground sm:text-lg">
                    <span className="ck-num">Step {effectivePhaseIndex + 1}</span> of{" "}
                    <span className="ck-num">{phases.length}</span> — {currentPhase.title}
                  </p>
                  {isPendingHeld && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      Under review
                    </span>
                  )}
                </div>

                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]"
                  role="progressbar"
                  aria-valuenow={Math.round(progressPercentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Application progress"
                >
                  <div
                    className="h-full rounded-full bg-[var(--jade)] transition-[width] duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>

                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {guidanceIcon === "clock" && <Clock className="h-3.5 w-3.5 shrink-0" />}
                  {guidanceMessage}
                </p>

                {showCta && (
                  <Button
                    onClick={() => handleStartPhase(currentPhase.id, currentPhase.type)}
                    disabled={activePhaseAction === currentPhase.id}
                    size="lg"
                    className="mt-4 w-full gap-2 sm:w-auto"
                  >
                    {activePhaseAction === currentPhase.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {phaseActionMessages[currentPhase.type]?.buttonText || "Continue"}
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Interview Confirmation Card - for candidate to confirm/reschedule */}
        {candidateInterview && (
          <div className="ck-reveal" style={{ ["--ck-i" as string]: 1 }}>
            <CandidateInterviewConfirmationCard
              interview={candidateInterview}
              applicationId={id!}
            />
          </div>
        )}

        {/* Document Requests Section for Hired Candidates */}
        {isHired &&
          (() => {
            const applicationDocRequests = documentRequests.filter(
              (req) => req.application_id === id
            );
            const pendingRequests = applicationDocRequests.filter(
              (req) => req.status === "pending" || req.status === "rejected"
            );

            if (applicationDocRequests.length === 0) return null;

            return (
              <Card className="relative overflow-hidden bg-card border-border ck-reveal" style={{ ["--ck-i" as string]: 1 }}>
                {BRASS_RULE}
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
                    <div className="mb-4 rounded-lg border border-primary/20 bg-primary/10 p-3">
                      <p className="text-sm text-foreground">
                        <strong>Action needed:</strong> upload these to finish your onboarding.
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

        {/* Every step, listed quietly — the full picture, no competing CTAs */}
        <div className="ck-reveal" style={{ ["--ck-i" as string]: 2 }}>
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your steps
          </p>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {phases.map((phase, index) => {
              const status = getPhaseStatus(index);
              const Icon = phase.icon;
              const isCurrent = index === effectivePhaseIndex;
              const isCompleted = index < effectivePhaseIndex;
              const skipped =
                isCompleted &&
                (isEmployerSkipped(phase.id, phase.type) || isImplicitlySkipped(index, phase.id, phase.type));

              let statusText = "Upcoming";
              if (skipped) statusText = "Skipped";
              else if (isCompleted) statusText = "Completed";
              else if (isCurrent) {
                statusText =
                  status === "rejected" ? "Not passed" : isPendingHeld ? "Under review" : "Up next";
              }

              return (
                <div key={phase.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      skipped
                        ? "text-[var(--brass-line)]"
                        : isCompleted
                        ? "text-[var(--jade)]"
                        : isCurrent
                        ? status === "rejected"
                          ? "text-[var(--crit)]"
                          : "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm [overflow-wrap:anywhere] ${
                      isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {phase.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{statusText}</span>
                </div>
              );
            })}
          </div>
        </div>
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
