import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { parseApplicationNotes, type StepRecordLike } from "@/utils/applicationNotes";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { StepAdvanceScreen, TestRulesNotice } from "@/components/candidate/NextStepCard";
import { GlyphJourney, GlyphCheckSeal } from "@/components/candidate/glyphs";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";

// A slim brass rule across the top of a card — the letterhead mark that
// opens every considered moment in this phase (Founder's Law: "the
// dialogues feel empty and boring").
const BRASS_RULE = (
  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
);

// The answer key is deliberately absent from this shape. It was moved
// server-side into a private table by a database trigger (see migration
// 20260915110000_quiz_answer_keys_server_side.sql), so the jobs row this
// page reads never carries it in the first place. Grading now happens in
// the submit_quiz_attempt RPC; this page only renders the question and the
// candidate's own answer.
interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
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
    workflow_steps: Array<{ id: string; type: string; title?: string }> | null;
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
  // No options to choose from — always fall through to free text, regardless
  // of the declared type. This MUST be checked before the type checks below:
  // Ava's job generator writes every quiz question as type "situational" with
  // an empty options array, and a situational/personality/work_style/
  // multi_select question with no options renders zero choices (a radio or
  // checkbox group over nothing) if the type check wins first. Free text is
  // what an option-less scenario prompt wants anyway. A situational question
  // that DOES have options still gets its radio buttons below.
  if (validOptions.length === 0) {
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
  

  // Refs for timer cleanup and stable callbacks
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinishingRef = useRef(false);
  const currentQuestionIndexRef = useRef(currentQuestionIndex);
  const questionsLengthRef = useRef(0);
  const questionDeadlinesRef = useRef<Record<string, string>>({});
  const quizContainerRef = useRef<HTMLDivElement>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
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

  // After "Send my answers": the waiting screen, then "Start <next step>" the
  // moment the row says the next step is open (see useStepAdvance).
  const advance = useStepAdvance({ applicationId: id, stepId, job: application?.jobs });

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
          // Drop deadlines that have already passed. Restoring them unfiltered
          // meant a quiz reopened after any real gap came back with every
          // stored deadline expired, which is the input the cascade above fed
          // on. A question the candidate is returning to gets a fresh clock.
          setQuestionDeadlines(
            Object.fromEntries(
              Object.entries(progress.questionDeadlines || {}).filter(
                ([, iso]) => Date.parse(iso as string) > Date.now()
              )
            ) as Record<string, string>
          );
          
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
    }

    // Mark initialized once the application has resolved, EVEN IF there are no
    // questions. This used to sit inside the `length > 0` guard, so a quiz with
    // zero questions left quizInitialized false forever, the render fell into
    // the `questions.length === 0 && !quizInitialized` skeleton branch, and the
    // candidate watched two grey bars for as long as they were willing to wait.
    // The honest "nothing to answer here" state below it — the only branch with
    // a Back to Application button — was unreachable code. A cleared quiz, a
    // stale emailed link, or a step whose config.questions is [] all land here.
    if (application && !quizInitialized) {
      setQuizInitialized(true);
    }
  }, [fetchedQuestions, quizInitialized, QUIZ_STORAGE_KEY, application]);

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
    toast.warning("Copy is turned off here — just answer in your own words.", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('paste_attempt');
    toast.warning("Paste is turned off here — answer directly.", {
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
    toast.warning("Right-click is turned off here.", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Block keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'p', 's'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      recordViolation('keyboard_shortcut', `Blocked ${e.key.toUpperCase()} shortcut`);
      toast.warning("That shortcut is turned off here.", {
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
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: "quiz" });


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

  // Grading used to happen here, against the answer key the browser had
  // just been sent. It doesn't anymore — submit_quiz_attempt grades
  // server-side, against a key the browser never sees, when the candidate
  // actually sends their answers. Finishing just stops the clock and shows
  // the calm "ready to send" checkpoint; `results` is populated once the
  // server responds in handleSubmit.
  const handleFinishQuiz = useCallback(() => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;

    // Clear the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setShowResults(true);
  }, []);

  const syncTimerState = useCallback(() => {
    if (!quizInitialized || showResults || questions.length === 0) return;

    const now = Date.now();
    const startIndex = Math.min(currentQuestionIndexRef.current, questions.length - 1);
    const workingDeadlines = { ...questionDeadlinesRef.current };
    let resolvedIndex = startIndex;
    let lastBoundary: number | null = null;

    while (resolvedIndex < questions.length) {
      const question = questions[resolvedIndex];
      const existingDeadline = workingDeadlines[question.id];
      let deadlineMs = existingDeadline ? Date.parse(existingDeadline) : Number.NaN;

      if (!Number.isFinite(deadlineMs)) {
        // Was `lastBoundary ?? now`, which dated a question the candidate has
        // never been shown off the PREVIOUS question's deadline. On a return
        // visit that boundary is already in the past, so the new deadline was
        // born expired too — and the loop then walked the same way through
        // every remaining question, minting each one already dead, until it
        // reached the end and submitted a blank paper. Close the tab on
        // question 1, come back later, and the quiz was over with a permanent
        // zero. A question's clock starts when the candidate reaches it.
        deadlineMs = now + getQuestionTimeLimit(question) * 1000;
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
    if (!application) return;

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

      // Auto mode: the waiting screen goes up now and stays until the next
      // step is open (useStepAdvance) — never a toast and a trip back to the
      // overview.
      if (isAutoMode) advance.begin();

      // Grade server-side. submit_quiz_attempt is the only thing that ever
      // touches the answer key — it reads the private key table, grades
      // with the exact rules this page used to run in the browser, writes
      // the application's own result fields itself, and hands back only
      // the tally. This page never sees which answer was correct.
      const { data: submission, error: submitError } = await supabase.rpc("submit_quiz_attempt", {
        p_application_id: id!,
        p_step_id: stepId!,
        p_answers: answers as unknown as Json,
        p_violations: violations as unknown as Json,
      });

      if (submitError) throw submitError;

      const graded = submission as { score: number; correct: number; total: number; passed: boolean };
      setResults(graded);

      // Clear saved progress after successful submission
      clearSavedProgress();

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      // Also invalidate the specific application detail query so UI updates when navigating back
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      if (isAutoMode) {
        // The answers are stored. Which step opens next is the server's call
        // (it moves `phase`); the screen follows the row, and the trigger's
        // reply only speeds that up. invokeTriggerAvaAnalysis never throws.
        advance.markSaved();
        const reply = await invokeTriggerAvaAnalysis({
          applicationId: id!,
          autopilotDecision: true,
          currentPhaseId: stepId,
        });
        advance.settle(reply);
      } else {
        // Manual mode - NEVER auto-advance or reject. Employer controls.
        invokeTriggerAvaAnalysis({
          applicationId: id!,
          autopilotDecision: false,
          currentPhaseId: stepId,
        }).catch(err => console.error("[QuizPhase] AVA analysis trigger failed:", err));

        toast.success("Skills check sent", {
          description: "Your answers are saved. The hiring team will review them and get back to you.",
        });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting quiz:", error);
      toast.error("That didn't send — please try again.");
      advance.cancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if already submitted
  const existingResult = (() => {
    // If application was reconsidered (status reset to pending), allow re-submission
    if (application?.status === "pending" && application?.phase === stepId) {
      return null;
    }
    if (!application?.notes) return null;
    try {
      const notes = parseApplicationNotes(application.notes);
      // Check for step-specific quiz answers or general quiz result
      const stepData = (notes.quizAnswers?.[stepId!] || notes[stepId!]) as StepRecordLike | undefined;
      if (stepData?.completedAt) return stepData;
      return notes.quizResult || null;
    } catch {
      return null;
    }
  })();

  // "Already done" is decided once, from the first read after this page
  // mounted — never from a refresh that lands while the candidate is here.
  const resultAtFirstLoad = useResultAtFirstLoad(isFetchedAfterMount && !!application, !!existingResult);

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

  // Sent in this visit: the waiting screen, then the next step's button.
  if (advance.view) {
    return (
      <StepAdvanceScreen
        advance={advance}
        applicationId={id!}
        jobTitle={application.jobs?.title}
        completedTitle={journeyStep.title}
      />
    );
  }

  if (resultAtFirstLoad === null) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Done before this visit began (a bookmark, the back button): say where
  // things stand and offer the next step, never a dead end.
  if (resultAtFirstLoad && existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName={journeyStep.title}
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

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            {showResults
              ? "Have a last look, then send your answers in."
              : "Each question is timed — when the clock runs out, the next one comes up."}
          </p>
        </div>

        {/* The quiz has no intro screen of its own (its clock starts on load),
            so the rules sit here, above question 1, for the whole quiz. */}
        {!showResults && <TestRulesNotice />}

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
                            <Label className="flex-1 cursor-pointer leading-snug text-foreground">
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
                          className="flex-1 cursor-pointer leading-snug text-foreground"
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
