import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  ArrowRight,
  ClipboardList, 
  CheckCircle,
  Loader2,
  HelpCircle,
  Clock,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { triggerAvaAnalysis, evaluatePhaseSubmission } from "@/utils/triggerAvaAnalysis";
import { parseApplicationNotes, stringifyApplicationNotes } from "@/utils/applicationNotes";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: number;
  correct_answer?: string | number;
  time_limit_seconds?: number;
  type?: string;
  category?: string;
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
    quiz_questions: QuizQuestion[] | null;
    workflow_steps: any[] | null;
  } | null;
}

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'cut_attempt' | 'right_click';
  timestamp: string;
  details?: string;
}

interface QuizProgress {
  currentQuestionIndex: number;
  answers: Record<string, number | string>;
  startedAt: string;
  violations: AntiCheatViolation[];
}

// Helper to detect question type
const getQuestionType = (question: QuizQuestion): 'multiple_choice' | 'text' => {
  // If type is explicitly set to a text-based type, use text
  if (question.type === 'text' || question.type === 'open_ended' || question.type === 'short_answer' || question.type === 'long_answer') {
    return 'text';
  }
  // If no options or empty options array, treat as text
  if (!question.options || question.options.length === 0) {
    return 'text';
  }
  return 'multiple_choice';
};

export default function QuizPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Storage key for quiz persistence
  const QUIZ_STORAGE_KEY = `quiz_progress_${id}_${stepId}`;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<{
    correct: number;
    total: number;
    score: number;
    passed: boolean;
  } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  
  // Stable questions state - prevents crashes from query invalidation
  const [stableQuestions, setStableQuestions] = useState<QuizQuestion[]>([]);
  const [quizInitialized, setQuizInitialized] = useState(false);
  
  // Anti-cheating violation tracking
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);

  // Refs for timer cleanup and stable callbacks
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFinishingRef = useRef(false);
  const currentQuestionIndexRef = useRef(currentQuestionIndex);
  const questionsLengthRef = useRef(0);
  const quizContainerRef = useRef<HTMLDivElement>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["quiz-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, quiz_questions, workflow_steps)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`quiz-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        console.log('[QuizPhase] Application updated via realtime:', payload);
        // Only invalidate if quiz hasn't started yet
        if (!quizInitialized) {
          queryClient.invalidateQueries({ queryKey: ["quiz-application", id] });
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient, quizInitialized]);

  // Extract questions from application data
  const fetchedQuestions: QuizQuestion[] = useMemo(() => {
    if (!application?.jobs) return [];
    
    // First check workflow_steps for quiz config
    const workflowSteps = application.jobs.workflow_steps as any[] | null;
    const quizStep = workflowSteps?.find(s => s.id === stepId || s.type === "quiz");
    
    if (quizStep?.config?.questions) {
      return quizStep.config.questions;
    }
    
    // Fallback to quiz_questions from job
    return (application.jobs.quiz_questions as QuizQuestion[]) || [];
  }, [application?.jobs, stepId]);

  // Initialize stable questions and restore progress from localStorage
  useEffect(() => {
    if (fetchedQuestions.length > 0 && !quizInitialized) {
      // Check for saved progress
      const savedProgress = localStorage.getItem(QUIZ_STORAGE_KEY);
      
      if (savedProgress) {
        try {
          const progress: QuizProgress = JSON.parse(savedProgress);
          console.log('[QuizPhase] Restoring saved progress:', progress);
          
          setCurrentQuestionIndex(progress.currentQuestionIndex);
          setAnswers(progress.answers);
          setViolations(progress.violations || []);
          
          toast.info("Quiz progress restored", {
            description: `Continuing from question ${progress.currentQuestionIndex + 1}`,
          });
        } catch (e) {
          console.error('[QuizPhase] Failed to restore progress:', e);
        }
      }
      
      setStableQuestions(fetchedQuestions);
      setQuizInitialized(true);
    }
  }, [fetchedQuestions, quizInitialized, QUIZ_STORAGE_KEY]);

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    if (quizInitialized && !showResults && stableQuestions.length > 0) {
      const progress: QuizProgress = {
        currentQuestionIndex,
        answers,
        startedAt: new Date().toISOString(),
        violations,
      };
      localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(progress));
    }
  }, [currentQuestionIndex, answers, violations, quizInitialized, showResults, QUIZ_STORAGE_KEY, stableQuestions.length]);

  // Clear localStorage when quiz is submitted
  const clearSavedProgress = useCallback(() => {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
  }, [QUIZ_STORAGE_KEY]);

  // Anti-cheating: Record violation
  const recordViolation = useCallback((type: AntiCheatViolation['type'], details?: string) => {
    const violation: AntiCheatViolation = {
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setViolations(prev => [...prev, violation]);
    console.log('[QuizPhase] Violation recorded:', violation);
  }, []);

  // Anti-cheating: Tab/Window visibility detection
  useEffect(() => {
    if (!quizInitialized || showResults) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('tab_switch', 'User switched to another tab or window');
        toast.warning("Tab switch detected!", {
          description: "This activity has been recorded and will be reported.",
          icon: <ShieldAlert className="h-4 w-4" />,
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [quizInitialized, showResults, recordViolation]);

  // Anti-cheating: Prevent copy/paste/cut and right-click
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('copy_attempt');
    toast.warning("Copying is disabled during the quiz", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('paste_attempt');
    toast.warning("Pasting is disabled during the quiz", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  const handleCut = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('cut_attempt');
  }, [recordViolation]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    recordViolation('right_click');
    toast.warning("Right-click is disabled during the quiz", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Use stable questions for rendering
  const questions = quizInitialized ? stableQuestions : fetchedQuestions;
  
  // Keep refs in sync for stable timer callbacks
  currentQuestionIndexRef.current = currentQuestionIndex;
  questionsLengthRef.current = questions.length;

  // Safe access to current question with null guard
  const currentQuestion = questions.length > 0 && currentQuestionIndex < questions.length 
    ? questions[currentQuestionIndex] 
    : null;
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  const handleAnswerSelect = (answerIndex: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answerIndex,
    }));
  };

  const handleTextAnswerChange = (text: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: text,
    }));
  };

  // Check if a question has been answered (works for both types)
  const isQuestionAnswered = (questionId: string, question: QuizQuestion): boolean => {
    const answer = answers[questionId];
    if (getQuestionType(question) === 'text') {
      return typeof answer === 'string' && answer.trim().length > 0;
    }
    return answer !== undefined;
  };

  const goToNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const calculateResults = useCallback(() => {
    let correct = 0;
    let multipleChoiceCount = 0;
    
    questions.forEach(q => {
      const userAnswer = answers[q.id];
      
      // Text questions are counted as "completed" - they get reviewed by AI/employer
      if (getQuestionType(q) === 'text') {
        // Text answers don't count toward the multiple choice score
        return;
      }
      
      multipleChoiceCount++;
      if (userAnswer === undefined) return;
      
      // Get correct answer - handle both field names and formats
      let correctAnswerIndex: number | undefined;
      
      // Check correctAnswer (camelCase) first
      if (q.correctAnswer !== undefined) {
        correctAnswerIndex = q.correctAnswer;
      }
      // Check correct_answer (snake_case) - could be text or index
      else if (q.correct_answer !== undefined) {
        if (typeof q.correct_answer === 'number') {
          correctAnswerIndex = q.correct_answer;
        } else if (typeof q.correct_answer === 'string') {
          // Find the index of the correct answer text in options
          correctAnswerIndex = q.options?.findIndex(
            opt => opt.toLowerCase().trim() === q.correct_answer?.toString().toLowerCase().trim()
          );
          if (correctAnswerIndex === -1) correctAnswerIndex = undefined;
        }
      }
      
      if (correctAnswerIndex !== undefined && userAnswer === correctAnswerIndex) {
        correct++;
      }
    });
    
    // Score is based only on multiple-choice questions
    const score = multipleChoiceCount > 0 ? Math.round((correct / multipleChoiceCount) * 100) : 100;
    
    // NOTE: local 'passed' is for UI display ONLY. Backend trigger-ava-analysis is the SINGLE SOURCE OF TRUTH
    // for the official pass/fail decision via weighted ai_score calculation
    return { correct, total: multipleChoiceCount, score, passed: false }; // Always false locally - backend decides
  }, [questions, answers, application?.jobs?.passing_score]);

  const handleFinishQuiz = useCallback(() => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    
    // Clear the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    const calculatedResults = calculateResults();
    setResults(calculatedResults);
    setShowResults(true);
  }, [calculateResults]);

  // Timer effect - countdown for each question
  // Uses refs to avoid stale closure issues
  useEffect(() => {
    if (!currentQuestion || showResults || questions.length === 0) return;
    
    // Reset timer when question changes
    const timeLimit = currentQuestion.time_limit_seconds || 30;
    setTimeRemaining(timeLimit);
    isFinishingRef.current = false;
    
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Time's up - auto-advance
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          
          // Use setTimeout to avoid state update during render
          // Use refs instead of closure values to get current state
          setTimeout(() => {
            if (currentQuestionIndexRef.current < questionsLengthRef.current - 1) {
              setCurrentQuestionIndex(i => i + 1);
            } else {
              handleFinishQuiz();
            }
          }, 0);
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentQuestionIndex, showResults, questions.length, handleFinishQuiz, currentQuestion]);

  const handleSubmit = async () => {
    if (!results || !application) return;
    
    setIsSubmitting(true);
    
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      // This prevents stale cached data from causing auto-rejection in manual mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();
      
      const isAutoMode = freshJob?.processing_mode === "auto";
      const passingScore = freshJob?.passing_score || 60;
      
      // For autopilot mode, show evaluation screen
      if (isAutoMode) {
        setEvaluationState("evaluating");
      }
      // Parse existing notes (safe parser handles string, object, or null)
      const existingNotes = parseApplicationNotes(application.notes);
      
      // Create answers summary
      const answersSummary = questions.map(q => {
        const userAnswer = answers[q.id];
        const questionType = getQuestionType(q);
        
        // For text questions, store the text answer directly
        if (questionType === 'text') {
          return {
            questionId: q.id,
            question: q.question,
            questionType: 'text',
            textAnswer: typeof userAnswer === 'string' ? userAnswer : '',
            selectedAnswer: null,
            selectedAnswerText: typeof userAnswer === 'string' ? userAnswer : 'Not answered',
            correctAnswer: null,
            isCorrect: null, // Text answers are reviewed by AI/employer
          };
        }
        
        // Get correct answer - handle both field names and formats (same logic as calculateResults)
        let correctAnswerIndex: number | undefined;
        
        if (q.correctAnswer !== undefined) {
          correctAnswerIndex = q.correctAnswer;
        } else if (q.correct_answer !== undefined) {
          if (typeof q.correct_answer === 'number') {
            correctAnswerIndex = q.correct_answer;
          } else if (typeof q.correct_answer === 'string') {
            correctAnswerIndex = q.options?.findIndex(
              opt => opt.toLowerCase().trim() === q.correct_answer?.toString().toLowerCase().trim()
            );
            if (correctAnswerIndex === -1) correctAnswerIndex = undefined;
          }
        }
        
        const answerIndex = typeof userAnswer === 'number' ? userAnswer : undefined;
        
        return {
          questionId: q.id,
          question: q.question,
          questionType: 'multiple_choice',
          selectedAnswer: answerIndex,
          selectedAnswerText: answerIndex !== undefined ? (q.options?.[answerIndex] || "Not answered") : "Not answered",
          correctAnswer: correctAnswerIndex,
          isCorrect: answerIndex !== undefined && correctAnswerIndex !== undefined && answerIndex === correctAnswerIndex,
        };
      });
      
      // Add quiz results with anti-cheat violations
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "quiz",
          answers: answersSummary,
          score: results.score,
          correct: results.correct,
          total: results.total,
          passed: results.passed,
          completedAt: new Date().toISOString(),
          // Anti-cheat violation data for AVA and employer
          antiCheatViolations: violations,
          totalViolations: violations.length,
          violationSummary: violations.length > 0 
            ? `${violations.filter(v => v.type === 'tab_switch').length} tab switches, ${violations.filter(v => v.type === 'copy_attempt').length} copy attempts, ${violations.filter(v => v.type === 'paste_attempt').length} paste attempts, ${violations.filter(v => v.type === 'right_click').length} right-clicks`
            : "No violations detected",
        },
        quizResult: {
          score: results.score,
          correct: results.correct,
          total: results.total,
          passed: results.passed,
        },
      };

      // Build the full phases list to find the next phase
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = application.jobs?.quiz_questions as any[] | undefined;
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = workflowSteps.find((step: any) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string; title: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist (before workflow steps)
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      workflowSteps.filter((step: any) => step.type !== 'voice_interview').forEach((step: any) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add Review phase
      allPhases.push({ id: "review", type: "review", title: "Review" });
      
      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({ 
          id: (voiceInterviewStep as any).id, 
          type: "voice_interview", 
          title: (voiceInterviewStep as any).title || "Ava Interview" 
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
        
        // Save phase data but do NOT set status=rejected locally
        // Let the backend autopilot decision handle it
        
        // Determine next phase info for UI (if candidate passes)
        if (nextPhase && nextPhase.type !== "voice_interview" && nextPhase.type !== "review") {
          setNextPhaseInfo({
            id: nextPhase.id,
            title: nextPhase.title,
          });
        }
      }
      // Manual mode - NEVER auto-advance or reject. Employer controls.

      // Build phase_ai_analysis with violation info
      let phaseAnalysis = `Quiz: ${results.correct}/${results.total} correct (${results.score}%). `;
      phaseAnalysis += `Local calculation: ${results.passed ? "PASSED" : "FAILED"}. `;
      phaseAnalysis += `Backend will compute final weighted score.`;
      if (violations.length > 0) {
        phaseAnalysis += ` ⚠️ ${violations.length} anti-cheat violation(s) detected during quiz.`;
      }

      // Update application with quiz data but do NOT set status to rejected
      // The backend will handle status updates via autopilotDecision
      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          // Do NOT change phase or status here - let backend handle in autopilot mode
          phase: application.phase,
          status: application.status as "pending" | "reviewing" | "interview" | "offered" | "hired" | "rejected",
          phase_ai_analysis: phaseAnalysis,
        })
        .eq("id", id!);

      if (error) throw error;

      // Clear saved progress after successful submission
      clearSavedProgress();

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      // Also invalidate the specific application detail query so UI updates when navigating back
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      // CRITICAL: Trigger backend analysis with autopilotDecision=true in auto mode
      // The backend will calculate weighted score and decide pass/fail
      const analysisPromise = supabase.functions.invoke("trigger-ava-analysis", {
        body: { 
          applicationId: id!,
          autopilotDecision: isAutoMode, // Backend makes the pass/fail decision
          currentPhaseId: stepId,
        },
      });

      if (isAutoMode) {
        // Wait for backend to process and set the result
        setEvaluationState("evaluating");
        
        try {
          const { data: analysisResult } = await analysisPromise;
          console.log("[QuizPhase] Backend analysis result:", analysisResult);
          
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
          console.error("[QuizPhase] Backend analysis failed:", err);
          // Keep evaluating state - backend is source of truth, no local fallback
          setEvaluationState("evaluating");
        }
      } else {
        // Manual mode - just trigger analysis in background, toast and navigate
        analysisPromise.catch(err => console.error("[QuizPhase] AVA analysis trigger failed:", err));
        
        toast.success("Quiz submitted successfully!", {
          description: "Your answers have been recorded. The employer will review your submission.",
        });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting quiz:", error);
      toast.error("Failed to submit quiz");
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for evaluation screen
  const handleStartNextPhase = () => {
    if (!nextPhaseInfo || !application) return;
    
    const workflowSteps = application.jobs?.workflow_steps || [];
    const nextStep = workflowSteps.find((s: any) => s.id === nextPhaseInfo.id);
    
    if (nextStep) {
      // Navigate to the specific phase page based on type
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
      // If next phase is review, go back to application
      navigate(`/applications/${id}`);
    } else {
      navigate(`/applications/${id}`);
    }
  };

  const handleDoLater = () => {
    navigate(`/applications/${id}`);
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
      // Check for step-specific quiz answers or general quiz result
      const stepData = notes.quizAnswers?.[stepId!] || notes[stepId!];
      if (stepData?.completedAt) return stepData;
      return notes.quizResult || null;
    } catch {
      return null;
    }
  })();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
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
        phaseName="Quiz"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  if (questions.length === 0 && !quizInitialized) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Button 
          variant="outline" 
          onClick={() => navigate(`/applications/${id}`)} 
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Application
        </Button>
        
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <HelpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Quiz Questions</h2>
            <p className="text-muted-foreground">
              This quiz has not been configured yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      ref={quizContainerRef}
      className="space-y-6 max-w-3xl mx-auto select-none"
      onCopy={handleCopy}
      onPaste={handlePaste}
      onCut={handleCut}
      onContextMenu={handleContextMenu}
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
          <ClipboardList className="h-4 w-4" />
          Assessment Quiz
        </Badge>
      </div>

      {/* Main Quiz Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Skills Assessment
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!showResults && currentQuestion ? (
            <>
              {/* Progress and Timer */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">Progress</span>
                    {/* Timer */}
                    <div className="flex items-center gap-1.5">
                      <Clock className={`h-4 w-4 ${timeRemaining <= 10 ? "text-red-500" : "text-primary"}`} />
                      <span className={`font-mono text-base font-semibold ${
                        timeRemaining <= 10 ? "text-red-500 animate-pulse" : "text-foreground"
                      }`}>
                        {timeRemaining}s
                      </span>
                    </div>
                  </div>
                  <span className="font-medium text-foreground">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Question */}
              <div className="bg-muted/30 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  {currentQuestion.question}
                </h3>
                
                {getQuestionType(currentQuestion) === 'multiple_choice' ? (
                  <RadioGroup
                    value={answers[currentQuestion.id]?.toString() ?? ""}
                    onValueChange={(value) => handleAnswerSelect(parseInt(value))}
                    className="space-y-3"
                  >
                    {currentQuestion.options?.map((option, index) => (
                      <div
                        key={index}
                        className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                          answers[currentQuestion.id] === index
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50"
                        }`}
                        onClick={() => handleAnswerSelect(index)}
                      >
                        <RadioGroupItem value={index.toString()} id={`option-${index}`} />
                        <Label 
                          htmlFor={`option-${index}`} 
                          className="flex-1 cursor-pointer text-foreground"
                        >
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <Textarea
                    placeholder="Type your answer here..."
                    value={(answers[currentQuestion.id] as string) ?? ""}
                    onChange={(e) => handleTextAnswerChange(e.target.value)}
                    className="min-h-[150px] bg-background resize-none"
                    maxLength={2000}
                  />
                )}
              </div>

              {/* Navigation - Forward only */}
              <div className="flex justify-end">
              {currentQuestionIndex < questions.length - 1 ? (
                  <Button
                    onClick={goToNextQuestion}
                    disabled={!isQuestionAnswered(currentQuestion.id, currentQuestion)}
                    className="gap-2"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinishQuiz}
                    disabled={!questions.every(q => isQuestionAnswered(q.id, q))}
                    className="gap-2"
                  >
                    Finish Quiz
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Question indicators */}
              <div className="flex justify-center gap-2 flex-wrap">
                {questions.map((q, index) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                      index === currentQuestionIndex
                        ? "bg-primary text-primary-foreground"
                        : answers[q.id] !== undefined
                        ? "bg-success/20 text-success"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </>
          ) : showResults ? (
            /* Results */
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                  results?.passed ? "bg-success/20" : "bg-destructive/20"
                }`}>
                  <CheckCircle className={`h-10 w-10 ${
                    results?.passed ? "text-success" : "text-destructive"
                  }`} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {results?.passed ? "Quiz Passed!" : "Quiz Complete"}
                  </h3>
                  <p className="text-muted-foreground">
                    Your answers have been recorded. Thank you for completing the assessment!
                  </p>
                </div>
                
                {/* Show violation summary if any */}
                {violations.length > 0 && (
                  <div className="text-sm text-warning bg-warning/10 px-4 py-2 rounded-lg inline-flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    {violations.length} monitoring alert(s) will be included in your submission
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-center gap-4">
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
          ) : (
            /* Loading state while questions initialize */
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
