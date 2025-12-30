import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { parseApplicationNotes, isPhaseSkipped as checkPhaseSkipped } from "@/utils/applicationNotes";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CondensedAIAnalysis } from "@/components/CondensedAIAnalysis";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, isFuture } from "date-fns";
import { 
  ArrowLeft, FileText, MessageSquare, Sparkles, 
  XCircle, GripHorizontal, Clock, RefreshCw, 
  FileCheck, ClipboardList, Video, Keyboard, Mic,
  Eye, Users, CheckCircle, Loader2, Mail, ExternalLink,
  Calendar, AlertTriangle, ShieldAlert, ShieldCheck, Shield,
  HelpCircle, Move, Zap, AlertCircle, Download, FastForward,
  MoreHorizontal, CalendarX, Flag
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import InterviewSchedulingWizard, { type SavedWizardState } from "@/components/InterviewSchedulingWizard";
import ApplicantNotesDialog from "@/components/ApplicantNotesDialog";
import ApplicantMessageDialog from "@/components/ApplicantMessageDialog";
import { SalesAnalysisDialog } from "@/components/SalesAnalysisDialog";
import { AvaInterviewConfigDialog } from "@/components/AvaInterviewConfigDialog";
import { VoiceInterviewResultsDialog } from "@/components/VoiceInterviewResultsDialog";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { MediaPlayer } from "@/components/MediaPlayer";
import { useApplicantDossier } from "@/hooks/useApplicantDossier";
import { RescheduleInterviewDialog } from "@/components/RescheduleInterviewDialog";
import { EmployerRescheduleReviewDialog } from "@/components/EmployerRescheduleReviewDialog";
import { RejectedStampAnimation } from "@/components/animations/RejectedStampAnimation";
import InterviewQuestionsDialog from "@/components/InterviewQuestionsDialog";
import type { InterviewWithDetails } from "@/hooks/useInterviews";
import type { Tables } from "@/integrations/supabase/types";
import { detectResumeUrl } from "@/utils/detectResumeUrl";
import { extractPdfTextFromUrl } from "@/utils/pdfText";
import { useAutoTriggerAvaAnalysis } from "@/hooks/useAutoTriggerAvaAnalysis";
import { useSubscription } from "@/hooks/useSubscription";


interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, any>;
}

interface ApplicationDetails extends Tables<"applications"> {
  profiles: Tables<"profiles"> | null;
  jobs: (Tables<"jobs"> & { workflow_steps?: WorkflowStep[] }) | null;
}

// Default phases if job has no workflow
const defaultPhases = [
  { id: "application", title: "Application", fullTitle: "Application", icon: FileCheck, type: "application" },
  { id: "interview", title: "Interview", fullTitle: "Interview", icon: Users, type: "interview" },
  { id: "hired", title: "Hired", fullTitle: "Hired", icon: CheckCircle, type: "hired" },
];

// Map workflow step types to icons
const stepTypeIcons: Record<string, any> = {
  journey_start: Flag,
  application: FileCheck,
  quiz: ClipboardList,
  video_intro: Video,
  video_message: Video,
  portfolio_upload: FileCheck,
  typing_test: Keyboard,
  chat_simulation: MessageSquare,
  chat_interview: MessageSquare,
  sales_simulation: MessageSquare,
  voice_interview: Video,
  review: Eye,
  interview: Users,
  hired: CheckCircle,
};

// Short descriptions for workflow step types (for tooltips)
const stepTypeDescriptions: Record<string, string> = {
  journey_start: "Application journey begins here",
  application: "Submit your application details",
  quiz: "Complete a knowledge assessment",
  video_intro: "Record a brief video introduction",
  video_message: "Record a video message",
  portfolio_upload: "Upload portfolio or work samples",
  typing_test: "Test your typing speed & accuracy",
  chat_simulation: "Practice a chat-based scenario",
  chat_interview: "AI-powered chat interview",
  sales_simulation: "Complete a sales scenario exercise",
  voice_interview: "AI video/voice interview with Ava",
  review: "Employer reviews your submission",
  interview: "Live interview with hiring team",
  hired: "Congratulations, you're hired!",
};

// Colors for different phase states
const phaseColors = {
  completed: "bg-success",
  current: "bg-warning",
  upcoming: "bg-muted",
};

export default function ApplicantDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const updateApplication = useUpdateApplication();
  const { data: permissions } = useTeamMemberPermissions();
  const { downloadDossier, isGenerating: isGeneratingDossier } = useApplicantDossier();
  const { getVoiceMinutesRemaining } = useSubscription();
  
  // Permission checks for team members
  const canManagePipeline = permissions?.isTeamMember ? permissions.canManagePipeline : true;
  const canScheduleInterviews = permissions?.isTeamMember ? permissions.canScheduleInterviews : true;
  const canMessageCandidates = permissions?.isTeamMember ? permissions.canMessageCandidates : true;
  const canSendDocuments = permissions?.isTeamMember ? permissions.canSendDocuments : true;
  const queryClient = useQueryClient();
  
  // Auto-trigger AVA analysis when needed (after phase reset + resubmission)
  useAutoTriggerAvaAnalysis({ applicationId: id, enabled: !!id });
  
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isAwaitingReview, setIsAwaitingReview] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [activeBadgeDialog, setActiveBadgeDialog] = useState<string | null>(null);
  const [showInterviewWizard, setShowInterviewWizard] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<SavedWizardState | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  // Allow Redo functionality removed - employers should reject candidates who need to restart
  const [showSalesAnalysisDialog, setShowSalesAnalysisDialog] = useState(false);
  const [salesAnalysisData, setSalesAnalysisData] = useState<any>(null);
  const [showAvaInterviewConfig, setShowAvaInterviewConfig] = useState(false);
  const [showVoiceInterviewResults, setShowVoiceInterviewResults] = useState(false);
  const [pendingAvaInterview, setPendingAvaInterview] = useState<{
    newIndex: number;
    newPhase: { id: string; title: string; type: string };
  } | null>(null);
  const [pendingInterview, setPendingInterview] = useState<{
    newIndex: number;
    newPhase: { id: string; title: string; type: string };
  } | null>(null);
  const [showHiringDocumentPrompt, setShowHiringDocumentPrompt] = useState(false);
  const [showCancelInterviewConfirm, setShowCancelInterviewConfirm] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showRescheduleReviewDialog, setShowRescheduleReviewDialog] = useState(false);
  const [showRejectAnimation, setShowRejectAnimation] = useState(false);
  const [showInterviewQuestionsDialog, setShowInterviewQuestionsDialog] = useState(false);
  const [showRejectConfirmation, setShowRejectConfirmation] = useState(false);
  const [showHireConfirmation, setShowHireConfirmation] = useState(false);
  const [showReconsiderConfirmation, setShowReconsiderConfirmation] = useState(false);
  const [computedRestorePhase, setComputedRestorePhase] = useState<{ id: string; name: string; index: number }>({ id: "review", name: "Review", index: -1 });
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<ApplicationDetails | null>(null);
  
  // Ref to prevent useEffect from overriding slider position during phase change
  const isPhaseChangeInProgressRef = useRef(false);

  // Check for OAuth return and auto-open wizard with restored state
  useEffect(() => {
    const openWizard = searchParams.get("openWizard");
    if (openWizard === "true") {
      // Check for saved wizard state
      const savedStateStr = localStorage.getItem("interview_wizard_state");
      if (savedStateStr) {
        try {
          const savedState: SavedWizardState = JSON.parse(savedStateStr);
          // Check if state is still valid (not expired)
          const WIZARD_STATE_EXPIRY = 30 * 60 * 1000; // 30 minutes
          if (Date.now() - savedState.savedAt < WIZARD_STATE_EXPIRY) {
            setWizardInitialState(savedState);
            setShowInterviewWizard(true);
            toast.success("Google Calendar connected! Continue scheduling your interview.");
          }
          // Clear the saved state after use
          localStorage.removeItem("interview_wizard_state");
        } catch (e) {
          console.error("Failed to parse wizard state:", e);
        }
      } else {
        // No saved state, but still open wizard (Google connected)
        setShowInterviewWizard(true);
      }
      // Remove the query param
      searchParams.delete("openWizard");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: application, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: async () => {
      const { data: app, error } = await supabase
        .from("applications")
        .select("*, jobs(*)")
        .eq("id", id!)
        .single();

      if (error) throw error;

      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", app.candidate_id)
        .single();

      return { ...app, profiles: profile, jobs: app.jobs } as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Fetch scheduled interview for this application - prioritize by response status
  const { data: scheduledInterview } = useQuery({
    queryKey: ["interview", "application", id],
    queryFn: async () => {
      // Step 1: Check for reschedule_requested interviews first (needs immediate action)
      const { data: rescheduleInterview, error: rescheduleError } = await supabase
        .from("interviews")
        .select("*")
        .eq("application_id", id!)
        .eq("status", "scheduled")
        .eq("candidate_response", "reschedule_requested")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rescheduleError) throw rescheduleError;
      if (rescheduleInterview) return rescheduleInterview;

      // Step 2: Check for pending/awaiting response interviews
      const { data: pendingInterview, error: pendingError } = await supabase
        .from("interviews")
        .select("*")
        .eq("application_id", id!)
        .eq("status", "scheduled")
        .or("candidate_response.is.null,candidate_response.eq.pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingError) throw pendingError;
      if (pendingInterview) return pendingInterview;

      // Step 3: Get confirmed interview or most recent scheduled
      const { data: confirmedInterview, error: confirmedError } = await supabase
        .from("interviews")
        .select("*")
        .eq("application_id", id!)
        .eq("status", "scheduled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (confirmedError) throw confirmedError;
      if (confirmedInterview) return confirmedInterview;
      
      // Step 4: Fall back to most recently created interview (for history)
      const { data: latestInterview, error: latestError } = await supabase
        .from("interviews")
        .select("*")
        .eq("application_id", id!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      return latestInterview;
    },
    enabled: !!id,
  });

  // Computed InterviewWithDetails object for the InterviewQuestionsDialog
  const interviewWithDetails = useMemo<InterviewWithDetails | null>(() => {
    if (!scheduledInterview || !application) return null;
    return {
      ...scheduledInterview,
      applications: {
        id: application.id,
        candidate_id: application.candidate_id,
        jobs: application.jobs,
        profiles: application.profiles,
      },
    } as InterviewWithDetails;
  }, [scheduledInterview, application]);

  // Query for ALL scheduled interviews for this application (for rejection cleanup)
  const { data: allScheduledInterviews } = useQuery({
    queryKey: ["interviews", "all-scheduled", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("id, scheduled_at, status, interview_type")
        .eq("application_id", id!)
        .eq("status", "scheduled");
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Real-time subscription for this application - syncs when AVA or external sources update it
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`application-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'applications',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log('Application updated in real-time:', payload);
          queryClient.invalidateQueries({ queryKey: ["application", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Real-time subscription for job updates (processing_mode changes, etc.)
  useEffect(() => {
    if (!application?.job_id) return;

    const channel = supabase
      .channel(`job-${application.job_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${application.job_id}`,
        },
        (payload) => {
          console.log('Job updated in real-time:', payload);
          // Invalidate the application query since it includes job data
          queryClient.invalidateQueries({ queryKey: ["application", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [application?.job_id, id, queryClient]);

  // Real-time subscription for interview updates (candidate confirms, reschedules, etc.)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`interview-employer-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interviews',
          filter: `application_id=eq.${id}`,
        },
        (payload) => {
          console.log('Interview updated in real-time:', payload);
          queryClient.invalidateQueries({ queryKey: ["interview", "application", id] });
          
          // Show toast notifications for interview changes
          const newData = payload.new as any;
          const oldData = payload.old as any;
          
          if (newData?.candidate_response === "reschedule_requested" && 
              oldData?.candidate_response !== "reschedule_requested") {
            toast.info("Candidate has requested to reschedule", {
              description: "Review their proposed times and respond.",
            });
            // Auto-open the reschedule review dialog
            setShowRescheduleReviewDialog(true);
          } else if (newData?.candidate_response === "confirmed" && 
                     oldData?.candidate_response !== "confirmed") {
            toast.success("Candidate confirmed the interview!", {
              description: "The interview is now confirmed.",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Listen for AVA voice assistant section open commands
  // Use a ref to access handleReanalyze to avoid stale closure
  const handleReanalyzeRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    const handleAvaSection = (e: CustomEvent<{ section: string }>) => {
      const { section } = e.detail;
      console.log('AVA opening section:', section);
      
      switch (section) {
        case 'analysis':
          // Scroll to AI analysis card (it's visible on the page)
          const analysisCard = document.querySelector('[data-section="ai-analysis"]');
          if (analysisCard) {
            analysisCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            toast.success('Showing Ava Analysis');
          }
          break;
        case 'resume':
          setShowResumeDialog(true);
          break;
        case 'application':
          setShowApplicationDialog(true);
          break;
        case 'notes':
          setShowNotesDialog(true);
          break;
        case 'messages':
          setShowMessageDialog(true);
          break;
        case 'interview_results':
          setShowVoiceInterviewResults(true);
          break;
        case 'sales_results':
          setShowSalesAnalysisDialog(true);
          break;
        case 'run_analysis':
          // Trigger reanalysis via ref
          if (handleReanalyzeRef.current) {
            handleReanalyzeRef.current();
          }
          break;
      }
    };
    
    window.addEventListener('ava-open-section', handleAvaSection as EventListener);
    return () => window.removeEventListener('ava-open-section', handleAvaSection as EventListener);
  }, []);

  // Auto-advance in Autopilot mode: when application meets criteria, advance automatically
  const autoAdvanceTriggeredRef = useRef(false);
  useEffect(() => {
    // Guard: only run once per page load
    if (autoAdvanceTriggeredRef.current) return;
    if (!application || !application.jobs) return;
    
    const job = application.jobs;
    const isAutopilot = job.processing_mode === "auto";
    const currentPhase = application.phase || "application";
    const aiScore = application.ai_score;
    const passingScore = job.passing_score || 60;
    const isRejected = application.status === "rejected";
    
    // Only proceed if:
    // 1. Job is in autopilot mode
    // 2. Application is in "application" or "quiz" phase (phases that can auto-advance)
    // 3. Has a passing score
    // 4. Not rejected
    if (!isAutopilot || isRejected) return;
    if (currentPhase !== "application" && currentPhase !== "quiz") return;
    if (aiScore === null || aiScore === undefined) return;
    if (aiScore < passingScore) return;
    
    // Check if the phase is actually complete
    const parsedAppNotes = (() => {
      try {
        if (!application.notes) return {};
        if (typeof application.notes === "object") return application.notes as Record<string, any>;
        return JSON.parse(application.notes as string);
      } catch {
        return {};
      }
    })();
    
    // For "application" phase: check if form was submitted
    if (currentPhase === "application") {
      const hasApplicationAnswers = !!parsedAppNotes.applicationAnswers?.length;
      const hasAnyData = Object.keys(parsedAppNotes).length > 0;
      if (!hasApplicationAnswers && !hasAnyData) return;
    }
    
    // For "quiz" phase: check if quiz was completed
    if (currentPhase === "quiz") {
      if (!parsedAppNotes.quizResult && !parsedAppNotes.quiz) return;
    }
    
    // All conditions met - auto-advance
    autoAdvanceTriggeredRef.current = true;
    console.log("[Autopilot Auto-Advance] Conditions met, advancing application", {
      appId: application.id,
      currentPhase,
      aiScore,
      passingScore,
    });
    
    // Determine next phase
    const workflowSteps = (job.workflow_steps as WorkflowStep[]) || [];
    const quizQuestions = job.quiz_questions as any[] | undefined;
    const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    
    let nextPhaseId: string | null = null;
    let nextPhaseTitle: string = "";
    
    if (currentPhase === "application") {
      if (hasQuizQuestions) {
        nextPhaseId = "quiz";
        nextPhaseTitle = "Quiz";
      } else if (workflowSteps.length > 0) {
        // SAFETY GATE: Never auto-advance to voice_interview - employer must configure it
        const firstNonVoiceStep = workflowSteps.find((s: WorkflowStep) => s.type !== "voice_interview");
        if (firstNonVoiceStep) {
          nextPhaseId = firstNonVoiceStep.id;
          nextPhaseTitle = firstNonVoiceStep.title;
        } else {
          // All steps are voice_interview - cannot auto-advance, employer must configure
          console.log("[Autopilot Auto-Advance] First step is voice_interview - requires employer configuration");
          return;
        }
      }
    } else if (currentPhase === "quiz") {
      if (workflowSteps.length > 0) {
        // SAFETY GATE: Never auto-advance to voice_interview - employer must configure it
        const firstNonVoiceStep = workflowSteps.find((s: WorkflowStep) => s.type !== "voice_interview");
        if (firstNonVoiceStep) {
          nextPhaseId = firstNonVoiceStep.id;
          nextPhaseTitle = firstNonVoiceStep.title;
        } else {
          // All steps are voice_interview - cannot auto-advance, employer must configure
          console.log("[Autopilot Auto-Advance] First step is voice_interview - requires employer configuration");
          return;
        }
      }
    }
    
    if (!nextPhaseId) {
      console.log("[Autopilot Auto-Advance] No next phase found");
      return;
    }
    
    // Perform the advancement
    (async () => {
      try {
        await supabase
          .from("applications")
          .update({
            phase: nextPhaseId,
            status: "reviewing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", application.id);
        
        // Notify candidate
        await supabase.from("notifications").insert({
          user_id: application.candidate_id,
          type: "status_update",
          title: "You've Advanced!",
          message: `Great news! You've been advanced to the ${nextPhaseTitle} phase for ${job.title || "this position"}.`,
          link: `/applications/${application.id}`,
        });
        
        console.log("[Autopilot Auto-Advance] Successfully advanced to", nextPhaseId);
        queryClient.invalidateQueries({ queryKey: ["application", id] });
        toast.success(`Autopilot: Advanced to ${nextPhaseTitle}`);
      } catch (error) {
        console.error("[Autopilot Auto-Advance] Failed:", error);
      }
    })();
  }, [application, id, queryClient]);

  // Build phases from workflow_steps or use defaults
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = application?.jobs?.quiz_questions as any[] | undefined;
    
    if (workflowSteps && workflowSteps.length > 0) {
      // Start with journey_start as the true origin, then application
      const allPhases: { id: string; title: string; fullTitle: string; icon: any; type: string }[] = [
        { id: "journey_start", title: "Start", fullTitle: "Start", icon: Flag, type: "journey_start" },
        { id: "application", title: "Application", fullTitle: "Application", icon: FileCheck, type: "application" },
      ];
      
      // Add Quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({
          id: "quiz",
          title: "Quiz",
          fullTitle: "Quiz Assessment",
          icon: ClipboardList,
          type: "quiz",
        });
      }
      
      // Extract voice_interview step (goes after Review)
      const voiceInterviewStep = workflowSteps.find(s => s.type === 'voice_interview');
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter(s => s.type !== 'voice_interview').forEach(step => {
        allPhases.push({
          id: step.id,
          title: step.title.length > 12 ? step.title.substring(0, 10) + "..." : step.title,
          fullTitle: step.title,
          icon: stepTypeIcons[step.type] || ClipboardList,
          type: step.type,
        });
      });
      
      // No explicit Review phase - employer approves/rejects right before Ava Interview or Interview
      
      // Add Ava Interview AFTER review if it exists in workflow
      if (voiceInterviewStep) {
        allPhases.push({
          id: voiceInterviewStep.id,
          title: "Ava Interview",
          fullTitle: "Ava Interview",
          icon: stepTypeIcons.voice_interview || Users,
          type: "voice_interview",
        });
      }
      
      allPhases.push(
        { id: "interview", title: "Interview", fullTitle: "Interview", icon: Users, type: "interview" },
        { id: "hired", title: "Hired", fullTitle: "Hired", icon: CheckCircle, type: "hired" }
      );
      return allPhases;
    }
    // Default phases with journey_start
    return [
      { id: "journey_start", title: "Start", icon: Flag, type: "journey_start" },
      ...defaultPhases
    ];
  })();

  // Parse submitted data from notes (used for phase completion + analysis gating)
  // Uses safe parser that handles string, object, or null and never loses data
  const parsedNotes = useMemo(() => {
    return parseApplicationNotes(application?.notes);
  }, [application?.notes]);
  
  // Helper to check if a phase was skipped by employer (checks both id and type)
  const isPhaseSkipped = useCallback((phase: { id: string; type: string }) => {
    return checkPhaseSkipped(parsedNotes, phase.id, phase.type);
  }, [parsedNotes]);

  // Check if candidate has completed the current phase (awaiting employer review)
  const hasCompletedCurrentPhase = (phaseId: string, phaseType: string): boolean => {
    // Journey start is always "complete" - it's just the starting point
    if (phaseType === "journey_start") {
      return true;
    }
    if (phaseType === "application") {
      return !!(application?.cover_letter || parsedNotes.applicationAnswers?.length > 0);
    }
    if (phaseType === "quiz") {
      // QuizPhase saves to parsedNotes[stepId] with type: "quiz" and answers array
      // Also check parsedNotes.quizResult for the summary
      const stepData = parsedNotes[phaseId];
      const hasQuizData = stepData?.type === "quiz" && stepData?.answers;
      const hasQuizResult = !!parsedNotes.quizResult;
      // Legacy fallback
      const hasLegacyQuizAnswers = !!(parsedNotes.quizAnswers?.[phaseId] || parsedNotes.quizAnswers);
      return hasQuizData || hasQuizResult || hasLegacyQuizAnswers;
    }
    if (phaseType === "typing_test") {
      return !!parsedNotes.typingTestResult;
    }
    if (phaseType === "video_intro" || phaseType === "video_message") {
      // Check both legacy videoIntroUrl and stepId-based storage
      const stepData = parsedNotes[phaseId];
      return !!parsedNotes.videoIntroUrl || !!(stepData?.videoUrl || stepData?.completed);
    }
    if (phaseType === "portfolio_upload") {
      const stepData = parsedNotes[phaseId];
      return !!(stepData?.completed || stepData?.portfolioUrls?.length > 0);
    }
    if (phaseType === "chat_simulation") {
      return !!parsedNotes.chatSimulationResult;
    }
    if (phaseType === "chat_interview") {
      return !!parsedNotes.chatInterviewResult;
    }
    if (phaseType === "sales_simulation") {
      return !!parsedNotes.salesSimulationResult;
    }
    if (phaseType === "voice_interview") {
      return !!application?.voice_interview_result;
    }
    // Review, Interview, Hired are employer-controlled - no candidate submission
    return false;
  };

  // Find current phase index with fuzzy matching to handle spaces/underscores
  const normalizePhase = (str: string | null | undefined) => str?.toLowerCase().replace(/[\s-]/g, '_') || '';

  const currentPhaseIndex = phases.findIndex((p) => {
    const appPhase = application?.phase;
    if (!appPhase) return false;

    const normalizedAppPhase = normalizePhase(appPhase);
    return (
      p.id === appPhase ||
      p.type === appPhase ||
      normalizePhase(p.type) === normalizedAppPhase ||
      normalizePhase(p.id) === normalizedAppPhase
    );
  });

  // Backward-compat: some older flows store phase as "review" even though we don't render an explicit Review node.
  // In that case, anchor the slider to the latest *candidate-completed* phase so it doesn't snap back to Start.
  const fallbackPhaseIndex = useMemo(() => {
    if (currentPhaseIndex >= 0) return null;
    if (normalizePhase(application?.phase) !== 'review') return null;

    let lastCompleted = 0;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      // Stop before employer-controlled phases
      if (p.type === 'interview' || p.type === 'hired') break;
      if (hasCompletedCurrentPhase(p.id, p.type)) lastCompleted = i;
    }
    return lastCompleted;
  }, [application?.phase, currentPhaseIndex, phases, parsedNotes, application?.cover_letter, application?.voice_interview_result]);

  const effectivePhaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : (fallbackPhaseIndex ?? 0);

  // Keep ref updated for callbacks
  useEffect(() => {
    applicationRef.current = application || null;
  }, [application]);

  // Check if there's valid application data to analyze
  // This is true if: applicationAnswers exist OR resume_url exists
  const hasValidApplicationData = useMemo(() => {
    const hasApplicationAnswers = parsedNotes.applicationAnswers?.length > 0;
    const hasResume = !!application?.resume_url;
    return hasApplicationAnswers || hasResume;
  }, [parsedNotes, application?.resume_url]);

  // Extract applicant display name from application answers (prioritize Full Name)
  const applicantDisplayName = (() => {
    if (parsedNotes.applicationAnswers?.length > 0) {
      const fullNameAnswer = parsedNotes.applicationAnswers.find(
        (a: { question: string; answer: string }) =>
          a.question.toLowerCase().includes("full name") ||
          a.question.toLowerCase() === "name"
      );
      if (fullNameAnswer?.answer) return fullNameAnswer.answer;
    }
    return application?.profiles?.full_name || application?.profiles?.email || "Unknown Candidate";
  })();

  // Check if currently in manual mode (not autopilot)
  const isManualMode = application?.jobs?.processing_mode !== "auto";

  // Calculate slider position based on phase (read-only display)
  useEffect(() => {
    // Skip if a phase change is in progress (wait for query invalidation to complete)
    if (isPhaseChangeInProgressRef.current) {
      console.log('[Slider Position] Skipping - phase change in progress');
      return;
    }
    
    if (sliderRef.current) {
      const currentPhase = phases[effectivePhaseIndex];
      const nextPhase = phases[effectivePhaseIndex + 1];
      const isComplete = currentPhase ? hasCompletedCurrentPhase(currentPhase.id, currentPhase.type) : false;
      const isLastPhase = effectivePhaseIndex === phases.length - 1;
      
      // Show halfway position after Ava Interview completes in Autopilot mode
      const isVoiceInterviewCompleted = 
        currentPhase?.type === "voice_interview" && 
        !!application?.voice_interview_result;
      
      // In Manual mode: show halfway when current phase is complete (awaiting employer action)
      // In Autopilot: only show halfway after Ava Interview completes (before employer-driven phases)
      const nextIsEmployerPhase = nextPhase?.type === "voice_interview" || nextPhase?.type === "interview" || nextPhase?.type === "hired";
      
      // Await review (halfway) logic:
      // - In Manual mode: ALWAYS show halfway when current phase is complete (employer reviews every phase)
      // - In Autopilot: only show halfway after Ava Interview completes or before employer-driven phases
      const awaitingReview = isComplete && !isLastPhase && 
        (isManualMode ? true : (isVoiceInterviewCompleted || nextIsEmployerPhase));
      
      setIsAwaitingReview(awaitingReview);
      
      // Add 0.5 offset if awaiting review (halfway to next phase)
      const adjustedPosition = awaitingReview 
        ? effectivePhaseIndex + 0.5 
        : effectivePhaseIndex;
      
      const percentage = (adjustedPosition / (phases.length - 1)) * 100;
      setSliderPosition(percentage);
    }
  }, [effectivePhaseIndex, phases.length, parsedNotes, application, isManualMode]);

  // Handler for advancing to next phase via button (replaces drag)
  const handleAdvanceToNextPhase = async () => {
    if (!application || effectivePhaseIndex >= phases.length - 1) return;
    
    const nextIndex = effectivePhaseIndex + 1;
    const nextPhase = phases[nextIndex];
    
    // Handle special phase types that need dialogs
    if (nextPhase.type === "voice_interview") {
      setPendingAvaInterview({ newIndex: nextIndex, newPhase: nextPhase });
      setShowAvaInterviewConfig(true);
      return;
    }
    
    if (nextPhase.type === "interview") {
      setPendingInterview({ newIndex: nextIndex, newPhase: nextPhase });
      setShowInterviewWizard(true);
      return;
    }
    
    await executePhaseChange(nextIndex, nextPhase, false);
  };
  
  // Handler for skipping to a specific future phase
  const handleSkipToPhase = async (targetIndex: number) => {
    if (!application || targetIndex <= effectivePhaseIndex || targetIndex >= phases.length) return;
    
    const targetPhase = phases[targetIndex];
    
    // Handle special phase types that need dialogs
    if (targetPhase.type === "voice_interview") {
      setPendingAvaInterview({ newIndex: targetIndex, newPhase: targetPhase });
      setShowAvaInterviewConfig(true);
      return;
    }
    
    if (targetPhase.type === "interview") {
      setPendingInterview({ newIndex: targetIndex, newPhase: targetPhase });
      setShowInterviewWizard(true);
      return;
    }
    
    await executePhaseChange(targetIndex, targetPhase, false);
  };

  const executePhaseChange = async (
    newIndex: number,
    newPhase: { id: string; title: string; type: string },
    isBackward: boolean
  ) => {
    if (!application) return;
    
    // Set flag to prevent useEffect from overriding slider position
    isPhaseChangeInProgressRef.current = true;
    
    try {
      const currentIndex = effectivePhaseIndex;
      let updatedNotes = { ...parsedNotes };
      
      if (isBackward) {
        // Moving backward - clear data for reset phases
        const phasesToReset = phases.slice(newIndex, currentIndex + 1);
        
        phasesToReset.forEach((phase) => {
          // ALWAYS delete step ID data (e.g., notes.step1, notes.step_xxx)
          delete updatedNotes[phase.id];
          
          // Clear specific phase data based on type
          if (phase.type === "typing_test") {
            delete updatedNotes.typingTestResult;
          }
          if (phase.type === "chat_simulation") {
            delete updatedNotes.chatSimulationResult;
          }
          if (phase.type === "chat_interview") {
            delete updatedNotes.chatInterviewResult;
          }
          if (phase.type === "sales_simulation") {
            delete updatedNotes.salesSimulationResult;
          }
          if (phase.type === "quiz") {
            // Delete all possible quiz data formats
            delete updatedNotes.quiz;
            delete updatedNotes.quizResult;
            if (updatedNotes.quizAnswers) {
              delete updatedNotes.quizAnswers[phase.id];
              delete updatedNotes.quizAnswers['quiz'];
              // Clean up empty quizAnswers object
              if (Object.keys(updatedNotes.quizAnswers).length === 0) {
                delete updatedNotes.quizAnswers;
              }
            }
          }
          if (phase.type === "video_intro" || phase.type === "video_message") {
            delete updatedNotes.videoIntroUrl;
            delete updatedNotes.videoIntroResult;
            // Also delete stepId-based storage for video_message
            delete updatedNotes[phase.id];
          }
          if (phase.type === "portfolio_upload") {
            delete updatedNotes[phase.id];
            delete updatedNotes.portfolioResult; // Also clear the global portfolioResult key
          }
          // Remove from employer-skipped list if it was there
          if (updatedNotes.employerSkippedPhases) {
            updatedNotes.employerSkippedPhases = updatedNotes.employerSkippedPhases.filter(
              (id: string) => id !== phase.id
            );
            if (updatedNotes.employerSkippedPhases.length === 0) {
              delete updatedNotes.employerSkippedPhases;
            }
          }
        });
        
        // Clear skipped status for ALL phases at or after the reset destination
        // This ensures any phase the candidate will pass through again is no longer marked as skipped
        if (updatedNotes.employerSkippedPhases) {
          const phasesAtOrAfterDestination = phases.slice(newIndex).map(p => p.id);
          updatedNotes.employerSkippedPhases = updatedNotes.employerSkippedPhases.filter(
            (id: string) => !phasesAtOrAfterDestination.includes(id)
          );
          if (updatedNotes.employerSkippedPhases.length === 0) {
            delete updatedNotes.employerSkippedPhases;
          }
        }
        
        // Determine if we're resetting to application or start phase (clear ai_score, resume, and application answers)
        const isResetToApplication = newPhase.type === "journey_start" || newPhase.type === "application" || newPhase.id === "application";
        
        // Check if any voice_interview phases are being reset
        const isResettingVoiceInterview = phasesToReset.some((p: any) => p.type === "voice_interview");
        
        // If resetting to application or start, also clear the application answers so candidate can re-submit
        if (isResetToApplication) {
          delete updatedNotes.applicationAnswers;
        }
        
        await updateApplication.mutateAsync({
          id: application.id,
          phase: newPhase.id,
          notes: JSON.stringify(updatedNotes),
          phase_ai_analysis: null, // Clear phase analysis when resetting
          ai_analysis: null, // Clear AI analysis so it can be re-run with remaining data
          ai_score: null, // Always clear AI score when resetting phases
          resume_url: isResetToApplication ? null : application.resume_url, // Clear resume if resetting to application
          cover_letter: isResetToApplication ? null : application.cover_letter, // Clear cover letter if resetting to application
          voice_interview_result: isResettingVoiceInterview ? null : application.voice_interview_result,
          voice_interview_recording_url: isResettingVoiceInterview ? null : application.voice_interview_recording_url,
          status: newPhase.type === "interview" ? "interview" : 
                  newPhase.type === "hired" ? "hired" : 
                  "reviewing",
        });
        
        toast.success(`Reset to ${newPhase.title} phase. Candidate can redo cleared phases.`);
      } else {
        // Moving forward - track skipped phases (include origin if no data, plus all phases between)
        const originPhase = phases[currentIndex];
        const originHasData = hasCompletedCurrentPhase(originPhase.id, originPhase.type);
        
        // Phases between origin and destination (excludes both endpoints and review phases)
        let skippedPhaseIds = phases.slice(currentIndex + 1, newIndex)
          .filter(p => p.type !== "review")
          .map((p) => p.id);
        
        // If origin phase has no data (was reset/not completed), also mark it as skipped
        // Exception: Don't mark 'journey_start' or 'review' as skipped
        if (!originHasData && originPhase.type !== "journey_start" && originPhase.type !== "review") {
          skippedPhaseIds = [originPhase.id, ...skippedPhaseIds];
        }
        
        if (skippedPhaseIds.length > 0) {
          updatedNotes.employerSkippedPhases = [
            ...(updatedNotes.employerSkippedPhases || []),
            ...skippedPhaseIds,
          ];
        }
        
        await updateApplication.mutateAsync({
          id: application.id,
          phase: newPhase.id,
          notes: JSON.stringify(updatedNotes),
          status: newPhase.type === "interview" ? "interview" : 
                  newPhase.type === "hired" ? "hired" : 
                  application.status,
        });
        
        toast.success(`Advanced to ${newPhase.title} phase`);
        
        // Show hiring document prompt when moving to hired phase
        if (newPhase.type === "hired") {
          setShowHiringDocumentPrompt(true);
        }
      }
      
      // Wait for query invalidation to complete before allowing useEffect to update slider
      await queryClient.invalidateQueries({ queryKey: ["application", id] });
    } catch (error) {
      toast.error("Failed to update phase");
    } finally {
      // Reset flag after query invalidation completes
      isPhaseChangeInProgressRef.current = false;
    }
  };

  // Handle Schedule Interview button click - skips to Interview phase
  const handleScheduleInterviewClick = async () => {
    if (!application) return;
    
    // Find the interview phase
    const interviewPhaseIndex = phases.findIndex(p => p.type === "interview");
    if (interviewPhaseIndex === -1) {
      toast.error("No interview phase found in workflow");
      return;
    }
    
    const interviewPhase = phases[interviewPhaseIndex];
    
    // If already at interview phase, just open the wizard
    if (effectivePhaseIndex === interviewPhaseIndex) {
      setShowInterviewWizard(true);
      return;
    }
    
    try {
      // Track skipped phases (include origin if no data, plus phases in between)
      let updatedNotes = { ...parsedNotes };
      const originPhase = phases[effectivePhaseIndex];
      const originHasData = hasCompletedCurrentPhase(originPhase.id, originPhase.type);
      
      // Phases between origin and destination (excludes review phases)
      let skippedPhaseIds = phases.slice(effectivePhaseIndex + 1, interviewPhaseIndex)
        .filter(p => p.type !== "review")
        .map(p => p.id);
      
      // If origin phase has no data, also mark it as skipped
      // Exception: Don't mark 'journey_start' or 'review' as skipped
      if (!originHasData && originPhase.type !== "journey_start" && originPhase.type !== "review") {
        skippedPhaseIds = [originPhase.id, ...skippedPhaseIds];
      }
      
      if (skippedPhaseIds.length > 0) {
        updatedNotes.employerSkippedPhases = [
          ...(updatedNotes.employerSkippedPhases || []),
          ...skippedPhaseIds,
        ];
      }
      
      // Update application: phase, status, and notes
      await updateApplication.mutateAsync({
        id: application.id,
        phase: interviewPhase.id,
        status: "interview",
        notes: JSON.stringify(updatedNotes),
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      
      toast.success("Advanced to Interview phase");
      
      // Open the wizard
      setShowInterviewWizard(true);
    } catch (error) {
      toast.error("Failed to advance to interview phase");
    }
  };

  // Allow Redo functionality removed - employers should reject candidates who need to restart

  const handleReject = async () => {
    if (!application || !user) return;
    try {
      // Trigger animation FIRST
      setShowRejectAnimation(true);
      
      // Close the confirmation dialog
      setShowRejectConfirmation(false);
      
      // Determine rejection type: team member vs regular employer
      const rejectedByType = permissions?.isTeamMember ? 'team_member' : 'user';
      
      // DELETE all interviews for this application first
      const { error: interviewError } = await supabase
        .from("interviews")
        .delete()
        .eq("application_id", application.id);
      
      if (interviewError) {
        console.error("Failed to delete interviews:", interviewError);
      }
      
      // Update database in background with rejection attribution
      await updateApplication.mutateAsync({ 
        id: application.id, 
        status: "rejected",
        rejected_by: user.id,
        rejected_by_type: rejectedByType,
      });
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["interviews", "all-scheduled", id] });
      queryClient.invalidateQueries({ queryKey: ["interview", "application", id] });
      
      // Create notification for candidate so they get a real-time pop-up
      await supabase.from("notifications").insert({
        user_id: application.candidate_id,
        type: "status_update" as const,
        title: "Application Update",
        message: `Your application for ${application.jobs?.title || "this position"} has been reviewed.`,
        link: `/applications/${application.id}`,
      });
      
      // No navigation - animation handles feedback
    } catch (error) {
      setShowRejectAnimation(false);
      toast.error("Failed to reject candidate");
    }
  };

  const handleHire = async () => {
    if (!application || !user) return;
    try {
      // Close the confirmation dialog
      setShowHireConfirmation(false);
      
      // Find the hired phase
      const hiredPhaseIndex = phases.findIndex(p => p.type === "hired");
      const hiredPhase = phases[hiredPhaseIndex];
      
      // Track skipped phases between current phase and hired
      let updatedNotes = { ...parsedNotes };
      const skippedPhaseIds = phases.slice(effectivePhaseIndex + 1, hiredPhaseIndex)
        .filter(p => p.type !== "review" && p.type !== "journey_start")
        .map(p => p.id);
      
      if (skippedPhaseIds.length > 0) {
        updatedNotes.employerSkippedPhases = [
          ...(updatedNotes.employerSkippedPhases || []),
          ...skippedPhaseIds.filter(id => !updatedNotes.employerSkippedPhases?.includes(id)),
        ];
      }
      
      // DELETE all interviews for this application (cleanup)
      const { error: interviewError } = await supabase
        .from("interviews")
        .delete()
        .eq("application_id", application.id);
      
      if (interviewError) {
        console.error("Failed to delete interviews:", interviewError);
      }
      
      // Update application to hired status
      await updateApplication.mutateAsync({
        id: application.id,
        phase: hiredPhase?.id || "hired",
        status: "hired",
        notes: JSON.stringify(updatedNotes),
      });
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["interviews", "all-scheduled", id] });
      queryClient.invalidateQueries({ queryKey: ["interview", "application", id] });
      
      // Create notification for candidate
      await supabase.from("notifications").insert({
        user_id: application.candidate_id,
        type: "status_update" as const,
        title: "Congratulations! You're Hired!",
        message: `Great news! You've been hired for ${application.jobs?.title || "this position"}!`,
        link: `/applications/${application.id}`,
      });
      
      toast.success("Candidate hired successfully!");
      
      // Show document prompt for sending offer letter
      setShowHiringDocumentPrompt(true);
    } catch (error) {
      toast.error("Failed to hire candidate");
    }
  };

  // Calculate the first incomplete phase for smart restoration
  const calculateRestorePhase = () => {
    // Skip "journey_start" (index 0) - it's just the start marker
    for (let i = 1; i < phases.length; i++) {
      const phase = phases[i];
      
      // Stop at employer-driven phases - these are valid restore points
      if (phase.type === "voice_interview" || phase.type === "interview" || phase.type === "hired") {
        return { phaseId: phase.id, phaseName: phase.title, phaseIndex: i };
      }
      
      // Check if this candidate-facing phase has data using hasCompletedCurrentPhase
      const isComplete = hasCompletedCurrentPhase(phase.id, phase.type);
      
      // If this phase is not complete, restore here
      if (!isComplete) {
        return { phaseId: phase.id, phaseName: phase.title, phaseIndex: i };
      }
    }
    
    // Fallback to voice_interview or interview if everything is complete
    const voiceInterviewPhase = phases.find(p => p.type === "voice_interview");
    const interviewPhase = phases.find(p => p.type === "interview");
    const fallbackPhase = voiceInterviewPhase || interviewPhase;
    return { 
      phaseId: fallbackPhase?.id || "interview", 
      phaseName: fallbackPhase?.title || "Interview",
      phaseIndex: phases.findIndex(p => p.id === fallbackPhase?.id) || phases.findIndex(p => p.type === "interview")
    };
  };
  
  const handleReconsider = async () => {
    if (!application) return;
    
    // Set flag to prevent useEffect from overriding slider position during reconsideration
    isPhaseChangeInProgressRef.current = true;
    
    try {
      console.log('[handleReconsider] Starting reconsideration for application:', application.id);
      
      // Cancel any scheduled interviews
      if (scheduledInterview) {
        await supabase
          .from("interviews")
          .update({ status: "cancelled" })
          .eq("id", scheduledInterview.id);
      }
      
      // Also cancel any other scheduled interviews for this application
      if (allScheduledInterviews && allScheduledInterviews.length > 0) {
        await supabase
          .from("interviews")
          .update({ status: "cancelled" })
          .eq("application_id", application.id)
          .eq("status", "scheduled");
      }
      
      // Complete reset - start from scratch
      // Find the first candidate-facing phase (after journey_start)
      const firstPhase = phases.find((p, i) => i > 0 && p.type !== "journey_start") || phases[1];
      const targetPhaseId = firstPhase?.id || "application";
      const targetPhaseIndex = phases.findIndex(p => p.id === targetPhaseId);
      
      console.log('[handleReconsider] Resetting to phase:', targetPhaseId, 'at index:', targetPhaseIndex);
      
      // Clear notes and ALL application data for a true fresh start
      const result = await updateApplication.mutateAsync({ 
        id: application.id, 
        status: "pending",
        phase: targetPhaseId,
        ai_score: null,
        ai_analysis: null,
        phase_ai_analysis: null,
        notes: JSON.stringify({}),  // Clear ALL phase data (quiz, typing test, application answers, etc.)
        voice_interview_result: null,
        voice_interview_transcript: null,
        voice_interview_recording_url: null,
        voice_interview_duration: null,
        voice_interview_language: null,
        voice_interview_language_rule: null,
        voice_interview_video_enabled: null,
        rejected_by: null,
        rejected_by_type: null,
        // Clear resume and cover letter to prevent auto-analysis from re-triggering
        cover_letter: null,
        resume_url: null,
        resume_score: null,
      });
      
      console.log('[handleReconsider] Mutation result:', result);
      console.log('[handleReconsider] Updated notes value:', result?.notes);
      
      // Slider position will update automatically via the useEffect
      
      // Create notification for candidate about fresh start
      await supabase.from("notifications").insert({
        user_id: application.candidate_id,
        type: "status_update",
        title: "You've Been Given a Second Chance!",
        message: `Great news! The employer has decided to give you another opportunity for ${job?.title || "this position"}. You can now restart your application from the beginning.`,
        link: `/applications/${application.id}`,
      });
      
      // Wait for query invalidation to complete
      await queryClient.invalidateQueries({ queryKey: ["application", id] });
      
      setShowReconsiderConfirmation(false);
      toast.success("Candidate reset to beginning - they can now reapply");
    } catch (error) {
      console.error("[handleReconsider] Failed to reset candidate:", error);
      toast.error("Failed to reset candidate application");
    } finally {
      // Reset flag after query invalidation completes
      isPhaseChangeInProgressRef.current = false;
    }
  };

  const handleReanalyze = async () => {
    if (!application) return;
    
    // Guard: Don't run analysis if application data was reset
    const hasApplicationAnswers = parsedNotes.applicationAnswers?.length > 0;
    const hasResume = !!application.resume_url;
    
    if (!hasApplicationAnswers && !hasResume) {
      toast.error("No application data to analyze. The candidate must resubmit the application first.");
      return;
    }
    
    setIsAnalyzing(true);
    
    try {
      console.log("[handleReanalyze] Calling trigger-ava-analysis backend function for application:", application.id);
      
      // Call the backend function which computes the weighted overall score
      // This ensures ai_score is calculated consistently (resume + quiz + voice + portfolio weights)
      const { data, error } = await supabase.functions.invoke("trigger-ava-analysis", {
        body: {
          applicationId: application.id,
          force: true, // Force re-analysis even if score exists
        },
      });

      if (error) throw error;

      console.log("[handleReanalyze] Backend analysis complete:", data);

      // Invalidate and refetch to get the updated score from the database
      await queryClient.invalidateQueries({ queryKey: ["application", id] });
      
      toast.success("Ava analysis completed!");
    } catch (error) {
      console.error("Ava analysis error:", error);
      toast.error("Failed to run Ava analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };


  // Update the ref so the AVA event listener can access it
  useEffect(() => {
    handleReanalyzeRef.current = handleReanalyze;
  });

  // Helper to get resume URL from either resume_url field or application answers
  // Moved BEFORE early returns to maintain hooks order
  const resumeUrl = useMemo((): string | null => {
    if (!application) return null;
    // First check the direct resume_url field
    if (application.resume_url) {
      return application.resume_url;
    }
    
    // Check application answers for uploaded resume
    if (parsedNotes.applicationAnswers && Array.isArray(parsedNotes.applicationAnswers)) {
      const resumeAnswer = parsedNotes.applicationAnswers.find(
        (item: { question: string; answer: string }) => 
          item.question?.toLowerCase().includes('resume') && 
          item.answer?.startsWith('http')
      );
      if (resumeAnswer?.answer) {
        return resumeAnswer.answer;
      }
    }
    
    return null;
  }, [application, parsedNotes]);

  // Build badge data from workflow steps
  // Moved BEFORE early returns to maintain hooks order
  const workflowBadges = useMemo(() => {
    if (!application) return [];
    
    const job = application.jobs;
    const workflowSteps = job?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = job?.quiz_questions as any[] | undefined;
    const badges: { id: string; title: string; type: string; hasData: boolean; isSkipped: boolean; score?: number; icon: any }[] = [];
    
    // Helper to get step submission data (inlined to avoid dependency issues)
    const getStepData = (stepId: string, stepType: string) => {
      if (stepType === "quiz") {
        return parsedNotes.quizAnswers?.[stepId] || parsedNotes.quizAnswers;
      }
      if (stepType === "typing_test") {
        return parsedNotes.typingTestResult;
      }
      if (stepType === "video_intro" || stepType === "video_message") {
        if (parsedNotes[stepId]) {
          return parsedNotes[stepId];
        }
        return parsedNotes.videoIntroUrl;
      }
      if (stepType === "portfolio_upload") {
        return parsedNotes[stepId];
      }
      if (stepType === "chat_simulation") {
        if (parsedNotes[stepId]) {
          return parsedNotes[stepId];
        }
        return parsedNotes.chatSimulationResult;
      }
      if (stepType === "chat_interview") {
        if (parsedNotes[stepId]) {
          return parsedNotes[stepId];
        }
        return parsedNotes.chatInterviewResult;
      }
      if (stepType === "sales_simulation") {
        if (parsedNotes[stepId]) {
          return parsedNotes[stepId];
        }
        return parsedNotes.salesSimulationResult;
      }
      if (stepType === "voice_interview") {
        const result = application?.voice_interview_result as Record<string, unknown> | null;
        if (result) {
          return { ...result, score: result.overall_score ?? result.score };
        }
        return result;
      }
      return parsedNotes[stepId];
    };
    
    // Application badge (always present)
    const hasApplicationData = !!(application.cover_letter || parsedNotes.applicationAnswers?.length > 0);
    const isApplicationSkipped = isPhaseSkipped({ id: "application", type: "application" }) && !hasApplicationData;
    badges.push({
      id: "application",
      title: "Application",
      type: "application",
      hasData: hasApplicationData,
      isSkipped: isApplicationSkipped,
      icon: FileCheck,
    });

    // Resume badge (if resume uploaded or required)
    // Resume is also skipped if Application is skipped (since resume is part of application)
    if (job?.require_resume !== false || resumeUrl) {
      const hasResumeData = !!resumeUrl;
      const isResumeSkipped = isPhaseSkipped({ id: "resume", type: "resume" }) && !hasResumeData;
      badges.push({
        id: "resume",
        title: "Resume",
        type: "resume",
        hasData: hasResumeData,
        isSkipped: isResumeSkipped || isApplicationSkipped,
        // Only show resume score if it was actually analyzed (score > 0 means it was processed)
        score: resumeUrl && (application as any).resume_score != null && (application as any).resume_score > 0 
          ? (application as any).resume_score 
          : undefined,
        icon: FileText,
      });
    }

    // Quiz badge (if quiz_questions exist)
    if (quizQuestions && quizQuestions.length > 0) {
      const quizData = parsedNotes.quiz || parsedNotes.quizResult || parsedNotes.quizAnswers;
      const hasQuizData = !!quizData;
      badges.push({
        id: "quiz",
        title: "Quiz",
        type: "quiz",
        hasData: hasQuizData,
        isSkipped: isPhaseSkipped({ id: "quiz", type: "quiz" }) && !hasQuizData,
        score: quizData?.score,
        icon: ClipboardList,
      });
    }

    // Workflow step badges
    if (workflowSteps && workflowSteps.length > 0) {
      workflowSteps.forEach(step => {
        const stepData = getStepData(step.id, step.type);
        const hasStepData = !!stepData;
        badges.push({
          id: step.id,
          title: step.title.length > 15 ? step.title.substring(0, 12) + "..." : step.title,
          type: step.type,
          hasData: hasStepData,
          isSkipped: isPhaseSkipped({ id: step.id, type: step.type }) && !hasStepData,
          score: stepData?.score,
          icon: stepTypeIcons[step.type] || ClipboardList,
        });
      });
    }
    
    return badges;
  }, [application, parsedNotes, resumeUrl, isPhaseSkipped]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
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
            <Button onClick={() => navigate("/applicants")} className="mt-4">
              Back to Applicants
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = application.profiles;
  const job = application.jobs;
  const isAutoPilot = job?.processing_mode === "auto";
  const passingScore = job?.passing_score || 60;
  const isRejected = application.status === "rejected";
  const isHired = application.status === "hired";
  
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || "?";

  // Check which workflow steps have data submitted
  const getStepSubmissionData = (stepId: string, stepType: string) => {
    // Check for specific data types
    if (stepType === "quiz") {
      return parsedNotes.quizAnswers?.[stepId] || parsedNotes.quizAnswers;
    }
    if (stepType === "typing_test") {
      return parsedNotes.typingTestResult;
    }
    if (stepType === "video_intro" || stepType === "video_message") {
      // Check stepId first (new format with object), then legacy videoIntroUrl (just URL string)
      if (parsedNotes[stepId]) {
        return parsedNotes[stepId];
      }
      return parsedNotes.videoIntroUrl;
    }
    if (stepType === "portfolio_upload") {
      return parsedNotes[stepId];
    }
    if (stepType === "chat_simulation") {
      // First try stepId which contains full data including messages
      if (parsedNotes[stepId]) {
        return parsedNotes[stepId];
      }
      // Fallback to chatSimulationResult for older data
      return parsedNotes.chatSimulationResult;
    }
    if (stepType === "chat_interview") {
      // First try stepId which contains full data including messages
      if (parsedNotes[stepId]) {
        return parsedNotes[stepId];
      }
      return parsedNotes.chatInterviewResult;
    }
    if (stepType === "sales_simulation") {
      // First try stepId which contains full data including messages
      if (parsedNotes[stepId]) {
        return parsedNotes[stepId];
      }
      return parsedNotes.salesSimulationResult;
    }
    if (stepType === "voice_interview") {
      return application?.voice_interview_result;
    }
    return parsedNotes[stepId];
  };

  // Standardized display titles for phase types - function to handle dynamic video/voice text
  const getTypeDisplayTitle = (type: string): string => {
    const titles: Record<string, string> = {
      video_intro: "Video Intro",
      video_message: "Video Intro",
      typing_test: "Typing Test",
      chat_simulation: "Chat Simulation",
      chat_interview: "Interview",
      sales_simulation: "Sales Simulation",
      portfolio_upload: "Portfolio",
      quiz: "Quiz",
      voice_interview: application?.voice_interview_video_enabled !== false 
        ? "Video Interview with Ava" 
        : "Voice Interview with Ava",
    };
    return titles[type] || type;
  };

  // Get data for a specific badge/step
  const getBadgeDialogContent = (badgeId: string, badgeType: string) => {
    if (badgeId === "application") {
      return {
        title: "Application Submission",
        content: parsedNotes.applicationAnswers || [],
        type: "application",
      };
    }
    if (badgeId === "resume") {
      return {
        title: "Resume",
        content: resumeUrl,
        type: "resume",
      };
    }
    if (badgeId === "quiz") {
      const quizData = parsedNotes.quiz || parsedNotes.quizResult || parsedNotes.quizAnswers;
      return {
        title: "Quiz",
        content: quizData,
        type: "quiz",
      };
    }
    
    const stepData = getStepSubmissionData(badgeId, badgeType);
    // Use standardized display title based on type, fallback to badge title
    const displayTitle = getTypeDisplayTitle(badgeType) || workflowBadges.find(b => b.id === badgeId)?.title || badgeId;
    return {
      title: displayTitle,
      content: stepData,
      type: badgeType,
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/applicants")}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to Applicants</TooltipContent>
        </Tooltip>
        
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => downloadDossier(application?.id ?? null)}
                disabled={isGeneratingDossier}
              >
                {isGeneratingDossier ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download Dossier</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowNotesDialog(true)}
                className="relative"
              >
                <FileText className="h-5 w-5" />
                {application?.employer_notes && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Internal Notes</TooltipContent>
          </Tooltip>
          
          {canMessageCandidates && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setShowMessageDialog(true)}
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Messages</TooltipContent>
            </Tooltip>
          )}
          
          {canScheduleInterviews && (!scheduledInterview || scheduledInterview.status === "cancelled" || scheduledInterview.status === "completed") && (
            <Button 
              onClick={handleScheduleInterviewClick}
              size="sm"
              className="gap-1.5"
            >
              <Calendar className="h-4 w-4" />
              Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Rejected Status Banner */}
      {isRejected && (() => {
        const isAutopilot = job?.processing_mode === "auto";
        const rejectionPhase = application.phase;
        const phaseAnalysis = application.phase_ai_analysis;
        
        // Get human-readable phase name
        const getPhaseDisplayName = (phaseId: string | null) => {
          if (!phaseId) return "Unknown Phase";
          if (phaseId === "application") return "Application Review";
          if (phaseId === "quiz") return "Quiz";
          const phase = phases.find(p => p.id === phaseId);
          return phase?.title || phaseId.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        };
        
        return (
          <Card className="bg-muted/30 border-muted-foreground/20 border-l-4 border-l-muted-foreground/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">
                      {application.rejected_by_type === 'ava' 
                        ? "Candidate Rejected by Ava" 
                        : application.rejected_by_type === 'team_member'
                        ? "Candidate Rejected by Team Member"
                        : "Candidate Rejected"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {application.rejected_by_type === 'ava' && rejectionPhase ? (
                        <>Automatically rejected at the <span className="font-medium text-foreground">{getPhaseDisplayName(rejectionPhase)}</span> phase</>
                      ) : (
                        <>This candidate is no longer being considered for {job?.title || "this position"}.</>
                      )}
                    </p>
                  </div>
                </div>
                {canManagePipeline && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      // Calculate restore phase before showing dialog
                      const restorePhase = calculateRestorePhase();
                      setComputedRestorePhase({ id: restorePhase.phaseId, name: restorePhase.phaseName, index: restorePhase.phaseIndex });
                      setShowReconsiderConfirmation(true);
                    }}
                    className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reconsider
                  </Button>
                )}
              </div>
              
              {/* Autopilot Rejection Reason */}
              {application.rejected_by_type === 'ava' && (
                <div className="bg-background/50 rounded-lg p-3 border border-muted">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Ava's Assessment</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {phaseAnalysis || (
                          application.ai_score !== null && job?.passing_score
                            ? `Score of ${application.ai_score}% did not meet the passing threshold of ${job.passing_score}%.`
                            : "This candidate did not meet the requirements for this position."
                        )}
                      </p>
                      {job?.passing_score && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Passing threshold: <span className="font-medium">{job.passing_score}%</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Autopilot AVA Interview Prompt - Show when candidate is ready for voice interview in autopilot mode */}
      {!isRejected && canManagePipeline && (() => {
        const isAutoPilot = job?.processing_mode === "auto";
        const currentPhase = phases[effectivePhaseIndex];
        const nextPhase = phases[effectivePhaseIndex + 1];
        const isCurrentPhaseComplete = currentPhase ? hasCompletedCurrentPhase(currentPhase.id, currentPhase.type) : false;
        const isAwaitingVoiceInterview = isAutoPilot && isCurrentPhaseComplete && nextPhase?.type === "voice_interview";
        
        if (!isAwaitingVoiceInterview) return null;
        
        return (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-card border-border border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                      <Mic className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-purple-500">Ready for AIVA Interview</h3>
                      <p className="text-sm text-muted-foreground">
                        Candidate has passed all automated assessments. Configure the voice interview to continue.
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => {
                      const nextIndex = effectivePhaseIndex + 1;
                      const nextPhaseData = phases[nextIndex];
                      setPendingAvaInterview({ newIndex: nextIndex, newPhase: nextPhaseData });
                      setShowAvaInterviewConfig(true);
                    }} 
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    <Mic className="h-4 w-4" />
                    Configure Interview
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })()}

      {/* Autopilot auto-advance is handled by useEffect - no manual button needed */}

      {/* Scheduled Interview Card */}
      {scheduledInterview && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Left side: Icon + Info */}
              <div className="flex items-start md:items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">Interview Scheduled</span>
                    {/* Hide status badge on mobile since title already implies it */}
                    <Badge 
                      variant="secondary"
                      className={`hidden md:inline-flex ${
                        scheduledInterview.status === "scheduled" ? "bg-primary/20 text-primary" :
                        scheduledInterview.status === "completed" ? "bg-success/20 text-success" :
                        scheduledInterview.status === "cancelled" ? "bg-destructive/20 text-destructive" :
                        "bg-muted"
                      }`}
                    >
                      {scheduledInterview.status}
                    </Badge>
                    {/* Candidate Response Status */}
                    {scheduledInterview.status === "scheduled" && (
                      <Badge 
                        variant="outline"
                        className={
                          (scheduledInterview as any).candidate_response === "confirmed" 
                            ? "bg-success/10 text-success border-success/30" :
                          (scheduledInterview as any).candidate_response === "reschedule_requested" 
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
                          "bg-muted/50 text-muted-foreground border-muted"
                        }
                      >
                        {(scheduledInterview as any).candidate_response === "confirmed" 
                          ? "✓ Confirmed" :
                         (scheduledInterview as any).candidate_response === "reschedule_requested" 
                          ? "Reschedule Requested" :
                         "Awaiting Response"}
                      </Badge>
                    )}
                  </div>
                  {/* Compact date/time info */}
                  <div className="text-sm text-muted-foreground mt-1">
                    <span className="hidden md:inline">
                      {format(new Date(scheduledInterview.scheduled_at), "MMM d, yyyy")} • {format(new Date(scheduledInterview.scheduled_at), "h:mm a")}
                    </span>
                    <span className="md:hidden">
                      {format(new Date(scheduledInterview.scheduled_at), "MMM d")} • {format(new Date(scheduledInterview.scheduled_at), "h:mm a")}
                    </span>
                    {scheduledInterview.duration_minutes && (
                      <span> • {scheduledInterview.duration_minutes}min</span>
                    )}
                    <span> • {scheduledInterview.interview_type || "Video"}</span>
                  </div>
                </div>
              </div>
              
              {/* Right side: Actions - wrap on mobile */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Review Request Button */}
                {(scheduledInterview as any).candidate_response === "reschedule_requested" && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowRescheduleReviewDialog(true)}
                    className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  >
                    <Clock className="h-4 w-4" />
                    <span className="hidden sm:inline">Review Request</span>
                    <span className="sm:hidden">Review</span>
                  </Button>
                )}
                
                {/* AI Questions Button - Green styling */}
                {scheduledInterview.status === "scheduled" && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowInterviewQuestionsDialog(true)}
                    className="gap-2 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {scheduledInterview.ai_questions?.length 
                        ? `${scheduledInterview.ai_questions.length} Ava Questions` 
                        : "Ava Questions"}
                    </span>
                    <span className="sm:hidden">Ava</span>
                  </Button>
                )}
                
                {scheduledInterview.meeting_link && scheduledInterview.status === "scheduled" && isFuture(new Date(scheduledInterview.scheduled_at)) && (scheduledInterview as any).candidate_response === "confirmed" && (
                  <Button asChild size="sm" className="gap-2">
                    <a href={scheduledInterview.meeting_link} target="_blank" rel="noopener noreferrer">
                      <Video className="h-4 w-4" />
                      <span className="hidden sm:inline">Join Meeting</span>
                      <span className="sm:hidden">Join</span>
                    </a>
                  </Button>
                )}
                
                {scheduledInterview.status === "scheduled" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowRescheduleDialog(true)}>
                        <Calendar className="h-4 w-4 mr-2" />
                        Reschedule
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setShowCancelInterviewConfirm(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <CalendarX className="h-4 w-4 mr-2" />
                        Cancel Interview
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidate Journey - Animated */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
      >
      <Card className={`bg-card border-border overflow-hidden ${isRejected ? 'relative' : ''}`}>
        {/* Rejected Stamp Animation */}
        <RejectedStampAnimation 
          isVisible={showRejectAnimation} 
          onComplete={() => setShowRejectAnimation(false)}
        />
        
        {/* Static Rejected Overlay (after animation completes) */}
        {isRejected && !showRejectAnimation && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-30 flex items-center justify-center pointer-events-none">
            <div className="transform -rotate-12 border-4 border-destructive/50 rounded-lg px-8 py-3">
              <span className="text-4xl font-bold text-destructive/70 tracking-widest">REJECTED</span>
            </div>
          </div>
        )}
        <CardContent className={`p-6 ${isRejected && !showRejectAnimation ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Candidate Journey</span>
            </div>
            
            <div className="flex items-center gap-2">
              {!canManagePipeline && (
                <Badge variant="secondary" className="text-xs">
                  View Only
                </Badge>
              )}
              {/* Desktop: Visible Hire and Reject buttons */}
              {canManagePipeline && !isRejected && !isHired && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHireConfirmation(true)}
                  className="hidden md:flex gap-1.5 h-8 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Hire
                </Button>
              )}
              {canManagePipeline && !isRejected && !isHired && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRejectConfirmation(true)}
                  className="hidden md:flex gap-1.5 h-8 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-800/50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              )}
              {/* Mobile: Dropdown with Hire and Reject options */}
              {canManagePipeline && !isRejected && !isHired && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => setShowHireConfirmation(true)}
                      className="gap-2 text-emerald-600 focus:text-emerald-600"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Hire Candidate
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setShowRejectConfirmation(true)}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject Candidate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Journey Slider */}
          <div 
            ref={sliderRef}
            className="relative h-20 select-none"
          >
            {/* Progress bar background */}
            <div className="absolute top-8 left-0 right-0 h-2 bg-muted rounded-full" />
            
            {/* Completed progress - Smooth CSS animation */}
            <div 
              className="absolute top-8 left-0 h-2 rounded-full"
              style={{ 
                background: "linear-gradient(90deg, hsl(var(--success)) 0%, hsl(var(--warning)) 100%)",
                width: `${sliderPosition}%`,
                transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />

            {/* Phase markers */}
            {phases.map((phase, index) => {
              const position = (index / (phases.length - 1)) * 100;
              const Icon = phase.icon;
              const isCompleted = index < effectivePhaseIndex;
              const isCurrent = index === effectivePhaseIndex;
              const hasData = hasCompletedCurrentPhase(phase.id, phase.type);
              // Show "Skipped" if:
              // 1. Employer explicitly marked it skipped (isPhaseSkipped) AND no data, OR
              // 2. Implicitly skipped: behind current phase, no data, and it's a candidate-facing phase
              const isExplicitlySkipped = isPhaseSkipped(phase) && !hasData && index < effectivePhaseIndex;
              const isCandidateFacingPhase = phase.type !== "review" && phase.type !== "interview" && phase.type !== "hired" && phase.type !== "journey_start";
              const isImplicitlySkipped = index < effectivePhaseIndex && !hasData && isCandidateFacingPhase && !isPhaseSkipped(phase);
              const isSkipped = isExplicitlySkipped || isImplicitlySkipped;
              const isStartPhase = phase.type === "journey_start";
              
              // Start point turns green when candidate has begun their journey:
              // - They've moved past Start (effectivePhaseIndex > 0), OR
              // - They're at Start but Application phase has data (they've started filling it)
              const isStartCompleted = isStartPhase && (
                effectivePhaseIndex > 0 || 
                (effectivePhaseIndex === 0 && hasCompletedCurrentPhase("application", "application"))
              );
              
              return (
                <div 
                  key={phase.id}
                  className="absolute flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${position}%` }}
                >
                  {/* Dot - smaller for start phase */}
                  <div 
                    className={`rounded-full border-2 border-background mt-6 z-10 ${
                      isStartPhase ? "w-3 h-3" : "w-4 h-4"
                    } ${
                      isSkipped ? "bg-amber-500" :
                      isStartPhase ? (isStartCompleted ? "bg-success" : "bg-muted-foreground/50") :
                      isCompleted ? phaseColors.completed : 
                      isCurrent ? phaseColors.current : 
                      phaseColors.upcoming
                    }`}
                  />
                  
                  {/* Icon & Label with Tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="mt-3 flex flex-col items-center cursor-help">
                        {isSkipped ? (
                          <FastForward className={`${isMobile ? "h-3 w-3" : "h-5 w-5"} text-amber-500`} />
                        ) : (
                          <Icon className={`${isMobile ? "h-3 w-3" : isStartPhase ? "h-4 w-4" : "h-5 w-5"} ${
                            isStartPhase ? (isStartCompleted ? "text-success" : "text-muted-foreground/60") :
                            isCompleted ? "text-success" : 
                            isCurrent ? "text-warning" : 
                            "text-muted-foreground"
                          }`} />
                        )}
                        <span className={`text-xs mt-1 ${isMobile ? "hidden" : ""} ${
                          isSkipped ? "text-amber-500" :
                          isStartPhase ? (isStartCompleted ? "text-success" : "text-muted-foreground/60") :
                          isCompleted ? "text-success" : 
                          isCurrent ? "text-warning" : 
                          "text-muted-foreground"
                        }`}>
                          {isSkipped ? "Skipped" : phase.title}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-center">
                      <p className="font-medium">{phase.fullTitle || phase.title}</p>
                      <p className="text-xs text-muted-foreground">{stepTypeDescriptions[phase.type] || ""}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}

            {/* Read-only avatar indicator */}
            <div 
              className={`absolute top-3 z-20 ${
                isAwaitingReview ? "animate-float-awaiting" : ""
              } ${application?.profiles?.avatar_url ? "cursor-pointer" : ""}`}
              style={{ 
                left: `${sliderPosition}%`,
                transform: 'translateX(-50%)',
                transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onClick={() => {
                if (application?.profiles?.avatar_url) {
                  setShowAvatarLightbox(true);
                }
              }}
              title={application?.profiles?.avatar_url ? "Click to view full photo" : undefined}
            >
              <Avatar className={`h-8 w-8 md:h-10 md:w-10 ring-2 md:ring-4 ${isAwaitingReview ? "ring-warning/50" : "ring-primary/30"} shadow-lg ${application?.profiles?.avatar_url ? "hover:ring-primary transition-all" : ""}`}>
                {application?.profiles?.avatar_url && (
                  <AvatarImage src={application.profiles.avatar_url} alt={application.profiles.full_name || "Candidate"} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-xs md:text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Processing Mode Indicator - Animated */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
      >
      {isAutoPilot ? (
        <Card className="bg-card border-border border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold text-primary">Auto-Pilot Mode Active</h3>
                <p className="text-sm text-muted-foreground hidden md:block">
                  AVA automatically evaluates, progresses, and notifies candidates based on a passing score of {passingScore}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-500">Manual Review Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Review each phase submission and approve candidates to progress manually.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </motion.div>

      {/* Manual Mode Action Button - Only show when candidate has completed current phase and awaiting review */}
      {!isAutoPilot && isAwaitingReview && !isRejected && canManagePipeline && effectivePhaseIndex < phases.length - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.25 }}
        >
          <Card className="bg-card border-border border-l-4 border-l-success">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <div>
                    <h3 className="font-semibold text-success">Ready for Review</h3>
                    <p className="text-sm text-muted-foreground">
                      Candidate has completed the <span className="font-medium">{phases[effectivePhaseIndex]?.title}</span> phase. Review and advance when ready.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={handleAdvanceToNextPhase}
                  className="gap-2"
                >
                  <FastForward className="h-4 w-4" />
                  Approve & Advance
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Applicant Info - Animated */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
      >
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          {/* Phase Tags - Clickable */}
          <div className="flex flex-wrap gap-2 mb-6">
            {workflowBadges.map((badge) => {
              const Icon = badge.icon;
              return (
                <Badge 
                  key={badge.id}
                  variant={badge.hasData || badge.isSkipped ? undefined : "outline"}
                  className={`gap-1 cursor-pointer transition-colors ${
                    badge.isSkipped
                      ? "bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/30"
                      : badge.hasData 
                      ? "bg-success/20 text-success border-success/30 hover:bg-success/30" 
                      : "hover:bg-accent"
                  }`}
                  onClick={() => {
                    if (badge.id === "application") {
                      setShowApplicationDialog(true);
                    } else if (badge.id === "resume") {
                      setShowResumeDialog(true);
                    } else {
                      setActiveBadgeDialog(badge.id);
                    }
                  }}
                >
                  {badge.isSkipped ? (
                    <FastForward className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  <span className="hidden md:inline">
                    {badge.title}
                    {badge.isSkipped && " (Skipped)"}
                    {!badge.isSkipped && badge.score != null && ` (${Math.round(badge.score)})`}
                  </span>
                </Badge>
              );
            })}
          </div>

          {/* Name & Details */}
          <h2 className="text-2xl font-bold text-foreground">{applicantDisplayName}</h2>
          <p className="text-muted-foreground mt-1">
            Applied for {job?.title || "Unknown Position"} at {profile?.company_name || "Company"}
          </p>
          
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Mail className="h-4 w-4" />
            <span>{profile?.email}</span>
          </div>
          
          <p className="text-muted-foreground text-sm mt-1">
            Submitted on {format(new Date(application.created_at), "M/d/yyyy")}
          </p>
        </CardContent>
      </Card>
      </motion.div>

      {/* AVA's Analysis - Animated */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
      >
      <Card className="bg-card border-border" data-section="ai-analysis">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">AVA's Analysis</span>
            </div>
            
            <div className="flex items-center gap-3">
              {application.updated_at && (
                <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Updated: {format(new Date(application.updated_at), "MMM d, hh:mm a")}
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleReanalyze}
                      disabled={isAnalyzing || !hasValidApplicationData || isRejected}
                      className={isMobile ? "h-8 w-8 p-0" : "gap-2"}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {!isMobile && "Re-analyze"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {(isRejected || !hasValidApplicationData) && (
                  <TooltipContent>
                    <p>{isRejected 
                      ? "Analysis is locked. This applicant has already been rejected." 
                      : "No application data available. The candidate must resubmit the application first."}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>

          {/* What AVA analyzed */}
          {application.ai_analysis && (
            <>
              {/* Hide "AVA analyzed" badges on mobile */}
              <div className="hidden md:flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-sm text-muted-foreground">AVA analyzed:</span>
                {resumeUrl && (
                  <Badge variant="outline" className="text-xs">Resume</Badge>
                )}
                {(parsedNotes.applicationAnswers?.length > 0 || application.cover_letter) && (
                  <Badge variant="outline" className="text-xs">Application Answers</Badge>
                )}
                {parsedNotes.typingTestResult && (
                  <Badge variant="outline" className="text-xs">Typing Test</Badge>
                )}
                {(parsedNotes.quizResult || parsedNotes.quiz || (parsedNotes.quizAnswers && Object.keys(parsedNotes.quizAnswers).length > 0)) && (
                  <Badge variant="outline" className="text-xs">Quiz</Badge>
                )}
                {parsedNotes.chatSimulationResult && (
                  <Badge variant="outline" className="text-xs">Chat Simulation</Badge>
                )}
                {parsedNotes.chatInterviewResult && (
                  <Badge variant="outline" className="text-xs">Interview</Badge>
                )}
                {parsedNotes.salesSimulationResult && (
                  <Badge variant="outline" className="text-xs">Sales Simulation</Badge>
                )}
                {parsedNotes.portfolioResult && (
                  <Badge variant="outline" className="text-xs">Portfolio</Badge>
                )}
                {parsedNotes.videoIntroUrl && (
                  <Badge variant="outline" className="text-xs">Video Intro</Badge>
                )}
                {application.voice_interview_result && (
                  <Badge variant="outline" className="text-xs">Voice Interview</Badge>
                )}
              </div>

              {/* Condensed AI Analysis */}
              <CondensedAIAnalysis 
                content={application.ai_analysis} 
                applicationNotes={parsedNotes}
                voiceInterviewResult={application.voice_interview_result}
                aiScore={application.ai_score}
                applicationStatus={application.status}
                rejectionReason={application.phase_ai_analysis}
                passingScore={job?.passing_score}
                rejectedByType={application.rejected_by_type}
                isAnalyzing={isAnalyzing}
              />
              
            </>
          )}

          {!application.ai_analysis && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">No Analysis Yet</h3>
              
              {!hasValidApplicationData ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mx-auto max-w-md">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="text-amber-200 text-sm font-medium">Application data was reset</p>
                      <p className="text-amber-200/70 text-xs mt-1">
                        The candidate must resubmit the application phase before Ava can run a new analysis.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm mb-4">
                    Run Ava analysis to get Ava's recommendation on this candidate.
                  </p>
                  <Button onClick={handleReanalyze} disabled={isAnalyzing}>
                    {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Sparkles className="mr-2 h-4 w-4" />
                    Run Ava Analysis
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>
      
      {/* Application Data Dialog */}
      <Dialog open={showApplicationDialog} onOpenChange={setShowApplicationDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              Application Submission
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Cover Letter */}
              {application.cover_letter && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">Cover Letter</h4>
                  <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                    {application.cover_letter}
                  </div>
                </div>
              )}
              
              {/* Application Questions & Answers */}
              {(() => {
                const notes = application.notes;
                let applicationAnswers: { question: string; answer: string }[] = [];
                
                if (notes) {
                  try {
                    const parsed = JSON.parse(notes);
                    if (parsed.applicationAnswers && Array.isArray(parsed.applicationAnswers)) {
                      applicationAnswers = parsed.applicationAnswers;
                    }
                  } catch {
                    // Notes might not be JSON
                  }
                }
                
                if (applicationAnswers.length === 0) {
                  return (
                    <div className="text-muted-foreground text-sm">
                      No application answers were submitted.
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-foreground">Application Answers</h4>
                    {applicationAnswers.map((item, index) => (
                      <div key={index} className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          {index + 1}. {item.question}
                        </p>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm">
                          {item.answer?.startsWith("http") ? (
                            <a 
                              href={item.answer} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-2"
                            >
                              <ExternalLink className="h-4 w-4" />
                              View Uploaded File
                            </a>
                          ) : (
                            item.answer || <span className="text-muted-foreground italic">No answer provided</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              
              {/* Submitted Date */}
              <div className="pt-4 border-t border-border text-sm text-muted-foreground">
                Submitted on {format(new Date(application.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Resume Dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Resume
              {resumeUrl && (application as any).resume_score != null && (application as any).resume_score > 0 && (
                <Badge className="bg-success/20 text-success ml-2">
                  Resume Score: {Math.round((application as any).resume_score)}/100
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {resumeUrl ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Candidate Resume</p>
                      <p className="text-sm text-muted-foreground">PDF Document</p>
                    </div>
                  </div>
                  <Button asChild>
                    <a 
                      href={resumeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </Button>
                </div>
                
                {/* Resume Preview using Google Docs Viewer for reliable PDF display */}
                <div className="rounded-lg overflow-hidden border border-border bg-muted h-96">
                  <iframe 
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(resumeUrl)}&embedded=true`}
                    className="w-full h-full"
                    title="Resume Preview"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No resume was uploaded for this application.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Workflow Step Data Dialog */}
      <Dialog open={!!activeBadgeDialog} onOpenChange={(open) => !open && setActiveBadgeDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          {activeBadgeDialog && (() => {
            const badge = workflowBadges.find(b => b.id === activeBadgeDialog);
            const dialogData = getBadgeDialogContent(activeBadgeDialog, badge?.type || "");
            const Icon = badge?.icon || ClipboardList;
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    {dialogData.title}
                    {badge?.score != null && (
                      <Badge className="bg-success/20 text-success ml-2">
                        Score: {Math.round(badge.score)}
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                  {dialogData.content ? (
                    <div className="space-y-4">
                      {dialogData.type === "quiz" && dialogData.content && (
                        <div className="space-y-4">
                          {/* Quiz Summary */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className="text-xl font-bold text-primary">{dialogData.content.correct || 0}/{dialogData.content.total || 0}</p>
                              <p className="text-xs text-muted-foreground">Correct</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className="text-xl font-bold text-foreground">{dialogData.content.score || 0}%</p>
                              <p className="text-xs text-muted-foreground">Score</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className={`text-xl font-bold ${dialogData.content.passed ? "text-success" : "text-destructive"}`}>
                                {dialogData.content.passed ? "PASSED" : "FAILED"}
                              </p>
                              <p className="text-xs text-muted-foreground">Result</p>
                            </div>
                          </div>
                          
                          {/* Questions and Answers */}
                          <div className="border-t border-border pt-4">
                            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Questions & Answers</h4>
                            <div className="space-y-4">
                              {(dialogData.content.answers || []).map((item: any, index: number) => (
                                <div key={index} className="space-y-2">
                                  <div className="flex items-start gap-2">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                                      item.isCorrect ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                                    }`}>
                                      {item.isCorrect ? "✓" : "✗"}
                                    </span>
                                    <p className="text-sm font-medium text-foreground">{item.question}</p>
                                  </div>
                                  <div className={`p-3 rounded-lg text-sm ml-7 ${
                                    item.isCorrect ? "bg-success/10 border border-success/20" : "bg-destructive/10 border border-destructive/20"
                                  }`}>
                                    {item.selectedAnswerText || item.answer || <span className="text-muted-foreground italic">No answer</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {dialogData.type === "typing_test" && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-foreground">{dialogData.content.wpm || "N/A"}</p>
                              <p className="text-sm text-muted-foreground">Words Per Minute</p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-foreground">{dialogData.content.accuracy || "N/A"}%</p>
                              <p className="text-sm text-muted-foreground">Accuracy</p>
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-foreground">{dialogData.content.score || "N/A"}</p>
                              <p className="text-sm text-muted-foreground">Score</p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {(dialogData.type === "video_intro" || dialogData.type === "video_message") && (
                        <div className="space-y-4">
                          {(() => {
                            // Extract videoUrl from either string or object format
                            const videoUrl = typeof dialogData.content === "string" 
                              ? dialogData.content 
                              : dialogData.content?.videoUrl;
                            
                            if (videoUrl) {
                              return (
                                <div className="rounded-lg overflow-hidden border border-border bg-muted">
                                  <video 
                                    src={videoUrl} 
                                    controls 
                                    preload="auto"
                                    playsInline
                                    crossOrigin="anonymous"
                                    className="w-full max-h-[400px] bg-black"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling;
                                      if (fallback) (fallback as HTMLElement).style.display = 'block';
                                    }}
                                  >
                                    <source src={videoUrl} type="video/webm" />
                                  </video>
                                  <div className="text-center py-8 text-muted-foreground space-y-3 hidden">
                                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive/50" />
                                    <p>Video could not be loaded</p>
                                    <p className="text-xs">The file may be corrupted or in an unsupported format</p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(videoUrl, '_blank')}
                                    >
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Open in New Tab
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                            
                            return (
                              <div className="text-center py-8 text-muted-foreground">
                                <Video className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>Video not available</p>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      {dialogData.type === "chat_simulation" && (
                        <div className="space-y-4">
                          {/* Evaluation Summary */}
                          {dialogData.content.evaluation && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-muted/50 rounded-lg text-center">
                                  <p className="text-xl font-bold text-primary">{dialogData.content.evaluation.score ?? dialogData.content.score ?? "N/A"}</p>
                                  <p className="text-xs text-muted-foreground">Overall</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg text-center">
                                  <p className="text-xl font-bold text-foreground">{dialogData.content.evaluation.empathy ?? "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Empathy</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg text-center">
                                  <p className="text-xl font-bold text-foreground">{dialogData.content.evaluation.problemSolving ?? "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Problem Solving</p>
                                </div>
                              </div>
                              
                              {dialogData.content.evaluation.strengths?.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-success mb-2">Strengths</h4>
                                  <ul className="space-y-1">
                                    {dialogData.content.evaluation.strengths.map((s: string, i: number) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-success mt-0.5">•</span> {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {dialogData.content.evaluation.improvements?.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-orange-500 mb-2">Areas for Improvement</h4>
                                  <ul className="space-y-1">
                                    {dialogData.content.evaluation.improvements.map((s: string, i: number) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-orange-500 mt-0.5">•</span> {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Chat Messages */}
                          <div className="border-t border-border pt-4">
                            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Conversation</h4>
                            <div className="space-y-3 max-h-60 overflow-y-auto">
                              {dialogData.content.messages?.map((msg: any, index: number) => (
                                <div key={index} className={`flex ${msg.role === "agent" || msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                  <div className={`p-3 rounded-lg max-w-[80%] ${
                                    msg.role === "agent" || msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                                  }`}>
                                    <p className="text-sm">{msg.content}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Anti-cheat Summary */}
                          {dialogData.content.antiCheatLog && dialogData.content.antiCheatLog.totalViolations > 0 && (
                            <div className="border-t border-border pt-4">
                              <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Anti-Cheat Violations ({dialogData.content.antiCheatLog.totalViolations})
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="p-2 bg-destructive/10 rounded">
                                  Tab Switches: {dialogData.content.antiCheatLog.tabSwitches}
                                </div>
                                <div className="p-2 bg-destructive/10 rounded">
                                  Copy/Paste: {dialogData.content.antiCheatLog.copyAttempts + dialogData.content.antiCheatLog.pasteAttempts}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {dialogData.type === "chat_interview" && (
                        <div className="space-y-4">
                          {/* Evaluation Summary */}
                          {dialogData.content.evaluation && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-4 mb-4">
                                <div className="text-center">
                                  <p className="text-3xl font-bold text-primary">{dialogData.content.evaluation.score || dialogData.content.score || "N/A"}</p>
                                  <p className="text-xs text-muted-foreground">/100</p>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-medium text-foreground">
                                      Recommendation: <span className={`font-bold ${
                                        dialogData.content.evaluation.recommendation === "Strong Hire" ? "text-success" :
                                        dialogData.content.evaluation.recommendation === "Hire" ? "text-success" :
                                        dialogData.content.evaluation.recommendation === "Maybe" ? "text-warning" : "text-destructive"
                                      }`}>{dialogData.content.evaluation.recommendation || "N/A"}</span>
                                    </p>
                                    {/* Credibility Rating Badge */}
                                    {dialogData.content.evaluation.credibilityRating && (
                                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        dialogData.content.evaluation.credibilityRating === "High" ? "bg-success/20 text-success" :
                                        dialogData.content.evaluation.credibilityRating === "Medium" ? "bg-warning/20 text-warning" : "bg-destructive/20 text-destructive"
                                      }`}>
                                        {dialogData.content.evaluation.credibilityRating === "High" ? (
                                          <ShieldCheck className="h-3 w-3" />
                                        ) : dialogData.content.evaluation.credibilityRating === "Medium" ? (
                                          <Shield className="h-3 w-3" />
                                        ) : (
                                          <ShieldAlert className="h-3 w-3" />
                                        )}
                                        {dialogData.content.evaluation.credibilityRating} Credibility
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">{dialogData.content.evaluation.summary}</p>
                                </div>
                              </div>
                              
                              {/* Inconsistencies / Red Flags Section */}
                              {dialogData.content.evaluation.inconsistencies?.length > 0 && (
                                <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                                  <h4 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4" />
                                    Red Flags Detected ({dialogData.content.evaluation.inconsistencies.length})
                                  </h4>
                                  <div className="space-y-3">
                                    {dialogData.content.evaluation.inconsistencies.map((item: { claim: string; evidence: string; assessment: string }, i: number) => (
                                      <div key={i} className="p-3 bg-background rounded-lg border border-destructive/10">
                                        <div className="space-y-2">
                                          <div>
                                            <span className="text-xs font-medium text-muted-foreground">Claim:</span>
                                            <p className="text-sm text-foreground">{item.claim}</p>
                                          </div>
                                          <div>
                                            <span className="text-xs font-medium text-muted-foreground">Evidence:</span>
                                            <p className="text-sm text-foreground">{item.evidence}</p>
                                          </div>
                                          <div>
                                            <span className="text-xs font-medium text-destructive">Assessment:</span>
                                            <p className="text-sm text-destructive">{item.assessment}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {dialogData.content.evaluation.strengths?.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-success mb-2">Key Strengths</h4>
                                  <ul className="space-y-1">
                                    {dialogData.content.evaluation.strengths.map((s: string, i: number) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-success mt-0.5">•</span> {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {dialogData.content.evaluation.concerns?.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-orange-500 mb-2">Concerns</h4>
                                  <ul className="space-y-1">
                                    {dialogData.content.evaluation.concerns.map((s: string, i: number) => (
                                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <span className="text-orange-500 mt-0.5">•</span> {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Interview Stats */}
                          {dialogData.content.duration && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-muted/50 rounded-lg text-center">
                                <p className="text-lg font-bold text-foreground">
                                  {Math.floor(dialogData.content.duration / 60)}:{String(dialogData.content.duration % 60).padStart(2, '0')}
                                </p>
                                <p className="text-xs text-muted-foreground">Duration</p>
                              </div>
                              <div className="p-3 bg-muted/50 rounded-lg text-center">
                                <p className="text-lg font-bold text-foreground">{dialogData.content.questionCount || dialogData.content.messages?.length || 0}</p>
                                <p className="text-xs text-muted-foreground">Questions</p>
                              </div>
                            </div>
                          )}
                          
                          {/* Chat Messages */}
                          <div className="border-t border-border pt-4">
                            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Interview Transcript</h4>
                            <div className="space-y-3 max-h-60 overflow-y-auto">
                              {dialogData.content.messages?.map((msg: any, index: number) => (
                                <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                  <div className={`p-3 rounded-lg max-w-[80%] ${
                                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                                  }`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Anti-cheat Summary */}
                          {dialogData.content.antiCheatLog && dialogData.content.antiCheatLog.totalViolations > 0 && (
                            <div className="border-t border-border pt-4">
                              <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Anti-Cheat Violations ({dialogData.content.antiCheatLog.totalViolations})
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="p-2 bg-destructive/10 rounded">
                                  Tab Switches: {dialogData.content.antiCheatLog.tabSwitches}
                                </div>
                                <div className="p-2 bg-destructive/10 rounded">
                                  Copy/Paste: {(dialogData.content.antiCheatLog.copyAttempts || 0) + (dialogData.content.antiCheatLog.pasteAttempts || 0)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {dialogData.type === "sales_simulation" && (
                        <div className="space-y-4">
                          {/* Compact Summary */}
                          <div className="flex items-center gap-6 p-4 bg-muted/30 rounded-lg border border-border">
                            <div className="text-center">
                              <p className={`text-3xl font-bold ${
                                (dialogData.content.evaluation?.score ?? dialogData.content.score) >= 70 ? "text-emerald-500" :
                                (dialogData.content.evaluation?.score ?? dialogData.content.score) >= 50 ? "text-amber-500" : 
                                (dialogData.content.evaluation?.score ?? dialogData.content.score) !== undefined ? "text-red-400" : "text-muted-foreground"
                              }`}>
                                {dialogData.content.evaluation?.score ?? dialogData.content.score ?? "N/A"}
                              </p>
                              <p className="text-xs text-muted-foreground">/100</p>
                            </div>
                            <div className="h-12 w-px bg-border" />
                            <div className="flex-1">
                              <p className="text-sm text-muted-foreground mb-1">Would Buy</p>
                              <p className={`font-semibold ${
                                dialogData.content.evaluation?.wouldBuy === "yes" ? "text-emerald-500" :
                                dialogData.content.evaluation?.wouldBuy === "maybe" ? "text-amber-500" : "text-red-400"
                              }`}>
                                {dialogData.content.evaluation?.wouldBuy === "yes" ? "Yes" :
                                 dialogData.content.evaluation?.wouldBuy === "maybe" ? "Maybe" : "No"}
                              </p>
                            </div>
                            {dialogData.content.antiCheatLog?.totalViolations > 0 && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {dialogData.content.antiCheatLog.totalViolations} violations
                              </Badge>
                            )}
                          </div>
                          
                          {/* Category Scores Preview */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="p-2 bg-muted/50 rounded-lg text-center">
                              <p className={`text-lg font-bold ${
                                (dialogData.content.evaluation?.discovery ?? null) !== null 
                                  ? (dialogData.content.evaluation.discovery >= 70 ? "text-emerald-500" : 
                                     dialogData.content.evaluation.discovery >= 50 ? "text-amber-500" : "text-red-400")
                                  : "text-muted-foreground"
                              }`}>
                                {dialogData.content.evaluation?.discovery ?? "N/A"}{dialogData.content.evaluation?.discovery !== undefined && "%"}
                              </p>
                              <p className="text-xs text-muted-foreground">Discovery</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded-lg text-center">
                              <p className={`text-lg font-bold ${
                                (dialogData.content.evaluation?.objectionHandling ?? null) !== null 
                                  ? (dialogData.content.evaluation.objectionHandling >= 70 ? "text-emerald-500" : 
                                     dialogData.content.evaluation.objectionHandling >= 50 ? "text-amber-500" : "text-red-400")
                                  : "text-muted-foreground"
                              }`}>
                                {dialogData.content.evaluation?.objectionHandling ?? "N/A"}{dialogData.content.evaluation?.objectionHandling !== undefined && "%"}
                              </p>
                              <p className="text-xs text-muted-foreground">Objections</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded-lg text-center">
                              <p className={`text-lg font-bold ${
                                (dialogData.content.evaluation?.valueProposition ?? null) !== null 
                                  ? (dialogData.content.evaluation.valueProposition >= 70 ? "text-emerald-500" : 
                                     dialogData.content.evaluation.valueProposition >= 50 ? "text-amber-500" : "text-red-400")
                                  : "text-muted-foreground"
                              }`}>
                                {dialogData.content.evaluation?.valueProposition ?? "N/A"}{dialogData.content.evaluation?.valueProposition !== undefined && "%"}
                              </p>
                              <p className="text-xs text-muted-foreground">Value Prop</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded-lg text-center">
                              <p className={`text-lg font-bold ${
                                (dialogData.content.evaluation?.closingSkills ?? null) !== null 
                                  ? (dialogData.content.evaluation.closingSkills >= 70 ? "text-emerald-500" : 
                                     dialogData.content.evaluation.closingSkills >= 50 ? "text-amber-500" : "text-red-400")
                                  : "text-muted-foreground"
                              }`}>
                                {dialogData.content.evaluation?.closingSkills ?? "N/A"}{dialogData.content.evaluation?.closingSkills !== undefined && "%"}
                              </p>
                              <p className="text-xs text-muted-foreground">Closing</p>
                            </div>
                          </div>
                          
                          {/* View Full Analysis Button */}
                          <Button
                            className="w-full"
                            onClick={() => {
                              setSalesAnalysisData(dialogData.content);
                              setShowSalesAnalysisDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Full Analysis
                          </Button>
                        </div>
                      )}
                      
                      {/* Portfolio Upload Preview */}
                      {dialogData.type === "portfolio_upload" && (
                        <div className="space-y-4">
                          {/* File Grid */}
                          {dialogData.content.files && dialogData.content.files.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {dialogData.content.files.map((file: { url: string; name: string; type: string }, index: number) => {
                                const isImage = file.type?.startsWith("image/");
                                return (
                                  <div key={index} className="relative group rounded-lg border border-border overflow-hidden bg-muted/30">
                                    {isImage ? (
                                      <img 
                                        src={file.url} 
                                        alt={file.name}
                                        className="w-full h-24 object-cover cursor-pointer hover:opacity-80 transition"
                                        onClick={() => window.open(file.url, '_blank')}
                                      />
                                    ) : (
                                      <div 
                                        className="w-full h-24 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition"
                                        onClick={() => window.open(file.url, '_blank')}
                                      >
                                        <FileText className="h-10 w-10 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className="p-2 flex items-center justify-between gap-1 bg-background/80">
                                      <p className="text-xs truncate flex-1" title={file.name}>{file.name}</p>
                                      <a 
                                        href={file.url} 
                                        download={file.name}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-muted-foreground hover:text-foreground transition shrink-0"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* AI Analysis Section */}
                          {dialogData.content.aiAnalysis && (
                            <div className="space-y-3 border-t border-border pt-4">
                              {/* Score Breakdown */}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="p-2 bg-muted/50 rounded text-center">
                                  <p className="text-lg font-bold">{dialogData.content.aiAnalysis.relevance?.score || 0}%</p>
                                  <p className="text-xs text-muted-foreground">Relevance</p>
                                </div>
                                <div className="p-2 bg-muted/50 rounded text-center">
                                  <p className="text-lg font-bold">{dialogData.content.aiAnalysis.quality?.score || 0}%</p>
                                  <p className="text-xs text-muted-foreground">Quality</p>
                                </div>
                                <div className="p-2 bg-muted/50 rounded text-center">
                                  <p className="text-lg font-bold">{dialogData.content.aiAnalysis.creativity?.score || 0}%</p>
                                  <p className="text-xs text-muted-foreground">Creativity</p>
                                </div>
                              </div>
                              
                              {/* Summary */}
                              {dialogData.content.aiAnalysis.summary && (
                                <p className="text-sm text-muted-foreground">{dialogData.content.aiAnalysis.summary}</p>
                              )}
                              
                              {/* Strengths */}
                              {dialogData.content.aiAnalysis.strengths && dialogData.content.aiAnalysis.strengths.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-emerald-400 mb-1">Strengths</h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {dialogData.content.aiAnalysis.strengths.map((s: string, i: number) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {/* Areas for Improvement */}
                              {dialogData.content.aiAnalysis.areasForImprovement && dialogData.content.aiAnalysis.areasForImprovement.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-amber-400 mb-1">Areas for Improvement</h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {dialogData.content.aiAnalysis.areasForImprovement.map((s: string, i: number) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {dialogData.type === "voice_interview" && dialogData.content && (
                        <div className="space-y-4">
                          {/* Recording Player - Show directly */}
                          {application?.voice_interview_recording_url && (
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                  {application?.voice_interview_video_enabled !== false ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                  Interview Recording
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <MediaPlayer 
                                  src={application.voice_interview_recording_url}
                                  type={application.voice_interview_video_enabled !== false ? "video" : "audio"}
                                />
                              </CardContent>
                            </Card>
                          )}

                          {/* Quick Summary */}
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-3xl font-bold text-primary">{dialogData.content.overall_score || "N/A"}</p>
                              <p className="text-xs text-muted-foreground">/100</p>
                            </div>
                            <div className="flex-1">
                              <Badge className={
                                dialogData.content.recommendation === "strong_hire" ? "bg-success" :
                                dialogData.content.recommendation === "hire" ? "bg-success/80" :
                                dialogData.content.recommendation === "maybe" ? "bg-warning" : "bg-destructive"
                              }>
                                {dialogData.content.recommendation?.replace("_", " ").toUpperCase() || "N/A"}
                              </Badge>
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{dialogData.content.executive_summary || dialogData.content.summary}</p>
                            </div>
                          </div>

                          {/* View Full Analysis Button */}
                          <Button
                            onClick={() => {
                              setActiveBadgeDialog(null);
                              setShowVoiceInterviewResults(true);
                            }}
                            variant="outline"
                            className="w-full gap-2"
                          >
                            <Sparkles className="h-4 w-4" />
                            View Full Analysis
                          </Button>
                        </div>
                      )}

                      {!["quiz", "typing_test", "video_intro", "video_message", "chat_simulation", "chat_interview", "sales_simulation", "portfolio_upload", "voice_interview"].includes(dialogData.type) && (
                        <div className="p-4 bg-muted/50 rounded-lg">
                          <pre className="text-sm whitespace-pre-wrap">
                            {typeof dialogData.content === "object" 
                              ? JSON.stringify(dialogData.content, null, 2) 
                              : dialogData.content}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Icon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No data has been submitted for this step yet.</p>
                    </div>
                  )}
                </ScrollArea>
                
                {/* Allow Redo button removed - employers should reject candidates who need to restart */}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Voice Interview Results Dialog */}
      <VoiceInterviewResultsDialog
        open={showVoiceInterviewResults}
        onOpenChange={setShowVoiceInterviewResults}
        result={application?.voice_interview_result}
        transcript={application?.voice_interview_transcript as any[]}
        recordingUrl={application?.voice_interview_recording_url || undefined}
        videoEnabled={application?.voice_interview_video_enabled !== false}
        candidateName={profile?.full_name || "Candidate"}
        jobTitle={job?.title || "Position"}
        applicationId={application?.id}
      />

      {/* Interview Scheduling Wizard */}
      <InterviewSchedulingWizard
        applicationId={application?.id || null}
        candidateName={profile?.full_name || "Candidate"}
        candidateEmail={profile?.email}
        jobTitle={job?.title}
        open={showInterviewWizard}
        initialState={wizardInitialState}
        onOpenChange={(open) => {
          if (!open && pendingInterview) {
            // Wizard cancelled - just clear the pending state
            setPendingInterview(null);
          }
          setShowInterviewWizard(open);
          if (!open) {
            setWizardInitialState(null);
          }
        }}
        onComplete={() => {
          if (pendingInterview) {
            // Wizard completed successfully - execute the phase change
            executePhaseChange(pendingInterview.newIndex, pendingInterview.newPhase, false);
            setPendingInterview(null);
          }
        }}
      />

      {/* Allow Redo dialog removed - employers should reject candidates who need to restart */}

      {/* Reject Candidate Confirmation Dialog */}
      <AlertDialog open={showRejectConfirmation} onOpenChange={setShowRejectConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reject Candidate?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Are you sure you want to reject <strong>{applicantDisplayName}</strong> for the position of <strong>{job?.title}</strong>?
              </p>
              {allScheduledInterviews && allScheduledInterviews.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-destructive flex items-center gap-2">
                    <CalendarX className="h-4 w-4" />
                    {allScheduledInterviews.length} scheduled interview{allScheduledInterviews.length !== 1 ? 's' : ''} will be canceled
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {allScheduledInterviews.map((interview) => (
                      <li key={interview.id}>
                        • {format(new Date(interview.scheduled_at), "PPP 'at' p")}
                        {interview.interview_type && ` (${interview.interview_type})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                The candidate will be notified of this decision. You can reconsider this candidate later if needed.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject Candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hire Candidate Confirmation Dialog */}
      <AlertDialog open={showHireConfirmation} onOpenChange={setShowHireConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              Hire {applicantDisplayName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Are you sure you want to hire <strong>{applicantDisplayName}</strong> for the position of <strong>{job?.title}</strong>?
              </p>
              {effectivePhaseIndex < phases.length - 1 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <FastForward className="h-4 w-4" />
                    Remaining workflow phases will be skipped
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This candidate will be marked as hired immediately.
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                The candidate will be notified of this great news! You'll be prompted to send hiring documents (offer letter, contract, etc.) after confirmation.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleHire}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Hire Candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reconsider Candidate Confirmation Dialog */}
      <AlertDialog open={showReconsiderConfirmation} onOpenChange={setShowReconsiderConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Give Candidate a Fresh Start?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will completely reset the application for <strong>{applicantDisplayName}</strong>.
              </p>
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 space-y-2">
                <p className="text-sm text-foreground font-medium">
                  The candidate will need to restart from the beginning:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Reset to the beginning of the application process</li>
                  <li>Clear all previous scores and AI analysis</li>
                  <li>Clear all phase data (quiz answers, typing test, interview, etc.)</li>
                  <li>Notify the candidate they can start fresh</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                This action cannot be undone. The candidate will receive a notification to restart their application.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReconsider}>
              Reset & Give Fresh Start
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hold & Drag Help Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move className="h-5 w-5 text-primary" />
              How to Use the Candidate Journey Slider
            </DialogTitle>
            <DialogDescription>
              Easily manage candidate progress through the hiring pipeline
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* How it works */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <GripHorizontal className="h-4 w-4 text-primary" />
                How It Works
              </h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Click and hold</strong> the candidate's avatar on the journey slider, 
                  then <strong className="text-foreground">drag left or right</strong> to move them through the hiring phases.
                </p>
                <p>
                  Release to drop them at the desired phase. The candidate will be notified of their progress update.
                </p>
              </div>
            </div>

            {/* Moving Forward */}
            <div className="p-4 bg-success/5 border border-success/20 rounded-lg space-y-2">
              <h4 className="font-semibold text-success flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 rotate-180" />
                Moving Forward (Right)
              </h4>
              <p className="text-sm text-muted-foreground">
                Advancing a candidate skips them ahead in the pipeline. Any phases they skip will be tracked 
                so they're not penalized for assessments they didn't complete.
              </p>
            </div>

            {/* Moving Backward */}
            <div className="p-4 bg-warning/5 border border-warning/20 rounded-lg space-y-2">
              <h4 className="font-semibold text-warning flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Moving Backward (Left)
              </h4>
              <p className="text-sm text-muted-foreground">
                Moving a candidate backward will <strong className="text-foreground">reset</strong> all phase data 
                from the phases they're being moved back through. This allows them to redo assessments fresh.
              </p>
            </div>

            {/* Processing Modes */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Processing Modes</h4>
              
              <div className="grid gap-3">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium text-primary">Auto-Pilot Mode</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AVA automatically evaluates and advances candidates based on their passing score. 
                    You can still manually override by dragging candidates if needed.
                  </p>
                </div>
                
                <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="h-4 w-4 text-orange-500" />
                    <span className="font-medium text-orange-500">Manual Mode</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Candidates wait at each phase for your review. Drag them forward to advance, 
                    or backward to let them retry assessments.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowHelpDialog(false)}>
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicant Notes Dialog */}
      <ApplicantNotesDialog
        open={showNotesDialog}
        onOpenChange={setShowNotesDialog}
        applicationId={application?.id || ""}
        currentNotes={(application as any)?.employer_notes || null}
        candidateName={application?.profiles?.full_name || "this candidate"}
      />

      {/* Applicant Message Dialog */}
      <ApplicantMessageDialog
        open={showMessageDialog}
        onOpenChange={setShowMessageDialog}
        candidateId={application?.candidate_id || ""}
        candidateName={application?.profiles?.full_name || "Candidate"}
        applicationId={application?.id || ""}
        jobTitle={application?.jobs?.title || "Position"}
      />

      {/* Sales Analysis Dialog */}
      <SalesAnalysisDialog
        open={showSalesAnalysisDialog}
        onOpenChange={setShowSalesAnalysisDialog}
        data={salesAnalysisData || {}}
      />

      {/* Ava Interview Config Dialog */}
      <AvaInterviewConfigDialog
        open={showAvaInterviewConfig}
        onOpenChange={(open) => {
          setShowAvaInterviewConfig(open);
          if (!open) {
            setPendingAvaInterview(null);
            // Slider position will update automatically via useEffect
          }
        }}
        onConfirm={async (config) => {
          if (!pendingAvaInterview || !application) return;
          
          try {
            // Track skipped phases when advancing to Ava Interview
            let updatedNotes = { ...parsedNotes };
            const currentIndex = effectivePhaseIndex;
            const targetIndex = pendingAvaInterview.newIndex;
            
            // Check which phases are being skipped (between current and target)
            const originPhase = phases[currentIndex];
            const originHasData = hasCompletedCurrentPhase(originPhase.id, originPhase.type);
            
            // Phases between origin and destination (excludes review phases)
            let skippedPhaseIds = phases.slice(currentIndex + 1, targetIndex)
              .filter(p => p.type !== "review" && p.type !== "journey_start")
              .map(p => p.id);
            
            // If origin phase has no data (was reset/not completed), also mark it as skipped
            // Exception: Don't mark 'journey_start' or 'review' as skipped
            if (!originHasData && originPhase.type !== "journey_start" && originPhase.type !== "review") {
              skippedPhaseIds = [originPhase.id, ...skippedPhaseIds];
            }
            
            // Also check for quiz - common case where employer skips directly to Ava Interview
            const quizIndex = phases.findIndex(p => p.type === "quiz");
            if (quizIndex >= 0) {
              const quizPhase = phases[quizIndex];
              const hasQuizData = hasCompletedCurrentPhase(quizPhase.id, quizPhase.type);
              if (quizIndex >= currentIndex && quizIndex < targetIndex && !hasQuizData && !skippedPhaseIds.includes(quizPhase.id)) {
                skippedPhaseIds.push(quizPhase.id);
              }
            }
            
            if (skippedPhaseIds.length > 0) {
              updatedNotes.employerSkippedPhases = [
                ...(updatedNotes.employerSkippedPhases || []),
                ...skippedPhaseIds.filter(id => !updatedNotes.employerSkippedPhases?.includes(id)), // Dedupe
              ];
            }
            
            // Update application with all config, notes, and advance to phase
            await updateApplication.mutateAsync({
              id: application.id,
              phase: pendingAvaInterview.newPhase.id,
              notes: JSON.stringify(updatedNotes),
              voice_interview_duration: config.duration,
              voice_interview_language: config.language,
              voice_interview_language_rule: config.languageRule,
              voice_interview_video_enabled: config.videoEnabled,
            });
            
            toast.success(`Ava Interview configured - ${config.duration} minutes, ${config.videoEnabled ? 'video' : 'audio only'}`);
            queryClient.invalidateQueries({ queryKey: ["application", id] });
            // Slider position will update automatically via useEffect
          } catch (error) {
            toast.error("Failed to configure interview");
          }
          
          setShowAvaInterviewConfig(false);
          setPendingAvaInterview(null);
        }}
        candidateName={application?.profiles?.full_name || "this candidate"}
        language={(() => {
          const workflowSteps = (application?.jobs as any)?.workflow_steps as any[] || [];
          const voiceStep = workflowSteps.find((s: any) => s.type === 'voice_interview');
          return voiceStep?.config?.language_name || 'English';
        })()}
        voiceMinutesRemaining={getVoiceMinutesRemaining()}
      />

      {/* Hiring Document Prompt Dialog */}
      <HiringDocumentPromptDialog
        open={showHiringDocumentPrompt}
        onOpenChange={setShowHiringDocumentPrompt}
        candidateName={profile?.full_name || "this candidate"}
        jobTitle={job?.title || "this position"}
        applicationId={application?.id || ""}
        onSkip={() => setShowHiringDocumentPrompt(false)}
      />

      {/* Cancel Interview Confirmation */}
      <AlertDialog open={showCancelInterviewConfirm} onOpenChange={setShowCancelInterviewConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Interview?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this interview? The candidate will need to be rescheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Interview</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!scheduledInterview || !application) return;
                try {
                  const { error } = await supabase
                    .from("interviews")
                    .update({ status: "cancelled" })
                    .eq("id", scheduledInterview.id);
                  
                  if (error) throw error;
                  
                  // Send email notification to candidate
                  const { notifyInterviewCancelled } = await import("@/utils/emailNotifications");
                  const originalDate = format(new Date(scheduledInterview.scheduled_at), "EEEE, MMMM d, yyyy 'at' h:mm a");
                  await notifyInterviewCancelled(
                    application.candidate_id,
                    application.jobs?.title || "Position",
                    originalDate,
                    application.jobs?.employer_id ? undefined : undefined
                  );
                  
                  queryClient.invalidateQueries({ queryKey: ["interview", "application", id] });
                  queryClient.invalidateQueries({ queryKey: ["interviews"] });
                  toast.success("Interview cancelled");
                  setShowCancelInterviewConfirm(false);
                } catch (error) {
                  toast.error("Failed to cancel interview");
                }
              }}
            >
              Cancel Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Interview Dialog */}
      <RescheduleInterviewDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        interview={scheduledInterview}
        applicationId={id || ""}
      />

      {/* Employer Review Reschedule Request Dialog */}
      {scheduledInterview && (scheduledInterview as any).candidate_response === "reschedule_requested" && (
        <EmployerRescheduleReviewDialog
          open={showRescheduleReviewDialog}
          onOpenChange={setShowRescheduleReviewDialog}
          interviewId={scheduledInterview.id}
          applicationId={id || ""}
          currentScheduledAt={scheduledInterview.scheduled_at}
          proposedTimes={((scheduledInterview as any).proposed_times as any[]) || []}
          candidateNote={(scheduledInterview as any).candidate_note || null}
          onMessageCandidate={() => setShowMessageDialog(true)}
        />
      )}

      {/* AI Interview Questions Dialog */}
      {interviewWithDetails && (
        <InterviewQuestionsDialog
          interview={interviewWithDetails}
          open={showInterviewQuestionsDialog}
          onOpenChange={setShowInterviewQuestionsDialog}
          onQuestionsGenerated={async (questions) => {
            if (scheduledInterview) {
              await supabase
                .from("interviews")
                .update({ ai_questions: questions })
                .eq("id", scheduledInterview.id);
              queryClient.invalidateQueries({ queryKey: ["interview", "application", id] });
              toast.success("Questions saved!");
            }
          }}
        />
      )}

      {/* Avatar Lightbox */}
      {application?.profiles?.avatar_url && (
        <Dialog open={showAvatarLightbox} onOpenChange={setShowAvatarLightbox}>
          <DialogContent className="sm:max-w-md bg-card border-border p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>{application.profiles.full_name || "Candidate"}'s Photo</DialogTitle>
              <DialogDescription>Full size profile photo</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center">
              <img
                src={application.profiles.avatar_url}
                alt={application.profiles.full_name || "Candidate"}
                className="max-w-full max-h-[70vh] rounded-lg object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}