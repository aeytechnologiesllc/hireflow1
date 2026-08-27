import { useState, useRef, useEffect, useMemo } from "react";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { buildCandidateJourney, positionFor } from "@/lib/candidateJourney";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Users,
  Send,
  CheckCircle,
  User,
  Clock,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis, triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { AvaSeal } from "@/components/ava/AvaSeal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'screenshot_attempt' | 'right_click';
  timestamp: string;
  details: string;
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
    description: string;
    requirements: string | null;
    responsibilities: string | null;
    benefits: string[] | null;
    skills_required: string[] | null;
    location: string | null;
    job_type: string | null;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: any[] | null;
    quiz_questions: any[] | null;
  } | null;
  profiles?: {
    full_name: string | null;
  };
}

const CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat-interview`;

export default function ChatInterviewPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [state, setState] = useState<"intro" | "interviewing" | "evaluating" | "completed" | "rejected">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [isBlurred, setIsBlurred] = useState(false);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [autoEndTriggered, setAutoEndTriggered] = useState(false);
  const [rejectedAppData, setRejectedAppData] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Update elapsed time every second when interviewing
  useEffect(() => {
    if (state !== "interviewing" || !startTime) return;
    
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [state, startTime]);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["chat-interview-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, description, requirements, responsibilities, benefits, skills_required, location, job_type, processing_mode, passing_score, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      
      // Also fetch the candidate's profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", data.candidate_id)
        .single();
      
      return { ...data, profiles: profile } as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`chat-interview-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["chat-interview-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Log anti-cheat violation
  const logViolation = (type: AntiCheatViolation['type'], details: string) => {
    if (state === "interviewing") {
      setViolations(prev => [...prev, {
        type,
        timestamp: new Date().toISOString(),
        details,
      }]);
    }
  };

  // Anti-cheat: Blur content when page loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && state === "interviewing") {
        logViolation('tab_switch', 'User switched to another tab or window');
      }
      setIsBlurred(document.hidden);
    };
    
    const handleBlur = () => {
      if (state === "interviewing") {
        logViolation('tab_switch', 'Window lost focus');
      }
      setIsBlurred(true);
    };
    const handleFocus = () => setIsBlurred(false);
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [state]);

  // Auto-end interview when closing message is detected
  useEffect(() => {
    if (autoEndTriggered && state === "interviewing") {
      setState("evaluating");
      // Need to call handleSubmit - we'll trigger it via the button's logic
      setAutoEndTriggered(false);
      // Directly execute the submission logic
      const runSubmit = async () => {
        if (!application) return;
        setIsSubmitting(true);
        try {
          const candidateContext = buildCandidateContext();
          const evalResponse = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              mode: "evaluate",
              jobTitle: application.jobs?.title || "",
              jobDescription: application.jobs?.description || "",
              candidateName: application.profiles?.full_name || "Candidate",
              candidateContext,
              messages: messages.map(m => ({ role: m.role, content: m.content })),
            }),
          });

          let evaluation = null;
          if (evalResponse.ok) {
            evaluation = await evalResponse.json();
          }

          const existingNotes = parseApplicationNotes(application.notes);
          const updatedNotes = {
            ...existingNotes,
            chatInterviewResult: {
              messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
              duration: getDuration(),
              questionCount,
              violations: violations.length > 0 ? violations : undefined,
              evaluation,
            },
          };

          const workflowSteps = application.jobs?.workflow_steps as Array<{ id: string; type: string }> || [];
          const currentStepIndex = workflowSteps.findIndex(s => s.id === stepId);
          const nextStep = workflowSteps[currentStepIndex + 1];

          // Respect manual mode: NEVER auto-advance phases.
          const { data: freshJobAutoEnd } = await supabase
            .from("jobs")
            .select("processing_mode")
            .eq("id", application.job_id)
            .single();

          const isAutoModeAutoEnd = freshJobAutoEnd?.processing_mode === "auto";

          // Save phase data only - do NOT write ai_score directly
          // Backend trigger-ava-analysis is the SINGLE SOURCE OF TRUTH for scoring
          await supabase
            .from("applications")
            .update({
              notes: JSON.stringify(updatedNotes),
              phase_ai_analysis: evaluation?.summary || null,
              status: "reviewing",
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);

          // Trigger backend analysis - it will calculate weighted ai_score and decide pass/fail
          await triggerAvaAnalysis(id!);
          
          // If auto mode, advance phase after backend processes
          if (isAutoModeAutoEnd && nextStep) {
            await supabase
              .from("applications")
              .update({ phase: nextStep.id })
              .eq("id", id);
          }

          queryClient.invalidateQueries({ queryKey: ["applications"] });
          queryClient.invalidateQueries({ queryKey: ["chat-interview-application", id] });

          toast.success("Interview sent!", {
            description: "The hiring team will get back to you — everyone hears back.",
          });
          setState("completed");
          setTimeout(() => navigate(`/applications/${id}`), 2000);
        } catch (error) {
          console.error("Submit error:", error);
          toast.error("That didn't send — please try again.");
          setState("interviewing");
        } finally {
          setIsSubmitting(false);
        }
      };
      runSubmit();
    }
  }, [autoEndTriggered]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useMemo(() => {
    const workflowSteps = (application?.jobs?.workflow_steps || []) as Array<{ id: string; type: string; title?: string }>;
    const quizQuestions = application?.jobs?.quiz_questions;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    const steps = buildCandidateJourney(workflowSteps, { hasQuiz });
    const { index, total, current } = positionFor(steps, { stepId, phase: application?.phase });
    return { index, total, title: current.title };
  }, [application?.jobs?.workflow_steps, application?.jobs?.quiz_questions, application?.phase, stepId]);

  const journeyProgressPct = Math.round(((journeyStep.index + 1) / Math.max(journeyStep.total, 1)) * 100);

  // Format elapsed time for display
  const getDuration = () => {
    const mins = Math.floor(elapsedTime / 60);
    const secs = elapsedTime % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract candidate context from application notes
  const buildCandidateContext = () => {
    if (!application) return undefined;
    
    const notes = application.notes ? JSON.parse(application.notes) : {};
    const context: any = {
      completedPhases: [] as string[],
    };

    // Extract application answers
    if (notes.applicationAnswers) {
      context.applicationAnswers = notes.applicationAnswers;
    }

    // Extract resume analysis
    if (notes.resumeAnalysis) {
      context.resumeAnalysis = notes.resumeAnalysis;
    }

    // Extract quiz results
    if (notes.quizResult) {
      context.quizScore = notes.quizResult.score;
      context.quizSummary = notes.quizResult.correctAnswers 
        ? `${notes.quizResult.correctAnswers}/${notes.quizResult.totalQuestions} correct`
        : undefined;
      context.completedPhases.push('Quiz');
    }

    // Extract typing test results
    if (notes.typingTestResult) {
      context.typingTestResult = {
        wpm: notes.typingTestResult.wpm,
        accuracy: notes.typingTestResult.accuracy,
      };
      context.completedPhases.push('Typing Test');
    }

    // Extract chat simulation results
    if (notes.chatSimulationResult) {
      context.chatSimulationResult = {
        score: notes.chatSimulationResult.score,
        summary: notes.chatSimulationResult.recommendation || 'Completed',
      };
      context.completedPhases.push('Chat Simulation');
    }

    // Extract sales simulation results
    if (notes.salesSimulationResult) {
      context.salesSimulationResult = {
        score: notes.salesSimulationResult.score,
        summary: notes.salesSimulationResult.recommendation || 'Completed',
      };
      context.completedPhases.push('Sales Simulation');
    }

    // Extract video intro URL
    if (notes.videoIntroUrl) {
      context.videoIntroUrl = notes.videoIntroUrl;
      context.completedPhases.push('Video Introduction');
    }

    return context;
  };

  const streamChat = async (mode: "start" | "respond", userMessage?: string) => {
    if (!application?.jobs) return;
    
    // Show typing indicator first with a delay to feel more natural
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const candidateContext = buildCandidateContext();
    const jobDetails = {
      requirements: application.jobs.requirements || undefined,
      responsibilities: application.jobs.responsibilities || undefined,
      benefits: application.jobs.benefits || undefined,
      skills: application.jobs.skills_required || undefined,
      location: application.jobs.location || undefined,
      jobType: application.jobs.job_type || undefined,
    };
    
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          jobTitle: application.jobs.title,
          jobDescription: application.jobs.description || "",
          jobDetails,
          candidateName: application.profiles?.full_name || "Candidate",
          candidateContext,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          userMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get interview response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });
        
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last.id.startsWith("assistant-streaming")) {
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, {
                  id: `assistant-streaming-${Date.now()}`,
                  role: "assistant",
                  content: assistantContent,
                  timestamp: new Date(),
                }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Finalize the message with a proper ID
      setMessages(prev => prev.map(m => 
        m.id.startsWith("assistant-streaming") 
          ? { ...m, id: `assistant-${Date.now()}` } 
          : m
      ));

      // Count questions (rough heuristic: messages ending with ?)
      if (assistantContent.includes("?")) {
        setQuestionCount(prev => prev + 1);
      }

      // Auto-detect closing message and end interview automatically
      const closingPhrases = [
        "take care",
        "be in touch with next steps",
        "best of luck",
        "good luck",
        "thank you for your time today"
      ];
      const lowerContent = assistantContent.toLowerCase();
      const isClosingMessage = closingPhrases.some(phrase => lowerContent.includes(phrase));
      
      // If it's a closing message (not a question), auto-end the interview after a short delay
      if (isClosingMessage && !lowerContent.includes("?")) {
        // Give user 2.5 seconds to read the closing message, then auto-submit
        setTimeout(() => {
          setAutoEndTriggered(true);
        }, 2500);
        return; // Don't focus input since interview is ending
      }

    } catch (error) {
      console.error("Chat interview error:", error);
      toast.error(error instanceof Error ? error.message : "That message didn't send — please try again.");
    } finally {
      setIsTyping(false);
      // Auto-focus the input after Ava responds
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const startInterview = async () => {
    setState("interviewing");
    setStartTime(new Date());
    await streamChat("start");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");
    
    await streamChat("respond", messageToSend);
  };

  const endInterview = () => {
    setState("evaluating");
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application) return;
    
    setIsSubmitting(true);
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();
      
      const isAutoMode = freshJob?.processing_mode === "auto";
      
      // Get AI evaluation with full context (for notes/display only - NOT for pass/fail decision)
      const candidateContext = buildCandidateContext();
      const evalResponse = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "evaluate",
          jobTitle: application.jobs?.title || "",
          jobDescription: application.jobs?.description || "",
          candidateName: application.profiles?.full_name || "Candidate",
          candidateContext,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      let evaluation = {
        score: 70,
        strengths: ["Completed interview"],
        concerns: [],
        recommendation: "Maybe",
        summary: "Interview completed successfully.",
      };

      if (evalResponse.ok) {
        evaluation = await evalResponse.json();
      }

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      const duration = startTime ? Math.floor((new Date().getTime() - startTime.getTime()) / 1000) : 0;
      
      const antiCheatLog = {
        violations,
        totalViolations: violations.length,
        tabSwitches: violations.filter(v => v.type === 'tab_switch').length,
        copyAttempts: violations.filter(v => v.type === 'copy_attempt').length,
        pasteAttempts: violations.filter(v => v.type === 'paste_attempt').length,
        screenshotAttempts: violations.filter(v => v.type === 'screenshot_attempt').length,
        rightClickAttempts: violations.filter(v => v.type === 'right_click').length,
      };

      // Save phase data to notes (NO local pass/fail decision)
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "chat_interview",
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          evaluation,
          duration,
          questionCount,
          phaseScore: evaluation.score, // Store phase score for backend to use
          antiCheatLog,
          completedAt: new Date().toISOString(),
        },
        chatInterviewResult: {
          messageCount: messages.length,
          duration,
          score: evaluation.score,
          strengths: evaluation.strengths,
          concerns: evaluation.concerns,
          recommendation: evaluation.recommendation,
          completed: true,
          antiCheatSummary: {
            hasViolations: violations.length > 0,
            violationCount: violations.length,
            tabSwitches: antiCheatLog.tabSwitches,
            copyPasteAttempts: antiCheatLog.copyAttempts + antiCheatLog.pasteAttempts,
          },
        },
      };

      // Save notes first (DO NOT set status or make pass/fail decision)
      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase_ai_analysis: `Interview: ${evaluation.recommendation} (${evaluation.score}%). ${evaluation.summary}`,
        })
        .eq("id", id!);

      if (error) throw error;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      // SINGLE SOURCE OF TRUTH: Let backend decide pass/fail
      if (isAutoMode) {
        try {
          const { data: analysisResult } = await invokeTriggerAvaAnalysis({
            applicationId: id!,
            autopilotDecision: true,
          });
          
          // Backend returns decision: "rejected" | "advanced" | "needs_employer_approval"
          if (analysisResult?.decision === "rejected") {
            setRejectedAppData({ ...application, status: "rejected" });
            setState("rejected");
          } else if (analysisResult?.decision === "advanced" || analysisResult?.decision === "needs_employer_approval") {
            toast.success("Interview sent!", {
              description: "You've moved on to the next step.",
            });
            setState("completed");
            setTimeout(() => navigate(`/applications/${id}`), 2000);
          } else {
            // Fallback: check application status from database
            const { data: updatedApp } = await supabase
              .from("applications")
              .select("status")
              .eq("id", id!)
              .single();
            
            if (updatedApp?.status === "rejected") {
              setRejectedAppData({ ...application, status: "rejected" });
              setState("rejected");
            } else {
              toast.success("Interview sent!", {
                description: "The hiring team will get back to you — everyone hears back.",
              });
              setState("completed");
              setTimeout(() => navigate(`/applications/${id}`), 2000);
            }
          }
        } catch (err) {
          console.error("[ChatInterviewPhase] Backend analysis failed:", err);
          setState("completed");
          setTimeout(() => navigate(`/applications/${id}`), 2000);
        }
      } else {
        // Manual mode - trigger analysis in background
        invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => console.error("[ChatInterviewPhase] AVA analysis trigger failed:", err));
        
        toast.success("Interview sent!", {
          description: "The hiring team will get back to you — everyone hears back.",
        });
        setState("completed");
        setTimeout(() => navigate(`/applications/${id}`), 2000);
      }
      
    } catch (error) {
      console.error("Error submitting interview:", error);
      toast.error("That didn't send — please try again.");
      setState("interviewing");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Anti-cheat handlers
  const preventCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
    logViolation('copy_attempt', 'User attempted to copy content');
    toast.error("Copy is turned off here — just type your own words.");
  };

  const preventPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    logViolation('paste_attempt', 'User attempted to paste content');
    toast.error("Paste is turned off here — type your answer directly.");
  };

  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    logViolation('right_click', 'User attempted right-click context menu');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Block common shortcuts for copying/pasting/printing/screenshots
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        logViolation('copy_attempt', 'User pressed Ctrl/Cmd+C');
        toast.error("Copy is turned off here — just type your own words.");
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        logViolation('paste_attempt', 'User pressed Ctrl/Cmd+V');
        toast.error("Paste is turned off here — type your answer directly.");
      } else if (['p', 'a', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        toast.error("That shortcut is turned off here.");
      }
    }
    // Block PrintScreen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      logViolation('screenshot_attempt', 'User pressed PrintScreen');
    }
    // Note: Enter to send is handled by the Textarea's onKeyDown to avoid double-firing
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
      return notes.chatInterviewResult || null;
    } catch {
      return null;
    }
  })();

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
            <h2 className="font-display text-xl text-foreground">We couldn't find this application</h2>
            <p className="text-sm text-muted-foreground">
              It may have been removed, or you might not have access to it.
            </p>
            <Button onClick={() => navigate("/applications")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to applications
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
        phaseName="Interview"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const minQuestions = 5;
  const candidateResponseCount = messages.filter((message) => message.role === "user").length;
  const canEndInterview = questionCount >= minQuestions || candidateResponseCount >= minQuestions;

  // Show rejection screen for autopilot mode failure
  if (state === "rejected" && rejectedAppData) {
    return (
      <CandidateStatusScreen
        state="rejected"
        jobTitle={application?.jobs?.title}
        onClose={() => navigate(`/applications/${id}`)}
      />
    );
  }

  return (
    <div
      className="ck-page relative mx-auto max-w-3xl space-y-6"
      onCopy={preventCopy}
      onPaste={preventPaste}
      onCut={preventCopy}
      onContextMenu={preventContextMenu}
      onKeyDown={handleKeyDown}
    >
      {/* Blur overlay when page loses focus — a quiet pause, not an alarm */}
      {isBlurred && state === "interviewing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl">
          <div className="p-8 text-center">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="font-display mb-2 text-xl text-foreground">Interview paused</h2>
            <p className="text-muted-foreground">Click anywhere to pick back up</p>
          </div>
        </div>
      )}

      {/* Journey header — where am I, what's happening now, what's next */}
      <header className="ck-reveal space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/applications/${id}`)}
              aria-label="Back to application overview"
              className="h-11 w-11 shrink-0 text-muted-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
              {application.jobs?.title || "This role"}
            </p>
          </div>
          <ConnectionStatusIndicator />
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
            {state === "intro" ? "Your interview" : "Interview in progress"}
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyProgressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            {state === "intro"
              ? "Take your time — you can't break anything. About 10–15 minutes."
              : "Answer naturally, the way you would in person — there's no rush."}
          </p>
        </div>
      </header>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {state === "intro" && (
            <div className="ck-reveal space-y-8">
              <div className="space-y-4 rounded-xl bg-muted/30 p-6">
                <h3 className="font-display text-lg text-foreground">Before you start</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>The hiring team has read your application and built questions around it</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>It's a two-way conversation — ask your own questions whenever you like</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>You'll get a chance to wrap up and ask anything before it ends</span>
                  </li>
                </ul>
              </div>

              <Button onClick={startInterview} size="lg" className="w-full gap-2 sm:w-auto">
                <MessageSquare className="h-5 w-5" />
                Start the interview
              </Button>
            </div>
          )}

          {(state === "interviewing" || state === "evaluating" || state === "completed") && (
            <>
              {/* Interview Info - Duration Only */}
              <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/30 p-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="ck-num text-sm font-medium text-foreground">{getDuration()}</span>
              </div>

              {/* Chat Area */}
              <ScrollArea
                className="h-[400px] rounded-lg border border-border p-4 select-none"
                style={{ userSelect: 'none' }}
              >
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                            HF
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[75%] rounded-xl px-4 py-3 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "user" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex gap-3 justify-start">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                          HF
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted rounded-xl px-4 py-3">
                        <div className="flex gap-1.5">
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Scroll anchor */}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area — the one primary action while interviewing */}
              {state === "interviewing" && (
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onPaste={preventPaste}
                    placeholder="Type your answer..."
                    disabled={isTyping}
                    rows={3}
                    className="min-h-[80px] flex-1 resize-none bg-secondary/50 border-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={isTyping || !inputValue.trim()}
                    className="h-[80px]"
                    aria-label="Send message"
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* End Interview — quiet, never competing with the send action */}
              {state === "interviewing" && canEndInterview && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    onClick={endInterview}
                    disabled={isTyping}
                    className="text-muted-foreground"
                  >
                    End the interview & send my answers
                  </Button>
                </div>
              )}

              {/* Evaluating — a held moment, not a bare spinner */}
              {state === "evaluating" && (
                <div className="ck-reveal flex flex-col items-center justify-center gap-4 py-16">
                  <span className="ck-seal-breathe">
                    <AvaSeal size={32} />
                  </span>
                  <p className="font-display text-lg text-foreground">Reviewing your answers…</p>
                  <p className="text-sm text-muted-foreground">This can take a moment — stay on this page.</p>
                </div>
              )}

              {/* Completed — a small seal-press payoff, and what happens next */}
              {state === "completed" && (
                <div className="ck-reveal flex flex-col items-center justify-center gap-3 py-16">
                  <AvaSeal size={40} tilt={-3} className="ck-seal-press" />
                  <p className="font-display text-lg text-foreground">Interview sent</p>
                  <p className="text-sm text-muted-foreground">
                    The hiring team will get back to you — everyone hears back.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
