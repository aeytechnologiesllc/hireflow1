import { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
import { parseApplicationNotes, isPhaseSkipped as checkPhaseSkipped, type StepRecordLike } from "@/utils/applicationNotes";
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
  Eye,
  Clock,
  Play,
  Loader2,
  MapPin,
  Briefcase,
  Calendar,
  AlertCircle,
  CheckCircle,
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
import { buildCandidateJourney, positionFor, titleFor } from "@/lib/candidateJourney";
import { stepHasResult, stepIsDone, stepRoute, whereCandidateStands } from "@/lib/journeyProgress";
import { glyphForKind } from "@/components/glyphForKind";

interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
}

interface ApplicationDetails extends Tables<"applications"> {
  jobs: (Tables<"jobs"> & { workflow_steps?: WorkflowStep[] }) | null;
}

// Map workflow step types to icons
// Was a map of stock lucide icons — FileCheck, ClipboardList, Video, Keyboard,
// MessageSquare, Briefcase, Mic, Eye. This list is the candidate's own journey,
// the surface they look at most on their side of the product, and it was drawn
// in exactly the generic voice the brand kit exists to replace. glyphForKind is
// the same resolver the employer create-flow uses, so a step wears one mark
// throughout the product.

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

  // Fetch application with job details. Always fresh: on 2026-10-05 this
  // page inherited the app-wide five-minute cache and showed a finished
  // written interview as "Up next · Begin Interview" from a copy loaded
  // before the candidate took it. Every step page already reads fresh; this
  // one does too, and refetches when the tab regains focus.
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  // The employer's real, public-safe company name. jobs.department is a job
  // department, not a company — employer_public_branding is the honest
  // source (RLS keeps raw employer profiles invisible to candidates).
  const employerId = application?.jobs?.employer_id;
  const { data: employerBranding } = useQuery({
    queryKey: ["candidate-application", "employer-branding", employerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_public_branding")
        .select("company_name")
        .eq("user_id", employerId!)
        .maybeSingle();

      if (error) throw error;
      return data?.company_name ?? null;
    },
    enabled: !!employerId,
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

  // Subscribe to real-time updates for this application. The topic carries
  // this instance's id: a static `application-${id}` is shared with anything
  // else listening to the same row under that name, and a second
  // `.on()` on an already-joined channel throws.
  const liveInstanceId = useId();
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`application-${id}-${liveInstanceId}`)
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
              const voiceInterviewStep = workflowSteps?.find((s) => s.type === 'voice_interview');
              
              if (voiceInterviewStep && newPhase === voiceInterviewStep.id) {
                setStatusScreen("ava_interview_unlocked");
              } else {
                // Read the stored title through the sanitiser. Rows in
                // production carry "Interview with Ava" because the workflow
                // generator wrote it, and this toast rendered it raw — the
                // journey header two hundred lines below has always been
                // sanitised, so the same screen told the truth in one place and
                // named the machine in another.
                const rawStep = workflowSteps?.find((s) => s.id === newPhase);
                const stepTitle = rawStep
                  ? titleFor(rawStep.type, rawStep.title)
                  : candidatePhaseDisplayNames[newPhase as string] || "the next step";
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
      .subscribe((status) => {
        // Catch up on anything that changed before the socket joined (or
        // while it was down) — a step finished in another tab, the next one
        // opened by the server.
        if (status === "SUBSCRIBED") refetch();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch, liveInstanceId]);

  // Subscribe to real-time updates for interview changes (cancel/reschedule detection)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`interview-candidate-${id}-${liveInstanceId}`)
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
  }, [id, refetchInterview, liveInstanceId]);

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
      const voiceInterviewStep = workflowSteps?.find((s) => s.type === 'voice_interview');
      
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
      icon: glyphForKind(step.type),
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
  
  // Does a step have its result on file? One rule, shared with the step
  // pages' next-step card and the cockpit (journeyProgress.stepHasResult) —
  // this screen used to carry two inline copies of it.
  const hasPhaseData = useCallback(
    (phaseId: string, phaseType: string) =>
      stepHasResult(notes, application?.voice_interview_result, { id: phaseId, type: phaseType }),
    [notes, application?.voice_interview_result],
  );

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

  // Where the candidate stands, read from the DATA: the step at `phase` is
  // "take" (open, no result yet), "waiting" (its result is in, the next step
  // is not open yet), or every step is behind them ("finished"). Position
  // alone used to decide this, so a finished last step — whose phase never
  // moves past it — read "Up next" or "Under review" forever.
  const journeyApp = {
    phase: application?.phase,
    status: application?.status,
    notes,
    voiceInterviewResult: application?.voice_interview_result,
  };
  const standing = whereCandidateStands(phases, journeyApp);

  const job = application?.jobs;
  const companyName = employerBranding || "This employer";

  // Handle starting a phase action (quiz, typing test, etc.) — through the
  // one step-to-route map the step pages use too (journeyProgress.stepRoute).
  const handleStartPhase = (phaseId: string, phaseType: string) => {
    setActivePhaseAction(phaseId);
    const route = id ? stepRoute(id, { id: phaseId, type: phaseType }) : null;
    if (route) {
      navigate(route);
      return;
    }
    // Reachable only if a job is configured with a step type this build
    // cannot open. "Not yet implemented" is our word, not theirs — it tells
    // a candidate nothing, blames nobody, and leaves them staring at a
    // button that did nothing. Say whose problem it is and where to go.
    console.error("No route for candidate phase type:", phaseType, "step:", phaseId);
    toast.error("We can't open this step right now", {
      description: "That's on our side, not yours — nothing you've done is lost. Try again shortly.",
    });
    setActivePhaseAction(null);
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

  const applicationStatus = application.status;
  const isRejected = applicationStatus === "rejected";
  const isHired = applicationStatus === "hired";

  // GUIDED: the one status line that answers "what's happening right now" and,
  // where there's something to do, "what's the one next thing". Once every
  // step is behind them the header moves to the closing stage — "Step 6 of 6
  // — Decision · You've finished every step" — with no button to begin
  // anything they have already done.
  const isFinished = standing.kind === "finished";
  const isWaiting = standing.kind === "waiting";
  // Every step is in and the application is held for the hiring team's
  // review — the only time anything on this screen reads "In review".
  const isPendingHeld = isFinished;
  const focusIndex = isFinished ? standing.index : effectivePhaseIndex;
  const currentPhase = phases[focusIndex] ?? phases[effectivePhaseIndex];
  const showCta = !isRejected && !isHired && standing.kind === "take";
  const progressPercentage = isFinished ? 100 : ((focusIndex + 1) / phases.length) * 100;

  let guidanceMessage = "The hiring team will get back to you — everyone hears back.";
  let guidanceIcon: "clock" | null = null;
  if (standing.kind === "take") {
    const duration = phaseDurationEstimates[currentPhase.type];
    if (duration?.isCandidateAction) {
      guidanceMessage = `About ${duration.label.replace(/ min$/, " minutes")}.`;
      guidanceIcon = "clock";
    } else {
      guidanceMessage = "Take your time — you can't break anything.";
    }
  } else if (isWaiting) {
    // Same promise as NextStepCard's: in auto mode the next step normally
    // opens within seconds; if it has not, a person opens it.
    guidanceMessage =
      application.jobs?.processing_mode === "manual"
        ? "Saved — the hiring team opens your next step. You can close this page."
        : "Saved — your next step opens here. If it hasn't opened in a few minutes, the hiring team will open it.";
  }

  return (
    <>
      {/* Status Screen Overlay */}
      <CandidateStatusScreen
        state={statusScreen}
        jobTitle={job?.title}
        companyName={companyName}
        interviewDetails={interviewDetails || undefined}
        onClose={() => setStatusScreen(null)}
        onStartVoiceInterview={() => {
          // Same route handleStartPhase computes for the voice step — the card
          // used to just close and leave the candidate to find it.
          const voiceStep = (application?.jobs as unknown as { workflow_steps?: WorkflowStep[] } | null)
            ?.workflow_steps?.find((s) => s.type === "voice_interview");
          setStatusScreen(null);
          if (voiceStep) handleStartPhase(voiceStep.id, "voice_interview");
        }}
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
              {companyName}
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
                    <span className="ck-num">Step {focusIndex + 1}</span> of{" "}
                    <span className="ck-num">{phases.length}</span> — {currentPhase.title}
                  </p>
                  {isFinished ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-[var(--jade)]" />
                      You&apos;ve finished every step
                    </span>
                  ) : isWaiting ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-[var(--jade)]" />
                      Done
                    </span>
                  ) : null}
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
                    {/* Named after the step itself, the same words the
                        next-step card uses ("Start Player chat practice"),
                        not a generic label for its type. */}
                    {currentPhase.type === "application"
                      ? phaseActionMessages.application?.buttonText || "Complete Application"
                      : `Start ${currentPhase.title}`}
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
              employerName={employerBranding}
              jobTitle={job?.title}
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
              const Icon = phase.icon;
              // The row the header is about: the step to take or just done,
              // or the closing stage once every step is behind them.
              const isCurrent = index === focusIndex;
              const isBehind = index < effectivePhaseIndex;
              const isDecisionStep = phase.type === "decision";
              // Labelled from its DATA: a step whose result is on file is
              // done, even when the phase has not moved past it yet.
              const isDone = !isDecisionStep && stepIsDone(journeyApp, phase);
              const isCompleted = isBehind || isDone;
              const skipped =
                isBehind &&
                (isEmployerSkipped(phase.id, phase.type) || isImplicitlySkipped(index, phase.id, phase.type));
              const isDecided = isHired || isRejected;

              // A decided application has no "Upcoming". This list used to
              // contradict the banner directly above it: a hired candidate saw
              // the closing Decision stage read "Under review" (or "Upcoming"),
              // and every step the employer decided not to run still read as
              // though it were still coming. Rejected candidates got the same
              // treatment — a "Decision" that had already been made, listed as
              // pending. Once there is an outcome, every row must reflect it.
              let statusText = "Upcoming";
              if (skipped) statusText = "Skipped";
              else if (isBehind) statusText = "Completed";
              else if (isDecisionStep && isDecided) statusText = isHired ? "Offer" : "Closed";
              else if (isHired) {
                // Finished it, or the employer decided before reaching it.
                statusText = isDone ? "Completed" : "Not needed";
              } else if (isRejected) statusText = index === effectivePhaseIndex ? "Not passed" : "Not reached";
              else if (isDone) statusText = "Completed";
              // The header's row: the step to take next, or — once every
              // step is in — the closing stage, in review.
              else if (isCurrent) statusText = isPendingHeld ? "In review" : "Up next";

              return (
                <div key={phase.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      skipped
                        ? "text-[var(--brass-line)]"
                        : isCompleted
                        ? "text-[var(--jade)]"
                        : isDecisionStep && isDecided
                        ? isHired
                          ? "text-[var(--jade)]"
                          : "text-[var(--crit)]"
                        : isCurrent
                        ? isRejected
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
