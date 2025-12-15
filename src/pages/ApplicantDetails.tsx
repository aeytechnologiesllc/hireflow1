import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  FileCheck, ClipboardList, Video, Keyboard, 
  Eye, Users, CheckCircle, Loader2, Mail, ExternalLink,
  Calendar, AlertTriangle, ShieldAlert, ShieldCheck, Shield,
  HelpCircle, Move, Zap
} from "lucide-react";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
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
  typing_test: Keyboard,
  chat_simulation: MessageSquare,
  chat_interview: MessageSquare,
  sales_simulation: MessageSquare,
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
function AIAnalysisContent({ content }: { content: string }) {
  // Parse the content into sections
  const sections: { type: 'score' | 'heading' | 'list' | 'paragraph'; text: string }[] = [];
  
  const lines = content.split('\n');
  let currentList: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: currentList.join('|||') });
        currentList = [];
      }
      continue;
    }
    
    // Check for score line
    if (trimmed.match(/^\*\*Overall Score:\s*\d+\*\*$/)) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: currentList.join('|||') });
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
        sections.push({ type: 'list', text: currentList.join('|||') });
        currentList = [];
      }
      const headingText = trimmed.replace(/\*\*/g, '');
      sections.push({ type: 'heading', text: headingText });
      continue;
    }
    
    // Check for recommendation (bold text with value)
    if (trimmed.match(/^\*\*Recommendation:\s*[^*]+\*\*$/)) {
      if (currentList.length > 0) {
        sections.push({ type: 'list', text: currentList.join('|||') });
        currentList = [];
      }
      const recText = trimmed.replace(/\*\*/g, '');
      sections.push({ type: 'heading', text: recText });
      continue;
    }
    
    // Check for list items
    if (trimmed.startsWith('- ')) {
      currentList.push(trimmed.substring(2));
      continue;
    }
    
    // Regular paragraph
    if (currentList.length > 0) {
      sections.push({ type: 'list', text: currentList.join('|||') });
      currentList = [];
    }
    sections.push({ type: 'paragraph', text: trimmed.replace(/\*\*/g, '') });
  }
  
  // Don't forget remaining list items
  if (currentList.length > 0) {
    sections.push({ type: 'list', text: currentList.join('|||') });
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
          const isStrengths = section.text.toLowerCase().includes('strength');
          const isConcerns = section.text.toLowerCase().includes('concern') || section.text.toLowerCase().includes('areas');
          
          return (
            <h4 
              key={index} 
              className={`font-semibold text-sm pt-2 ${
                isRecommendation ? 'text-primary' : 
                isStrengths ? 'text-success' : 
                isConcerns ? 'text-orange-500' : 
                'text-foreground'
              }`}
            >
              {section.text}
            </h4>
          );
        }
        
        if (section.type === 'list') {
          const items = section.text.split('|||');
          return (
            <ul key={index} className="space-y-2 pl-4">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
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
  const queryClient = useQueryClient();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [activeBadgeDialog, setActiveBadgeDialog] = useState<string | null>(null);
  const [showInterviewWizard, setShowInterviewWizard] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [pendingPhaseChange, setPendingPhaseChange] = useState<{
    newIndex: number;
    newPhase: { id: string; title: string; type: string };
    phasesToReset: { id: string; title: string; type: string }[];
  } | null>(null);
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

  // Build phases from workflow_steps or use defaults
  const phases = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as WorkflowStep[] | undefined;
    
    if (workflowSteps && workflowSteps.length > 0) {
      // Start with application phase
      const allPhases = [
        { id: "application", title: "Application", icon: FileCheck, type: "application" },
        ...workflowSteps.map(step => ({
          id: step.id,
          title: step.title.length > 12 ? step.title.substring(0, 10) + "..." : step.title,
          icon: stepTypeIcons[step.type] || ClipboardList,
          type: step.type,
        })),
        { id: "review", title: "Review", icon: Eye, type: "review" },
        { id: "interview", title: "Interview", icon: Users, type: "interview" },
        { id: "hired", title: "Hired", icon: CheckCircle, type: "hired" },
      ];
      return allPhases;
    }
    return defaultPhases;
  })();

  // Find current phase index
  const currentPhaseIndex = phases.findIndex(p => p.id === application?.phase || p.type === application?.phase);
  const effectivePhaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : 0;

  // Calculate avatar position based on phase
  useEffect(() => {
    if (sliderRef.current && !isDragging) {
      const percentage = (effectivePhaseIndex / (phases.length - 1)) * 100;
      setDragPosition(percentage);
    }
  }, [effectivePhaseIndex, phases.length, isDragging]);

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
    
    if (newPhase && newPhase.id !== application.phase) {
      const currentIndex = effectivePhaseIndex;
      
      // Check if moving backward (resetting phases)
      if (nearestIndex < currentIndex) {
        // Get phases that will be reset
        const phasesToReset = phases.slice(nearestIndex + 1, currentIndex + 1);
        setPendingPhaseChange({
          newIndex: nearestIndex,
          newPhase,
          phasesToReset,
        });
        setShowResetConfirmation(true);
        // Don't snap yet - wait for confirmation
        return;
      }
      
      // Moving forward - execute immediately
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
        const phasesToReset = phases.slice(newIndex + 1, currentIndex + 1);
        
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
            if (updatedNotes.quizAnswers) {
              delete updatedNotes.quizAnswers[phase.id];
              // Clean up empty quizAnswers object
              if (Object.keys(updatedNotes.quizAnswers).length === 0) {
                delete updatedNotes.quizAnswers;
              }
            }
          }
          if (phase.type === "video_intro") {
            delete updatedNotes.videoIntroUrl;
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
        
        // Determine if we're resetting to application phase (clear ai_score and resume)
        const isResetToApplication = newPhase.type === "application" || newPhase.id === "application";
        
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
          ai_score: isResetToApplication ? null : application.ai_score, // Clear AI score if resetting to application
          resume_url: isResetToApplication ? null : application.resume_url, // Clear resume if resetting to application
          cover_letter: isResetToApplication ? null : application.cover_letter, // Clear cover letter if resetting to application
          status: newPhase.type === "interview" ? "interview" : 
                  newPhase.type === "hired" ? "hired" : 
                  "reviewing",
        });
        
        toast.success(`Reset to ${newPhase.title} phase. Candidate can redo cleared phases.`);
      } else {
        // Moving forward - track skipped phases
        const skippedPhases = phases.slice(currentIndex + 1, newIndex + 1).map((p) => p.id);
        
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

  // Parse submitted data from notes (moved earlier for use in executePhaseChange)
  const parsedNotes = (() => {
    try {
      return application?.notes ? JSON.parse(application.notes) : {};
    } catch {
      return {};
    }
  })();

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
      const content = `
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

Cover Letter:
${application.cover_letter || "Not provided"}

Resume URL: ${application.resume_url || "Not provided"}
      `;

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

      const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      await updateApplication.mutateAsync({
        id: application.id,
        ai_analysis: data.analysis,
        ai_score: score && score >= 0 && score <= 100 ? score : null,
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
    if (stepType === "video_intro") {
      return parsedNotes.videoIntroUrl;
    }
    if (stepType === "chat_simulation") {
      return parsedNotes.chatSimulationResult;
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
    const badges: { id: string; title: string; type: string; hasData: boolean; score?: number; icon: any }[] = [];
    
    // Application badge (always present)
    const hasApplicationData = !!(application.cover_letter || parsedNotes.applicationAnswers?.length > 0);
    badges.push({
      id: "application",
      title: "Application",
      type: "application",
      hasData: hasApplicationData,
      icon: FileCheck,
    });
    
    // Resume badge (if resume uploaded or required)
    if (job?.require_resume !== false || resumeUrl) {
      badges.push({
        id: "resume",
        title: "Resume",
        type: "resume",
        hasData: !!resumeUrl,
        score: application.ai_score || undefined,
        icon: FileText,
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
          score: stepData?.score,
          icon: stepTypeIcons[step.type] || ClipboardList,
        });
      });
    }
    
    return badges;
  })();

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
    
    const stepData = getStepSubmissionData(badgeId, badgeType);
    return {
      title: workflowBadges.find(b => b.id === badgeId)?.title || badgeId,
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
            onClick={() => setShowInterviewWizard(true)}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            Schedule Interview
          </Button>
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Notes
          </Button>
          <Button variant="outline" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Message
          </Button>
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
              <Button 
                variant="outline" 
                onClick={handleReject}
                className="gap-2 text-destructive border-destructive/50 hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4" />
                Reject Candidate
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowHelpDialog(true)}
                className="gap-2 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50 hover:bg-primary/15 transition-all"
              >
                <Move className="h-4 w-4 text-primary" />
                <span className="text-foreground">Hold & Drag</span>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
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
              
              return (
                <div 
                  key={phase.id}
                  className="absolute flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${position}%` }}
                >
                  {/* Dot */}
                  <div 
                    className={`w-4 h-4 rounded-full border-2 border-background mt-6 z-10 ${
                      isCompleted ? phaseColors.completed : 
                      isCurrent ? phaseColors.current : 
                      phaseColors.upcoming
                    }`}
                  />
                  
                  {/* Icon & Label */}
                  <div className="mt-3 flex flex-col items-center">
                    <Icon className={`h-5 w-5 ${
                      isCompleted ? "text-success" : 
                      isCurrent ? "text-warning" : 
                      "text-muted-foreground"
                    }`} />
                    <span className={`text-xs mt-1 ${
                      isCompleted ? "text-success" : 
                      isCurrent ? "text-warning" : 
                      "text-muted-foreground"
                    }`}>
                      {phase.title}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Draggable avatar */}
            <div 
              className={`absolute top-3 -translate-x-1/2 cursor-grab active:cursor-grabbing z-20 ${
                phases[effectivePhaseIndex]?.type === "review" && !isDragging ? "animate-bounce-subtle" : ""
              }`}
              style={{ left: `${dragPosition}%` }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <Avatar className="h-10 w-10 ring-4 ring-primary/30">
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
                  variant={badge.hasData ? undefined : "outline"}
                  className={`gap-1 cursor-pointer transition-colors ${
                    badge.hasData 
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
                  <Icon className="h-3 w-3" />
                  {badge.title}
                  {badge.score && ` (${badge.score})`}
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
                      
                      {dialogData.type === "video_intro" && (
                        <div className="space-y-4">
                          {typeof dialogData.content === "string" ? (
                            <div className="rounded-lg overflow-hidden border border-border bg-muted">
                              <video 
                                src={dialogData.content} 
                                controls 
                                className="w-full"
                              />
                            </div>
                          ) : (
                            <div className="p-4 bg-muted/50 rounded-lg">
                              <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(dialogData.content, null, 2)}</pre>
                            </div>
                          )}
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
                          {/* Evaluation Summary */}
                          {dialogData.content.evaluation && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-4 mb-4">
                                <div className="text-center">
                                  <p className="text-3xl font-bold text-primary">{dialogData.content.evaluation.score || dialogData.content.score || "N/A"}</p>
                                  <p className="text-xs text-muted-foreground">/100</p>
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">
                                    Would Buy: <span className={`${
                                      dialogData.content.evaluation.wouldBuy === "yes" ? "text-success" :
                                      dialogData.content.evaluation.wouldBuy === "maybe" ? "text-warning" : "text-destructive"
                                    }`}>
                                      {dialogData.content.evaluation.wouldBuy === "yes" ? "Yes" :
                                       dialogData.content.evaluation.wouldBuy === "maybe" ? "Maybe" : "No"}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-4 gap-2">
                                <div className="p-2 bg-muted/50 rounded-lg text-center">
                                  <p className="text-lg font-bold text-foreground">{dialogData.content.evaluation.discovery || "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Discovery</p>
                                </div>
                                <div className="p-2 bg-muted/50 rounded-lg text-center">
                                  <p className="text-lg font-bold text-foreground">{dialogData.content.evaluation.objectionHandling || "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Objections</p>
                                </div>
                                <div className="p-2 bg-muted/50 rounded-lg text-center">
                                  <p className="text-lg font-bold text-foreground">{dialogData.content.evaluation.valueProposition || "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Value Prop</p>
                                </div>
                                <div className="p-2 bg-muted/50 rounded-lg text-center">
                                  <p className="text-lg font-bold text-foreground">{dialogData.content.evaluation.closingSkills || "N/A"}%</p>
                                  <p className="text-xs text-muted-foreground">Closing</p>
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
                            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Sales Conversation</h4>
                            <div className="space-y-3 max-h-60 overflow-y-auto">
                              {dialogData.content.messages?.map((msg: any, index: number) => (
                                <div key={index} className={`flex ${msg.role === "salesRep" || msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                  <div className={`p-3 rounded-lg max-w-[80%] ${
                                    msg.role === "salesRep" || msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
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
                                  Copy/Paste: {(dialogData.content.antiCheatLog.copyAttempts || 0) + (dialogData.content.antiCheatLog.pasteAttempts || 0)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!["quiz", "typing_test", "video_intro", "chat_simulation", "chat_interview", "sales_simulation"].includes(dialogData.type) && (
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
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
    </div>
  );
}