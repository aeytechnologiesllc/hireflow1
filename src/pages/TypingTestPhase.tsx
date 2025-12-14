import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

// Sample typing test paragraphs
const typingTexts = [
  "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the English alphabet at least once. It has been used for decades to test typewriters, keyboards, and typing software.",
  "Customer service is about creating positive experiences for every client. Active listening, empathy, and clear communication are essential skills. A great support representative can turn a frustrated customer into a loyal advocate.",
  "In today's fast-paced business environment, effective communication is more important than ever. Whether you're writing emails, preparing reports, or participating in meetings, your ability to express ideas clearly can make or break your career.",
  "Technology continues to transform how we work and interact with customers. From chatbots to CRM systems, understanding these tools helps us provide better service. Embracing change while maintaining a human touch is the key to success.",
  "Problem-solving is a critical skill in any workplace. When faced with challenges, taking a step back to analyze the situation, considering multiple solutions, and implementing the best approach can lead to positive outcomes for everyone involved."
];

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
  } | null;
}

export default function TypingTestPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
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
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["typing-test-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as ApplicationDetails;
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
    setStartTime(Date.now());
    setTypedText("");
    setTimeLeft(60);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const calculateResults = useCallback(() => {
    const words = typedText.trim().split(/\s+/).filter(Boolean);
    const elapsedMinutes = startTime ? (Date.now() - startTime) / 60000 : 1;
    const wpm = Math.round(words.length / elapsedMinutes);

    // Calculate accuracy
    const typedChars = typedText.split("");
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

    // Calculate overall score (weighted: 60% WPM, 40% accuracy)
    const wpmScore = Math.min(100, (wpm / 60) * 100);
    const score = Math.round((wpmScore * 0.6) + (accuracy * 0.4));

    const passingScore = application?.jobs?.passing_score || 60;
    const passed = score >= passingScore;

    return { wpm, accuracy, score, passed };
  }, [typedText, targetText, startTime, application]);

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

      // Determine next phase based on processing mode
      const isAutoMode = application.jobs?.processing_mode !== "manual";
      const passingScore = application.jobs?.passing_score || 60;
      
      let newPhase = application.phase;
      if (isAutoMode && results.score >= passingScore) {
        // In auto mode, advance to next phase if passed
        // For now, just mark the current phase as completed
        newPhase = stepId; // Keep at current step, AI will advance
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase_ai_analysis: isAutoMode 
            ? `Typing test: ${results.wpm} WPM, ${results.accuracy}% accuracy, Score: ${results.score}%. ${results.passed ? "PASSED" : "FAILED"}`
            : null,
        })
        .eq("id", id!);

      if (error) throw error;

      toast.success("Typing test submitted successfully!", {
        description: results.passed 
          ? "Great job! You passed the typing test."
          : "Your results have been recorded.",
      });

      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting typing test:", error);
      toast.error("Failed to submit typing test");
    } finally {
      setIsSubmitting(false);
    }
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
                onChange={(e) => setTypedText(e.target.value)}
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
                      ? "You've passed the typing test!"
                      : "Your results have been recorded."}
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
