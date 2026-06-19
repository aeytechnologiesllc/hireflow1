import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Keyboard, 
  Timer, 
  Target,
  Zap,
  CheckCircle,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { parseApplicationNotes, stringifyApplicationNotes } from "@/utils/applicationNotes";
import { invokeTriggerAvaAnalysis, triggerAvaAnalysis, evaluatePhaseSubmission } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { PhaseContextCard } from "@/components/PhaseContextCard";

// Sample typing test paragraphs
const typingTexts = [
  "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the English alphabet at least once. It has been used for decades to test typewriters, keyboards, and typing software.",
  "Customer service is about creating positive experiences for every client. Active listening, empathy, and clear communication are essential skills. A great support representative can turn a frustrated customer into a loyal advocate.",
  "In today's fast-paced business environment, effective communication is more important than ever. Whether you're writing emails, preparing reports, or participating in meetings, your ability to express ideas clearly can make or break your career.",
  "Technology continues to transform how we work and interact with customers. From chatbots to CRM systems, understanding these tools helps us provide better service. Embracing change while maintaining a human touch is the key to success.",
  "Problem-solving is a critical skill in any workplace. When faced with challenges, taking a step back to analyze the situation, considering multiple solutions, and implementing the best approach can lead to positive outcomes for everyone involved."
];

interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, any>;
}

interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
  status: string;
  jobs: {
    title: string;
    processing_mode: string | null;
    passing_score: number | null;
    required_wpm: number | null;
    workflow_steps?: WorkflowStep[] | null;
  } | null;
}

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'cut_attempt' | 'right_click' | 'keyboard_shortcut';
  timestamp: string;
  details?: string;
}

export default function TypingTestPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [testState, setTestState] = useState<"intro" | "testing" | "completed">("intro");
  const [typedText, setTypedText] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [results, setResults] = useState<{
    wpm: number;
    accuracy: number;
    score: number;
    passed: boolean;
  } | null>(null);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typedTextRef = useRef<string>("");
  const startTimeRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Anti-cheating: Record violation
  const recordViolation = useCallback((type: AntiCheatViolation['type'], details?: string) => {
    const violation: AntiCheatViolation = {
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setViolations(prev => [...prev, violation]);
  }, []);

  // Anti-cheating: Prevent copy
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('copy_attempt', 'Copy attempted');
    toast.warning("Copying is disabled during the typing test", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Prevent paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('paste_attempt', 'Paste attempted');
    toast.warning("Pasting is disabled during the typing test", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Prevent cut
  const handleCut = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('cut_attempt', 'Cut attempted');
  }, [recordViolation]);

  // Anti-cheating: Prevent right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    recordViolation('right_click', 'Right-click attempted');
    toast.warning("Right-click is disabled during the typing test", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Block keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      recordViolation('keyboard_shortcut', `Blocked ${e.key.toUpperCase()} shortcut`);
      toast.warning("Keyboard shortcuts are disabled during the typing test", {
        icon: <ShieldAlert className="h-4 w-4" />,
      });
    }
  }, [recordViolation]);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["typing-test-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, required_wpm, workflow_steps)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      
      // Parse workflow_steps from JSON
      const parsed = {
        ...data,
        jobs: data.jobs ? {
          ...data.jobs,
          workflow_steps: Array.isArray(data.jobs.workflow_steps) 
            ? data.jobs.workflow_steps as unknown as WorkflowStep[]
            : null
        } : null
      };
      
      return parsed as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`typing-test-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["typing-test-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Initialize target text
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * typingTexts.length);
    setTargetText(typingTexts[randomIndex]);
  }, []);

  // Timer countdown
  useEffect(() => {
    if (testState === "testing" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleTestComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [testState]);

  // Detect tab switching during test - record as violation
  useEffect(() => {
    if (testState !== "testing") return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('tab_switch', 'User switched to another tab or window');
      } else {
        toast.warning("Tab switch detected! This activity has been recorded.", {
          duration: 3000,
          icon: <ShieldAlert className="h-4 w-4" />,
        });
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [testState, recordViolation]);

  const startTest = useCallback(() => {
    setTestState("testing");
    const now = Date.now();
    setStartTime(now);
    startTimeRef.current = now;
    setTypedText("");
    typedTextRef.current = "";
    setTimeLeft(60);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const calculateResults = useCallback(() => {
    const currentTypedText = typedTextRef.current;
    const currentStartTime = startTimeRef.current;
    
    // Calculate elapsed time in minutes
    const elapsedMs = currentStartTime ? Date.now() - currentStartTime : 60000;
    const elapsedMinutes = Math.max(elapsedMs / 60000, 0.1); // At least 0.1 minutes to avoid division issues
    
    // Calculate Gross WPM (standard: 5 characters = 1 word)
    const charCount = currentTypedText.length;
    const grossWpm = Math.round((charCount / 5) / elapsedMinutes);

    // Word-by-word accuracy comparison (more forgiving than character position matching)
    const typedWords = currentTypedText.trim().split(/\s+/).filter(w => w.length > 0);
    const targetWords = targetText.trim().split(/\s+/).filter(w => w.length > 0);
    
    let correctWords = 0;
    for (let i = 0; i < typedWords.length; i++) {
      if (i < targetWords.length && typedWords[i] === targetWords[i]) {
        correctWords++;
      }
    }
    
    // Accuracy based on correctly typed words
    const accuracy = typedWords.length > 0 
      ? Math.round((correctWords / typedWords.length) * 100)
      : 0;

    // Calculate overall score: Gross WPM weighted by accuracy
    // Score formula: (grossWpm / requiredWpm * 100) * (accuracy / 100)
    // The employer sets the required WPM (default 35)
    const requiredWpm = application?.jobs?.required_wpm || 35;
    const speedScore = Math.min(100, (grossWpm / requiredWpm) * 100);
    const score = Math.round(speedScore * (accuracy / 100));

    // NOTE: local 'passed' is for UI display ONLY. Backend trigger-ava-analysis is the SINGLE SOURCE OF TRUTH
    // for the official pass/fail decision via weighted ai_score calculation
    const passed = false; // Always false locally - backend decides

    return { wpm: grossWpm, accuracy, score, passed };
  }, [targetText, application]);

  const handleTestComplete = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const calculatedResults = calculateResults();
    setResults(calculatedResults);
    setTestState("completed");
  }, [calculateResults]);

  const handleSubmit = async () => {
    if (!results || !application) return;
    
    setIsSubmitting(true);
    
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      // This prevents stale cached data from causing auto-rejection in manual mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score, required_wpm")
        .eq("id", application.job_id)
        .single();
      
      const isAutoMode = freshJob?.processing_mode === "auto";
      const passingScore = freshJob?.passing_score || 60;
      const requiredWpm = freshJob?.required_wpm || 40;
      
      // For autopilot mode, show evaluation screen
      if (isAutoMode) {
        setEvaluationState("evaluating");
      }
      // Parse existing notes or start fresh
      const existingNotes = parseApplicationNotes(application.notes);
      
      // Add typing test results (include requiredWpm for proper assessment)
      const tabSwitchViolations = violations.filter(v => v.type === 'tab_switch').length;
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "typing_test",
          wpm: results.wpm,
          accuracy: results.accuracy,
          score: results.score,
          passed: results.passed,
          requiredWpm: requiredWpm,
          tabSwitches: tabSwitchViolations,
          violations: violations,
          completedAt: new Date().toISOString(),
        },
        typingTestResult: {
          wpm: results.wpm,
          accuracy: results.accuracy,
          score: results.score,
          passed: results.passed,
          requiredWpm: requiredWpm,
          tabSwitches: tabSwitchViolations,
          violations: violations,
        },
      };

      // Build the full phases list to find the next phase
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = application.jobs?.quiz_questions as Json[] | undefined;
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = workflowSteps.find((step) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string; title: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist (before workflow steps)
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter((step) => step.type !== 'voice_interview').forEach((step) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add Review phase
      allPhases.push({ id: "review", type: "review", title: "Review" });
      
      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({ 
          id: voiceInterviewStep.id, 
          type: "voice_interview", 
          title: voiceInterviewStep.title || "Ava Interview" 
        });
      }
      
      // Add final phases
      allPhases.push(
        { id: "interview", type: "interview", title: "Interview" },
        { id: "hired", type: "hired", title: "Hired" }
      );
      
      // Find current step index
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }

      let newPhase = application.phase;
      let newStatus = application.status;
      
      // Determine next phase
      let nextPhase: { id: string; type: string; title: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }
      
      if (isAutoMode) {
        // UNIFIED SCORING: Do NOT make pass/fail decision locally
        // The backend (trigger-ava-analysis) is the SINGLE SOURCE OF TRUTH
        // It will calculate the weighted score and decide pass/fail
        
        // Determine next phase info for UI (if candidate passes)
        if (nextPhase && nextPhase.type !== "voice_interview" && nextPhase.type !== "review") {
          setNextPhaseInfo({
            id: nextPhase.id,
            title: nextPhase.title,
          });
        }
      }
      // Manual mode - NEVER auto-advance or reject. Employer controls.

      // Build detailed phase analysis
      const speedPercent = Math.round((results.wpm / requiredWpm) * 100);
      const phaseAiAnalysis = `Typing test: ${results.wpm} WPM (${speedPercent}% of ${requiredWpm} WPM target), Accuracy: ${results.accuracy}%, Combined Score: ${results.score}%. Local calculation: ${results.passed ? "PASSED" : "FAILED"}. Backend will compute final weighted score.`;

      // Update application with typing test data but do NOT set status to rejected
      // The backend will handle status updates via autopilotDecision
      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          // Do NOT change phase or status here - let backend handle in autopilot mode
          phase: application.phase,
          status: application.status as "pending" | "reviewing" | "interview" | "offered" | "hired" | "rejected",
          phase_ai_analysis: phaseAiAnalysis,
        })
        .eq("id", id!);

      if (error) throw error;

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      // CRITICAL: Trigger backend analysis with autopilotDecision=true in auto mode
      // The backend will calculate weighted score and decide pass/fail
      const analysisPromise = invokeTriggerAvaAnalysis({
        applicationId: id!,
        autopilotDecision: isAutoMode,
        currentPhaseId: stepId,
      });

      if (isAutoMode) {
        // Wait for backend to process and set the result
        setEvaluationState("evaluating");
        
        try {
          const { data: analysisResult } = await analysisPromise;

          // Check the backend's decision
          if (analysisResult?.decision === "rejected") {
            setEvaluationState("failed");
          } else if (analysisResult?.decision === "advanced" || analysisResult?.decision === "needs_employer_approval") {
            setEvaluationState("passed");
          } else {
            // Fallback: fetch fresh application status
            const { data: freshApp } = await supabase
              .from("applications")
              .select("status, ai_score")
              .eq("id", id!)
              .single();
            
            if (freshApp?.status === "rejected") {
              setEvaluationState("failed");
            } else if (freshApp?.ai_score !== null && freshApp.ai_score >= passingScore) {
              setEvaluationState("passed");
            } else if (freshApp?.ai_score !== null) {
              setEvaluationState("failed");
            } else {
              // Still processing - show as evaluating, realtime will update
              setEvaluationState("evaluating");
            }
          }
        } catch (err) {
          console.error("[TypingTestPhase] Backend analysis failed:", err);
          // Keep evaluating state - backend is source of truth, no local fallback
          setEvaluationState("evaluating");
        }
      } else {
        // Manual mode - just trigger analysis in background, toast and navigate
        analysisPromise.catch(err => console.error("[TypingTestPhase] AVA analysis trigger failed:", err));
        
        toast.success("Typing test submitted successfully!", {
          description: "Your results have been recorded. The employer will review your submission.",
        });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting typing test:", error);
      toast.error("Failed to submit typing test");
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for evaluation screen
  const handleStartNextPhase = () => {
    if (!nextPhaseInfo || !application) return;
    
    const workflowSteps = application.jobs?.workflow_steps || [];
    const nextStep = workflowSteps.find((s) => s.id === nextPhaseInfo.id);
    
    if (nextStep) {
      const phaseRoutes: Record<string, string> = {
        typing_test: "typing-test",
        video_intro: "video-intro",
        video_message: "video-intro",
        portfolio_upload: "portfolio",
        chat_simulation: "chat-simulation",
        chat_interview: "chat-interview",
        sales_simulation: "sales-simulation",
        voice_interview: "voice-interview",
        quiz: "quiz",
      };
      const route = phaseRoutes[nextStep.type] || nextStep.type;
      navigate(`/applications/${id}/${route}/${nextPhaseInfo.id}`);
    } else if (nextPhaseInfo.id === "review") {
      navigate(`/applications/${id}`);
    } else {
      navigate(`/applications/${id}`);
    }
  };

  const handleDoLater = () => {
    navigate(`/applications/${id}`);
  };

  const resetTest = () => {
    setTestState("intro");
    setTypedText("");
    setTimeLeft(60);
    setResults(null);
    setStartTime(null);
    setViolations([]);
    const randomIndex = Math.floor(Math.random() * typingTexts.length);
    setTargetText(typingTexts[randomIndex]);
  };

  // Check if already submitted
  const existingResult = (() => {
    // If application was reconsidered (status reset to pending), allow re-submission
    if (application?.status === "pending" && application?.phase === stepId) {
      return null;
    }
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.typingTestResult || null;
    } catch {
      return null;
    }
  })();

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
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
            <Button onClick={() => navigate("/applications")} className="mt-4">
              Back to Applications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show already submitted view if phase was completed
  if (existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Typing Test"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const isAutoMode = application.jobs?.processing_mode !== "manual";
  const passingScore = application.jobs?.passing_score || 60;

  // Show evaluation screen for autopilot mode
  if (evaluationState) {
    // Show CandidateStatusScreen for failed state
    if (evaluationState === "failed") {
      return (
        <CandidateStatusScreen
          state="rejected"
          jobTitle={application?.jobs?.title}
          onClose={() => navigate(`/applications/${id}`)}
        />
      );
    }
    
    // Show EvaluationScreen for passed/evaluating states
    return (
      <EvaluationScreen
        state={evaluationState}
        onStartNextPhase={nextPhaseInfo ? handleStartNextPhase : undefined}
        onDoLater={handleDoLater}
        nextPhaseName={nextPhaseInfo?.title}
      />
    );
  }

  return (
    <div 
      ref={containerRef}
      className="space-y-6 max-w-4xl mx-auto select-none"
      onCopy={handleCopy}
      onPaste={handlePaste}
      onCut={handleCut}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {/* Anti-cheat indicator */}
      {violations.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 px-3 py-2 rounded-lg border border-warning/20">
          <ShieldAlert className="h-4 w-4" />
          <span>{violations.length} violation(s) recorded</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate(`/applications/${id}`)} 
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Application
        </Button>
        
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <Keyboard className="h-4 w-4" />
          Typing Speed Test
        </Badge>
      </div>

      {/* Main Test Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Typing Speed Assessment
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Intro State */}
          {testState === "intro" && (
            <div className="space-y-6">
              <div className="bg-muted/30 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-foreground">Instructions</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Timer className="h-4 w-4 mt-1 text-primary" />
                    <span>You will have 60 seconds to type as much as you can</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="h-4 w-4 mt-1 text-primary" />
                    <span>Target speed: <strong className="text-foreground">{application.jobs?.required_wpm || 40} WPM</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 mt-1 text-primary" />
                    <span>Your score combines speed and accuracy</span>
                  </li>
                </ul>
                <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-md">
                  <p className="text-sm text-warning">
                    <strong>Note:</strong> Copy/paste and right-click are disabled. Tab switching will be recorded.
                  </p>
                </div>
              </div>

              <div className="text-center">
                <Button onClick={startTest} size="lg" className="gap-2">
                  <Play className="h-5 w-5" />
                  Start Typing Test
                </Button>
              </div>
            </div>
          )}

          {/* Testing State */}
          {testState === "testing" && (
            <div className="space-y-6">
              {/* Timer */}
              <div className="flex items-center justify-between">
                <Badge 
                  className={`gap-1 ${
                    timeLeft <= 10 
                      ? "bg-destructive/20 text-destructive border-destructive/30" 
                      : "bg-primary/20 text-primary border-primary/30"
                  }`}
                >
                  <Timer className="h-4 w-4" />
                  {timeLeft}s remaining
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Words typed: {typedText.trim().split(/\s+/).filter(Boolean).length}
                </span>
              </div>

              <Progress value={(60 - timeLeft) / 60 * 100} className="h-2" />

              {/* Target Text */}
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-2">Type this text:</p>
                <p className="text-foreground leading-relaxed font-mono">
                  {targetText}
                </p>
              </div>

              {/* Typing Area */}
              <Textarea
                ref={textareaRef}
                value={typedText}
                onChange={(e) => {
                  setTypedText(e.target.value);
                  typedTextRef.current = e.target.value;
                }}
                placeholder="Start typing here..."
                className="min-h-[150px] font-mono text-lg"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                onContextMenu={handleContextMenu}
                onPaste={handlePaste}
                onCopy={handleCopy}
                onCut={handleCut}
                onKeyDown={handleKeyDown}
              />

              <div className="flex justify-end">
                <Button onClick={handleTestComplete} variant="outline">
                  Finish Early
                </Button>
              </div>
            </div>
          )}

          {/* Completed State */}
          {testState === "completed" && results && (
            <div className="space-y-6">
              {/* Results */}
              <div className="text-center space-y-4">
                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                  results.passed ? "bg-success/20" : "bg-destructive/20"
                }`}>
                  {results.passed ? (
                    <CheckCircle className="h-10 w-10 text-success" />
                  ) : (
                    <Target className="h-10 w-10 text-destructive" />
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {results.passed ? "Great Job!" : "Test Complete"}
                  </h3>
                  <p className="text-muted-foreground">
                    {results.passed
                      ? isAutoMode
                        ? "You passed! After you submit, the next phase will unlock automatically."
                        : "You passed! The employer will review your overall application next."
                      : results.wpm < (application.jobs?.required_wpm || 35)
                        ? `Your typing speed of ${results.wpm} WPM did not meet the required ${application.jobs?.required_wpm || 35} WPM threshold.`
                        : `Your combined score of ${results.score}% did not meet the required threshold.`
                    }
                  </p>
                </div>
              </div>

              {/* Performance Stats */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 text-center">
                    <Zap className="h-6 w-6 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold text-foreground">{results.wpm}</p>
                    <p className="text-xs text-muted-foreground">Words/Min (target: {application.jobs?.required_wpm || 40})</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 text-center">
                    <Target className="h-6 w-6 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold text-foreground">{results.accuracy}%</p>
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                  </CardContent>
                </Card>
              </div>

              {/* Actions */}
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={resetTest} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Try Again
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Submit Results
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
