import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { triggerAvaAnalysis, evaluatePhaseSubmission } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";

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
    workflow_steps?: WorkflowStep[] | null;
  } | null;
}

export default function TypingTestPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  
  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const typedTextRef = useRef<string>("");
  const startTimeRef = useRef<number | null>(null);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["typing-test-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps)")
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
    enabled: !!id && !!user,
  });

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
    
    // Count words typed (standard: 5 characters = 1 word)
    const charCount = currentTypedText.length;
    const rawWpm = Math.round((charCount / 5) / elapsedMinutes);

    // Calculate accuracy by comparing character by character
    const typedChars = currentTypedText.split("");
    const targetChars = targetText.split("");
    let correctChars = 0;
    
    for (let i = 0; i < typedChars.length; i++) {
      if (typedChars[i] === targetChars[i]) {
        correctChars++;
      }
    }
    
    const accuracy = typedChars.length > 0 
      ? Math.round((correctChars / typedChars.length) * 100)
      : 0;

    // Net WPM = (All Typed Entries / 5 - Uncorrected Errors) / Time (min)
    const errors = typedChars.length - correctChars;
    const netWpm = Math.max(0, Math.round(((charCount / 5) - (errors / 5)) / elapsedMinutes));

    // Calculate overall score (weighted: 60% WPM, 40% accuracy)
    const wpmScore = Math.min(100, (netWpm / 60) * 100);
    const score = Math.round((wpmScore * 0.6) + (accuracy * 0.4));

    const passingScore = application?.jobs?.passing_score || 60;
    const passed = score >= passingScore;

    console.log("Typing test results:", { 
      typedLength: currentTypedText.length,
      elapsedMinutes,
      rawWpm,
      netWpm,
      correctChars, 
      errors,
      accuracy, 
      score, 
      passed 
    });

    return { wpm: netWpm, accuracy, score, passed };
  }, [targetText, application]);

  const handleTestComplete = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const calculatedResults = calculateResults();
    setResults(calculatedResults);
    setTestState("completed");
  }, [calculateResults]);

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
      // Parse existing notes or start fresh
      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
      // Add typing test results
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "typing_test",
          wpm: results.wpm,
          accuracy: results.accuracy,
          score: results.score,
          passed: results.passed,
          completedAt: new Date().toISOString(),
        },
        typingTestResult: {
          wpm: results.wpm,
          accuracy: results.accuracy,
          score: results.score,
          passed: results.passed,
        },
      };

      // Build the full phases list to find the next phase
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = (application.jobs as any)?.quiz_questions as any[] | undefined;
      
      const allPhases: { id: string; type: string; title: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist (before workflow steps)
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps
      workflowSteps.forEach((step) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add final phases
      allPhases.push(
        { id: "review", type: "review", title: "Review" },
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
          phase_ai_analysis: `Typing test: ${results.wpm} WPM, ${results.accuracy}% accuracy, Score: ${results.score}%. ${results.passed ? "PASSED" : "FAILED"}`,
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
    const randomIndex = Math.floor(Math.random() * typingTexts.length);
    setTargetText(typingTexts[randomIndex]);
  };

  // Check if already submitted
  const existingResult = (() => {
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.typingTestResult || null;
    } catch {
      return null;
    }
  })();

  if (isLoading) {
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
        score={existingResult.score}
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
          applicationData={application as any}
          candidateId={user?.id}
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
        score={results?.score}
        passingScore={passingScore}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
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
                    <span>Try to match the text exactly - accuracy matters!</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 mt-1 text-primary" />
                    <span>Your score is based on speed (WPM) and accuracy</span>
                  </li>
                </ul>
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
                        ? `You passed with a score of ${results.score}%. After you submit, the next phase will unlock automatically.`
                        : `You passed with a score of ${results.score}%. The employer will review your overall application next.`
                      : isAutoMode
                        ? `You scored ${results.score}% (required ${passingScore}%). After you submit, your application for this role will be automatically rejected.`
                        : `You scored ${results.score}% (required ${passingScore}%). Your results have been recorded for the employer to review.`
                    }
                  </p>
                </div>
              </div>

              {/* Score Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 text-center">
                    <Zap className="h-6 w-6 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold text-foreground">{results.wpm}</p>
                    <p className="text-xs text-muted-foreground">Words/Min</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 text-center">
                    <Target className="h-6 w-6 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold text-foreground">{results.accuracy}%</p>
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-border">
                  <CardContent className="p-4 text-center">
                    <CheckCircle className={`h-6 w-6 mx-auto mb-2 ${
                      results.passed ? "text-success" : "text-destructive"
                    }`} />
                    <p className="text-2xl font-bold text-foreground">{results.score}%</p>
                    <p className="text-xs text-muted-foreground">Overall Score</p>
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
