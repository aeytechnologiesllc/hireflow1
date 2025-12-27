import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  TrendingUp, 
  Send,
  CheckCircle,
  Loader2,
  Briefcase,
  User,
  Building
} from "lucide-react";
import { toast } from "sonner";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";

interface Message {
  id: string;
  role: "prospect" | "salesRep";
  content: string;
  timestamp: Date;
}

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'screenshot_attempt' | 'right_click';
  timestamp: string;
  details: string;
}

interface SalesScenario {
  id: string;
  prospectName: string;
  prospectCompany: string;
  prospectRole: string;
  scenario: string;
  productService: string;
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
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: any[] | null;
  } | null;
}

// Default sales scenarios
const defaultScenarios: SalesScenario[] = [
  {
    id: "scenario1",
    prospectName: "Michael Chen",
    prospectCompany: "TechFlow Solutions",
    prospectRole: "VP of Operations",
    scenario: "Mid-size tech company looking to streamline their operations. They've had issues with their current vendor and are open to alternatives, but skeptical after a bad experience.",
    productService: "Enterprise software solution",
  },
  {
    id: "scenario2",
    prospectName: "Sarah Williams",
    prospectCompany: "GrowthFirst Marketing",
    prospectRole: "Marketing Director",
    scenario: "Growing marketing agency struggling to scale. They need better tools but are cost-conscious and have a small team that's resistant to change.",
    productService: "Marketing automation platform",
  },
  {
    id: "scenario3",
    prospectName: "David Park",
    prospectCompany: "Metro Healthcare Group",
    prospectRole: "Chief Technology Officer",
    scenario: "Healthcare organization with strict compliance requirements. They need a solution but are concerned about security, implementation time, and disruption to existing workflows.",
    productService: "Healthcare management system",
  },
];

const SALES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-sales-simulation`;

export default function SalesSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [state, setState] = useState<"intro" | "selling" | "evaluating" | "completed" | "rejected">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<SalesScenario | null>(null);
  const [isBlurred, setIsBlurred] = useState(false);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [rejectedAppData, setRejectedAppData] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["sales-simulation-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, description, processing_mode, passing_score, workflow_steps)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      
      // Get candidate profile name
      let candidateName: string | null = null;
      if (data?.candidate_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", data.candidate_id)
          .single();
        candidateName = profile?.full_name || null;
      }
      
      return { ...data, candidateName } as ApplicationDetails & { candidateName: string | null };
    },
    enabled: !!id && !!user,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`sales-simulation-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        console.log('[SalesSimulationPhase] Application updated via realtime:', payload);
        queryClient.invalidateQueries({ queryKey: ["sales-simulation-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Get config from workflow
  const salesConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const salesStep = workflowSteps?.find(s => s.id === stepId || s.type === "sales_simulation");
    return {
      minMessages: salesStep?.config?.minMessages || 6,
      scenarios: salesStep?.config?.scenarios || defaultScenarios,
    };
  })();

  // Pre-select scenario on mount so we can show preview
  useEffect(() => {
    if (!currentScenario && salesConfig.scenarios.length > 0) {
      const scenarios = salesConfig.scenarios;
      const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
      setCurrentScenario(randomScenario);
    }
  }, [salesConfig.scenarios]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Log anti-cheat violation
  const logViolation = (type: AntiCheatViolation['type'], details: string) => {
    if (state === "selling") {
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
      if (document.hidden && state === "selling") {
        logViolation('tab_switch', 'User switched to another tab or window');
      }
      setIsBlurred(document.hidden);
    };
    
    const handleBlur = () => {
      if (state === "selling") {
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

  // Anti-cheat handlers
  const preventCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
    logViolation('copy_attempt', 'User attempted to copy content');
    toast.error("Copy is disabled during this assessment");
  };

  const preventPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    logViolation('paste_attempt', 'User attempted to paste content');
    toast.error("Paste is disabled during this assessment");
  };

  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    logViolation('right_click', 'User attempted right-click context menu');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        logViolation('copy_attempt', 'User pressed Ctrl/Cmd+C');
        toast.error("Copy is disabled during this assessment");
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        logViolation('paste_attempt', 'User pressed Ctrl/Cmd+V');
        toast.error("Paste is disabled during this assessment");
      } else if (['p', 'a', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        toast.error("Keyboard shortcuts are disabled during this assessment");
      }
    }
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      logViolation('screenshot_attempt', 'User pressed PrintScreen');
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e);
    if (e.key === "Enter" && !e.shiftKey && state === "selling") {
      e.preventDefault();
      sendMessage();
    }
  };

  const streamProspectResponse = async (mode: "start" | "respond", salesRepMessage?: string) => {
    if (!currentScenario) return;
    
    setIsTyping(true);
    
    // Add typing delay for more natural feel (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const response = await fetch(SALES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          scenario: currentScenario.scenario,
          prospectName: currentScenario.prospectName,
          prospectCompany: currentScenario.prospectCompany,
          productService: currentScenario.productService,
          jobTitle: application?.jobs?.title || "",
          candidateName: application?.candidateName || "the sales representative",
          messages: messages.map(m => ({ 
            role: m.role === "salesRep" ? "user" : "assistant", 
            content: m.content 
          })),
          salesRepMessage,
          messageCount: messages.length,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get prospect response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let prospectContent = "";
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
              prospectContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "prospect" && last.id.startsWith("prospect-streaming")) {
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: prospectContent } : m
                  );
                }
                return [...prev, {
                  id: `prospect-streaming-${Date.now()}`,
                  role: "prospect",
                  content: prospectContent,
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

      setMessages(prev => prev.map(m => 
        m.id.startsWith("prospect-streaming") 
          ? { ...m, id: `prospect-${Date.now()}` } 
          : m
      ));

    } catch (error) {
      console.error("Sales simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to get prospect response");
    } finally {
      setIsTyping(false);
    }
  };

  const startSales = async () => {
    if (!currentScenario) return;
    setState("selling");
    
    setTimeout(async () => {
      await streamProspectResponseWithScenario("start", currentScenario);
      inputRef.current?.focus();
    }, 100);
  };

  const streamProspectResponseWithScenario = async (mode: "start", scenario: SalesScenario) => {
    setIsTyping(true);
    
    // Add typing delay for more natural feel (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const response = await fetch(SALES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          scenario: scenario.scenario,
          prospectName: scenario.prospectName,
          prospectCompany: scenario.prospectCompany,
          productService: scenario.productService,
          jobTitle: application?.jobs?.title || "",
          candidateName: application?.candidateName || "the sales representative",
          messages: [],
          messageCount: 0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start simulation");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let prospectContent = "";
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
              prospectContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "prospect" && last.id.startsWith("prospect-streaming")) {
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: prospectContent } : m
                  );
                }
                return [...prev, {
                  id: `prospect-streaming-${Date.now()}`,
                  role: "prospect",
                  content: prospectContent,
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

      setMessages(prev => prev.map(m => 
        m.id.startsWith("prospect-streaming") 
          ? { ...m, id: `prospect-initial` } 
          : m
      ));

    } catch (error) {
      console.error("Sales simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start simulation");
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping || !currentScenario) return;
    
    const salesRepMessage: Message = {
      id: `salesRep-${Date.now()}`,
      role: "salesRep",
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, salesRepMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");
    
    await streamProspectResponse("respond", messageToSend);
  };

  const endSales = () => {
    setState("evaluating");
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;
    
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
      const passingScoreFresh = freshJob?.passing_score || 60;
      
      const evalResponse = await fetch(SALES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "evaluate",
          scenario: currentScenario.scenario,
          prospectName: currentScenario.prospectName,
          prospectCompany: currentScenario.prospectCompany,
          productService: currentScenario.productService,
          jobTitle: application.jobs?.title || "",
          messages: messages.map(m => ({ 
            role: m.role === "salesRep" ? "user" : "assistant", 
            content: m.content 
          })),
        }),
      });

      let evaluation = {
        score: 70,
        discovery: 70,
        objectionHandling: 70,
        valueProposition: 70,
        closingSkills: 70,
        rapport: 70,
        strengths: ["Completed simulation"],
        improvements: [],
        wouldBuy: "maybe",
        overallFeedback: "Simulation completed successfully.",
      };

      if (evalResponse.ok) {
        evaluation = await evalResponse.json();
      }

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      const salesRepMessages = messages.filter((m) => m.role === "salesRep");
      const passed = evaluation.score >= passingScoreFresh;
      
      const antiCheatLog = {
        violations,
        totalViolations: violations.length,
        tabSwitches: violations.filter(v => v.type === 'tab_switch').length,
        copyAttempts: violations.filter(v => v.type === 'copy_attempt').length,
        pasteAttempts: violations.filter(v => v.type === 'paste_attempt').length,
        screenshotAttempts: violations.filter(v => v.type === 'screenshot_attempt').length,
        rightClickAttempts: violations.filter(v => v.type === 'right_click').length,
      };

      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "sales_simulation",
          scenario: currentScenario.scenario,
          prospectName: currentScenario.prospectName,
          prospectCompany: currentScenario.prospectCompany,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          evaluation,
          metrics: {
            totalMessages: messages.length,
            salesRepResponses: salesRepMessages.length,
          },
          score: evaluation.score,
          passed,
          antiCheatLog,
          completedAt: new Date().toISOString(),
        },
        salesSimulationResult: {
          scenario: currentScenario.scenario,
          prospectCompany: currentScenario.prospectCompany,
          messageCount: messages.length,
          score: evaluation.score,
          discovery: evaluation.discovery,
          objectionHandling: evaluation.objectionHandling,
          valueProposition: evaluation.valueProposition,
          closingSkills: evaluation.closingSkills,
          wouldBuy: evaluation.wouldBuy,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          passed,
          completed: true,
          antiCheatSummary: {
            hasViolations: violations.length > 0,
            violationCount: violations.length,
            tabSwitches: antiCheatLog.tabSwitches,
            copyPasteAttempts: antiCheatLog.copyAttempts + antiCheatLog.pasteAttempts,
          },
        },
      };
      
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = (application.jobs as any)?.quiz_questions as any[] | undefined;
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = (workflowSteps as any[]).find((step: any) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string }[] = [
        { id: "application", type: "application" },
      ];
      
      // Add quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz" });
      }
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      (workflowSteps as any[]).filter((step: any) => step.type !== 'voice_interview').forEach((step: any) => {
        allPhases.push({ id: step.id, type: step.type });
      });
      
      // Add Review phase
      allPhases.push({ id: "review", type: "review" });
      
      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({ id: voiceInterviewStep.id, type: "voice_interview" });
      }
      
      // Add final phases
      allPhases.push(
        { id: "interview", type: "interview" },
        { id: "hired", type: "hired" }
      );
      
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }
      
      let newPhase = application.phase;
      let newStatus = application.status;

      // Determine next phase
      let nextPhase: { id: string; type: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }

      if (isAutoMode) {
        if (passed) {
          if (nextPhase) {
            newPhase = nextPhase.id;
            // Note: SalesSimulation uses toast instead of EvaluationScreen
          }
          toast.success("Sales simulation completed!", {
            description: `Great work! You've completed this phase.`,
          });
        } else {
          newStatus = "rejected";
          // Store app data for rejection screen
          setRejectedAppData({
            ...application,
            status: "rejected",
          });
        }
      } else {
        // Manual mode - only advance to review phase if it's the next step
        if (nextPhase?.type === "review") {
          newPhase = nextPhase.id;
        }
        toast.success("Sales simulation completed!", {
          description: "Your performance has been recorded. The employer will review it.",
        });
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          status: newStatus as any,
          phase_ai_analysis: `Sales simulation: ${evaluation.score}%. Discovery: ${evaluation.discovery}%, Objection handling: ${evaluation.objectionHandling}%. Would buy: ${evaluation.wouldBuy}. ${passed ? "PASSED" : "FAILED"}`,
          // Track Ava as the rejector for autopilot rejections
          ...(newStatus === "rejected" && isAutoMode ? { rejected_by_type: 'ava' } : {}),
        })
        .eq("id", id!);

      if (error) throw error;

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      // Trigger AVA analysis via backend edge function (bypasses RLS issues)
      supabase.functions.invoke("trigger-ava-analysis", {
        body: { applicationId: id! },
      }).catch(err => console.error("[SalesSimulationPhase] AVA analysis trigger failed:", err));

      // Show rejection screen for failed autopilot, otherwise complete
      if (isAutoMode && !passed) {
        setState("rejected");
      } else {
        setState("completed");
        setTimeout(() => navigate(`/applications/${id}`), 2000);
      }

    } catch (error) {
      console.error("Error submitting sales simulation:", error);
      toast.error("Failed to submit sales simulation");
      setState("selling");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if already submitted
  const existingResult = (() => {
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.salesSimulationResult || null;
    } catch {
      return null;
    }
  })();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
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
        phaseName="Sales Simulation"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const canEndSales = messages.filter(m => m.role === "salesRep").length >= salesConfig.minMessages;

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
        
        <Badge className="bg-green-500/20 text-green-500 border-green-500/30 gap-1">
          <TrendingUp className="h-4 w-4" />
          Sales Conversation
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Client Meeting
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "intro" && (
            <div className="space-y-6">
              {/* Meeting Briefing Card */}
              {currentScenario && (
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-green-500" />
                    Your Meeting Briefing
                  </h3>
                  
                  <div className="grid gap-3">
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 mt-1 text-green-500 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Meeting With</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.prospectName}</p>
                        <p className="text-xs text-muted-foreground">{currentScenario.prospectRole}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <Building className="h-4 w-4 mt-1 text-green-500 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Company</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.prospectCompany}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <TrendingUp className="h-4 w-4 mt-1 text-green-500 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">You're Selling</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.productService}</p>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-3 border-t border-green-500/10">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Situation</p>
                      <p className="text-sm text-muted-foreground">{currentScenario.scenario}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/30 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-foreground">What We're Looking For</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <User className="h-4 w-4 mt-0.5 text-green-500" />
                    <span><strong>Discovery Skills</strong> — How well you uncover the client's needs and challenges</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Building className="h-4 w-4 mt-0.5 text-green-500" />
                    <span><strong>Objection Handling</strong> — How you respond when the client pushes back or raises concerns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 mt-0.5 text-green-500" />
                    <span><strong>Value Proposition</strong> — How clearly you communicate the benefits of your solution</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                    <span><strong>Rapport Building</strong> — How naturally you connect with the client</span>
                  </li>
                </ul>
                
                <p className="text-muted-foreground text-xs mt-4 italic">
                  Complete at least {salesConfig.minMessages} responses before ending the meeting.
                </p>
              </div>
              
              <div className="text-center">
                <Button onClick={startSales} size="lg" className="gap-2 bg-green-600 hover:bg-green-700" disabled={!currentScenario}>
                  <TrendingUp className="h-5 w-5" />
                  Start Meeting
                </Button>
              </div>
            </div>
          )}

          {(state === "selling" || state === "evaluating" || state === "completed") && currentScenario && (
            <>
              {/* Prospect Info */}
              <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Prospect</p>
                  <p className="text-sm font-medium text-foreground">{currentScenario.prospectName}</p>
                  <p className="text-xs text-muted-foreground">{currentScenario.prospectRole} at {currentScenario.prospectCompany}</p>
                </div>
                <Badge variant="outline">
                  {messages.filter(m => m.role === "salesRep").length} / {salesConfig.minMessages} pitches
                </Badge>
              </div>

              {/* Chat Area */}
              <ScrollArea className="h-[400px] rounded-lg border border-border p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "salesRep" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "prospect" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {currentScenario.prospectName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.role === "salesRep"
                            ? "bg-green-600 text-white"
                            : "bg-muted"
                        }`}
                      >
                        {message.role === "prospect" && (
                          <p className="text-xs font-medium mb-1 opacity-70">
                            {currentScenario.prospectName}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "salesRep" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-green-600 text-white">
                            You
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex gap-3 justify-start">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          {currentScenario.prospectName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              {state === "selling" && (
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Make your pitch... (Press Enter to send)"
                    onKeyDown={handleTextareaKeyDown}
                    onCopy={preventCopy}
                    onPaste={preventPaste}
                    onContextMenu={preventContextMenu}
                    disabled={isTyping}
                    rows={3}
                    className="resize-none min-h-[80px] bg-background/50"
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={!inputValue.trim() || isTyping} 
                    className="h-[80px] px-4 bg-green-600 hover:bg-green-700"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              )}

              {/* End Sales Button */}
              {state === "selling" && canEndSales && (
                <div className="text-center pt-2">
                  <Button 
                    variant="outline" 
                    onClick={endSales}
                    disabled={isTyping}
                  >
                    End Call & Submit
                  </Button>
                </div>
              )}

              {/* Evaluating State */}
              {state === "evaluating" && (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-green-500 mb-4" />
                  <p className="text-foreground font-medium">Evaluating your sales performance...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    AI is analyzing your pitch
                  </p>
                </div>
              )}

              {/* Completed State */}
              {state === "completed" && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-success mb-4" />
                  <p className="text-foreground font-medium">Sales Simulation Complete!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Redirecting to your application...
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
