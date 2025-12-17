import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  
  const [state, setState] = useState<"intro" | "selling" | "evaluating" | "completed">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<SalesScenario | null>(null);
  const [isBlurred, setIsBlurred] = useState(false);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      return data as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Get config from workflow
  const salesConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const salesStep = workflowSteps?.find(s => s.id === stepId || s.type === "sales_simulation");
    return {
      minMessages: salesStep?.config?.minMessages || 6,
      scenarios: salesStep?.config?.scenarios || defaultScenarios,
    };
  })();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
    if (e.key === "Enter" && !e.shiftKey && state === "selling") {
      sendMessage();
    }
  };

  const streamProspectResponse = async (mode: "start" | "respond", salesRepMessage?: string) => {
    if (!currentScenario) return;
    
    setIsTyping(true);
    
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
    const scenarios = salesConfig.scenarios;
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    setCurrentScenario(randomScenario);
    setState("selling");
    
    setTimeout(async () => {
      await streamProspectResponseWithScenario("start", randomScenario);
      inputRef.current?.focus();
    }, 100);
  };

  const streamProspectResponseWithScenario = async (mode: "start", scenario: SalesScenario) => {
    setIsTyping(true);
    
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
      const passingScore = application.jobs?.passing_score || 60;
      const passed = evaluation.score >= passingScore;
      
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

      const isAutoMode = application.jobs?.processing_mode !== "manual";
      
      const workflowSteps = application.jobs?.workflow_steps || [];
      const allPhases = [
        { id: "application", type: "application" },
        ...workflowSteps.map((step: any) => ({ id: step.id, type: step.type })),
        { id: "review", type: "review" },
        { id: "interview", type: "interview" },
        { id: "hired", type: "hired" },
      ];
      
      let currentIndex = allPhases.findIndex((p) => p.id === stepId);
      if (currentIndex === -1 && application.phase) {
        currentIndex = allPhases.findIndex(
          (p) => p.id === application.phase || p.type === application.phase
        );
      }
      
      let newPhase = application.phase;
      let newStatus = application.status;

      if (isAutoMode) {
        if (passed) {
          if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
            newPhase = allPhases[currentIndex + 1].id;
          }
          toast.success("Sales simulation completed!", {
            description: `You scored ${evaluation.score}%. Prospect verdict: ${evaluation.wouldBuy === "yes" ? "Would buy!" : evaluation.wouldBuy === "maybe" ? "Might buy" : "Wouldn't buy"}`,
          });
        } else {
          newStatus = "rejected";
          toast.error("Sales simulation not passed", {
            description: `You scored ${evaluation.score}% but needed ${passingScore}% to pass.`,
          });
        }
      } else {
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
        })
        .eq("id", id!);

      if (error) throw error;

      // Invalidate candidate applications to update the tile status
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      setState("completed");
      setTimeout(() => navigate(`/applications/${id}`), 2000);

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
    const { PhaseAlreadySubmitted } = require("@/components/PhaseAlreadySubmitted");
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Sales Simulation"
        score={existingResult.score}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const canEndSales = messages.filter(m => m.role === "salesRep").length >= salesConfig.minMessages;

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
          Sales Simulation
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Sales Pitch Simulation
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "intro" && (
            <div className="space-y-6">
              <div className="bg-muted/30 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-foreground">How This Works</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <Building className="h-4 w-4 mt-0.5 text-green-500" />
                    <span>You'll meet with a prospect who has a real business problem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <User className="h-4 w-4 mt-0.5 text-green-500" />
                    <span>Discover their needs, handle objections, and pitch your solution</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 mt-0.5 text-green-500" />
                    <span>The prospect will react realistically - they may push back or show interest</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-green-500" />
                    <span>Complete at least {salesConfig.minMessages} responses to end the call</span>
                  </li>
                </ul>
              </div>
              
              <div className="text-center">
                <Button onClick={startSales} size="lg" className="gap-2 bg-green-600 hover:bg-green-700">
                  <TrendingUp className="h-5 w-5" />
                  Start Sales Call
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
                </div>
              </ScrollArea>

              {/* Input Area */}
              {state === "selling" && (
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Make your pitch..."
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    disabled={isTyping}
                  />
                  <Button onClick={sendMessage} disabled={!inputValue.trim() || isTyping} className="bg-green-600 hover:bg-green-700">
                    <Send className="h-4 w-4" />
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
