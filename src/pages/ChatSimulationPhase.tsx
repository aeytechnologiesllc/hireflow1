import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConversationDraft } from "@/hooks/useConversationDraft";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  CheckCircle,
  Loader2,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis, triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { parseApplicationNotes, stringifyApplicationNotes } from "@/utils/applicationNotes";
import { AvaSeal } from "@/components/ava/AvaSeal";

import { useJourneyPosition } from "@/hooks/useJourneyPosition";

interface Message {
  id: string;
  role: "customer" | "agent";
  content: string;
  timestamp: Date;
}

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'screenshot_attempt' | 'right_click';
  timestamp: string;
  details: string;
}

interface ChatScenario {
  id: string;
  customerName: string;
  scenario: string;
}

function isValidChatScenario(value: unknown): value is ChatScenario {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatScenario>;
  return (
    typeof candidate.customerName === "string" &&
    candidate.customerName.trim().length > 0 &&
    typeof candidate.scenario === "string" &&
    candidate.scenario.trim().length > 0
  );
}

function normalizeChatScenarios(value: unknown): ChatScenario[] {
  if (!Array.isArray(value)) {
    return defaultScenarios;
  }

  const normalized = value
    .filter(isValidChatScenario)
    .map((scenario, index) => ({
      id: typeof scenario.id === "string" && scenario.id.trim().length > 0 ? scenario.id : `scenario-${index + 1}`,
      customerName: scenario.customerName.trim(),
      scenario: scenario.scenario.trim(),
    }));

  return normalized.length > 0 ? normalized : defaultScenarios;
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
    /** Lives on its own column, not in workflow_steps — the journey builder
     *  needs it to count the quiz as the stage the candidate actually does. */
    quiz_questions: unknown[] | null;
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

const CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat-simulation`;

export default function ChatSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [state, setState] = useState<"intro" | "chatting" | "evaluating" | "completed" | "rejected">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<ChatScenario | null>(null);
  const [isBlurred, setIsBlurred] = useState(false);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [isResolved, setIsResolved] = useState(false);
  const [completionCountdown, setCompletionCountdown] = useState<number | null>(null);
  // The simulated customer failed to answer the candidate's last message. The
  // wrap-up button is normally gated on a minimum number of replies, so a
  // customer that never comes back would leave the candidate typing into a
  // void with no way to finish. Once this is set, they may send what they have.
  const [customerUnavailable, setCustomerUnavailable] = useState(false);

  // The transcript used to live only here, so a refresh or a phone call wiped
  // it mid-assessment with the clock still running.
  const { clear: clearConversationDraft } = useConversationDraft<Message>(
    id && stepId ? `${id}:${stepId}:chat-sim` : null,
    messages,
    setMessages,
    state === "chatting"
  );
  const [completionNote, setCompletionNote] = useState(
    "The hiring team will get back to you — everyone hears back."
  );
  const [rejectedAppData, setRejectedAppData] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["chat-simulation-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`chat-simulation-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["chat-simulation-application", id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // Get chat config
  const chatConfig = useMemo(() => {
    const workflowSteps = application?.jobs?.workflow_steps as Array<{ id: string; type: string; config?: Record<string, unknown> }> | null;
    const chatStep = workflowSteps?.find(s => s.id === stepId || s.type === "chat_simulation");
    return {
      minMessages: chatStep?.config?.minMessages || 5,
      scenarios: normalizeChatScenarios(chatStep?.config?.scenarios),
    };
  }, [application?.jobs?.workflow_steps, stepId]);

  // Pre-select scenario on component mount so candidates can see it before starting
  const preselectedScenario = useMemo(() => {
    const scenarios = chatConfig.scenarios;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
  }, [chatConfig.scenarios]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check for resolution marker in messages
  useEffect(() => {
    if (messages.length > 0 && state === "chatting") {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "customer" && lastMessage.content.includes("[RESOLVED]")) {
        // Strip the marker from the message
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: m.content.replace("[RESOLVED]", "").trim() }
            : m
        ));
        setIsResolved(true);
        // Start countdown
        setCompletionCountdown(5);
      }
    }
  }, [messages, state]);

  // Countdown timer for auto-submission
  useEffect(() => {
    if (completionCountdown === null) return;
    if (completionCountdown <= 0) {
      endChat();
      return;
    }
    const timer = setTimeout(() => {
      setCompletionCountdown(prev => prev !== null ? prev - 1 : null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [completionCountdown]);

  // Log anti-cheat violation
  const logViolation = (type: AntiCheatViolation['type'], details: string) => {
    if (state === "chatting") {
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
      if (document.hidden && state === "chatting") {
        logViolation('tab_switch', 'User switched to another tab or window');
      }
      setIsBlurred(document.hidden);
    };

    const handleBlur = () => {
      if (state === "chatting") {
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
    toast.error("Copy is turned off during this conversation");
  };

  const preventPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    logViolation('paste_attempt', 'User attempted to paste content');
    toast.error("Paste is turned off during this conversation");
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
        toast.error("Copy is turned off during this conversation");
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        logViolation('paste_attempt', 'User pressed Ctrl/Cmd+V');
        toast.error("Paste is turned off during this conversation");
      } else if (['p', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        toast.error("Keyboard shortcuts are turned off during this conversation");
      }
    }
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      logViolation('screenshot_attempt', 'User pressed PrintScreen');
    }
  };

  // Enter-to-send lives on the textarea itself; Ctrl/Cmd shortcut blocking
  // reaches every keystroke by bubbling up to the root handler below, so it
  // only needs to fire once per keypress.
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && state === "chatting") {
      e.preventDefault();
      sendMessage();
    }
  };

  const streamCustomerResponse = async (mode: "start" | "respond", agentMessage?: string) => {
    if (!currentScenario) return;

    setIsTyping(true);

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
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
      if (customerContent) setCustomerUnavailable(false);

    } catch (error) {
      console.error("Chat simulation error:", error);
      // The raw message here comes from the edge function, so preferring it
      // showed candidates backend internals (rate limits, provider errors) and
      // used our own plain-English copy only when the throw was NOT an Error —
      // exactly backwards. The candidate gets the sentence; the console keeps
      // the detail for debugging.
      console.error("Chat simulation message failed:", error);
      setCustomerUnavailable(true);
      toast.error("That didn't come through — give it another try.");
    } finally {
      setIsTyping(false);
      // Auto-focus the input after customer responds
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const startChat = async () => {
    // Use the preselected scenario that the candidate already saw
    setCurrentScenario(preselectedScenario);
    setState("chatting");

    // Small delay to ensure state is set before streaming
    setTimeout(async () => {
      await streamCustomerResponseWithScenario("start", preselectedScenario);
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
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
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
      if (customerContent) setCustomerUnavailable(false);

    } catch (error) {
      console.error("Chat simulation error:", error);
      console.error("Chat simulation failed to start:", error);
      setCustomerUnavailable(true);
      toast.error("Couldn't start the conversation — give it another try.");
    } finally {
      setIsTyping(false);
      // Auto-focus the input after initial customer message
      setTimeout(() => inputRef.current?.focus(), 100);
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
    // The conversation is finished and on its way to be scored — drop the
    // local draft so a retake never resumes inside the old transcript.
    clearConversationDraft();
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;

    setIsSubmitting(true);
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();

      const isAutoMode = freshJob?.processing_mode === "auto";

      // Get AI evaluation (for notes/display only - NOT for pass/fail decision)
      const evalResponse = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
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

      const existingNotes = parseApplicationNotes(application.notes);
      const agentMessages = messages.filter((m) => m.role === "agent");

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
          phaseScore: evaluation.score, // Store phase score for backend to use
          antiCheatLog,
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
          phase_ai_analysis: `Chat simulation: ${evaluation.score}%. Empathy: ${evaluation.empathy}%, Problem-solving: ${evaluation.problemSolving}%.`,
        })
        .eq("id", id!);

      if (error) throw error;

      const serializedNotes = JSON.stringify(updatedNotes);
      const updatedPhaseAnalysis = `Chat simulation: ${evaluation.score}%. Empathy: ${evaluation.empathy}%, Problem-solving: ${evaluation.problemSolving}%.`;

      // Update relevant caches immediately so the candidate detail page does not flash
      // a stale "Start Chat Simulation" state after the submission returns.
      queryClient.setQueryData(["chat-simulation-application", id], (previous: typeof application | undefined) =>
        previous
          ? {
              ...previous,
              notes: serializedNotes,
              phase_ai_analysis: updatedPhaseAnalysis,
            }
          : previous,
      );
      queryClient.setQueryData(["candidate-application", id], (previous: typeof application | undefined) =>
        previous
          ? {
              ...previous,
              notes: serializedNotes,
              phase_ai_analysis: updatedPhaseAnalysis,
            }
          : previous,
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] }),
        queryClient.invalidateQueries({ queryKey: ["candidate-application", id] }),
      ]);

      // SINGLE SOURCE OF TRUTH: Let backend decide pass/fail
      if (isAutoMode) {
        try {
          const { data: analysisResult } = await invokeTriggerAvaAnalysis({
            applicationId: id!,
            autopilotDecision: true,
            currentPhaseId: stepId,
          });

          // Backend returns decision: "rejected" | "advanced" | "needs_employer_approval"
          if (analysisResult?.decision === "rejected") {
            setRejectedAppData({ ...application, status: "rejected" });
            setState("rejected");
          } else if (analysisResult?.decision === "advanced" || analysisResult?.decision === "needs_employer_approval") {
            setCompletionNote("You've moved on to the next step — nice work.");
            toast.success("Chat simulation completed!", {
              description: "Great work! You've advanced to the next phase.",
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
              setCompletionNote("The hiring team will get back to you — everyone hears back.");
              toast.success("Chat simulation completed!", {
                description: "Your responses have been recorded.",
              });
              setState("completed");
              setTimeout(() => navigate(`/applications/${id}`), 2000);
            }
          }
        } catch (err) {
          console.error("[ChatSimulationPhase] Backend analysis failed:", err);
          setCompletionNote("The hiring team will get back to you — everyone hears back.");
          setState("completed");
          setTimeout(() => navigate(`/applications/${id}`), 2000);
        }
      } else {
        // Manual mode - trigger analysis in background
        invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => console.error("[ChatSimulationPhase] AVA analysis trigger failed:", err));

        setCompletionNote("The hiring team will get back to you — everyone hears back.");
        toast.success("Chat simulation completed!", {
          description: "Your responses have been recorded. The employer will review your performance.",
        });
        setState("completed");
        setTimeout(() => navigate(`/applications/${id}`), 2000);
      }
    } catch (error) {
      console.error("Error submitting chat:", error);
      toast.error("That didn't send — give it another try.");
      setState("chatting");
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
      return notes.chatSimulationResult || null;
    } catch {
      return null;
    }
  })();

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md bg-card border-border">
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

  // Show already submitted view if phase was completed
  if (existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Chat Simulation"
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  // "agent" is the candidate's role in this simulation (they play support; the
  // AI plays the customer), so this already counts the candidate's own turns.
  const agentReplyCount = messages.filter(m => m.role === "agent").length;
  // If the customer stopped answering, the candidate may wrap up with whatever
  // they have written — the minimum only applies while the conversation works.
  const canEndEarly = customerUnavailable && agentReplyCount > 0;
  const canEndChat = agentReplyCount >= chatConfig.minMessages || canEndEarly;
  // Ending early, before the usual minimum — the button and hint change wording.
  const endingShort = canEndEarly && agentReplyCount < Number(chatConfig.minMessages ?? 0);

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

  // The context a nervous candidate needs to keep reading while they reply —
  // lives in the header so it never disappears once the conversation starts.
  const headerScenario = currentScenario ?? preselectedScenario;

  const headerGuidance =
    state === "intro"
      ? "Take a breath — you can't get this wrong by being yourself."
      : state === "chatting"
        ? "Reply the way you would on the job. Wrap up whenever it feels resolved."
        : state === "evaluating"
          ? "Hang tight — we're looking over what you sent."
          : "All set.";

  return (
    <div
      className="ck-page mx-auto max-w-3xl space-y-6 relative"
      onCopy={preventCopy}
      onPaste={preventPaste}
      onCut={preventCopy}
      onContextMenu={preventContextMenu}
      onKeyDown={handleKeyDown}
    >
      {/* Paused overlay when the page loses focus mid-conversation */}
      {isBlurred && state === "chatting" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-xl">
          <div className="p-8 text-center">
            <MessageSquare className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="font-display text-xl text-foreground mb-2">Paused</h2>
            <p className="text-muted-foreground">Click back anywhere to pick the conversation back up.</p>
          </div>
        </div>
      )}

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
            Customer support chat
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">{headerGuidance}</p>
        </div>

        {(state === "intro" || state === "chatting") && headerScenario && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {headerScenario.customerName}'s situation
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              {headerScenario.scenario}
            </p>
          </div>
        )}

        {violations.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              {violations.length} thing{violations.length === 1 ? "" : "s"} flagged during this session
            </span>
          </div>
        )}
      </header>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {state === "intro" && preselectedScenario && (
            <div className="space-y-6">
              <div className="space-y-4 rounded-lg bg-muted/30 p-6">
                <h3 className="font-display text-lg text-foreground">How this works</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">{preselectedScenario.customerName}</strong> messages you first — reply the way you'd want a real customer treated.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Once it feels resolved, wrap up and send — you'll need at least{" "}
                      <strong className="text-foreground">{chatConfig.minMessages}</strong> replies first.
                    </span>
                  </li>
                </ul>
                <div className="flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/10 px-3 py-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-sm text-warning">
                    Copy, paste, and right-click are off here, and switching tabs gets noted — just you and the conversation.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  You can't get this wrong by being yourself.
                </p>
                <Button onClick={startChat} size="lg" className="w-full gap-2 sm:w-auto">
                  <MessageSquare className="h-5 w-5" />
                  Start the conversation
                </Button>
              </div>
            </div>
          )}

          {(state === "chatting" || state === "evaluating" || state === "completed") && currentScenario && (
            <>
              {state === "chatting" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">In conversation</span>
                    <span className="ck-num text-muted-foreground">
                      {agentReplyCount} / {chatConfig.minMessages} replies
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (agentReplyCount / Math.max(chatConfig.minMessages, 1)) * 100)}
                    className="h-1.5 bg-[var(--track)]"
                  />
                </div>
              )}

              {(state === "chatting" || state === "evaluating") && (
                <>
                  {/* Chat Area */}
                  <ScrollArea className="h-[400px] rounded-lg border border-border bg-background/50 p-4 select-none" ref={scrollRef}>
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.role === "agent" ? "justify-end" : "justify-start"
                          }`}
                        >
                          {message.role === "customer" && (
                            <Avatar className="h-8 w-8 border border-border">
                              <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                                {currentScenario.customerName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={`max-w-[70%] rounded-xl p-3 ${
                              message.role === "agent"
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary/80 border border-border/50 text-foreground"
                            }`}
                          >
                            {message.role === "customer" && (
                              <p className="text-xs font-semibold mb-1 text-primary">
                                {currentScenario.customerName}
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {message.role === "agent" && (
                            <Avatar className="h-8 w-8 border border-primary/30">
                              <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                                You
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      ))}

                      {isTyping && (
                        <div className="flex gap-3 justify-start">
                          <Avatar className="h-8 w-8 border border-border">
                            <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                              {currentScenario.customerName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="bg-secondary/80 border border-border/50 rounded-xl p-3">
                            <div className="flex gap-1">
                              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Resolution Banner */}
                  {isResolved && state === "chatting" && (
                    <div className="ck-reveal rounded-lg border border-success/30 bg-success/10 p-4 text-center">
                      <CheckCircle className="h-8 w-8 mx-auto text-success mb-2" />
                      <p className="text-foreground font-medium">Sounds like it's resolved</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Wrapping up in <span className="ck-num">{completionCountdown}</span> seconds...
                      </p>
                      <Button
                        onClick={endChat}
                        className="mt-3 gap-2"
                        disabled={isTyping}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Wrap up now
                      </Button>
                    </div>
                  )}

                  {/* Input Area */}
                  {state === "chatting" && !isResolved && (
                    <div className="flex gap-2 items-end">
                      <Textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type your reply... (Enter to send)"
                        onKeyDown={handleTextareaKeyDown}
                        disabled={isTyping}
                        rows={3}
                        className="resize-none min-h-[80px] bg-background/50"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!inputValue.trim() || isTyping}
                        className="h-[80px] px-4"
                        aria-label="Send message"
                        title="Send message"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                  )}

                  {/* End Chat Button - only show if not auto-resolved */}
                  {state === "chatting" && canEndChat && !isResolved && (
                    <div className="space-y-2 text-center pt-2">
                      {endingShort && (
                        <p className="text-sm text-muted-foreground">
                          The customer isn't responding right now. You can keep trying, or send what you have — it still counts.
                        </p>
                      )}
                      <Button
                        variant="outline"
                        onClick={endChat}
                        disabled={isTyping}
                      >
                        {endingShort ? "Send what I have" : "Wrap up and send"}
                      </Button>
                    </div>
                  )}

                  {/* Evaluating State — a held moment, not a bare spinner */}
                  {state === "evaluating" && (
                    <div className="ck-reveal space-y-4 py-6 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                      <div className="space-y-1.5">
                        <h2 className="font-display ck-ink text-xl text-foreground sm:text-2xl">One moment</h2>
                        <p className="text-sm text-muted-foreground">We're looking over what you sent.</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Completed State — a small finishing payoff, and what happens next */}
              {state === "completed" && (
                <div className="ck-reveal space-y-4 py-10 text-center">
                  <AvaSeal size={44} tilt={-3} className="ck-seal-press" />
                  <div className="space-y-1.5">
                    <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Sent</h2>
                    <p className="text-sm text-muted-foreground">{completionNote}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Taking you back to your application…</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
