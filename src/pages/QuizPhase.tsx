import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Loader2,
  Clock,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis, triggerAvaAnalysis, evaluatePhaseSubmission } from "@/utils/triggerAvaAnalysis";
import { parseApplicationNotes, stringifyApplicationNotes } from "@/utils/applicationNotes";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { GlyphJourney, GlyphCheckSeal } from "@/components/candidate/glyphs";
import { buildCandidateJourney, positionFor, DECISION_STAGE_ID } from "@/lib/candidateJourney";

// A slim brass rule across the top of a card — the letterhead mark that
// opens every considered moment in this phase (Founder's Law: "the
// dialogues feel empty and boring").
const BRASS_RULE = (
  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
);

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: number;
  correct_answer?: string | number | null;
  correct_answers?: string[]; // For multi_select type
  fit_context?: string; // For personality/situational fit-based scoring
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
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'cut_attempt' | 'right_click' | 'keyboard_shortcut';
  timestamp: string;
  details?: string;
}

interface QuizProgress {
  currentQuestionIndex: number;
  answers: Record<string, number | string | number[]>;
  startedAt: string;
  violations: AntiCheatViolation[];
  questionDeadlines?: Record<string, string>;
}

const areDeadlineMapsEqual = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

// Helper to detect question type
const getQuestionType = (question: QuizQuestion): 'multiple_choice' | 'multi_select' | 'text' | 'fit' => {
  const validOptions = question.options?.filter((option) => option?.trim()) || [];

  // If type is explicitly set to a text-based type, use text
  if (question.type === 'text' || question.type === 'open_ended' || question.type === 'short_answer' || question.type === 'long_answer') {
    return 'text';
  }
  // Personality/situational are fit-based (no right/wrong)
  if (question.type === 'personality' || question.type === 'situational' || question.type === 'work_style') {
    return 'fit';
  }
  // Multi-select questions
  if (question.type === 'multi_select') {
    return 'multi_select';
  }
  // If no options or empty options array, treat as text
  if (validOptions.length === 0) {
    return 'text';
  }
  return 'multiple_choice';
};

export default function QuizPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  // Storage key for quiz persistence
  const QUIZ_STORAGE_KEY = `quiz_progress_${id}_${stepId}`;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string | number[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<{
    correct: number;
    total: number;
    score: number;
    passed: boolean;
  } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [quizStartedAt, setQuizStartedAt] = useState<string>("");
  const [questionDeadlines, setQuestionDeadlines] = useState<Record<string, string>>({});
  
  // Stable questions state - prevents crashes from query invalidation
  const [stableQuestions, setStableQuestions] = useState<QuizQuestion[]>([]);
  const [quizInitialized, setQuizInitialized] = useState(false);
  
  // Anti-cheating violation tracking
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);

  // Refs for timer cleanup and stable callbacks
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinishingRef = useRef(false);
  const currentQuestionIndexRef = useRef(currentQuestionIndex);
  const questionsLengthRef = useRef(0);
  const questionDeadlinesRef = useRef<Record<string, string>>({});
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
    enabled: !!id && !!user && !authLoading,
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
    const workflowSteps = application.jobs.workflow_steps as Array<{ id: string; type: string; config?: Record<string, unknown> }> | null;
    const quizStep = workflowSteps?.find(s => s.id === stepId || s.type === "quiz");
    
    if (quizStep?.config?.questions) {
      return quizStep.config.questions as QuizQuestion[];
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

          setCurrentQuestionIndex(progress.currentQuestionIndex);
          setAnswers(progress.answers);
          setViolations(progress.violations || []);
          setQuizStartedAt(progress.startedAt || new Date().toISOString());
          setQuestionDeadlines(progress.questionDeadlines || {});
          
          toast.info("Quiz progress restored", {
            description: `Continuing from question ${progress.currentQuestionIndex + 1}`,
          });
        } catch (e) {
          console.error('[QuizPhase] Failed to restore progress:', e);
          setQuizStartedAt(new Date().toISOString());
        }
      } else {
        setQuizStartedAt(new Date().toISOString());
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
        startedAt: quizStartedAt || new Date().toISOString(),
        violations,
        questionDeadlines,
      };
      localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(progress));
    }
  }, [currentQuestionIndex, answers, quizStartedAt, violations, questionDeadlines, quizInitialized, showResults, QUIZ_STORAGE_KEY, stableQuestions.length]);

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

  // Anti-cheating: Block keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p', 's'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      recordViolation('keyboard_shortcut', `Blocked ${e.key.toUpperCase()} shortcut`);
      toast.warning("Keyboard shortcuts are disabled during the quiz", {
        icon: <ShieldAlert className="h-4 w-4" />,
      });
    }
  }, [recordViolation]);

  // Use stable questions for rendering
  const questions = quizInitialized ? stableQuestions : fetchedQuestions;
  
  // Keep refs in sync for stable timer callbacks
  currentQuestionIndexRef.current = currentQuestionIndex;
  questionsLengthRef.current = questions.length;
  questionDeadlinesRef.current = questionDeadlines;

  // Safe access to current question with null guard
  const currentQuestion = questions.length > 0 && currentQuestionIndex < questions.length 
    ? questions[currentQuestionIndex] 
    : null;
  const currentQuestionOptions = currentQuestion?.options?.filter((option) => option?.trim()) || [];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useMemo(() => {
    const workflowSteps = (application?.jobs?.workflow_steps || []) as Array<{ id: string; type: string; title?: string }>;
    const quizQuestions = application?.jobs?.quiz_questions;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    const steps = buildCandidateJourney(workflowSteps, { hasQuiz });
    const { index, total, current } = positionFor(steps, { stepId, phase: "quiz" });
    return { index, total, title: current.title };
  }, [application?.jobs?.workflow_steps, application?.jobs?.quiz_questions, stepId]);

  const journeyProgressPct = Math.round(((journeyStep.index + 1) / Math.max(journeyStep.total, 1)) * 100);

  // Used only for the "what happens next" line on the pre-send screen — the
  // real pass/fail decision is always made server-side after submit.
  const isAutoPilotJob = application?.jobs?.processing_mode === "auto";

  const getQuestionTimeLimit = useCallback((question: QuizQuestion | null | undefined) => {
    return question?.time_limit_seconds || 30;
  }, []);

  const handleAnswerSelect = (answerIndex: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answerIndex,
    }));
  };

  const handleMultiSelectToggle = (answerIndex: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => {
      const current = (prev[currentQuestion.id] as number[]) || [];
      const updated = current.includes(answerIndex)
        ? current.filter(i => i !== answerIndex)
        : [...current, answerIndex];
      return { ...prev, [currentQuestion.id]: updated };
    });
  };

  const handleTextAnswerChange = (text: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: text,
    }));
  };

  // Check if a question has been answered (works for all types)
  const isQuestionAnswered = (questionId: string, question: QuizQuestion): boolean => {
    const answer = answers[questionId];
    const qType = getQuestionType(question);
    if (qType === 'text') {
      return typeof answer === 'string' && answer.trim().length > 0;
    }
    if (qType === 'multi_select') {
      return Array.isArray(answer) && answer.length > 0;
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
      const qType = getQuestionType(q);
      
      // Text and fit questions don't count toward the scored total
      if (qType === 'text' || qType === 'fit') {
        return;
      }
      
      // Multi-select scoring
      if (qType === 'multi_select' && q.correct_answers && Array.isArray(q.correct_answers)) {
        multipleChoiceCount++;
        if (!Array.isArray(userAnswer) || userAnswer.length === 0) return;
        
        const selectedTexts = userAnswer.map(i => q.options?.[i]?.toLowerCase().trim());
        const correctTexts = q.correct_answers.map(a => a.toLowerCase().trim());
        
        const allCorrectSelected = correctTexts.every(ct => selectedTexts.includes(ct));
        const noExtras = selectedTexts.every(st => correctTexts.includes(st!));
        
        if (allCorrectSelected && noExtras) {
          correct += 1; // Full credit
        } else if (selectedTexts.some(st => correctTexts.includes(st!))) {
          correct += 0.5; // Partial credit
        }
        return;
      }
      
      multipleChoiceCount++;
      if (userAnswer === undefined) return;
      
      // Get correct answer - handle both field names and formats
      let correctAnswerIndex: number | undefined;
      
      if (q.correctAnswer !== undefined) {
        correctAnswerIndex = q.correctAnswer;
      } else if (q.correct_answer !== undefined && q.correct_answer !== null) {
        if (typeof q.correct_answer === 'number') {
          correctAnswerIndex = q.correct_answer;
        } else if (typeof q.correct_answer === 'string') {
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
    
    const score = multipleChoiceCount > 0 ? Math.round((correct / multipleChoiceCount) * 100) : 100;
    
    return { correct, total: multipleChoiceCount, score, passed: false };
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

  const syncTimerState = useCallback(() => {
    if (!quizInitialized || showResults || questions.length === 0) return;

    const now = Date.now();
    const startIndex = Math.min(currentQuestionIndexRef.current, questions.length - 1);
    let workingDeadlines = { ...questionDeadlinesRef.current };
    let resolvedIndex = startIndex;
    let lastBoundary: number | null = null;

    while (resolvedIndex < questions.length) {
      const question = questions[resolvedIndex];
      const existingDeadline = workingDeadlines[question.id];
      let deadlineMs = existingDeadline ? Date.parse(existingDeadline) : Number.NaN;

      if (!Number.isFinite(deadlineMs)) {
        const baseTime = lastBoundary ?? now;
        deadlineMs = baseTime + getQuestionTimeLimit(question) * 1000;
        workingDeadlines[question.id] = new Date(deadlineMs).toISOString();
      }

      if (deadlineMs > now) {
        break;
      }

      lastBoundary = deadlineMs;

      if (resolvedIndex >= questions.length - 1) {
        if (!areDeadlineMapsEqual(questionDeadlinesRef.current, workingDeadlines)) {
          questionDeadlinesRef.current = workingDeadlines;
          setQuestionDeadlines(workingDeadlines);
        }
        setTimeRemaining(0);
        handleFinishQuiz();
        return;
      }

      resolvedIndex += 1;
    }

    if (!areDeadlineMapsEqual(questionDeadlinesRef.current, workingDeadlines)) {
      questionDeadlinesRef.current = workingDeadlines;
      setQuestionDeadlines(workingDeadlines);
    }

    if (resolvedIndex !== currentQuestionIndexRef.current) {
      setCurrentQuestionIndex(resolvedIndex);
    }

    const activeQuestion = questions[resolvedIndex];
    const activeDeadline = workingDeadlines[activeQuestion.id];
    const activeDeadlineMs = activeDeadline ? Date.parse(activeDeadline) : now;
    setTimeRemaining(Math.max(0, Math.ceil((activeDeadlineMs - now) / 1000)));
  }, [getQuestionTimeLimit, handleFinishQuiz, questions, quizInitialized, showResults]);

  // Timer effect - uses persisted absolute deadlines so refreshes/backgrounding do not reset the quiz.
  useEffect(() => {
    if (!quizInitialized || showResults || questions.length === 0) return;

    isFinishingRef.current = false;
    syncTimerState();

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      syncTimerState();
    }, 250);

    const handleVisibleSync = () => {
      if (!document.hidden) {
        syncTimerState();
      }
    };

    window.addEventListener("focus", syncTimerState);
    document.addEventListener("visibilitychange", handleVisibleSync);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("focus", syncTimerState);
      document.removeEventListener("visibilitychange", handleVisibleSync);
    };
  }, [currentQuestionIndex, questions.length, quizInitialized, showResults, syncTimerState]);

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
            isCorrect: null,
          };
        }
        
        // Fit-based questions (personality/situational) - no right/wrong
        if (questionType === 'fit') {
          const answerIndex = typeof userAnswer === 'number' ? userAnswer : undefined;
          return {
            questionId: q.id,
            question: q.question,
            questionType: 'fit',
            selectedAnswer: answerIndex,
            selectedAnswerText: answerIndex !== undefined ? (q.options?.[answerIndex] || "Not answered") : "Not answered",
            correctAnswer: null,
            isCorrect: null, // Not scored - AVA evaluates qualitatively
            fit_context: q.fit_context || null,
          };
        }
        
        // Multi-select questions
        if (questionType === 'multi_select' && q.correct_answers) {
          const selectedIndices = Array.isArray(userAnswer) ? userAnswer as number[] : [];
          const selectedTexts = selectedIndices.map(i => q.options?.[i] || '');
          const correctTexts = q.correct_answers;
          
          const allCorrectSelected = correctTexts.every(ct => selectedTexts.some(st => st.toLowerCase().trim() === ct.toLowerCase().trim()));
          const noExtras = selectedTexts.every(st => correctTexts.some(ct => ct.toLowerCase().trim() === st.toLowerCase().trim()));
          
          return {
            questionId: q.id,
            question: q.question,
            questionType: 'multi_select',
            selectedAnswers: selectedTexts,
            correctAnswers: correctTexts,
            isCorrect: allCorrectSelected && noExtras,
            isPartialCredit: !allCorrectSelected && selectedTexts.some(st => correctTexts.some(ct => ct.toLowerCase().trim() === st.toLowerCase().trim())),
          };
        }
        
        // Standard multiple choice
        let correctAnswerIndex: number | undefined;
        
        if (q.correctAnswer !== undefined) {
          correctAnswerIndex = q.correctAnswer;
        } else if (q.correct_answer !== undefined && q.correct_answer !== null) {
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

      // Build the real journey to find the next stage
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = application.jobs?.quiz_questions;
      const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;

      const typedSteps = workflowSteps as Array<{ id: string; type: string; title?: string }>;
      const allPhases = buildCandidateJourney(typedSteps, { hasQuiz });

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

        // Determine next phase info for UI (if candidate passes) — not for
        // voice_interview (needs employer approval to start) or the closing
        // decision stage (nothing to click into, just wait).
        if (nextPhase && nextPhase.type !== "voice_interview" && nextPhase.id !== DECISION_STAGE_ID) {
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
    } else {
      // Next stage isn't a real workflow step (e.g. the closing decision
      // stage) — nothing to navigate into, just head back to the overview.
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

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="relative max-w-md overflow-hidden bg-card border-border">
          {BRASS_RULE}
          <CardContent className="space-y-4 p-8 text-center">
            <h2 className="font-display text-xl text-foreground">We can't find that application</h2>
            <p className="text-sm text-muted-foreground">
              It may have moved — head back and pick it up from your list.
            </p>
            <Button onClick={() => navigate("/applications")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
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
      <div className="max-w-3xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/applications/${id}`)}
          className="gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Application
        </Button>

        <Card className="relative overflow-hidden bg-card border-border">
          {BRASS_RULE}
          <CardContent className="space-y-2 p-8 text-center">
            <GlyphJourney size={40} className="mx-auto mb-2 text-muted-foreground" />
            <h2 className="font-display text-xl text-foreground">Nothing to answer yet</h2>
            <p className="text-sm text-muted-foreground">
              This quiz hasn't been set up on our end — there's nothing you need to do here.
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
      className="max-w-3xl mx-auto space-y-6 select-none"
      onCopy={handleCopy}
      onPaste={handlePaste}
      onCut={handleCut}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {/* Journey header — where am I, what's happening now, what's next */}
      <header className="ck-reveal space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/applications/${id}`)}
            aria-label="Back to application overview"
            className="shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {application.jobs?.title || "This role"}
          </p>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
            Skills check
          </h1>

          <span className="ck-num block text-xs font-medium text-muted-foreground">
            Step {journeyStep.index + 1} of {journeyStep.total} — {journeyStep.title}
          </span>

          <Progress value={journeyProgressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            {showResults
              ? "Have a last look, then send your answers in."
              : "Answer at your own pace — each question keeps its own gentle timer."}
          </p>
        </div>

        {violations.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              {violations.length} thing{violations.length === 1 ? "" : "s"} flagged during this session
            </span>
          </div>
        )}
      </header>

      {/* Main quiz card — the letterhead moment: brass rule, then the question itself as the heading */}
      <Card className="relative overflow-hidden bg-card border-border">
        {BRASS_RULE}
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {!showResults && currentQuestion ? (
            <>
              {/* Progress within the quiz */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="ck-num font-medium text-foreground">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock className={`h-4 w-4 ${timeRemaining <= 10 ? "text-destructive" : "text-muted-foreground"}`} />
                    <span className={`ck-num text-base font-semibold ${
                      timeRemaining <= 10 ? "text-destructive" : "text-foreground"
                    }`}>
                      {timeRemaining}s
                    </span>
                  </div>
                </div>
                <Progress value={progress} className="h-1.5 bg-[var(--track)]" />
              </div>

              {/* Question — the focal moment */}
              <div className="space-y-5">
                <h2 className="font-display ck-ink text-xl leading-snug text-foreground sm:text-2xl">
                  {currentQuestion.question}
                </h2>

                {getQuestionType(currentQuestion) === 'multi_select' ? (
                  <>
                    <p className="text-sm text-muted-foreground">Select all that apply</p>
                    <div className="space-y-3">
                      {currentQuestionOptions.map((option, index) => {
                        const selected = Array.isArray(answers[currentQuestion.id]) && (answers[currentQuestion.id] as number[]).includes(index);
                        return (
                          <div
                            key={index}
                            className={`flex items-center space-x-3 rounded-lg border p-4 transition-colors cursor-pointer ${
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-muted/50"
                            }`}
                            onClick={() => handleMultiSelectToggle(index)}
                          >
                            <Checkbox checked={selected} />
                            <Label className="flex-1 cursor-pointer text-foreground">
                              {option}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (getQuestionType(currentQuestion) === 'multiple_choice' || getQuestionType(currentQuestion) === 'fit') ? (
                  <RadioGroup
                    value={answers[currentQuestion.id]?.toString() ?? ""}
                    onValueChange={(value) => handleAnswerSelect(parseInt(value))}
                    className="space-y-3"
                  >
                    {currentQuestionOptions.map((option, index) => (
                      <div
                        key={index}
                        className={`flex items-center space-x-3 rounded-lg border p-4 transition-colors cursor-pointer ${
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
                    className="min-h-[150px] resize-none border-[var(--line)] bg-[var(--ground)] focus-visible:ring-[var(--brass-line)]"
                    maxLength={2000}
                  />
                )}
              </div>

              {/* Continue — the one primary action on this screen */}
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Tap a number below to jump to a different question.
                </p>
                {currentQuestionIndex < questions.length - 1 ? (
                  <Button
                    onClick={goToNextQuestion}
                    disabled={!isQuestionAnswered(currentQuestion.id, currentQuestion)}
                    size="lg"
                    className="w-full gap-2 sm:w-auto"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinishQuiz}
                    disabled={!questions.every(q => isQuestionAnswered(q.id, q))}
                    size="lg"
                    className="w-full gap-2 sm:w-auto"
                  >
                    Finish
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Question indicators */}
              <div className="flex flex-wrap justify-center gap-2">
                {questions.map((q, index) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(index)}
                    aria-label={`Go to question ${index + 1}`}
                    aria-current={index === currentQuestionIndex ? "step" : undefined}
                    className={`ck-num flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      index === currentQuestionIndex
                        ? "bg-primary text-primary-foreground"
                        : answers[q.id] !== undefined
                        ? "border border-primary/40 bg-primary/5 text-primary"
                        : "border border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </>
          ) : showResults ? (
            /* Results — a held moment before sending. The real pass/fail read
               happens after submit (EvaluationScreen / CandidateStatusScreen),
               so this stays a calm, neutral checkpoint — never red or green. */
            <div className="ck-reveal space-y-8 text-center">
              <div className="space-y-4">
                <GlyphCheckSeal size={44} className="ck-seal-press text-[var(--brass)]" />
                <div className="space-y-1.5">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
                    That's the quiz
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isAutoPilotJob
                      ? "Send your answers and you'll hear back in a moment."
                      : "Send your answers — the hiring team will review them and get back to you."}
                  </p>
                </div>
              </div>

              {violations.length > 0 && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-2 text-sm text-warning">
                  <ShieldAlert className="h-4 w-4" />
                  {violations.length} thing{violations.length === 1 ? "" : "s"} flagged — included with your answers
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                size="lg"
                className="w-full gap-2 sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send my answers
                    <CheckCircle className="h-4 w-4" />
                  </>
                )}
              </Button>
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
