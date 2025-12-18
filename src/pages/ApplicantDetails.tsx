import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { format } from "date-fns";
import { 
  ArrowLeft, FileText, MessageSquare, Sparkles, 
  XCircle, GripHorizontal, Clock, RefreshCw, 
  FileCheck, ClipboardList, Video, Keyboard, Mic,
  Eye, Users, CheckCircle, Loader2, Mail, ExternalLink,
  Calendar, AlertTriangle, ShieldAlert, ShieldCheck, Shield,
  HelpCircle, Move, Zap, AlertCircle, Download, FastForward
} from "lucide-react";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import ApplicantNotesDialog from "@/components/ApplicantNotesDialog";
import ApplicantMessageDialog from "@/components/ApplicantMessageDialog";
import { SalesAnalysisDialog } from "@/components/SalesAnalysisDialog";
import { AvaInterviewConfigDialog } from "@/components/AvaInterviewConfigDialog";
import { VoiceInterviewResultsDialog } from "@/components/VoiceInterviewResultsDialog";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { MediaPlayer } from "@/components/MediaPlayer";
import { useApplicantDossier } from "@/hooks/useApplicantDossier";
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
  profiles: Tables<"profiles"> | null;
  jobs: (Tables<"jobs"> & { workflow_steps?: WorkflowStep[] }) | null;
}

// Default phases if job has no workflow
const defaultPhases = [
  { id: "application", title: "Application", icon: FileCheck, type: "application" },
  { id: "review", title: "Review", icon: Eye, type: "review" },
  { id: "interview", title: "Interview", icon: Users, type: "interview" },
  { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" },
];

// Map workflow step types to icons
const stepTypeIcons: Record<string, any> = {
  application: FileCheck,
  quiz: ClipboardList,
  video_intro: Video,
  video_message: Video,
  portfolio_upload: FileCheck,
  typing_test: Keyboard,
  chat_simulation: MessageSquare,
  chat_interview: MessageSquare,
  sales_simulation: MessageSquare,
  voice_interview: Users,
  review: Eye,
  interview: Users,
  hired: CheckCircle,
};

// Colors for different phase states
const phaseColors = {
  completed: "bg-success",
  current: "bg-warning",
  upcoming: "bg-muted",
};

// Component to render AI analysis with proper formatting
type SectionContext = 'neutral' | 'strengths' | 'concerns' | 'critical';

interface ParsedSection {
  type: 'score' | 'heading' | 'list' | 'paragraph';
  text: string;
  context?: SectionContext;
}

interface ListItem {
  text: string;
  context: SectionContext;
}

function AIAnalysisContent({ content }: { content: string }) {
  // Parse the content into sections with context tracking
  const sections: ParsedSection[] = [];
  
  const lines = content.split('\n');
  let currentList: ListItem[] = [];
  let currentSection: SectionContext = 'neutral';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
        currentList = [];
      }
      continue;
    }
    
    // Check for score line
    if (trimmed.match(/^\*\*Overall Score:\s*\d+\*\*$/)) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
        currentList = [];
      }
      const scoreMatch = trimmed.match(/\d+/);
      if (scoreMatch) {
        sections.push({ type: 'score', text: scoreMatch[0] });
      }
      continue;
    }
    
    // Check for headings (bold text like **Key Strengths:**)
    if (trimmed.match(/^\*\*[^*]+:\*\*$/)) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
        currentList = [];
      }
      const headingText = trimmed.replace(/\*\*/g, '');
      const lowerText = headingText.toLowerCase();
      
      // Track section context for list items
      if (lowerText.includes('strength') || lowerText.includes('positive') || lowerText.includes('matching skills')) {
        currentSection = 'strengths';
      } else if (lowerText.includes('concern') || lowerText.includes('areas') || lowerText.includes('missing') || lowerText.includes('questionable')) {
        currentSection = 'concerns';
      } else if (lowerText.includes('red flag') || lowerText.includes('critical') || lowerText.includes('fabricat') || lowerText.includes('suspicious') || lowerText.includes('invalid')) {
        currentSection = 'critical';
      } else {
        currentSection = 'neutral';
      }
      
      sections.push({ type: 'heading', text: headingText, context: currentSection });
      continue;
    }
    
    // Check for recommendation (bold text with value)
    if (trimmed.match(/^\*\*Recommendation:\s*[^*]+\*\*$/)) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
        currentList = [];
      }
      const recText = trimmed.replace(/\*\*/g, '');
      currentSection = 'neutral';
      sections.push({ type: 'heading', text: recText, context: currentSection });
      continue;
    }
    
    // Check for list items
    if (trimmed.startsWith('- ')) {
      currentList.push({ text: trimmed.substring(2), context: currentSection });
      continue;
    }
    
    // Regular paragraph
    if (currentList.length > 0) {
      sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
      currentList = [];
    }
    sections.push({ type: 'paragraph', text: trimmed.replace(/\*\*/g, ''), context: currentSection });
  }
  
  // Don't forget remaining list items
  if (currentList.length > 0) {
    sections.push({ type: 'list', text: JSON.stringify(currentList), context: currentSection });
  }
  
  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        if (section.type === 'score') {
          return (
            <div key={index} className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Overall Score:</span>
              <span className="text-2xl font-bold text-primary">{section.text}</span>
              <span className="text-muted-foreground">/100</span>
            </div>
          );
        }
        
        if (section.type === 'heading') {
          const isRecommendation = section.text.toLowerCase().includes('recommendation');
          const headingColorClass = 
            isRecommendation ? 'text-primary' :
            section.context === 'strengths' ? 'text-emerald-500' : 
            section.context === 'concerns' ? 'text-amber-500' : 
            section.context === 'critical' ? 'text-red-400' :
            'text-foreground';
          
          return (
            <h4 
              key={index} 
              className={`font-semibold text-sm pt-2 ${headingColorClass}`}
            >
              {section.text}
            </h4>
          );
        }
        
        if (section.type === 'list') {
          let items: ListItem[] = [];
          try {
            items = JSON.parse(section.text);
          } catch {
            // Fallback for old format
            items = section.text.split('|||').map(t => ({ text: t, context: 'neutral' as SectionContext }));
          }
          
          return (
            <ul key={index} className="space-y-2 pl-4">
              {items.map((item, i) => {
                const bulletColor = 
                  item.context === 'strengths' ? 'text-emerald-500' :
                  item.context === 'concerns' ? 'text-amber-500' :
                  item.context === 'critical' ? 'text-red-400' : 
                  'text-primary';
                const textColor = 
                  item.context === 'strengths' ? 'text-emerald-300/90' :
                  item.context === 'concerns' ? 'text-amber-300/90' :
                  item.context === 'critical' ? 'text-red-300/90' : 
                  'text-muted-foreground';
                
                return (
                  <li key={i} className={`text-sm flex items-start gap-2 ${textColor}`}>
                    <span className={`mt-1.5 ${bulletColor}`}>•</span>
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          );
        }
        
        return (
          <p key={index} className="text-sm text-muted-foreground leading-relaxed">
            {section.text}
          </p>
        );
      })}
    </div>
  );
}

export default function ApplicantDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const updateApplication = useUpdateApplication();
  const { data: permissions } = useTeamMemberPermissions();
  const { downloadDossier, isGenerating: isGeneratingDossier } = useApplicantDossier();
  
  // Permission checks for team members
  const canManagePipeline = permissions?.isTeamMember ? permissions.canManagePipeline : true;
  const canScheduleInterviews = permissions?.isTeamMember ? permissions.canScheduleInterviews : true;
  const canMessageCandidates = permissions?.isTeamMember ? permissions.canMessageCandidates : true;
  const canSendDocuments = permissions?.isTeamMember ? permissions.canSendDocuments : true;
  const queryClient = useQueryClient();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [isAwaitingReview, setIsAwaitingReview] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [activeBadgeDialog, setActiveBadgeDialog] = useState<string | null>(null);
  const [showInterviewWizard, setShowInterviewWizard] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [pendingPhaseChange, setPendingPhaseChange] = useState<{
    newIndex: number;
    newPhase: { id: string; title: string; type: string };
    phasesToReset: { id: string; title: string; type: string }[];
  } | null>(null);
  const [showResetPhaseDialog, setShowResetPhaseDialog] = useState(false);
  const [phaseToReset, setPhaseToReset] = useState<{ id: string; title: string; type: string } | null>(null);
  const [showSalesAnalysisDialog, setShowSalesAnalysisDialog] = useState(false);
  const [salesAnalysisData, setSalesAnalysisData] = useState<any>(null);
  const [showAvaInterviewConfig, setShowAvaInterviewConfig] = useState(false);
  const [showVoiceInterviewResults, setShowVoiceInterviewResults] = useState(false);
  const [pendingAvaInterview, setPendingAvaInterview] = useState<{
    newIndex: number;
    newPhase: { id: string; title: string; type: string };
  } | null>(null);
  const [showHiringDocumentPrompt, setShowHiringDocumentPrompt] = useState(false);
  const [showDocumentWizard, setShowDocumentWizard] = useState(false);
  const [documentWizardMode, setDocumentWizardMode] = useState<"generate" | "upload" | undefined>();
  const sliderRef = useRef<HTMLDivElement>(null);

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

  // Build phases from workflow_steps or use defaults
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = application?.jobs?.quiz_questions as any[] | undefined;
    
    if (workflowSteps && workflowSteps.length > 0) {
      // Start with application phase
      const allPhases: { id: string; title: string; icon: any; type: string }[] = [
        { id: "application", title: "Application", icon: FileCheck, type: "application" },
      ];
      
      // Add Quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({
          id: "quiz",
          title: "Quiz",
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
          icon: stepTypeIcons[step.type] || ClipboardList,
          type: step.type,
        });
      });
      
      // Add Review phase - only in Autopilot mode
      const isAutoPilotMode = application?.jobs?.processing_mode === "auto";
      if (isAutoPilotMode) {
        allPhases.push(
          { id: "review", title: "Review", icon: Eye, type: "review" }
        );
      }
      
      // Add Ava Interview AFTER review if it exists in workflow
      if (voiceInterviewStep) {
        allPhases.push({
          id: voiceInterviewStep.id,
          title: "Ava Interview",
          icon: stepTypeIcons.voice_interview || Users,
          type: "voice_interview",
        });
      }
      
      allPhases.push(
        { id: "interview", title: "Interview", icon: Users, type: "interview" },
        { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" }
      );
      return allPhases;
    }
    return defaultPhases;
  })();

  // Find current phase index with fuzzy matching to handle spaces/underscores
  const normalizePhase = (str: string | null | undefined) => str?.toLowerCase().replace(/[\s-]/g, '_') || '';
  
  const currentPhaseIndex = phases.findIndex(p => {
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
  const effectivePhaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : 0;

  // Parse submitted data from notes (moved earlier for use in phase completion check)
  const parsedNotes = (() => {
    try {
      return application?.notes ? JSON.parse(application.notes) : {};
    } catch {
      return {};
    }
  })();

  // Check if candidate has completed the current phase (awaiting employer review)
  const hasCompletedCurrentPhase = (phaseId: string, phaseType: string): boolean => {
    if (phaseType === "application") {
      return !!(application?.cover_letter || parsedNotes.applicationAnswers?.length > 0);
    }
    if (phaseType === "quiz") {
      return !!(parsedNotes.quizAnswers?.[phaseId] || parsedNotes.quizAnswers);
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

  // Check if currently in manual mode (not autopilot)
  const isManualMode = application?.jobs?.processing_mode !== "auto";

  // Calculate avatar position based on phase
  useEffect(() => {
    if (sliderRef.current && !isDragging) {
      const currentPhase = phases[effectivePhaseIndex];
      const isComplete = currentPhase ? hasCompletedCurrentPhase(currentPhase.id, currentPhase.type) : false;
      const isLastPhase = effectivePhaseIndex === phases.length - 1;
      
      // Show halfway position after Ava Interview completes in Autopilot mode
      const isVoiceInterviewCompleted = 
        currentPhase?.type === "voice_interview" && 
        !!application?.voice_interview_result;
      
      // Await review in Manual mode for any phase, OR in Autopilot after Ava Interview
      const awaitingReview = isComplete && !isLastPhase && (isManualMode || isVoiceInterviewCompleted);
      
      // Debug logging for slider position issues
      console.log('[Slider Position Debug]', {
        currentPhase: currentPhase?.id,
        phaseType: currentPhase?.type,
        isComplete,
        isLastPhase,
        isManualMode,
        isVoiceInterviewCompleted,
        awaitingReview,
        hasVoiceResult: !!application?.voice_interview_result,
        effectivePhaseIndex,
        phasesCount: phases.length
      });
      
      setIsAwaitingReview(awaitingReview);
      
      // Add 0.5 offset if awaiting review (halfway to next phase)
      const adjustedPosition = awaitingReview 
        ? effectivePhaseIndex + 0.5 
        : effectivePhaseIndex;
      
      const percentage = (adjustedPosition / (phases.length - 1)) * 100;
      setDragPosition(percentage);
    }
  }, [effectivePhaseIndex, phases.length, isDragging, parsedNotes, application, isManualMode]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setDragPosition(percentage);
  };

  const handleDragEnd = async () => {
    if (!isDragging || !application) return;
    setIsDragging(false);
    
    // Calculate nearest phase
    const stepSize = 100 / (phases.length - 1);
    const nearestIndex = Math.round(dragPosition / stepSize);
    const newPhase = phases[nearestIndex];
    
    // Debug logging to troubleshoot slider issues
    console.log("[Slider Debug]", {
      dragPosition,
      nearestIndex,
      newPhase: newPhase?.id,
      currentPhase: application.phase,
      effectivePhaseIndex,
      phasesCount: phases.length,
      canManagePipeline,
    });
    
    // Check if the phase actually changed (comparing by index rather than just phase ID)
    const isPhaseChange = nearestIndex !== effectivePhaseIndex;
    
    if (newPhase && isPhaseChange) {
      const currentIndex = effectivePhaseIndex;
      
      // Check if moving backward (resetting phases)
      if (nearestIndex < currentIndex) {
        console.log("[Slider Debug] Moving backward from", currentIndex, "to", nearestIndex);
        // Get phases that will be reset
        const phasesToReset = phases.slice(nearestIndex, currentIndex + 1);
        setPendingPhaseChange({
          newIndex: nearestIndex,
          newPhase,
          phasesToReset,
        });
        setShowResetConfirmation(true);
        // Don't snap yet - wait for confirmation
        return;
      }
      
      // Moving forward - check if voice_interview phase
      console.log("[Slider Debug] Moving forward from", currentIndex, "to", nearestIndex);
      
      if (newPhase.type === "voice_interview") {
        // Show Ava Interview config dialog instead of executing immediately
        setPendingAvaInterview({ newIndex: nearestIndex, newPhase });
        setShowAvaInterviewConfig(true);
        return;
      }
      
      await executePhaseChange(nearestIndex, newPhase, false);
    }
    
    // Snap to position
    const snapPercentage = (nearestIndex / (phases.length - 1)) * 100;
    setDragPosition(snapPercentage);
  };

  const executePhaseChange = async (
    newIndex: number,
    newPhase: { id: string; title: string; type: string },
    isBackward: boolean
  ) => {
    if (!application) return;
    
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
        
        // Determine if we're resetting to application phase (clear ai_score and resume)
        const isResetToApplication = newPhase.type === "application" || newPhase.id === "application";
        
        // Check if any voice_interview phases are being reset
        const isResettingVoiceInterview = phasesToReset.some((p: any) => p.type === "voice_interview");
        
        // If resetting to application, also clear the application answers so candidate can re-submit
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
        // Moving forward - track skipped phases (exclude destination phase)
        const skippedPhases = phases.slice(currentIndex + 1, newIndex).map((p) => p.id);
        
        if (skippedPhases.length > 0) {
          updatedNotes.employerSkippedPhases = [
            ...(updatedNotes.employerSkippedPhases || []),
            ...skippedPhases,
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
        
        // Auto-open interview scheduler when moving to interview phase
        if (newPhase.type === "interview") {
          setShowInterviewWizard(true);
        }
        
        // Show hiring document prompt when moving to hired phase
        if (newPhase.type === "hired") {
          setShowHiringDocumentPrompt(true);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["application", id] });
    } catch (error) {
      toast.error("Failed to update phase");
    }
    
    // Snap to position
    const snapPercentage = (newIndex / (phases.length - 1)) * 100;
    setDragPosition(snapPercentage);
  };

  const handleConfirmReset = async () => {
    if (!pendingPhaseChange) return;
    
    await executePhaseChange(
      pendingPhaseChange.newIndex,
      pendingPhaseChange.newPhase,
      true
    );
    
    setShowResetConfirmation(false);
    setPendingPhaseChange(null);
  };

  const handleCancelReset = () => {
    setShowResetConfirmation(false);
    setPendingPhaseChange(null);
    
    // Snap back to current position
    const snapPercentage = (effectivePhaseIndex / (phases.length - 1)) * 100;
    setDragPosition(snapPercentage);
  };

  // Handle Schedule Interview button click - syncs with slider
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
      // Track skipped phases (from current position to interview, excluding destination)
      let updatedNotes = { ...parsedNotes };
      const skippedPhases = phases.slice(effectivePhaseIndex + 1, interviewPhaseIndex).map(p => p.id);
      
      if (skippedPhases.length > 0) {
        updatedNotes.employerSkippedPhases = [
          ...(updatedNotes.employerSkippedPhases || []),
          ...skippedPhases,
        ];
      }
      
      // Update application: phase, status, and notes
      await updateApplication.mutateAsync({
        id: application.id,
        phase: interviewPhase.id,
        status: "interview",
        notes: JSON.stringify(updatedNotes),
      });
      
      // Update slider position visually
      const snapPercentage = (interviewPhaseIndex / (phases.length - 1)) * 100;
      setDragPosition(snapPercentage);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      
      toast.success("Advanced to Interview phase");
      
      // Open the wizard
      setShowInterviewWizard(true);
    } catch (error) {
      toast.error("Failed to advance to interview phase");
    }
  };

  // Reset a single phase without affecting others
  const handleResetSinglePhase = async () => {
    if (!application || !phaseToReset) return;
    
    try {
      let updatedNotes = { ...parsedNotes };
      const phaseId = phaseToReset.id;
      const phaseType = phaseToReset.type;
      
      // Clear step ID data
      delete updatedNotes[phaseId];
      
      // Clear specific phase data based on type
      if (phaseType === "typing_test") {
        delete updatedNotes.typingTestResult;
      }
      if (phaseType === "chat_simulation") {
        delete updatedNotes.chatSimulationResult;
      }
      if (phaseType === "chat_interview") {
        delete updatedNotes.chatInterviewResult;
      }
      if (phaseType === "sales_simulation") {
        delete updatedNotes.salesSimulationResult;
      }
      if (phaseType === "quiz") {
        // Delete all possible quiz data formats
        delete updatedNotes.quiz;
        delete updatedNotes.quizResult;
        if (updatedNotes.quizAnswers) {
          delete updatedNotes.quizAnswers[phaseId];
          delete updatedNotes.quizAnswers['quiz'];
          if (Object.keys(updatedNotes.quizAnswers).length === 0) {
            delete updatedNotes.quizAnswers;
          }
        }
      }
      if (phaseType === "video_intro" || phaseType === "video_message") {
        delete updatedNotes.videoIntroUrl;
        delete updatedNotes.videoIntroResult;
      }
      if (phaseType === "portfolio_upload") {
        // Already deleted via updatedNotes[phaseId]
      }
      if (phaseType === "voice_interview") {
        // Voice interview result is stored separately
      }
      
      // Remove from employer-skipped list if it was there
      if (updatedNotes.employerSkippedPhases) {
        updatedNotes.employerSkippedPhases = updatedNotes.employerSkippedPhases.filter(
          (id: string) => id !== phaseId
        );
        if (updatedNotes.employerSkippedPhases.length === 0) {
          delete updatedNotes.employerSkippedPhases;
        }
      }
      
      // Build update payload
      const updatePayload: any = {
        id: application.id,
        notes: JSON.stringify(updatedNotes),
        phase_ai_analysis: null, // Clear phase analysis
      };
      
      // Clear voice interview result and recording if resetting that phase
      if (phaseType === "voice_interview") {
        updatePayload.voice_interview_result = null;
        updatePayload.voice_interview_recording_url = null;
      }
      
      await updateApplication.mutateAsync(updatePayload);
      
      // Create notification for candidate
      await supabase.from("notifications").insert({
        user_id: application.candidate_id,
        type: "status_update",
        title: "Phase Reset",
        message: `You can now re-submit your ${phaseToReset.title}. Please complete it again.`,
        link: `/applications/${application.id}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      toast.success(`${phaseToReset.title} has been reset. Candidate can now re-submit.`);
      
      setShowResetPhaseDialog(false);
      setPhaseToReset(null);
      setActiveBadgeDialog(null);
    } catch (error) {
      console.error("Error resetting phase:", error);
      toast.error("Failed to reset phase");
    }
  };

  const handleReject = async () => {
    if (!application) return;
    try {
      await updateApplication.mutateAsync({ id: application.id, status: "rejected" });
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      toast.success("Candidate rejected");
      navigate("/applicants");
    } catch (error) {
      toast.error("Failed to reject candidate");
    }
  };

  const handleReanalyze = async () => {
    if (!application) return;
    setIsAnalyzing(true);
    
    try {
      // Include application answers from notes if they exist
      const applicationAnswersText = parsedNotes.applicationAnswers?.length > 0
        ? parsedNotes.applicationAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
        : "Not provided";

      let content = `
Job Title: ${application.jobs?.title || "Unknown"}
Job Description: ${application.jobs?.description || "Not provided"}
Requirements: ${application.jobs?.requirements || "Not specified"}
Skills Required: ${application.jobs?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${application.jobs?.experience_level || "Not specified"}

Candidate Information:
Name: ${application.profiles?.full_name || "Unknown"}
Email: ${application.profiles?.email || "Not provided"}
Skills: ${application.profiles?.skills?.join(", ") || "Not specified"}
Experience Years: ${application.profiles?.experience_years || "Not specified"}
Bio: ${application.profiles?.bio || "Not provided"}
Location: ${application.profiles?.location || "Not specified"}

Application Answers:
${applicationAnswersText}

Cover Letter:
${application.cover_letter || "Not provided"}

Resume URL: ${application.resume_url || "Not provided"}
`;

      // Add Typing Test results if available
      if (parsedNotes.typingTestResult) {
        content += `
Typing Test Results:
- Speed: ${parsedNotes.typingTestResult.wpm} WPM
- Accuracy: ${parsedNotes.typingTestResult.accuracy}%
- Consistency Score: ${parsedNotes.typingTestResult.consistency || 'N/A'}
`;
      }

      // Add Quiz answers if available (check multiple formats)
      const quizData = parsedNotes.quizResult || parsedNotes.quiz;
      if (quizData) {
        content += `
Quiz Performance:
- Score: ${quizData.score || quizData.percentage || 'N/A'}%
- Correct: ${quizData.correct || 'N/A'}/${quizData.total || 'N/A'}
- Passed: ${quizData.passed ? 'Yes' : 'No'}
`;
      }

      // Add Chat Simulation results if available
      if (parsedNotes.chatSimulationResult) {
        content += `
Chat Simulation (Customer Support) Results:
- Score: ${parsedNotes.chatSimulationResult.score || 'N/A'}/100
- Evaluation: ${parsedNotes.chatSimulationResult.evaluation || 'N/A'}
`;
      }

      // Add Chat Interview results if available  
      if (parsedNotes.chatInterviewResult) {
        content += `
Interview Results:
- Overall Score: ${parsedNotes.chatInterviewResult.overallScore || 'N/A'}/100
- Evaluation: ${parsedNotes.chatInterviewResult.evaluation || 'N/A'}
`;
      }

      // Add Sales Simulation results if available
      if (parsedNotes.salesSimulationResult) {
        content += `
Sales Simulation Results:
- Score: ${parsedNotes.salesSimulationResult.score || 'N/A'}/100
- Evaluation: ${parsedNotes.salesSimulationResult.evaluation || 'N/A'}
`;
      }

      // Add Video Intro URL if available
      if (parsedNotes.videoIntroUrl) {
        content += `
Video Introduction: Submitted (demonstrates candidate effort and initiative)
`;
      }

      // Add Portfolio results if available
      if (parsedNotes.portfolioResult) {
        const analysis = parsedNotes.portfolioResult.aiAnalysis || parsedNotes.portfolioResult.analysis;
        content += `
Portfolio Upload:
- Files: ${parsedNotes.portfolioResult.files?.length || parsedNotes.portfolioResult.fileCount || 'N/A'} files submitted
- Score: ${analysis?.score || parsedNotes.portfolioResult.score || 'N/A'}/100
`;
      }

      // Add Voice Interview results if available (stored as separate column)
      if (application.voice_interview_result) {
        const vr = application.voice_interview_result as any;
        content += `
Voice Interview with AVA Results:
- Overall Score: ${vr.overall_score || 'N/A'}/100
- Recommendation: ${vr.recommendation || 'N/A'}
- Technical Score: ${vr.technical_score || 'N/A'}/100
- Communication Score: ${vr.communication_score || 'N/A'}/100
- Culture Fit Score: ${vr.culture_fit_score || 'N/A'}/100
- Credibility Rating: ${vr.credibility_rating || 'N/A'}
- Summary: ${vr.summary || 'Not provided'}
- Concerns: ${vr.concerns?.join(', ') || 'None noted'}
`;
      }

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "resume",
          content,
          resumeUrl: application.resume_url || null,
          context: {
            skills_required: application.jobs?.skills_required,
            experience_level: application.jobs?.experience_level,
            job_title: application.jobs?.title,
            job_type: application.jobs?.job_type,
          },
        },
      });

      if (error) throw error;

      // Extract score from analysis - but only use if no existing score
      const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
      const newScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
      
      // Preserve existing score - AVA stands by her original assessment
      const existingScore = application.ai_score;

      await updateApplication.mutateAsync({
        id: application.id,
        ai_analysis: data.analysis,
        ai_score: existingScore ?? (newScore && newScore >= 0 && newScore <= 100 ? newScore : null),
      });

      queryClient.invalidateQueries({ queryKey: ["application", id] });
      toast.success("AI analysis completed!");
    } catch (error) {
      console.error("AI analysis error:", error);
      toast.error("Failed to run AI analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };

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

  // Helper to get resume URL from either resume_url field or application answers
  const getResumeUrl = (): string | null => {
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
  };

  const resumeUrl = getResumeUrl();

  // Build badge data from workflow steps
  const workflowBadges = (() => {
    const workflowSteps = job?.workflow_steps as WorkflowStep[] | undefined;
    const quizQuestions = job?.quiz_questions as any[] | undefined;
    const skippedPhases = parsedNotes.employerSkippedPhases || [];
    const badges: { id: string; title: string; type: string; hasData: boolean; isSkipped: boolean; score?: number; icon: any }[] = [];
    
    // Application badge (always present)
    const hasApplicationData = !!(application.cover_letter || parsedNotes.applicationAnswers?.length > 0);
    badges.push({
      id: "application",
      title: "Application",
      type: "application",
      hasData: hasApplicationData,
      isSkipped: false,
      icon: FileCheck,
    });
    
    // Resume badge (if resume uploaded or required)
    if (job?.require_resume !== false || resumeUrl) {
      badges.push({
        id: "resume",
        title: "Resume",
        type: "resume",
        hasData: !!resumeUrl,
        isSkipped: skippedPhases.includes("resume"),
        score: application.ai_score || undefined,
        icon: FileText,
      });
    }
    
    // Quiz badge (if quiz_questions exist)
    if (quizQuestions && quizQuestions.length > 0) {
      const quizData = parsedNotes.quiz || parsedNotes.quizResult || parsedNotes.quizAnswers;
      badges.push({
        id: "quiz",
        title: "Quiz",
        type: "quiz",
        hasData: !!quizData,
        isSkipped: skippedPhases.includes("quiz"),
        score: quizData?.score,
        icon: ClipboardList,
      });
    }
    
    // Workflow step badges
    if (workflowSteps && workflowSteps.length > 0) {
      workflowSteps.forEach(step => {
        const stepData = getStepSubmissionData(step.id, step.type);
        badges.push({
          id: step.id,
          title: step.title.length > 15 ? step.title.substring(0, 12) + "..." : step.title,
          type: step.type,
          hasData: !!stepData,
          isSkipped: skippedPhases.includes(step.id),
          score: stepData?.score,
          icon: stepTypeIcons[step.type] || ClipboardList,
        });
      });
    }
    
    return badges;
  })();

  // Standardized display titles for phase types
  const typeDisplayTitles: Record<string, string> = {
    video_intro: "Video Intro",
    video_message: "Video Intro",
    typing_test: "Typing Test",
    chat_simulation: "Chat Simulation",
    chat_interview: "Interview",
    sales_simulation: "Sales Simulation",
    portfolio_upload: "Portfolio",
    quiz: "Quiz",
    voice_interview: "Voice Interview with Ava",
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
    const displayTitle = typeDisplayTitles[badgeType] || workflowBadges.find(b => b.id === badgeId)?.title || badgeId;
    return {
      title: displayTitle,
      content: stepData,
      type: badgeType,
    };
  };

  return (
    <div 
      className="space-y-6"
      onMouseMove={handleDrag}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchMove={handleDrag}
      onTouchEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate("/applicants")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applicants
        </Button>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => downloadDossier(application)}
            disabled={isGeneratingDossier}
            className="gap-2"
          >
            {isGeneratingDossier ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Dossier
          </Button>
          {canScheduleInterviews && (
            <Button 
              onClick={handleScheduleInterviewClick}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              Schedule Interview
            </Button>
          )}
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => setShowNotesDialog(true)}
          >
            <FileText className="h-4 w-4" />
            Notes
            {application?.employer_notes && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
          {canMessageCandidates && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setShowMessageDialog(true)}
            >
              <MessageSquare className="h-4 w-4" />
              Message
            </Button>
          )}
        </div>
      </div>

      {/* Candidate Journey */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Candidate Journey</span>
            </div>
            
            <div className="flex items-center gap-3">
              {canManagePipeline && (
                <Button 
                  variant="outline" 
                  onClick={handleReject}
                  className="gap-2 text-destructive border-destructive/50 hover:bg-destructive/10"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Candidate
                </Button>
              )}
              {canManagePipeline && (
                <Button 
                  variant="outline" 
                  onClick={() => setShowHelpDialog(true)}
                  className="gap-2 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50 hover:bg-primary/15 transition-all"
                >
                  <Move className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Hold & Drag</span>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
              {!canManagePipeline && (
                <Badge variant="secondary" className="text-xs">
                  View Only Mode
                </Badge>
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
            
            {/* Completed progress */}
            <div 
              className="absolute top-8 left-0 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${dragPosition}%`,
                background: "linear-gradient(90deg, hsl(var(--success)) 0%, hsl(var(--warning)) 100%)"
              }}
            />

            {/* Phase markers */}
            {phases.map((phase, index) => {
              const position = (index / (phases.length - 1)) * 100;
              const Icon = phase.icon;
              const isCompleted = index < effectivePhaseIndex;
              const isCurrent = index === effectivePhaseIndex;
              const isSkipped = parsedNotes.employerSkippedPhases?.includes(phase.id);
              
              return (
                <div 
                  key={phase.id}
                  className="absolute flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${position}%` }}
                >
                  {/* Dot */}
                  <div 
                    className={`w-4 h-4 rounded-full border-2 border-background mt-6 z-10 ${
                      isSkipped ? "bg-amber-500" :
                      isCompleted ? phaseColors.completed : 
                      isCurrent ? phaseColors.current : 
                      phaseColors.upcoming
                    }`}
                  />
                  
                  {/* Icon & Label */}
                  <div className="mt-3 flex flex-col items-center">
                    {isSkipped ? (
                      <FastForward className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Icon className={`h-5 w-5 ${
                        isCompleted ? "text-success" : 
                        isCurrent ? "text-warning" : 
                        "text-muted-foreground"
                      }`} />
                    )}
                    <span className={`text-xs mt-1 ${
                      isSkipped ? "text-amber-500" :
                      isCompleted ? "text-success" : 
                      isCurrent ? "text-warning" : 
                      "text-muted-foreground"
                    }`}>
                      {isSkipped ? "Skipped" : phase.title}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Draggable avatar */}
            <div 
              className={`absolute top-3 z-20 ${
                isAwaitingReview && !isDragging ? "animate-float-awaiting" : "-translate-x-1/2"
              } ${
                canManagePipeline ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-70"
              } ${
                phases[effectivePhaseIndex]?.type === "review" && !isDragging && canManagePipeline && !isAwaitingReview ? "animate-bounce-subtle" : ""
              }`}
              style={{ left: `${dragPosition}%` }}
              onMouseDown={canManagePipeline ? handleDragStart : undefined}
              onTouchStart={canManagePipeline ? handleDragStart : undefined}
            >
              <Avatar className={`h-10 w-10 ring-4 ${isAwaitingReview ? "ring-warning/50" : "ring-primary/30"}`}>
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Mode Indicator */}
      {isAutoPilot ? (
        <Card className="bg-card border-border border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold text-primary">Auto-Pilot Mode Active</h3>
                <p className="text-sm text-muted-foreground">
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

      {/* Applicant Info */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          {/* Phase Tags - Clickable */}
          <div className="flex flex-wrap gap-2 mb-6">
            {isAutoPilot ? (
              <Badge className="bg-primary/20 text-primary border-primary/30">
                <Sparkles className="h-3 w-3 mr-1" />
                Auto-Pilot
              </Badge>
            ) : (
              <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">
                <Eye className="h-3 w-3 mr-1" />
                Manual
              </Badge>
            )}
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
                  {badge.title}
                  {badge.isSkipped && " (Skipped)"}
                  {!badge.isSkipped && badge.score && ` (${badge.score})`}
                </Badge>
              );
            })}
          </div>

          {/* Name & Details */}
          <h2 className="text-2xl font-bold text-foreground">{profile?.full_name || "Unknown Candidate"}</h2>
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

      {/* AVA's Analysis */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">AVA's Analysis</span>
              {application.ai_score && (
                <Badge className="bg-primary/20 text-primary">
                  {application.ai_score}/100
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {application.updated_at && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Updated: {format(new Date(application.updated_at), "MMM d, hh:mm a")}
                </div>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleReanalyze}
                disabled={isAnalyzing}
                className="gap-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-analyze
              </Button>
              <Button variant="outline" size="sm">
                Employer Only
              </Button>
            </div>
          </div>

          {/* What AVA analyzed */}
          {application.ai_analysis && (
            <>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-sm text-muted-foreground">AVA analyzed:</span>
                {resumeUrl && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Resume
                  </Badge>
                )}
                {(parsedNotes.applicationAnswers?.length > 0 || application.cover_letter) && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Application Answers
                  </Badge>
                )}
                {parsedNotes.typingTestResult && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Typing Test
                  </Badge>
                )}
                {(parsedNotes.quizResult || parsedNotes.quiz || (parsedNotes.quizAnswers && Object.keys(parsedNotes.quizAnswers).length > 0)) && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Quiz
                  </Badge>
                )}
                {parsedNotes.chatSimulationResult && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Chat Simulation
                  </Badge>
                )}
                {parsedNotes.chatInterviewResult && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Interview
                  </Badge>
                )}
                {parsedNotes.salesSimulationResult && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Sales Simulation
                  </Badge>
                )}
                {parsedNotes.portfolioResult && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Portfolio
                  </Badge>
                )}
                {parsedNotes.videoIntroUrl && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Video Intro
                  </Badge>
                )}
                {application.voice_interview_result && (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1 text-success" />
                    Voice Interview
                  </Badge>
                )}
              </div>

              {/* Recommendation */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary">AVA's Recommendation</span>
                  </div>
                  <AIAnalysisContent content={application.ai_analysis} />
                </CardContent>
              </Card>
            </>
          )}

          {!application.ai_analysis && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">No Analysis Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Run AI analysis to get AVA's recommendation on this candidate.
              </p>
              <Button onClick={handleReanalyze} disabled={isAnalyzing}>
                {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" />
                Run AI Analysis
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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
              {application.ai_score && (
                <Badge className="bg-success/20 text-success ml-2">
                  AI Score: {application.ai_score}/100
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
                
                {/* Resume Preview iframe */}
                <div className="rounded-lg overflow-hidden border border-border bg-muted h-96">
                  <iframe 
                    src={resumeUrl}
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
                    {badge?.score && (
                      <Badge className="bg-success/20 text-success ml-2">
                        Score: {badge.score}
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                  {dialogData.content ? (
                    <div className="space-y-4">
                      {dialogData.type === "quiz" && Array.isArray(dialogData.content) && (
                        dialogData.content.map((item: any, index: number) => (
                          <div key={index} className="space-y-2">
                            <p className="text-sm font-medium text-foreground">
                              {index + 1}. {item.question}
                            </p>
                            <div className="p-3 bg-muted/50 rounded-lg text-sm">
                              {item.answer || <span className="text-muted-foreground italic">No answer</span>}
                            </div>
                          </div>
                        ))
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
                                  <p className="text-xl font-bold text-primary">{dialogData.content.evaluation.score || dialogData.content.score || "N/A"}</p>
                                  <p className="text-xs text-muted-foreground">Overall</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg text-center">
                                  <p className="text-xl font-bold text-foreground">{dialogData.content.evaluation.empathy || "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Empathy</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg text-center">
                                  <p className="text-xl font-bold text-foreground">{dialogData.content.evaluation.problemSolving || "N/A"}%</p>
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
                          <div className="grid grid-cols-4 gap-2">
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
                
                {/* Reset Phase Button - Only show if data exists and user can manage pipeline */}
                {dialogData.content && canManagePipeline && badge && !["application", "resume"].includes(badge.id) && (
                  <DialogFooter className="mt-4 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="gap-2 text-warning border-warning/50 hover:bg-warning/10"
                      onClick={() => {
                        setPhaseToReset({
                          id: badge.id,
                          title: dialogData.title,
                          type: badge.type,
                        });
                        setShowResetPhaseDialog(true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Allow Redo
                    </Button>
                  </DialogFooter>
                )}
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
        onOpenChange={setShowInterviewWizard}
      />

      {/* Phase Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Reset Candidate Progress?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Moving back to <strong>{pendingPhaseChange?.newPhase.title}</strong> will reset the following phases:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                {pendingPhaseChange?.phasesToReset.map((phase) => (
                  <li key={phase.id}>{phase.title}</li>
                ))}
              </ul>
              <p className="text-warning">
                All submission data for these phases will be cleared, and the candidate will need to redo them.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelReset}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Reset & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Phase Reset Confirmation Dialog */}
      <AlertDialog open={showResetPhaseDialog} onOpenChange={setShowResetPhaseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-warning" />
              Allow Candidate to Redo {phaseToReset?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will clear the candidate's submitted data for <strong>{phaseToReset?.title}</strong> and allow them to re-submit.
              </p>
              <p className="text-muted-foreground">
                The candidate will be notified that they can redo this phase. Other phases will not be affected.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowResetPhaseDialog(false);
              setPhaseToReset(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetSinglePhase} 
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Allow Redo
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
            // Reset slider position if cancelled
            const snapPercentage = (effectivePhaseIndex / (phases.length - 1)) * 100;
            setDragPosition(snapPercentage);
          }
        }}
        onConfirm={async (config) => {
          if (!pendingAvaInterview || !application) return;
          
          try {
            // Update application with all config and advance to phase
            await updateApplication.mutateAsync({
              id: application.id,
              phase: pendingAvaInterview.newPhase.id,
              voice_interview_duration: config.duration,
              voice_interview_language: config.language,
              voice_interview_language_rule: config.languageRule,
              voice_interview_video_enabled: config.videoEnabled,
            });
            
            toast.success(`Ava Interview configured - ${config.duration} minutes, ${config.videoEnabled ? 'video' : 'audio only'}`);
            queryClient.invalidateQueries({ queryKey: ["application", id] });
            
            // Snap to new position
            const snapPercentage = (pendingAvaInterview.newIndex / (phases.length - 1)) * 100;
            setDragPosition(snapPercentage);
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
      />

      {/* Hiring Document Prompt Dialog */}
      <HiringDocumentPromptDialog
        open={showHiringDocumentPrompt}
        onOpenChange={setShowHiringDocumentPrompt}
        candidateName={profile?.full_name || "this candidate"}
        jobTitle={job?.title || "this position"}
        onCreateDocument={() => {
          setDocumentWizardMode("generate");
          setShowHiringDocumentPrompt(false);
          setShowDocumentWizard(true);
        }}
        onUploadDocument={() => {
          setDocumentWizardMode("upload");
          setShowHiringDocumentPrompt(false);
          setShowDocumentWizard(true);
        }}
        onSkip={() => setShowHiringDocumentPrompt(false)}
      />

      {/* Document Wizard (pre-populated) */}
      <DocumentWizard
        open={showDocumentWizard}
        onOpenChange={setShowDocumentWizard}
        applications={application ? [{
          id: application.id,
          candidate_id: application.candidate_id,
          profiles: {
            full_name: profile?.full_name || null,
            email: profile?.email || "",
          },
          jobs: {
            title: job?.title || "",
          },
        }] : []}
        preSelectedApplicationId={application?.id}
        initialMode={documentWizardMode}
      />
    </div>
  );
}