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
  initialMessage: string;
  evaluationCriteria?: string[];
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
    workflow_steps: any[] | null;
  } | null;
}

// Default scenarios if none configured
const defaultScenarios: ChatScenario[] = [
  {
    id: "scenario1",
    customerName: "Alex Thompson",
    scenario: "Billing dispute - customer charged twice",
    initialMessage: "Hi, I noticed I was charged twice for my subscription this month. This is really frustrating as it's happened before. I need this fixed immediately!",
    evaluationCriteria: ["Empathy", "Problem resolution", "Clear communication"],
  },
  {
    id: "scenario2",
    customerName: "Jordan Miller",
    scenario: "Product not working as expected",
    initialMessage: "Hello, I purchased your software last week but it keeps crashing whenever I try to export files. I've tried reinstalling but nothing works. Can you help?",
    evaluationCriteria: ["Technical troubleshooting", "Patience", "Solution-oriented"],
  },
];

// Simulated customer responses based on keywords
const getSimulatedResponse = (agentMessage: string, scenario: ChatScenario): string => {
  const msg = agentMessage.toLowerCase();
  
  if (msg.includes("sorry") || msg.includes("apologize")) {
    return "I appreciate the apology, but I really need this issue resolved. What are you going to do about it?";
  }
  if (msg.includes("refund") || msg.includes("credit")) {
    return "That sounds fair. How long will it take to process?";
  }
  if (msg.includes("understand") || msg.includes("frustrating")) {
    return "Thank you for understanding. So what's the next step?";
  }
  if (msg.includes("help") && msg.includes("can")) {
    return "Yes, please help me. I've been dealing with this for too long.";
  }
  if (msg.includes("resolve") || msg.includes("fix")) {
    return "Great, I'd like that resolved as soon as possible. What do you need from me?";
  }
  if (msg.includes("account") || msg.includes("check")) {
    return "Sure, my account email is alex@example.com. Please take a look.";
  }
  if (msg.includes("thank") || msg.includes("welcome")) {
    return "Thank you for your help today. I appreciate the quick response!";
  }
  
  return "I see. Is there anything else you can do to help me with this issue?";
};

export default function ChatSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [state, setState] = useState<"intro" | "chatting" | "completed">("intro");
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

  const startChat = () => {
    // Select random scenario
    const scenarios = chatConfig.scenarios;
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    setCurrentScenario(randomScenario);
    
    // Add initial customer message
    setMessages([{
      id: "initial",
      role: "customer",
      content: randomScenario.initialMessage,
      timestamp: new Date(),
    }]);
    
    setState("chatting");
    setTimeout(() => inputRef.current?.focus(), 100);
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
    setInputValue("");
    
    // Simulate customer typing
    setIsTyping(true);
    
    setTimeout(() => {
      const response = getSimulatedResponse(agentMessage.content, currentScenario);
      const customerMessage: Message = {
        id: `customer-${Date.now()}`,
        role: "customer",
        content: response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, customerMessage]);
      setIsTyping(false);
      
      // Check if we should end the chat
      const agentMessages = messages.filter(m => m.role === "agent").length + 1;
      if (agentMessages >= chatConfig.minMessages && 
          (response.includes("Thank you") || response.includes("appreciate"))) {
        setTimeout(() => setState("completed"), 1500);
      }
    }, 1000 + Math.random() * 1500);
  };

  const endChat = () => {
    setState("completed");
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;
    
    setIsSubmitting(true);
    try {
      const existingNotes = application.notes ? JSON.parse(application.notes) : {};
      
      // Calculate simple metrics
      const agentMessages = messages.filter(m => m.role === "agent");
      const avgResponseLength = agentMessages.reduce((acc, m) => acc + m.content.length, 0) / agentMessages.length;
      
      const updatedNotes = {
        ...existingNotes,
        [stepId!]: {
          type: "chat_simulation",
          scenario: currentScenario.scenario,
          customerName: currentScenario.customerName,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          metrics: {
            totalMessages: messages.length,
            agentResponses: agentMessages.length,
            avgResponseLength: Math.round(avgResponseLength),
          },
          completedAt: new Date().toISOString(),
        },
        chatSimulationResult: {
          scenario: currentScenario.scenario,
          messageCount: messages.length,
          completed: true,
        },
      };

      const { error } = await supabase
        .from("applications")
        .update({
          notes: JSON.stringify(updatedNotes),
        })
        .eq("id", id!);

      if (error) throw error;

      toast.success("Chat simulation completed!", {
        description: "Your responses have been recorded for review.",
      });

      navigate(`/applications/${id}`);
    } catch (error) {
      console.error("Error submitting chat:", error);
      toast.error("Failed to submit chat simulation");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                    <span>Respond to the customer as if you were a support agent</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bot className="h-4 w-4 mt-0.5 text-primary" />
                    <span>The customer will respond based on your replies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary" />
                    <span>Complete at least {chatConfig.minMessages} responses to finish</span>
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

          {(state === "chatting" || state === "completed") && currentScenario && (
            <>
              {/* Scenario Info */}
              <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Scenario</p>
                  <p className="text-sm font-medium text-foreground">{currentScenario.scenario}</p>
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
                        <p className="text-sm">{message.content}</p>
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
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.1s]" />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
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
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    disabled={isTyping}
                  />
                  <Button onClick={sendMessage} disabled={!inputValue.trim() || isTyping}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-center gap-4">
                {state === "chatting" && messages.filter(m => m.role === "agent").length >= chatConfig.minMessages && (
                  <Button onClick={endChat} variant="outline" className="gap-2">
                    End Conversation
                  </Button>
                )}
                
                {state === "completed" && (
                  <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Submit Results
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
