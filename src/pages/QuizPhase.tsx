import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: number;
}

interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
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

  const goToPreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const calculateResults = () => {
    let correct = 0;
    
    questions.forEach(q => {
      const userAnswer = answers[q.id];
      if (userAnswer !== undefined && q.correctAnswer !== undefined) {
        if (userAnswer === q.correctAnswer) {
          correct++;
        }
      }
    });
    
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passingScore = application?.jobs?.passing_score || 60;
    const passed = score >= passingScore;
    
    return { correct, total: questions.length, score, passed };
  };

  const handleFinishQuiz = () => {
    const calculatedResults = calculateResults();
    setResults(calculatedResults);
    setShowResults(true);
  };

  const handleSubmit = async () => {
    if (!results || !application) return;
    
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

      const isAutoMode = application.jobs?.processing_mode !== "manual";

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase_ai_analysis: isAutoMode 
            ? `Quiz: ${results.correct}/${results.total} correct (${results.score}%). ${results.passed ? "PASSED" : "FAILED"}`
            : null,
        })
        .eq("id", id!);

      if (error) throw error;

      toast.success("Quiz submitted successfully!", {
        description: results.passed 
          ? "Great job! You passed the quiz."
          : "Your answers have been recorded.",
      });

      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting quiz:", error);
      toast.error("Failed to submit quiz");
    } finally {
      setIsSubmitting(false);
    }
  };

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
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
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

              {/* Navigation */}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={goToPreviousQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Previous
                </Button>
                
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
