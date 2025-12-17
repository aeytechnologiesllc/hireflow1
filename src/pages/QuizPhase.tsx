import { useState, useEffect, useRef } from "react";
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
import { 
  ArrowLeft, 
  ArrowRight,
  ClipboardList, 
  CheckCircle,
  Loader2,
  HelpCircle,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { triggerAvaAnalysis, evaluatePhaseSubmission } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";

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

export default function QuizPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<{
    correct: number;
    total: number;
    score: number;
    passed: boolean;
  } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);

  // Refs for timer cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFinishingRef = useRef(false);

  // Fetch application details
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
  });

  // Get questions from job
  const questions: QuizQuestion[] = (() => {
    if (!application?.jobs) return [];
    
    // First check workflow_steps for quiz config
    const workflowSteps = application.jobs.workflow_steps as any[] | null;
    const quizStep = workflowSteps?.find(s => s.id === stepId || s.type === "quiz");
    
    if (quizStep?.config?.questions) {
      return quizStep.config.questions;
    }
    
    // Fallback to quiz_questions from job
    return (application.jobs.quiz_questions as QuizQuestion[]) || [];
  })();

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  const handleAnswerSelect = (answerIndex: number) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answerIndex,
    }));
  };

  const goToNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const calculateResults = () => {
    let correct = 0;
    
    questions.forEach(q => {
      const userAnswer = answers[q.id];
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
          correctAnswerIndex = q.options.findIndex(
            opt => opt.toLowerCase().trim() === q.correct_answer?.toString().toLowerCase().trim()
          );
          if (correctAnswerIndex === -1) correctAnswerIndex = undefined;
        }
      }
      
      if (correctAnswerIndex !== undefined && userAnswer === correctAnswerIndex) {
        correct++;
      }
    });
    
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passingScore = application?.jobs?.passing_score || 60;
    const passed = score >= passingScore;
    
    return { correct, total: questions.length, score, passed };
  };

const handleFinishQuiz = () => {
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
  };

  // Timer effect - countdown for each question
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
          setTimeout(() => {
            if (currentQuestionIndex < questions.length - 1) {
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
  }, [currentQuestionIndex, showResults, questions.length]);

  const handleSubmit = async () => {
    if (!results || !application) return;
    
    const isAutoMode = application.jobs?.processing_mode !== "manual";
    const passingScore = application.jobs?.passing_score || 60;
    
    // For autopilot mode, show evaluation screen
    if (isAutoMode) {
      setEvaluationState("evaluating");
    }
    
    setIsSubmitting(true);
    try {
      // Parse existing notes
      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
      // Create answers summary
      const answersSummary = questions.map(q => ({
        questionId: q.id,
        question: q.question,
        selectedAnswer: answers[q.id],
        selectedAnswerText: q.options[answers[q.id]] || "Not answered",
        correctAnswer: q.correctAnswer,
        isCorrect: answers[q.id] === q.correctAnswer,
      }));
      
      // Add quiz results
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
      const allPhases = [
        { id: "application", type: "application", title: "Application" },
        ...workflowSteps.map((step: any) => ({ id: step.id, type: step.type, title: step.title || step.type })),
        { id: "review", type: "review", title: "Review" },
        { id: "interview", type: "interview", title: "Interview" },
        { id: "hired", type: "hired", title: "Hired" },
      ];
      
      // Find current step index
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }

      let newPhase = application.phase;
      let newStatus = application.status;
      
      if (isAutoMode) {
        if (results.passed) {
          // Advance to next phase
          if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
            newPhase = allPhases[currentIndex + 1].id;
            // Store next phase info for evaluation screen
            setNextPhaseInfo({
              id: allPhases[currentIndex + 1].id,
              title: allPhases[currentIndex + 1].title,
            });
          }
        } else {
          // Failed - reject the application
          newStatus = "rejected";
        }
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          status: newStatus as "pending" | "reviewing" | "interview" | "offered" | "hired" | "rejected",
          phase_ai_analysis: `Quiz: ${results.correct}/${results.total} correct (${results.score}%). ${results.passed ? "PASSED" : "FAILED"}`,
        })
        .eq("id", id!);

      if (error) throw error;

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      if (isAutoMode) {
        // Run evaluation and show result screen
        await evaluatePhaseSubmission(id!, results.score, passingScore);
        setEvaluationState(results.passed ? "passed" : "failed");
      } else {
        // Manual mode - toast and navigate
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
        score={existingResult.score}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
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
    return (
      <EvaluationScreen
        state={evaluationState}
        onStartNextPhase={nextPhaseInfo ? handleStartNextPhase : undefined}
        onDoLater={handleDoLater}
        nextPhaseName={nextPhaseInfo?.title}
        score={results?.score}
        passingScore={application?.jobs?.passing_score || 60}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
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
          {!showResults ? (
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
                  {currentQuestion?.question}
                </h3>
                
                <RadioGroup
                  value={answers[currentQuestion?.id]?.toString()}
                  onValueChange={(value) => handleAnswerSelect(parseInt(value))}
                  className="space-y-3"
                >
                  {currentQuestion?.options.map((option, index) => (
                    <div
                      key={index}
                      className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                        answers[currentQuestion?.id] === index
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
              </div>

{/* Navigation - Forward only */}
              <div className="flex justify-end">
                {currentQuestionIndex < questions.length - 1 ? (
                  <Button
                    onClick={goToNextQuestion}
                    disabled={answers[currentQuestion?.id] === undefined}
                    className="gap-2"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinishQuiz}
                    disabled={Object.keys(answers).length < questions.length}
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
          ) : (
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
                    You answered {results?.correct} out of {results?.total} questions correctly
                  </p>
                </div>
              </div>

              {/* Score Display */}
              <div className="bg-muted/30 rounded-lg p-6 text-center">
                <p className="text-4xl font-bold text-foreground">{results?.score}%</p>
                <p className="text-sm text-muted-foreground mt-1">Overall Score</p>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
