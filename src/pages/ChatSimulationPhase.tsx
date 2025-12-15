import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  MessageSquare, 
  Send,
  CheckCircle,
  Loader2,
  Bot,
  User
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "customer" | "agent";
  content: string;
  timestamp: Date;
}

interface ChatScenario {
  id: string;
  customerName: string;
  scenario: string;
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
    workflow_steps: any[] | null;
  } | null;
}

// Default scenarios if none configured
const defaultScenarios: ChatScenario[] = [
  {
    id: "scenario1",
    customerName: "Alex Thompson",
    scenario: "Billing dispute - the customer was charged twice for their monthly subscription. They noticed it on their bank statement and are frustrated because this has happened before. They want an immediate refund and assurance it won't happen again.",
  },
  {
    id: "scenario2",
    customerName: "Jordan Miller",
    scenario: "Product not working - the customer purchased software last week but it keeps crashing whenever they try to export files. They've already tried reinstalling and clearing cache. They're worried about losing their work and have an important deadline coming up.",
  },
  {
    id: "scenario3",
    customerName: "Sam Chen",
    scenario: "Delivery issue - the customer ordered an item 2 weeks ago with express shipping but it still hasn't arrived. The tracking shows it's stuck in transit. They needed it for a gift and are very upset about the delay and lack of updates.",
  },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-simulation`;

export default function ChatSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [state, setState] = useState<"intro" | "chatting" | "evaluating" | "completed">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<ChatScenario | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["chat-simulation-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Get chat config
  const chatConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps as any[] | null;
    const chatStep = workflowSteps?.find(s => s.id === stepId || s.type === "chat_simulation");
    return {
      minMessages: chatStep?.config?.minMessages || 5,
      scenarios: chatStep?.config?.scenarios || defaultScenarios,
    };
  })();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamCustomerResponse = async (mode: "start" | "respond", agentMessage?: string) => {
    if (!currentScenario) return;
    
    setIsTyping(true);
    
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          scenario: currentScenario.scenario,
          customerName: currentScenario.customerName,
          jobTitle: application?.jobs?.title || "",
          messages: messages.map(m => ({ 
            role: m.role === "agent" ? "user" : "assistant", 
            content: m.content 
          })),
          agentMessage,
          messageCount: messages.length,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get customer response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let customerContent = "";
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
              customerContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "customer" && last.id.startsWith("customer-streaming")) {
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: customerContent } : m
                  );
                }
                return [...prev, {
                  id: `customer-streaming-${Date.now()}`,
                  role: "customer",
                  content: customerContent,
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
        m.id.startsWith("customer-streaming") 
          ? { ...m, id: `customer-${Date.now()}` } 
          : m
      ));

    } catch (error) {
      console.error("Chat simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to get customer response");
    } finally {
      setIsTyping(false);
    }
  };

  const startChat = async () => {
    // Select random scenario
    const scenarios = chatConfig.scenarios;
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    setCurrentScenario(randomScenario);
    setState("chatting");
    
    // Small delay to ensure state is set before streaming
    setTimeout(async () => {
      await streamCustomerResponseWithScenario("start", randomScenario);
      inputRef.current?.focus();
    }, 100);
  };

  // Separate function to handle initial message with scenario
  const streamCustomerResponseWithScenario = async (mode: "start", scenario: ChatScenario) => {
    setIsTyping(true);
    
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode,
          scenario: scenario.scenario,
          customerName: scenario.customerName,
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
      let customerContent = "";
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
              customerContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "customer" && last.id.startsWith("customer-streaming")) {
                  return prev.map((m, i) => 
                    i === prev.length - 1 ? { ...m, content: customerContent } : m
                  );
                }
                return [...prev, {
                  id: `customer-streaming-${Date.now()}`,
                  role: "customer",
                  content: customerContent,
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

      // Finalize the message
      setMessages(prev => prev.map(m => 
        m.id.startsWith("customer-streaming") 
          ? { ...m, id: `customer-initial` } 
          : m
      ));

    } catch (error) {
      console.error("Chat simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start simulation");
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping || !currentScenario) return;
    
    const agentMessage: Message = {
      id: `agent-${Date.now()}`,
      role: "agent",
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, agentMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");
    
    await streamCustomerResponse("respond", messageToSend);
  };

  const endChat = () => {
    setState("evaluating");
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;
    
    setIsSubmitting(true);
    try {
      // Get AI evaluation
      const evalResponse = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "evaluate",
          scenario: currentScenario.scenario,
          customerName: currentScenario.customerName,
          jobTitle: application.jobs?.title || "",
          messages: messages.map(m => ({ 
            role: m.role === "agent" ? "user" : "assistant", 
            content: m.content 
          })),
        }),
      });

      let evaluation = {
        score: 70,
        empathy: 70,
        problemSolving: 70,
        communication: 70,
        professionalism: 70,
        strengths: ["Completed simulation"],
        improvements: [],
        overallFeedback: "Simulation completed successfully.",
      };

      if (evalResponse.ok) {
        evaluation = await evalResponse.json();
      }

      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      const agentMessages = messages.filter((m) => m.role === "agent");
      const passingScore = application.jobs?.passing_score || 60;
      const passed = evaluation.score >= passingScore;
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "chat_simulation",
          scenario: currentScenario.scenario,
          customerName: currentScenario.customerName,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          evaluation,
          metrics: {
            totalMessages: messages.length,
            agentResponses: agentMessages.length,
          },
          score: evaluation.score,
          passed,
          completedAt: new Date().toISOString(),
        },
        chatSimulationResult: {
          scenario: currentScenario.scenario,
          messageCount: messages.length,
          score: evaluation.score,
          empathy: evaluation.empathy,
          problemSolving: evaluation.problemSolving,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          passed,
          completed: true,
        },
      };

      // Determine next phase based on processing mode
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
          toast.success("Chat simulation completed!", {
            description: `You scored ${evaluation.score}%. You've advanced to the next phase.`,
          });
        } else {
          newStatus = "rejected";
          toast.error("Chat simulation not passed", {
            description: `You scored ${evaluation.score}% but needed ${passingScore}% to pass.`,
          });
        }
      } else {
        toast.success("Chat simulation completed!", {
          description: "Your responses have been recorded. The employer will review your performance.",
        });
      }

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
          phase: newPhase,
          status: newStatus as any,
          phase_ai_analysis: `Chat simulation: ${evaluation.score}%. Empathy: ${evaluation.empathy}%, Problem-solving: ${evaluation.problemSolving}%. ${passed ? "PASSED" : "FAILED"}`,
        })
        .eq("id", id!);

      if (error) throw error;

      setState("completed");
      setTimeout(() => navigate(`/applications/${id}`), 2000);

    } catch (error) {
      console.error("Error submitting chat:", error);
      toast.error("Failed to submit chat simulation");
      setState("chatting");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if already submitted
  const existingResult = (() => {
    if (!application?.notes) return null;
    try {
      const notes = JSON.parse(application.notes);
      return notes.chatSimulationResult || null;
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
        phaseName="Chat Simulation"
        score={existingResult.score}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const canEndChat = messages.filter(m => m.role === "agent").length >= chatConfig.minMessages;

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
          <MessageSquare className="h-4 w-4" />
          Chat Simulation
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Customer Support Simulation
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
                    <MessageSquare className="h-4 w-4 mt-0.5 text-primary" />
                    <span>You'll be presented with a customer support scenario</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <User className="h-4 w-4 mt-0.5 text-primary" />
                    <span>Respond to the AI customer as if you were a support agent</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bot className="h-4 w-4 mt-0.5 text-primary" />
                    <span>The customer will respond realistically based on your replies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary" />
                    <span>Complete at least {chatConfig.minMessages} responses to end the simulation</span>
                  </li>
                </ul>
              </div>
              
              <div className="text-center">
                <Button onClick={startChat} size="lg" className="gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Start Simulation
                </Button>
              </div>
            </div>
          )}

          {(state === "chatting" || state === "evaluating" || state === "completed") && currentScenario && (
            <>
              {/* Scenario Info */}
              <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="text-sm font-medium text-foreground">{currentScenario.customerName}</p>
                </div>
                <Badge variant="outline">
                  {messages.filter(m => m.role === "agent").length} / {chatConfig.minMessages} responses
                </Badge>
              </div>

              {/* Chat Area */}
              <ScrollArea className="h-[400px] rounded-lg border border-border p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "agent" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "customer" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {currentScenario.customerName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.role === "agent"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {message.role === "customer" && (
                          <p className="text-xs font-medium mb-1 opacity-70">
                            {currentScenario.customerName}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "agent" && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-primary-foreground">
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
                          {currentScenario.customerName.charAt(0)}
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
              {state === "chatting" && (
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your response..."
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    disabled={isTyping}
                  />
                  <Button onClick={sendMessage} disabled={!inputValue.trim() || isTyping}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* End Chat Button */}
              {state === "chatting" && canEndChat && (
                <div className="text-center pt-2">
                  <Button 
                    variant="outline" 
                    onClick={endChat}
                    disabled={isTyping}
                  >
                    End Simulation & Submit
                  </Button>
                </div>
              )}

              {/* Evaluating State */}
              {state === "evaluating" && (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
                  <p className="text-foreground font-medium">Evaluating your performance...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    AI is reviewing your customer service skills
                  </p>
                </div>
              )}

              {/* Completed State */}
              {state === "completed" && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-success mb-4" />
                  <p className="text-foreground font-medium">Simulation Complete!</p>
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
