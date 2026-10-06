import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { StepAdvanceScreen } from "@/components/candidate/NextStepCard";
import {
  EndEarlyDialog,
  TestPausedOverlay,
  TestRulesCard,
  TestRulesReminder,
} from "@/components/candidate/TestRulesCard";
import { useTestIntegrity } from "@/hooks/useTestIntegrity";
import {
  TURN_RESEND_DELAY_MS,
  TurnNotSavedError,
  assessmentRequestHeaders,
  gradingReplyOutcome,
  isTurnNotSaved,
  newClientId,
  pinnedScenarioFrom,
  restoreUnsentText,
  serverConversationState,
  storedResultKey,
  turnsFromJson,
  turnsToMessages,
  unansweredCandidateTurn,
  useAssessmentSession,
  useServerCheck,
  useResultKeyAtFirstLoad,
} from "@/hooks/useAssessmentSession";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { AvaSeal } from "@/components/ava/AvaSeal";

import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";
import { useShowContinueOnComputer } from "@/components/candidate/continueOnComputerContext";
import { ComputerRequiredError, isComputerRequired, refusedDeviceKind, throwIfComputerRequired, withDeviceKind } from "@/lib/deviceGate";

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
    workflow_steps: Array<{
      id: string;
      type: string;
      title?: string | null;
      description?: string | null;
      config?: { minMessages?: number; scenarios?: unknown };
    }> | null;
    /** Lives on its own column, not in workflow_steps — the journey builder
     *  needs it to count the quiz as the stage the candidate actually does. */
    quiz_questions: unknown[] | null;
  } | null;
}

/**
 * An escalated case: the applicant is the team leader taking over a chat one
 * of their agents handled badly. These cases are written for two readers
 * (docs/ZULU-SKILLS-CHECK.md rule 7), so they say it in the third person:
 * "A team leader has now taken over the chat", then "What the team leader
 * knows:". The page tells the applicant plainly that this is them.
 */
function isTakeoverScenario(scenario: string | null | undefined): boolean {
  return !!scenario && /team leader has (now )?taken over|what the team leader knows\s*:/i.test(scenario);
}

/** The case split for reading: what happened, and what the team leader knows. */
function splitScenarioBrief(scenario: string): { situation: string; youKnow: string | null } {
  const match = /\n?\s*What the team leader knows\s*:\s*/i.exec(scenario);
  if (!match) return { situation: scenario, youKnow: null };
  const known = scenario.slice(match.index + match[0].length).trim();
  return {
    situation: scenario.slice(0, match.index).trim(),
    // It follows a colon in the case ("…knows: agents and…"); under its own
    // heading it starts a sentence.
    youKnow: known ? known.charAt(0).toUpperCase() + known.slice(1) : null,
  };
}

/** Same seed, same index, every time (31-hash, unsigned). */
function stableIndex(seed: string, length: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
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

/** The candidate's own current access token — the "evaluate" call needs the
 *  real session JWT (not the anon key) so ai-chat-simulation can verify the
 *  caller is this application's candidate before it records anything. Falls
 *  back to a refresh once if the cached session looks stale. */
async function getFreshAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

export default function ChatSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [state, setState] = useState<"intro" | "chatting" | "evaluating" | "completed">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<ChatScenario | null>(null);
  const [isResolved, setIsResolved] = useState(false);
  // The rules card's "I understand" — Start stays disabled until it is ticked.
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["chat-simulation-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as ApplicationDetails;
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
    const workflowSteps = application?.jobs?.workflow_steps;
    const chatStep = workflowSteps?.find(s => s.id === stepId) ?? workflowSteps?.find(s => s.type === "chat_simulation");
    return {
      minMessages: chatStep?.config?.minMessages || 5,
      scenarios: normalizeChatScenarios(chatStep?.config?.scenarios),
      // The step's own name and description, as the employer wrote them
      // ("Escalated chat practice"; "You take over a player's chat from one
      // of your agents…"), so the page says what this step really is.
      title: typeof chatStep?.title === "string" && chatStep.title.trim() ? chatStep.title.trim() : null,
      description: typeof chatStep?.description === "string" && chatStep.description.trim() ? chatStep.description.trim() : null,
    };
  }, [application?.jobs?.workflow_steps, stepId]);

  // The candidate reads this player's situation before starting, so it must be
  // the same player on every load. It was Math.random() per mount: a reload (a
  // phone switching apps) or any refetch of the application row re-rolled it,
  // so someone could read Devin's situation and then be messaged by Angela, or
  // reload until they got a player they liked. One player per application.
  const preselectedScenario = useMemo(() => {
    const scenarios = chatConfig.scenarios;
    return scenarios[stableIndex(`${id}:${stepId}`, scenarios.length)];
  }, [chatConfig.scenarios, id, stepId]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // After the chat is sent: the waiting screen, then "Start <next step>" the
  // moment the row says it is open (see useStepAdvance). Replaces the old
  // two-second redirect to the overview.
  const advance = useStepAdvance({ applicationId: id, stepId, job: application?.jobs });

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

  // "Already done" is decided once, from the first read after this page
  // mounted — never from a refresh that lands after the candidate sends.
  const resultAtFirstLoad = useResultAtFirstLoad(isFetchedAfterMount && !!application, !!existingResult);
  // A step the server already holds has no use for a local draft (the send
  // that stored it may have been cut off before it could clear one), and a
  // later retake must never resume inside the old conversation.
  useEffect(() => {
    if (resultAtFirstLoad) clearConversationDraft();
  }, [resultAtFirstLoad, clearConversationDraft]);

  // The record the hiring team reads (docs/ASSESSMENT-RECORD.md): opened when
  // this page loads on a step that is not done, so a reload resumes from what
  // the server holds, with a heartbeat while the page is open.
  // A conversation the server is already checking (End was pressed here
  // before a reload, or on another device) is waited on, never put back as a
  // live chat the server no longer records (useServerCheck).
  const storedChatResult = useMemo(
    () => storedResultKey(parseApplicationNotes(application?.notes).chatSimulationResult),
    [application?.notes],
  );
  // The baseline of a wait this page did not start with its own send (the
  // heartbeat says End was pressed elsewhere, or a reload while it is being
  // checked): the result as first read, never the one cached since, which
  // the page's realtime refresh has usually already replaced by the time the
  // heartbeat says "completed" (useResultKeyAtFirstLoad).
  const loadResultKey = useResultKeyAtFirstLoad(isFetchedAfterMount && !!application, storedChatResult);
  const [serverCheckWaiting, setServerCheckWaiting] = useState(false);

  const session = useAssessmentSession({
    applicationId: id,
    stepId,
    enabled: resultAtFirstLoad === false,
    // While the server checks a send this page did not see through, the
    // heartbeat goes on: it is how the page learns that the check failed.
    live: state === "intro" || state === "chatting" || serverCheckWaiting,
    clientProgress: { screen: state === "intro" ? "intro" : "conversation" },
  });

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
    // `endChat` is a plain (unmemoized) function that calls setState, so its
    // reference changes on every render, including the one endChat() itself
    // causes. Adding it here would re-run this effect after that render;
    // completionCountdown is still <= 0 (nothing resets it), so it would
    // call endChat() -> handleSubmit() again on a loop, and handleSubmit
    // has no re-entrancy guard against a duplicate submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionCountdown]);

  // Copy, paste, switching away and screenshots: the one shared hook
  // (useTestIntegrity), live to the server while the conversation runs. It
  // replaced this page's own copy, which logged one tab switch twice (window
  // blur AND visibilitychange) and never said how long anyone was away.
  const integrity = useTestIntegrity({ applicationId: id, stepId, active: state === "chatting" });
  // A 400 computer_required from ai-chat-simulation hands the step to
  // "Continue on your computer" (CandidateStepGate), never an error toast.
  const showContinueOnComputer = useShowContinueOnComputer();

  // Enter-to-send lives on the textarea itself; copy/paste/shortcut blocking
  // is document-level in useTestIntegrity, so it fires once per keypress.
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && state === "chatting") {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * One request for the customer's next message — the opener ("start") or a
   * reply ("respond") — streamed into the conversation as it arrives.
   *
   * It carries the applicant's own JWT, the application and step, and an id
   * per message (clientMsgId), so the server can keep every turn as it
   * happens (docs/ASSESSMENT-RECORD.md §5.1): a closed tab no longer loses the
   * conversation, and a retried message is stored once. The full `messages`
   * history still rides along for a server on the previous build.
   *
   * When the server could not store the message (503 `turn_not_saved`) it
   * sent no reply: the message goes once more under the same id, and if that
   * fails too, `giveBack` takes the bubble off and puts the text back in the
   * reply box. A message on screen is never one nobody will answer.
   */
  const streamCustomerReply = async (
    mode: "start" | "respond",
    scenario: ChatScenario,
    opts: { agentMessage?: string; clientMsgId?: string; history: Message[]; giveBack?: boolean },
  ) => {
    setIsTyping(true);

    try {
      const request = async () =>
        fetch(CHAT_URL, {
          method: "POST",
          headers: await assessmentRequestHeaders(),
          body: JSON.stringify(withDeviceKind({
            mode,
            scenario: scenario.scenario,
            customerName: scenario.customerName,
            jobTitle: application?.jobs?.title || "",
            messages: opts.history.map(m => ({
              role: m.role === "agent" ? "user" : "assistant",
              content: m.content
            })),
            agentMessage: opts.agentMessage,
            messageCount: opts.history.length,
            applicationId: id,
            stepId,
            clientMsgId: opts.clientMsgId,
            clientAt: new Date().toISOString(),
            // The server pins the scenario on the attempt the first time it starts.
            scenarioId: scenario.id,
          })),
        });

      let response = await request();
      for (let resent = false; !response.ok; resent = true) {
        const errorData = await response.json().catch(() => null);
        throwIfComputerRequired(response.status, errorData);
        if (!isTurnNotSaved(response.status, errorData)) {
          throw new Error(errorData?.error || "Failed to get customer response");
        }
        if (resent) throw new TurnNotSavedError();
        // Not stored, no reply: once more under the same id (stored once).
        await new Promise((resolve) => setTimeout(resolve, TURN_RESEND_DELAY_MS));
        response = await request();
      }

      // The scenario the attempt is pinned to wins over this page's pick (they
      // differ only if the job's scenarios changed after the attempt began).
      const adoptPinnedScenario = (body: unknown) => {
        const pinned = pinnedScenarioFrom(body);
        if (!pinned) return;
        setCurrentScenario((current) =>
          current && current.scenario === pinned.scenario && current.customerName === pinned.customerName
            ? current
            : { id: current?.id ?? scenario.id, ...pinned },
        );
      };

      // A conversation the server already holds comes back as its stored
      // turns rather than a second opener (another tab or device started it).
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        const body = await response.json().catch(() => null);
        const turns = turnsFromJson(body);
        if (!turns || turns.length === 0) throw new Error("No reply in the response");
        adoptPinnedScenario(body);
        setMessages(turnsToMessages(turns, { candidate: "agent", other: "customer" }, session.offsetMs));
        setCustomerUnavailable(false);
        return;
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
            // The server's first line says what it recorded (and, on a start,
            // the pinned scenario); it carries no text.
            if (parsed?.assessment && mode === "start") adoptPinnedScenario(parsed);
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
          ? { ...m, id: mode === "start" ? "customer-initial" : `customer-${Date.now()}` }
          : m
      ));
      if (customerContent) setCustomerUnavailable(false);

    } catch (error) {
      if (error instanceof ComputerRequiredError && showContinueOnComputer(error.deviceKind)) return;
      if (error instanceof TurnNotSavedError && mode === "respond" && opts.giveBack && opts.clientMsgId && opts.agentMessage) {
        // The server has not got this message and will not answer it: take
        // the bubble back off and give the text back to send again.
        const unsent = opts.agentMessage;
        const unsentId = opts.clientMsgId;
        setMessages((prev) => prev.filter((m) => m.id !== unsentId));
        setInputValue((current) => restoreUnsentText(current, unsent));
        toast.error("Your message didn't save — it's back in the box. Send it again.");
        return;
      }
      // The raw message here comes from the edge function, so preferring it
      // showed candidates backend internals (rate limits, provider errors).
      // The candidate gets the sentence; the console keeps the detail.
      console.error(mode === "start" ? "Chat simulation failed to start:" : "Chat simulation message failed:", error);
      setCustomerUnavailable(true);
      toast.error(
        mode === "start"
          ? "Couldn't start the conversation — give it another try."
          : "That didn't come through — give it another try.",
      );
    } finally {
      setIsTyping(false);
      // Auto-focus the input after the customer responds
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const startChat = async () => {
    // Use the preselected scenario that the candidate already saw
    setCurrentScenario(preselectedScenario);
    setState("chatting");
    await streamCustomerReply("start", preselectedScenario, { history: [] });
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping || !currentScenario) return;

    // The message's id is also the server's key for it, so a retry is stored once.
    const clientMsgId = newClientId();
    const agentMessage: Message = {
      id: clientMsgId,
      role: "agent",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, agentMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");

    await streamCustomerReply("respond", currentScenario, {
      agentMessage: messageToSend,
      clientMsgId,
      history: messages,
      giveBack: true,
    });
  };

  // A reload (or another device) resumes the conversation instead of showing
  // the intro and asking for a fresh opener on top of it. The server's stored
  // turns win; without them (a server on the previous build, or the record
  // unreachable) this device's own draft is used. A last message nobody
  // answered yet (the tab closed while the reply was coming) is asked for
  // again under its own id. A conversation the server is already checking
  // gets the waiting screen instead, and one whose check failed is sent again.
  const resumeDecidedRef = useRef(false);
  const [resumeDecided, setResumeDecided] = useState(false);
  const resumeConversation = useCallback(() => {
    const turns = session.reply?.turns ?? [];
    const restored: Message[] =
      turns.length > 0
        ? (turnsToMessages(turns, { candidate: "agent", other: "customer" }, session.offsetMs) as Message[])
        : messages;
    const where = serverConversationState(session.reply, session.serverStatus);
    if (where === "checking" || where === "done") {
      if (restored.length > 0) setMessages(restored);
      setCurrentScenario(preselectedScenario);
      waitForServerCheck(where === "done");
      return true;
    }
    if (restored.length === 0) return false;
    setMessages(restored);
    setCurrentScenario(preselectedScenario);
    setRulesAccepted(true);
    setState("chatting");
    if (where === "owed") {
      // Sent before, and its check crashed: the result is still owed.
      setResendTriggered(true);
      return true;
    }
    toast.info("Picked up where you left off", { description: "Your conversation is saved as you go." });

    const pending = turns.length > 0 ? unansweredCandidateTurn(turns) : null;
    const lastLocal = restored[restored.length - 1];
    if (pending) {
      void streamCustomerReply("respond", preselectedScenario, {
        agentMessage: pending.content,
        clientMsgId: pending.client_msg_id ?? undefined,
        history: restored.slice(0, -1),
      });
    } else if (turns.length === 0 && lastLocal?.role === "agent") {
      // Only on this device: if the server cannot store it, it goes back in the box.
      void streamCustomerReply("respond", preselectedScenario, {
        agentMessage: lastLocal.content,
        clientMsgId: lastLocal.id,
        history: restored.slice(0, -1),
        giveBack: true,
      });
    }
    return true;
    // streamCustomerReply and waitForServerCheck are plain functions that read
    // the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.reply, session.serverStatus, session.offsetMs, messages, preselectedScenario]);

  useEffect(() => {
    if (resumeDecidedRef.current || resultAtFirstLoad !== false || !session.settled || state !== "intro") return;
    resumeDecidedRef.current = true;
    setResumeDecided(true);
    resumeConversation();
  }, [resultAtFirstLoad, session.settled, state, resumeConversation]);

  const endChat = () => {
    setState("evaluating");
    // The local draft is dropped only once the server has the transcript
    // (in handleSubmit) — clearing it first lost the whole conversation if
    // the tab closed or the send failed mid-way.
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;

    setIsSubmitting(true);
    // The stored result before this send: a 409 "already being checked"
    // waits for a result different from this one.
    const resultBeforeSend = storedChatResult;
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();

      const isAutoMode = freshJob?.processing_mode === "auto";

      // Auto mode: the honest waiting screen goes up now and stays until the
      // next step is open (useStepAdvance).
      if (isAutoMode) advance.begin();

      // The server grades the transcript AND records the result in one call
      // (ai-chat-simulation's "evaluate" mode, service-role) — this page no
      // longer writes `applications` itself. Needs the candidate's own
      // session token (not the anon key) so the function can verify the
      // caller is this application's candidate.
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        throw new Error("Your session expired — sign in again and retry.");
      }

      const evalResponse = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(withDeviceKind({
          mode: "evaluate",
          applicationId: id,
          stepId,
          scenario: currentScenario.scenario,
          customerName: currentScenario.customerName,
          jobTitle: application.jobs?.title || "",
          messages: messages.map(m => ({
            role: m.role === "agent" ? "user" : "assistant",
            content: m.content
          })),
          // The old-shape list, for a server that does not read the live
          // record yet; the record itself was sent as it happened.
          violations: integrity.violations,
        })),
      });

      if (!evalResponse.ok) {
        const errorData = await evalResponse.json().catch(() => null);
        if (isComputerRequired(evalResponse.status, errorData)) {
          advance.cancel();
          if (showContinueOnComputer(refusedDeviceKind(errorData))) return;
        }
        const outcome = gradingReplyOutcome(evalResponse.status, errorData);
        if (outcome === "checking" || outcome === "on_file") {
          // We have the conversation: it is being checked (another tab, a
          // retry whose first answer was lost) or already on file. Wait for
          // the result and the next step; never an error, never a second send.
          waitForServerCheck(outcome === "on_file", resultBeforeSend);
          return;
        }
        throw new Error(errorData?.error || "Failed to record chat simulation result");
      }

      await evalResponse.json().catch(() => null);

      // The server holds the result now. Drop the local draft so a retake
      // never resumes inside the old transcript. This page no longer writes
      // the result into its own cache: that made the page think the step had
      // been done before this visit and swap the waiting screen for a dead
      // end. The overview simply re-reads.
      clearConversationDraft();
      integrity.finish();
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      if (isAutoMode) {
        // Which step opens next is the server's call (it moves `phase`); the
        // screen follows the row, and the trigger's reply only speeds that
        // up. invokeTriggerAvaAnalysis never throws.
        advance.markSaved();
        const reply = await invokeTriggerAvaAnalysis({
          applicationId: id!,
          autopilotDecision: true,
          currentPhaseId: stepId,
        });
        advance.settle(reply);
      } else {
        // Manual mode - trigger analysis in background; the hiring team opens
        // the next step.
        invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => console.error("[ChatSimulationPhase] AVA analysis trigger failed:", err));

        setState("completed");
      }
    } catch (error) {
      console.error("Error submitting chat:", error);
      toast.error("That didn't send — give it another try.");
      advance.cancel();
      setState("chatting");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  // A send whose check crashed is sent again — once per visit; after that the
  // wrap-up button is there as usual.
  const [resendTriggered, setResendTriggered] = useState(false);
  const resentRef = useRef(false);
  useEffect(() => {
    if (!resendTriggered) return;
    setResendTriggered(false);
    if (resentRef.current) {
      setState("chatting");
      return;
    }
    resentRef.current = true;
    setState("evaluating");
    void handleSubmitRef.current();
  }, [resendTriggered]);

  /** The server has the result of a send this page did not see through. */
  const finishCheckedSend = async () => {
    setServerCheckWaiting(false);
    clearConversationDraft();
    integrity.finish();
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
    queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });
    if (application?.jobs?.processing_mode === "auto") {
      advance.markSaved();
      const reply = await invokeTriggerAvaAnalysis({
        applicationId: id!,
        autopilotDecision: true,
        currentPhaseId: stepId,
      });
      advance.settle(reply);
    } else {
      invokeTriggerAvaAnalysis({ applicationId: id! }).catch((err) =>
        console.error("[ChatSimulationPhase] AVA analysis trigger failed:", err),
      );
      setState("completed");
    }
  };
  const finishCheckedSendRef = useRef(finishCheckedSend);
  finishCheckedSendRef.current = finishCheckedSend;

  const serverCheck = useServerCheck({
    storedResultKey: storedChatResult,
    serverStatus: session.serverStatus,
    loadResultKey,
    onLanded: () => void finishCheckedSendRef.current(),
    onOwed: () => {
      setServerCheckWaiting(false);
      setResendTriggered(true);
    },
    onStale: () => queryClient.invalidateQueries({ queryKey: ["chat-simulation-application", id] }),
  });

  /** The waiting screen for a send the server is checking (or has on file).
   *  `baselineKey`: the stored result before this page's own send (a 409). */
  const waitForServerCheck = (alreadyOnFile = false, baselineKey?: string | null) => {
    setCompletionCountdown(null);
    setState("evaluating");
    if (application?.jobs?.processing_mode === "auto") {
      advance.begin();
      // The server holds the conversation: the usual one-minute hand-over to
      // the live card applies if the check runs long.
      advance.markSaved();
    }
    if (alreadyOnFile) {
      void finishCheckedSendRef.current();
      return;
    }
    setServerCheckWaiting(true);
    serverCheck.begin(baselineKey);
  };

  // The heartbeat says the server is checking this conversation while it is
  // still on screen here: End was pressed on another device.
  useEffect(() => {
    if (state !== "chatting" && state !== "intro") return;
    if (!resumeDecidedRef.current || isSubmitting || serverCheck.waiting) return;
    if (serverConversationState(null, session.serverStatus) !== "checking") return;
    if (!currentScenario) setCurrentScenario(preselectedScenario);
    waitForServerCheck();
    // waitForServerCheck reads the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.serverStatus, state, isSubmitting, serverCheck.waiting]);

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

  // Sent in this visit: the waiting screen, then the next step's button.
  if (advance.view) {
    return (
      <StepAdvanceScreen
        advance={advance}
        applicationId={id!}
        jobTitle={application.jobs?.title}
        completedTitle={journeyStep.title}
      />
    );
  }

  if (resultAtFirstLoad === null) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Done before this visit began (a bookmark, the back button): say where
  // things stand and offer the next step, never a dead end.
  if (resultAtFirstLoad && existingResult && state === "intro") {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName={journeyStep.title}
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

  // The context a nervous candidate needs to keep reading while they reply —
  // lives in the header so it never disappears once the conversation starts.
  const headerScenario = currentScenario ?? preselectedScenario;
  // The applicant is the team leader taking this chat over from an agent.
  const takeover = isTakeoverScenario(headerScenario?.scenario);
  const brief = headerScenario ? splitScenarioBrief(headerScenario.scenario) : null;

  const headerGuidance =
    state === "intro"
      ? "Take a breath. Answer the way you would on a real shift."
      : state === "chatting"
        ? "Reply the way you would on the job. Wrap up whenever it feels resolved."
        : state === "evaluating"
          ? serverCheckWaiting
            ? "We have your conversation — it's being checked now."
            : "Sending your conversation — keep this page open for a moment."
          : "All set.";

  return (
    <div className="ck-page mx-auto max-w-3xl space-y-6 relative">
      {/* Paused overlay when focus leaves the page mid-conversation */}
      <TestPausedOverlay
        show={integrity.away && state === "chatting"}
        body="Click back anywhere to pick the conversation back up. Leaving the test is recorded."
      />

      <EndEarlyDialog
        open={confirmEndOpen}
        onOpenChange={setConfirmEndOpen}
        what="conversation"
        answered={agentReplyCount}
        usual={chatConfig.minMessages}
        onConfirm={endChat}
      />

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
            {chatConfig.title ?? "Chat practice"}
          </h1>

          {chatConfig.description && (
            <p className="text-sm text-muted-foreground">{chatConfig.description}</p>
          )}

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">{headerGuidance}</p>
        </div>

        {(state === "intro" || state === "chatting") && headerScenario && brief && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 sm:p-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {headerScenario.customerName}'s situation
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {brief.situation}
              </p>
            </div>
            {brief.youKnow && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What you know, as the team leader
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {brief.youKnow}
                </p>
              </div>
            )}
          </div>
        )}

        {state === "chatting" && <TestRulesReminder recorded={integrity.flagged} />}
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
                    {takeover ? (
                      <span>
                        <strong className="text-foreground">You are the team leader.</strong>{" "}
                        {preselectedScenario.customerName}'s chat was handled badly by one of your agents, and you are taking it
                        over now. Read the situation and what you know, then reply.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-foreground">{preselectedScenario.customerName}</strong> messages you first — reply the way you'd want a real customer treated.
                      </span>
                    )}
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Once it feels resolved, wrap up and send — usually after about{" "}
                      <strong className="text-foreground">{chatConfig.minMessages}</strong> replies. You can end
                      sooner if you need to.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Every message is saved as you send it, so a dropped connection loses nothing.</span>
                  </li>
                </ul>
              </div>

              <TestRulesCard accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} />

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {rulesAccepted ? "Answer the way you would on a real shift." : "Tick the box above to start."}
                </p>
                <Button
                  onClick={startChat}
                  disabled={!rulesAccepted || !resumeDecided}
                  size="lg"
                  className="w-full gap-2 sm:w-auto"
                >
                  {resumeDecided ? <MessageSquare className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                  {resumeDecided ? "Start the conversation" : "Getting things ready…"}
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

                  {/* End Chat Button — from the first reply on; before the usual
                      number it asks first ("End now — we'll send what you have"). */}
                  {state === "chatting" && agentReplyCount > 0 && !isResolved && (
                    <div className="space-y-2 text-center pt-2">
                      {endingShort && (
                        <p className="text-sm text-muted-foreground">
                          {currentScenario.customerName} isn't responding right now. You can keep trying, or send what you have — it still counts.
                        </p>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => (canEndChat ? endChat() : setConfirmEndOpen(true))}
                        disabled={isTyping}
                      >
                        {canEndChat ? (endingShort ? "Send what I have" : "Wrap up and send") : "End now"}
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
                        <h2 className="font-display ck-ink text-xl text-foreground sm:text-2xl">
                          {serverCheckWaiting ? "We have your conversation" : "Sending your conversation"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {serverCheckWaiting
                            ? "It's being checked now. This page moves on by itself when it's done."
                            : "Keep this page open for a moment."}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Completed State (manual-review jobs) — the hiring team opens
                  the next step, so say so and stay put: no timed redirect. */}
              {state === "completed" && (
                <div className="ck-reveal space-y-4 py-10 text-center">
                  <AvaSeal size={44} tilt={-3} className="ck-seal-press" />
                  <div className="space-y-1.5">
                    <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Sent</h2>
                    <p className="text-sm text-muted-foreground">
                      Your conversation is saved. The hiring team will get back to you — you can close this page.
                    </p>
                  </div>
                  <Button onClick={() => navigate(`/applications/${id}`)} className="w-full gap-2 sm:w-auto">
                    <ArrowLeft className="h-4 w-4" />
                    Back to your application
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
