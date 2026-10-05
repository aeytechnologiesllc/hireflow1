import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConversationDraft } from "@/hooks/useConversationDraft";
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
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";
import { PhaseContextCard } from "@/components/PhaseContextCard";
import { parseApplicationNotes } from "@/lib/applicationNotes";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { Progress } from "@/components/ui/progress";

interface Message {
  id: string;
  role: "prospect" | "salesRep";
  content: string;
  timestamp: Date;
}

interface SalesScenario {
  id: string;
  prospectName: string;
  prospectCompany: string;
  prospectRole: string;
  scenario: string;
  productService: string;
}

function isValidSalesScenario(value: unknown): value is SalesScenario {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SalesScenario>;
  return (
    typeof candidate.prospectName === "string" &&
    candidate.prospectName.trim().length > 0 &&
    typeof candidate.prospectCompany === "string" &&
    candidate.prospectCompany.trim().length > 0 &&
    typeof candidate.prospectRole === "string" &&
    candidate.prospectRole.trim().length > 0 &&
    typeof candidate.scenario === "string" &&
    candidate.scenario.trim().length > 0 &&
    typeof candidate.productService === "string" &&
    candidate.productService.trim().length > 0
  );
}

function normalizeSalesScenarios(value: unknown): SalesScenario[] {
  if (!Array.isArray(value)) {
    return defaultScenarios;
  }

  const normalized = value
    .filter(isValidSalesScenario)
    .map((scenario, index) => ({
      id: typeof scenario.id === "string" && scenario.id.trim().length > 0 ? scenario.id : `scenario-${index + 1}`,
      prospectName: scenario.prospectName.trim(),
      prospectCompany: scenario.prospectCompany.trim(),
      prospectRole: scenario.prospectRole.trim(),
      scenario: scenario.scenario.trim(),
      productService: scenario.productService.trim(),
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
    description: string;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: Array<{ id: string; type: string; config?: { minMessages?: number; scenarios?: unknown } }> | null;
    /** Its own column, not part of workflow_steps. Without it the journey
     *  builder drops the quiz and this screen quotes a smaller "of N" than
     *  the rest of the app. */
    quiz_questions?: unknown[] | null;
  } | null;
}

/** Same seed, same index, every time (31-hash, unsigned). */
function stableIndex(seed: string, length: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
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

const SALES_URL = `${SUPABASE_URL}/functions/v1/ai-sales-simulation`;
// The trusted write path — grades the transcript and records the result
// server-side (see docs/TRUSTED-RESULTS.md). This page no longer writes
// applications.notes/phase_ai_analysis itself.
const SUBMIT_SALES_SIMULATION_URL = `${SUPABASE_URL}/functions/v1/submit-sales-simulation`;

export default function SalesSimulationPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [state, setState] = useState<"intro" | "selling" | "evaluating" | "completed">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<SalesScenario | null>(null);
  // The transcript used to live only in this component, so a refresh or a
  // phone call wiped it mid-simulation.
  const { clear: clearConversationDraft } = useConversationDraft<Message>(
    id && stepId ? `${id}:${stepId}:sales-sim` : null,
    messages,
    setMessages,
    state === "selling"
  );
  // The rules card's "I understand" — Start stays disabled until it is ticked.
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["sales-simulation-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, description, processing_mode, passing_score, workflow_steps, quiz_questions)")
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
      
      return { ...data, candidateName } as unknown as ApplicationDetails & { candidateName: string | null };
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
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
        queryClient.invalidateQueries({ queryKey: ["sales-simulation-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Where the candidate is. This screen showed no position at all, so
  // mid-journey they could not tell how much was left.
  const journeyStep = useJourneyPosition(application?.jobs, {
    stepId,
    phase: application?.phase,
  });

  // After the meeting is sent: the waiting screen, then "Start <next step>"
  // the moment the row says it is open (see useStepAdvance). Replaces the old
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
      return notes.salesSimulationResult || null;
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
  // A meeting the server is already checking (End was pressed here before a
  // reload, or on another device) is waited on, never put back as a live
  // meeting the server no longer records (useServerCheck).
  const storedSalesResult = useMemo(
    () => storedResultKey(parseApplicationNotes(application?.notes).salesSimulationResult),
    [application?.notes],
  );
  // The baseline of a wait this page did not start with its own send (the
  // heartbeat says End was pressed elsewhere, or a reload while it is being
  // checked): the result as first read, never the one cached since, which
  // the page's realtime refresh has usually already replaced by the time the
  // heartbeat says "completed" (useResultKeyAtFirstLoad).
  const loadResultKey = useResultKeyAtFirstLoad(isFetchedAfterMount && !!application, storedSalesResult);
  const [serverCheckWaiting, setServerCheckWaiting] = useState(false);

  const record = useAssessmentSession({
    applicationId: id,
    stepId,
    enabled: resultAtFirstLoad === false,
    // While the server checks a send this page did not see through, the
    // heartbeat goes on: it is how the page learns that the check failed.
    live: state === "intro" || state === "selling" || serverCheckWaiting,
    clientProgress: { screen: state === "intro" ? "intro" : "conversation" },
  });

  // Get config from workflow
  const salesConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps;
    const salesStep = workflowSteps?.find(s => s.id === stepId || s.type === "sales_simulation");
    return {
      minMessages: salesStep?.config?.minMessages || 6,
      scenarios: normalizeSalesScenarios(salesStep?.config?.scenarios),
    };
  })();

  // The same prospect on every load of this application's step: a random pick
  // per mount meant a reload (a phone switching apps) brought back the saved
  // conversation with a different prospect in the briefing.
  useEffect(() => {
    if (!currentScenario && salesConfig.scenarios.length > 0) {
      const scenarios = salesConfig.scenarios;
      setCurrentScenario(scenarios[stableIndex(`${id}:${stepId}`, scenarios.length)]);
    }
  }, [salesConfig.scenarios, currentScenario, id, stepId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Copy, paste, switching away and screenshots: the one shared hook
  // (useTestIntegrity), live to the server while the meeting runs. This page's
  // own copy logged one switch twice (window blur AND visibilitychange).
  const integrity = useTestIntegrity({ applicationId: id, stepId, active: state === "selling" });

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && state === "selling") {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * One request for the prospect's next message — the opener ("start") or a
   * reply ("respond") — streamed in as it arrives. It carries the applicant's
   * own JWT, the application and step, and an id per message (clientMsgId),
   * so the server can keep every turn as it happens
   * (docs/ASSESSMENT-RECORD.md §5.1). The full `messages` history still rides
   * along for a server on the previous build.
   *
   * When the server could not store the message (503 `turn_not_saved`) it
   * sent no reply: the message goes once more under the same id, and if that
   * fails too, `giveBack` takes the bubble off and puts the text back in the
   * reply box. A message on screen is never one nobody will answer.
   */
  const streamProspectReply = async (
    mode: "start" | "respond",
    scenario: SalesScenario,
    opts: { salesRepMessage?: string; clientMsgId?: string; history: Message[]; giveBack?: boolean },
  ) => {
    setIsTyping(true);

    // Add typing delay for more natural feel (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const request = async () =>
        fetch(SALES_URL, {
          method: "POST",
          headers: await assessmentRequestHeaders(),
          body: JSON.stringify({
            mode,
            scenario: scenario.scenario,
            prospectName: scenario.prospectName,
            prospectCompany: scenario.prospectCompany,
            productService: scenario.productService,
            jobTitle: application?.jobs?.title || "",
            candidateName: application?.candidateName || "the sales representative",
            messages: opts.history.map(m => ({
              role: m.role === "salesRep" ? "user" : "assistant",
              content: m.content
            })),
            salesRepMessage: opts.salesRepMessage,
            messageCount: opts.history.length,
            applicationId: id,
            stepId,
            clientMsgId: opts.clientMsgId,
            clientAt: new Date().toISOString(),
          }),
        });

      let response = await request();
      for (let resent = false; !response.ok; resent = true) {
        const errorData = await response.json().catch(() => null);
        if (!isTurnNotSaved(response.status, errorData)) {
          throw new Error(errorData?.error || "Failed to get prospect response");
        }
        if (resent) throw new TurnNotSavedError();
        // Not stored, no reply: once more under the same id (stored once).
        await new Promise((resolve) => setTimeout(resolve, TURN_RESEND_DELAY_MS));
        response = await request();
      }

      // A meeting the server already holds comes back as its stored turns
      // rather than a second opener (another tab or device started it).
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        const turns = turnsFromJson(await response.json().catch(() => null));
        if (!turns || turns.length === 0) throw new Error("No reply in the response");
        setMessages(turnsToMessages(turns, { candidate: "salesRep", other: "prospect" }, record.offsetMs) as Message[]);
        return;
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
          ? { ...m, id: mode === "start" ? "prospect-initial" : `prospect-${Date.now()}` }
          : m
      ));

    } catch (error) {
      if (error instanceof TurnNotSavedError && mode === "respond" && opts.giveBack && opts.clientMsgId && opts.salesRepMessage) {
        // The server has not got this message and will not answer it: take
        // the bubble back off and give the text back to send again.
        const unsent = opts.salesRepMessage;
        const unsentId = opts.clientMsgId;
        setMessages((prev) => prev.filter((m) => m.id !== unsentId));
        setInputValue((current) => restoreUnsentText(current, unsent));
        toast.error("Your message didn't save — it's back in the box. Send it again.");
        return;
      }
      // Candidates get our sentence, not the edge function's raw error string.
      console.error(mode === "start" ? "Sales simulation failed to start:" : "Sales simulation message failed:", error);
      toast.error(
        mode === "start"
          ? "Couldn't start the conversation — give it another try."
          : "That didn't come through — give it another try.",
      );
    } finally {
      setIsTyping(false);
      // Auto-focus the input after the prospect responds
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const startSales = async () => {
    if (!currentScenario) return;
    setState("selling");
    await streamProspectReply("start", currentScenario, { history: [] });
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isTyping || !currentScenario) return;

    // The message's id is also the server's key for it, so a retry is stored once.
    const clientMsgId = newClientId();
    const salesRepMessage: Message = {
      id: clientMsgId,
      role: "salesRep",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, salesRepMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");

    await streamProspectReply("respond", currentScenario, {
      salesRepMessage: messageToSend,
      clientMsgId,
      history: messages,
      giveBack: true,
    });
  };

  // A reload (or another device) resumes the meeting instead of showing the
  // briefing and asking for a fresh opener on top of it. The server's stored
  // turns win; without them this device's own draft is used. A last message
  // nobody answered yet is asked for again under its own id. A meeting the
  // server is already checking gets the waiting screen instead, and one whose
  // check failed is sent again.
  const resumeDecidedRef = useRef(false);
  const [resumeDecided, setResumeDecided] = useState(false);
  useEffect(() => {
    if (resumeDecidedRef.current || resultAtFirstLoad !== false || !record.settled || state !== "intro") return;
    if (!currentScenario) return;
    resumeDecidedRef.current = true;
    setResumeDecided(true);
    const turns = record.reply?.turns ?? [];
    const restored: Message[] =
      turns.length > 0
        ? (turnsToMessages(turns, { candidate: "salesRep", other: "prospect" }, record.offsetMs) as Message[])
        : messages;
    const where = serverConversationState(record.reply, record.serverStatus);
    if (where === "checking" || where === "done") {
      if (restored.length > 0) setMessages(restored);
      waitForServerCheck(where === "done");
      return;
    }
    if (restored.length === 0) return;
    setMessages(restored);
    setRulesAccepted(true);
    setState("selling");
    if (where === "owed") {
      // Sent before, and its check crashed: the result is still owed.
      setResendTriggered(true);
      return;
    }
    toast.info("Picked up where you left off", { description: "Your conversation is saved as you go." });

    const pending = turns.length > 0 ? unansweredCandidateTurn(turns) : null;
    const last = restored[restored.length - 1];
    if (pending) {
      void streamProspectReply("respond", currentScenario, {
        salesRepMessage: pending.content,
        clientMsgId: pending.client_msg_id ?? undefined,
        history: restored.slice(0, -1),
      });
    } else if (turns.length === 0 && last?.role === "salesRep") {
      // Only on this device: if the server cannot store it, it goes back in the box.
      void streamProspectReply("respond", currentScenario, {
        salesRepMessage: last.content,
        clientMsgId: last.id,
        history: restored.slice(0, -1),
        giveBack: true,
      });
    }
    // streamProspectReply and waitForServerCheck are plain functions reading
    // the latest render; this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultAtFirstLoad, record.settled, record.reply, record.offsetMs, state, currentScenario]);

  const endSales = () => {
    setState("evaluating");
    // The local draft is dropped only once the server has the transcript
    // (in handleSubmit) — clearing it first lost the meeting if the tab
    // closed or the send failed mid-way.
    handleSubmit();
  };

  const handleSubmit = async () => {
    if (!application || !currentScenario) return;

    setIsSubmitting(true);
    // The stored result before this send: a 409 "already being checked"
    // waits for a result different from this one.
    const resultBeforeSend = storedSalesResult;
    try {
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();

      const isAutoMode = freshJob?.processing_mode === "auto";

      // Auto mode: the honest waiting screen goes up now and stays until the
      // next step is open (useStepAdvance).
      if (isAutoMode) advance.begin();

      // The candidate's own session — the trusted write path verifies this
      // is really this application's candidate before it records anything
      // (see submit-sales-simulation/index.ts + _shared/trustedResults.ts).
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const accessToken = freshSession?.access_token ?? session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired — sign in again to submit.");
      }

      // Grades the transcript and records the trusted result server-side —
      // this page no longer writes applications.notes/phase_ai_analysis
      // itself. Same messages shape (salesRep -> "user", prospect ->
      // "assistant") the old evaluate call always sent.
      const submitResponse = await fetch(SUBMIT_SALES_SIMULATION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          applicationId: id,
          stepId,
          scenario: currentScenario.scenario,
          prospectName: currentScenario.prospectName,
          prospectCompany: currentScenario.prospectCompany,
          productService: currentScenario.productService,
          jobTitle: application.jobs?.title || "",
          messages: messages.map(m => ({
            role: m.role === "salesRep" ? "user" : "assistant",
            content: m.content
          })),
          // The old-shape list, for a server that does not read the live
          // record yet; the record itself was sent as it happened.
          violations: integrity.violations,
        }),
      });

      const submitBody = await submitResponse.json().catch(() => null);
      if (!submitResponse.ok) {
        const outcome = gradingReplyOutcome(submitResponse.status, submitBody);
        if (outcome === "checking" || outcome === "on_file") {
          // We have the meeting: it is being checked (another tab, a retry
          // whose first answer was lost) or already on file. Wait for the
          // result and the next step; never an error, never a second send.
          waitForServerCheck(outcome === "on_file", resultBeforeSend);
          return;
        }
        throw new Error(submitBody?.error || "Failed to submit sales simulation");
      }

      // The server holds the result now; drop the local draft so a retake
      // never resumes inside the old transcript.
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
        invokeTriggerAvaAnalysis({ applicationId: id! }).catch((err) => {
          /* Ava analysis is triggered in the background and non-critical */
          console.error("[SalesSimulationPhase] trigger-ava-analysis failed:", err);
        });
        setState("completed");
      }
    } catch (error) {
      console.error("Error submitting sales simulation:", error);
      toast.error("That didn't send — please try again.");
      advance.cancel();
      setState("selling");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  // A send whose check crashed is sent again — once per visit; after that the
  // End button is there as usual.
  const [resendTriggered, setResendTriggered] = useState(false);
  const resentRef = useRef(false);
  useEffect(() => {
    if (!resendTriggered) return;
    setResendTriggered(false);
    if (resentRef.current) {
      setState("selling");
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
        console.error("[SalesSimulationPhase] trigger-ava-analysis failed:", err),
      );
      setState("completed");
    }
  };
  const finishCheckedSendRef = useRef(finishCheckedSend);
  finishCheckedSendRef.current = finishCheckedSend;

  const serverCheck = useServerCheck({
    storedResultKey: storedSalesResult,
    serverStatus: record.serverStatus,
    loadResultKey,
    onLanded: () => void finishCheckedSendRef.current(),
    onOwed: () => {
      setServerCheckWaiting(false);
      setResendTriggered(true);
    },
    onStale: () => queryClient.invalidateQueries({ queryKey: ["sales-simulation-application", id] }),
  });

  /** The waiting screen for a send the server is checking (or has on file).
   *  `baselineKey`: the stored result before this page's own send (a 409). */
  const waitForServerCheck = (alreadyOnFile = false, baselineKey?: string | null) => {
    setState("evaluating");
    if (application?.jobs?.processing_mode === "auto") {
      advance.begin();
      // The server holds the meeting: the usual one-minute hand-over to the
      // live card applies if the check runs long.
      advance.markSaved();
    }
    if (alreadyOnFile) {
      void finishCheckedSendRef.current();
      return;
    }
    setServerCheckWaiting(true);
    serverCheck.begin(baselineKey);
  };

  // The heartbeat says the server is checking this meeting while it is still
  // on screen here: End was pressed on another device.
  useEffect(() => {
    if (state !== "selling" && state !== "intro") return;
    if (!resumeDecidedRef.current || isSubmitting || serverCheck.waiting) return;
    if (serverConversationState(null, record.serverStatus) !== "checking") return;
    waitForServerCheck();
    // waitForServerCheck reads the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.serverStatus, state, isSubmitting, serverCheck.waiting]);

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

  const salesRepCount = messages.filter(m => m.role === "salesRep").length;
  const canEndSales = salesRepCount >= salesConfig.minMessages;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <TestPausedOverlay
        show={integrity.away && state === "selling"}
        body="Click back anywhere to pick the meeting back up. Leaving the test is recorded."
      />

      <EndEarlyDialog
        open={confirmEndOpen}
        onOpenChange={setConfirmEndOpen}
        what="meeting"
        answered={salesRepCount}
        usual={salesConfig.minMessages}
        unit="responses"
        onConfirm={endSales}
      />

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
        
        <div className="flex items-center gap-3">
          <ConnectionStatusIndicator />
          <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
            <TrendingUp className="h-4 w-4" />
            Sales Conversation
          </Badge>
        </div>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Client Meeting
          </CardTitle>
          <p className="text-muted-foreground">
            For: {application.jobs?.title}
          </p>
          <span className="ck-num block pt-2 text-xs font-medium text-muted-foreground">
            Step {journeyStep.index + 1} of {journeyStep.total} — {journeyStep.title}
          </span>
          <Progress value={journeyStep.progressPct} className="mt-1.5 h-1.5 bg-[var(--track)]" />
          {state === "selling" && <TestRulesReminder recorded={integrity.flagged} className="mt-3" />}
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "intro" && (
            <div className="space-y-6">
              {/* Meeting Briefing Card */}
              {currentScenario && (
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Your Meeting Briefing
                  </h3>
                  
                  <div className="grid gap-3">
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Meeting With</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.prospectName}</p>
                        <p className="text-xs text-muted-foreground">{currentScenario.prospectRole}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <Building className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Company</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.prospectCompany}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <TrendingUp className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">You're Selling</p>
                        <p className="text-sm font-medium text-foreground">{currentScenario.productService}</p>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-3 border-t border-primary/10">
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
                    <User className="h-4 w-4 mt-0.5 text-primary" />
                    <span><strong>Discovery Skills</strong> — How well you uncover the client's needs and challenges</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Building className="h-4 w-4 mt-0.5 text-primary" />
                    <span><strong>Objection Handling</strong> — How you respond when the client pushes back or raises concerns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 mt-0.5 text-primary" />
                    <span><strong>Value Proposition</strong> — How clearly you communicate the benefits of your solution</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary" />
                    <span><strong>Rapport Building</strong> — How naturally you connect with the client</span>
                  </li>
                </ul>
                
                <p className="text-muted-foreground text-xs mt-4 italic">
                  Aim for about {salesConfig.minMessages} responses before ending the meeting. Every message is
                  saved as you send it, and you can end sooner if you need to.
                </p>
              </div>

              <TestRulesCard accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} />

              <div className="space-y-2 text-center">
                <Button
                  onClick={startSales}
                  size="lg"
                  className="w-full gap-2 bg-primary hover:bg-primary/90 sm:w-auto"
                  disabled={!currentScenario || !rulesAccepted || !resumeDecided}
                >
                  {resumeDecided ? <TrendingUp className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                  {resumeDecided ? "Start Meeting" : "Getting things ready…"}
                </Button>
                {!rulesAccepted && <p className="text-xs text-muted-foreground">Tick the box above to start.</p>}
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
                            ? "bg-primary text-primary-foreground"
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
                    disabled={isTyping}
                    rows={3}
                    className="resize-none min-h-[80px] bg-background/50"
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={!inputValue.trim() || isTyping} 
                    className="h-[80px] px-4 bg-primary hover:bg-primary/90"
                    aria-label="Send message"
                    title="Send message"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              )}

              {/* End Sales Button — from the first response on; before the usual
                  number it asks first ("End now — we'll send what you have"). */}
              {state === "selling" && salesRepCount > 0 && (
                <div className="text-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => (canEndSales ? endSales() : setConfirmEndOpen(true))}
                    disabled={isTyping}
                  >
                    End Call & Submit
                  </Button>
                </div>
              )}

              {/* Sending State */}
              {state === "evaluating" && (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
                  <p className="text-foreground font-medium">
                    {serverCheckWaiting ? "We have your meeting" : "Sending your meeting"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {serverCheckWaiting
                      ? "It's being checked now. This page moves on by itself when it's done."
                      : "Keep this page open for a moment."}
                  </p>
                </div>
              )}

              {/* Completed State (manual-review jobs) — no timed redirect */}
              {state === "completed" && (
                <div className="text-center py-8 space-y-3">
                  <CheckCircle className="h-12 w-12 mx-auto text-success" />
                  <p className="text-foreground font-medium">Sent</p>
                  <p className="text-sm text-muted-foreground">
                    Your meeting is saved. The hiring team will get back to you — you can close this page.
                  </p>
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
