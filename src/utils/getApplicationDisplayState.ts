import { 
  FileText, ClipboardList, Keyboard, Video, MessageSquare, Mic
} from "lucide-react";
import type { ApplicationWithJob } from "@/hooks/useApplications";

// Shared configuration for status colors
export const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  reviewing: "bg-blue-500/20 text-blue-500",
  interview: "bg-purple-500/20 text-purple-500",
  offered: "bg-primary/20 text-primary",
  hired: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

export const statusLabels: Record<string, string> = {
  pending: "Pending Review",
  reviewing: "Under Review",
  interview: "Interview Scheduled",
  offered: "Offer Extended",
  hired: "Hired",
  rejected: "Not Selected",
};

// Map phase types to icons and action labels
export const phaseActionConfig: Record<string, { icon: React.ElementType; label: string; description: string; route: string }> = {
  application: { icon: FileText, label: "Complete Application", description: "Complete your application", route: "application" },
  quiz: { icon: ClipboardList, label: "Take Assessment", description: "Complete your skills assessment", route: "quiz" },
  typing_test: { icon: Keyboard, label: "Start Typing Test", description: "Ready for your typing test", route: "typing-test" },
  video_intro: { icon: Video, label: "Record Video", description: "Record your video introduction", route: "video-intro" },
  video_message: { icon: Video, label: "Record Video", description: "Record your video message", route: "video-intro" },
  chat_simulation: { icon: MessageSquare, label: "Start Chat Sim", description: "Begin customer support simulation", route: "chat-simulation" },
  chat_interview: { icon: MessageSquare, label: "Start Interview", description: "Ready for your interview", route: "chat-interview" },
  sales_simulation: { icon: Mic, label: "Start Sales Pitch", description: "Begin your sales simulation", route: "sales-simulation" },
  voice_interview: { icon: Video, label: "Start Voice Interview", description: "Begin your voice interview", route: "voice-interview" },
  portfolio_upload: { icon: FileText, label: "Upload Portfolio", description: "Submit your portfolio", route: "portfolio" },
};

export function getPhaseType(phase: string, workflowSteps?: any[]): string {
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
  // Only treat as quiz if phase explicitly contains "quiz"
  if (phase.includes("quiz")) return "quiz";
  return phase;
}

export interface ApplicationDisplayState {
  // What to show
  showActionButton: boolean;
  actionLabel: string;
  actionRoute: string;
  actionIcon: React.ElementType | null;
  
  // Status info
  statusLabel: string;
  statusColor: string;
  phaseType: string;
  
  // Interview states
  hasScheduledInterview: boolean;
  interviewNeedsConfirmation: boolean;
  interviewRescheduleRequested: boolean;
  interviewConfirmed: boolean;
  
  // States
  isRejected: boolean;
  isHired: boolean;
  isWaitingPhase: boolean;
  isPendingReview: boolean;
  hasPhaseData: boolean;
  
  // Voice interview specific
  isVoiceInterviewComplete: boolean;
  voiceInterviewVideoEnabled: boolean;
}

export function getApplicationDisplayState(application: ApplicationWithJob): ApplicationDisplayState {
  const phase = application.phase || "application";
  const job = application.jobs;
  const phaseType = getPhaseType(phase, (job as any)?.workflow_steps as any[]);
  
  // Get interview status for this application
  const latestInterview = application.latestInterview;
  const hasScheduledInterview = !!(latestInterview && latestInterview.status === "scheduled");
  const interviewNeedsConfirmation = hasScheduledInterview && 
    (!latestInterview?.candidate_response || latestInterview?.candidate_response === "pending");
  const interviewRescheduleRequested = hasScheduledInterview && 
    latestInterview?.candidate_response === "reschedule_requested";
  const interviewConfirmed = hasScheduledInterview && 
    latestInterview?.candidate_response === "confirmed";
  
  // Parse notes to check if phase has been submitted
  let notes: Record<string, any> = {};
  try {
    notes = application.notes ? JSON.parse(application.notes as string) : {};
  } catch {
    // ignore
  }
  
  // Check if the current phase has been completed/submitted
  const hasPhaseData = (() => {
    // Application phase: check for submitted application answers
    if (phaseType === "application" || phase === "application") {
      const answers = notes.applicationAnswers;
      return Array.isArray(answers) && answers.length > 0;
    }
    if (phaseType === "quiz") {
      const stepData = notes[phase];
      return !!(stepData?.completedAt || notes.quizResult || notes.quiz?.completedAt);
    }
    if (phaseType === "typing_test") return !!notes.typingTestResult;
    if (phaseType === "video_intro") return !!notes.videoIntroUrl || !!notes[phase]?.videoIntroUrl;
    if (phaseType === "video_message") return !!notes.videoIntroUrl || !!notes[phase]?.videoIntroUrl;
    if (phaseType === "chat_simulation") return !!notes.chatSimulationResult;
    if (phaseType === "chat_interview") return !!notes.chatInterviewResult;
    if (phaseType === "sales_simulation") return !!notes.salesSimulationResult;
    // Voice interview result is stored in a dedicated column, not notes JSON
    if (phaseType === "voice_interview") return !!application.voice_interview_result;
    // Portfolio upload: check for completed flag or portfolio URLs
    if (phaseType === "portfolio_upload") return !!notes[phase]?.completed || !!notes[phase]?.portfolioUrls?.length || !!notes.portfolioResult;
    return false;
  })();
  
  // Determine states - "application" is NOT a waiting phase, it's a candidate action phase
  // Only employer-controlled phases are waiting phases
  const isWaitingPhase = ["review", "interview", "hired"].includes(phase);
  const actionConfig = phaseActionConfig[phaseType];
  const hasActionRequired = !isWaitingPhase && !!actionConfig && !hasPhaseData;
  const isPendingReview = !isWaitingPhase && hasPhaseData && application.status !== "rejected" && application.status !== "hired";
  
  const isRejected = application.status === "rejected";
  const isHired = application.status === "hired";
  
  // Build action label and route
  let actionLabel = actionConfig?.label || "";
  const actionRoute = actionConfig?.route || "";
  let actionIcon: React.ElementType | null = actionConfig?.icon || null;
  
  // Voice interview specific adjustments
  const voiceInterviewVideoEnabled = application.voice_interview_video_enabled !== false;
  if (phaseType === "voice_interview") {
    actionLabel = voiceInterviewVideoEnabled ? "Start Video Interview" : "Start Voice Interview";
    if (voiceInterviewVideoEnabled) {
      actionIcon = Video;
    }
  }
  
  return {
    showActionButton: hasActionRequired,
    actionLabel,
    actionRoute,
    actionIcon,
    statusLabel: statusLabels[application.status] || application.status,
    statusColor: statusColors[application.status] || statusColors.pending,
    phaseType,
    hasScheduledInterview,
    interviewNeedsConfirmation,
    interviewRescheduleRequested,
    interviewConfirmed,
    isRejected,
    isHired,
    isWaitingPhase,
    isPendingReview,
    hasPhaseData,
    isVoiceInterviewComplete: phaseType === "voice_interview" && hasPhaseData,
    voiceInterviewVideoEnabled,
  };
}
