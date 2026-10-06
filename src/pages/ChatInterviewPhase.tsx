import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";

import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConversationDraft } from "@/hooks/useConversationDraft";
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
  Loader2,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
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
import { useShowContinueOnComputer } from "@/components/candidate/continueOnComputerContext";
import { ComputerRequiredError, isComputerRequired, refusedDeviceKind, throwIfComputerRequired, withDeviceKind } from "@/lib/deviceGate";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { AvaSeal } from "@/components/ava/AvaSeal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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
    experience_level: string | null;
    required_wpm: number | null;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: unknown[] | null;
    quiz_questions: unknown[] | null;
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
  
  const [state, setState] = useState<"intro" | "interviewing" | "evaluating" | "completed">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  // The transcript used to live only in this component, so a refresh or a
  // phone call wiped it mid-interview.
  const { clear: clearConversationDraft } = useConversationDraft<Message>(
    id && stepId ? `${id}:${stepId}:chat-interview` : null,
    messages,
    setMessages,
    state === "interviewing"
  );
  const [elapsedTime, setElapsedTime] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [autoEndTriggered, setAutoEndTriggered] = useState(false);
  // The rules card's "I understand" — Start stays disabled until it is ticked.
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  
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
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["chat-interview-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, description, requirements, responsibilities, benefits, skills_required, location, job_type, experience_level, required_wpm, processing_mode, passing_score, workflow_steps, quiz_questions)")
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

  // Copy, paste, switching away and screenshots: the one shared hook
  // (useTestIntegrity), live to the server while the interview runs. This
  // page's own copy logged one switch twice (window blur AND
  // visibilitychange) and could not say how long anyone was away — the
  // owner's three "Window lost focus" flags on 2026-10-05 could not be judged.
  const integrity = useTestIntegrity({ applicationId: id, stepId, active: state === "interviewing" });
  // A 400 computer_required from ai-chat-interview hands the step to
  // "Continue on your computer" (CandidateStepGate), never an error toast.
  const showContinueOnComputer = useShowContinueOnComputer();

  // Format elapsed time for display
  const getDuration = useCallback(() => {
    const mins = Math.floor(elapsedTime / 60);
    const secs = elapsedTime % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [elapsedTime]);

  // Extract candidate context from application notes
  const buildCandidateContext = useCallback(() => {
    if (!application) return undefined;

    const notes = parseApplicationNotes(application.notes);
    const context: {
      completedPhases: string[];
      applicationAnswers?: Array<{ question: string; answer: string }>;
      resumeAnalysis?: unknown;
      quizScore?: number;
      quizSummary?: string;
      typingTestResult?: { wpm?: number; accuracy?: number };
      chatSimulationResult?: { score?: number; summary?: string };
      salesSimulationResult?: { score?: number; summary?: string };
      videoIntroUrl?: string;
    } = {
      completedPhases: [],
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
      context.quizSummary = notes.quizResult.correct != null
        ? `${notes.quizResult.correct}/${notes.quizResult.total} correct`
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

    // Extract chat simulation results. The chat practice stores what to
    // improve, not a recommendation (that field never existed, so this
    // always read "Completed"). The server builds its own copy of all of
    // this from the record and ignores this one; it is sent only for a
    // server on the previous build.
    if (notes.chatSimulationResult) {
      const improvements = (notes.chatSimulationResult as { improvements?: unknown }).improvements;
      const improvementText = Array.isArray(improvements)
        ? improvements.filter((item): item is string => typeof item === "string" && item.trim().length > 0).join("; ")
        : "";
      context.chatSimulationResult = {
        score: notes.chatSimulationResult.score,
        summary: improvementText || 'Completed',
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
  }, [application]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // After the interview is sent: the waiting screen, then "You've finished
  // every step" (or the next step's button) the moment the row says so.
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
      return notes.chatInterviewResult || null;
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
  // An interview the server is already checking (End was pressed here before
  // a reload, or on another device) is waited on, never put back as a live
  // chat the server no longer records (useServerCheck).
  const storedInterviewResult = useMemo(
    () => storedResultKey(parseApplicationNotes(application?.notes).chatInterviewResult),
    [application?.notes],
  );
  // The baseline of a wait this page did not start with its own send (the
  // heartbeat says End was pressed elsewhere, or a reload while it is being
  // checked): the result as first read, never the one cached since, which
  // the page's realtime refresh has usually already replaced by the time the
  // heartbeat says "completed" (useResultKeyAtFirstLoad).
  const loadResultKey = useResultKeyAtFirstLoad(isFetchedAfterMount && !!application, storedInterviewResult);
  const [serverCheckWaiting, setServerCheckWaiting] = useState(false);

  const session = useAssessmentSession({
    applicationId: id,
    stepId,
    enabled: resultAtFirstLoad === false,
    // While the server checks a send this page did not see through, the
    // heartbeat goes on: it is how the page learns that the check failed.
    live: state === "intro" || state === "interviewing" || serverCheckWaiting,
    clientProgress: { screen: state === "intro" ? "intro" : "conversation" },
  });

  /**
   * One request for the interviewer's next message, streamed in as it arrives.
   *
   * It carries the applicant's own JWT, the application and step, and an id
   * per message (clientMsgId), so the server keeps every turn as it happens
   * (docs/ASSESSMENT-RECORD.md §5.1): a closed tab no longer loses the
   * interview, and a retried message is stored once. The full `messages`
   * history still rides along for a server on the previous build.
   *
   * When the server could not store the answer (503 `turn_not_saved`) it sent
   * no reply: the answer goes once more under the same id, and if that fails
   * too, `giveBack` takes the bubble off and puts the text back in the reply
   * box. An answer on screen is never one nobody will reply to.
   */
  const streamChat = async (
    mode: "start" | "respond",
    userMessage?: string,
    clientMsgId?: string,
    history: Message[] = messages,
    giveBack = false,
  ) => {
    if (!application?.jobs) return;
    const job = application.jobs;
    
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
      // So a lead role is interviewed as one, and typing is judged against
      // this job's own bar. The server reads the job itself when it can.
      experienceLevel: application.jobs.experience_level || undefined,
      requiredWpm: typeof application.jobs.required_wpm === "number" ? application.jobs.required_wpm : undefined,
    };
    
    try {
      const request = async () =>
        fetch(CHAT_URL, {
          method: "POST",
          headers: await assessmentRequestHeaders(),
          body: JSON.stringify(withDeviceKind({
            mode,
            jobTitle: job.title,
            jobDescription: job.description || "",
            jobDetails,
            candidateName: application.profiles?.full_name || "Candidate",
            candidateContext,
            messages: history.map(m => ({ role: m.role, content: m.content })),
            userMessage,
            applicationId: id,
            stepId,
            clientMsgId,
            clientAt: new Date().toISOString(),
          })),
        });

      let response = await request();
      for (let resent = false; !response.ok; resent = true) {
        const errorData = await response.json().catch(() => null);
        throwIfComputerRequired(response.status, errorData);
        if (!isTurnNotSaved(response.status, errorData)) {
          throw new Error(errorData?.error || "Failed to get interview response");
        }
        if (resent) throw new TurnNotSavedError();
        // Not stored, no reply: once more under the same id (stored once).
        await new Promise((resolve) => setTimeout(resolve, TURN_RESEND_DELAY_MS));
        response = await request();
      }

      // An interview the server already holds comes back as its stored turns
      // rather than a second greeting (another tab or device started it).
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        const turns = turnsFromJson(await response.json().catch(() => null));
        if (!turns || turns.length === 0) throw new Error("No reply in the response");
        restoreFromMessages(turnsToMessages(turns, { candidate: "user", other: "assistant" }, session.offsetMs) as Message[]);
        return;
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
      if (error instanceof ComputerRequiredError && showContinueOnComputer(error.deviceKind)) return;
      if (error instanceof TurnNotSavedError && mode === "respond" && giveBack && clientMsgId && userMessage) {
        // The server has not got this answer and will not reply to it: take
        // the bubble back off and give the text back to send again.
        setMessages((prev) => prev.filter((m) => m.id !== clientMsgId));
        setInputValue((current) => restoreUnsentText(current, userMessage));
        toast.error("Your answer didn't save — it's back in the box. Send it again.");
        return;
      }
      // Candidates get our sentence, not the edge function's raw error string.
      console.error("Chat interview message failed:", error);
      toast.error("That message didn't send — please try again.");
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

    // The message's id is also the server's key for it, so a retry is stored once.
    const clientMsgId = newClientId();
    const userMessage: Message = {
      id: clientMsgId,
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputValue.trim();
    setInputValue("");
    
    await streamChat("respond", messageToSend, clientMsgId, messages, true);
  };

  /** Puts a saved interview back on screen with its clock and question count. */
  const restoreFromMessages = (restored: Message[]) => {
    setMessages(restored);
    // The clock counts from the interviewer's first message, as it did live.
    setStartTime(restored[0]?.timestamp ?? new Date());
    setQuestionCount(restored.filter((m) => m.role === "assistant" && m.content.includes("?")).length);
  };

  // A reload (or another device) resumes the interview instead of showing the
  // intro and asking for a new greeting on top of it. The server's stored
  // turns win; without them (a server on the previous build, or the record
  // unreachable) this device's own draft is used. A last answer nobody replied
  // to yet (the tab closed while the reply was coming) is asked for again
  // under its own id. An interview the server is already checking gets the
  // waiting screen instead, and one whose check failed is sent again.
  const resumeDecidedRef = useRef(false);
  const [resumeDecided, setResumeDecided] = useState(false);
  useEffect(() => {
    if (resumeDecidedRef.current || resultAtFirstLoad !== false || !session.settled || state !== "intro") return;
    if (!application?.jobs) return;
    resumeDecidedRef.current = true;
    setResumeDecided(true);
    const turns = session.reply?.turns ?? [];
    const restored: Message[] =
      turns.length > 0
        ? (turnsToMessages(turns, { candidate: "user", other: "assistant" }, session.offsetMs) as Message[])
        : messages;
    const where = serverConversationState(session.reply, session.serverStatus);
    if (where === "checking" || where === "done") {
      if (restored.length > 0) restoreFromMessages(restored);
      waitForServerCheck(where === "done");
      return;
    }
    if (restored.length === 0) return;
    restoreFromMessages(restored);
    setRulesAccepted(true);
    setState("interviewing");
    if (where === "owed") {
      // Sent before, and its check crashed: the result is still owed.
      setResendTriggered(true);
      return;
    }
    toast.info("Picked up where you left off", { description: "Your answers are saved as you send them." });

    const pending = turns.length > 0 ? unansweredCandidateTurn(turns) : null;
    const last = restored[restored.length - 1];
    if (pending) {
      void streamChat("respond", pending.content, pending.client_msg_id ?? undefined, restored.slice(0, -1));
    } else if (turns.length === 0 && last?.role === "user") {
      // Only on this device: if the server cannot store it, it goes back in the box.
      void streamChat("respond", last.content, last.id, restored.slice(0, -1), true);
    }
    // streamChat, restoreFromMessages and waitForServerCheck are plain
    // functions reading the latest render; this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultAtFirstLoad, session.settled, session.reply, session.offsetMs, state, application?.jobs]);

  const endInterview = () => {
    setState("evaluating");
    // The local draft is dropped only once the server has the transcript
    // (in submitInterview) — clearing it first lost the interview if the tab
    // closed or the send failed mid-way.
    void submitInterview("manual");
  };

  /**
   * The ONE way an interview is sent, for both endings: the closing message
   * the interviewer writes ("auto_end") and the candidate's own End button
   * ("manual"). They used to be two copies that disagreed — the auto-end copy
   * asked for scoring with no decision and no step id, so on 2026-10-05 the
   * owner's interview never reached Decision, and it never refreshed the
   * overview, which went on saying "Up next · Begin Interview".
   *
   * The eval score and the notes.chatInterviewResult write are ONE trusted,
   * server-side call — never a client-computed evaluation relayed into a
   * plain .update(), never a client-decided phase advance. See
   * docs/TRUSTED-RESULTS.md.
   */
  const submitInterview = async (path: "auto_end" | "manual") => {
    if (!application) return;

    setIsSubmitting(true);
    // The stored result before this send: a 409 "already being checked"
    // waits for a result different from this one.
    const resultBeforeSend = storedInterviewResult;
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();

      const isAutoMode = freshJob?.processing_mode === "auto";

      // Auto mode: the honest waiting screen goes up now and stays until the
      // row says what comes next (useStepAdvance).
      if (isAutoMode) advance.begin();

      const candidateContext = buildCandidateContext();
      // Each ending keeps the duration shape the server's result builder has
      // always received from it: "m:ss" for auto_end, seconds for manual.
      const duration =
        path === "auto_end"
          ? getDuration()
          : startTime
            ? Math.floor((new Date().getTime() - startTime.getTime()) / 1000)
            : 0;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your session expired — please sign in again.");
      }

      const submitResponse = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(withDeviceKind({
          mode: "submit",
          applicationId: id,
          stepId,
          path,
          jobTitle: application.jobs?.title || "",
          jobDescription: application.jobs?.description || "",
          candidateName: application.profiles?.full_name || "Candidate",
          candidateContext,
          messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
          duration,
          questionCount,
          // The old-shape list, for a server that does not read the live
          // record yet; the record itself was sent as it happened.
          violations: integrity.violations,
        })),
      });

      if (!submitResponse.ok) {
        const errBody = await submitResponse.json().catch(() => ({}));
        if (isComputerRequired(submitResponse.status, errBody)) {
          advance.cancel();
          if (showContinueOnComputer(refusedDeviceKind(errBody))) return;
        }
        const outcome = gradingReplyOutcome(submitResponse.status, errBody);
        if (outcome === "checking" || outcome === "on_file") {
          // We have the interview: it is being checked (another tab, a retry
          // whose first answer was lost, the auto-end and End at once) or
          // already on file. Wait for the result and the next step; never an
          // error, never a second send.
          waitForServerCheck(outcome === "on_file", resultBeforeSend);
          return;
        }
        throw new Error(errBody.error || "Failed to submit interview");
      }

      // The server holds the interview now.
      clearConversationDraft();
      integrity.finish();
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

      if (isAutoMode) {
        // Same call for both endings: a decision, relative to THIS step.
        // recordStepResult (called by the submit above) never advances
        // applications.phase for chat_interview — see StepAdvanceMode's doc
        // comment on RecordStepResultInput in trustedResults.ts — so the
        // step id is passed explicitly rather than re-read from the row.
        // invokeTriggerAvaAnalysis never throws.
        advance.markSaved();
        const reply = await invokeTriggerAvaAnalysis({
          applicationId: id!,
          autopilotDecision: true,
          currentPhaseId: stepId,
        });
        advance.settle(reply);
      } else {
        // Manual mode - trigger analysis in background
        invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => console.error("[ChatInterviewPhase] AVA analysis trigger failed:", err));

        setState("completed");
      }
    } catch (error) {
      console.error("Error submitting interview:", error);
      toast.error("That didn't send — please try again.");
      advance.cancel();
      setState("interviewing");
    } finally {
      setIsSubmitting(false);
    }
  };

  // The interviewer's closing message ends the interview by itself (see
  // streamChat). Read the latest submitInterview through a ref so the
  // transcript it sends includes that closing message.
  const submitInterviewRef = useRef(submitInterview);
  submitInterviewRef.current = submitInterview;
  useEffect(() => {
    if (autoEndTriggered && state === "interviewing") {
      // Reset first, so a re-render can never send it twice.
      setAutoEndTriggered(false);
      setState("evaluating");
      void submitInterviewRef.current("auto_end");
    }
  }, [autoEndTriggered, state]);

  // A send whose check crashed is sent again — once per visit; after that the
  // End button is there as usual.
  const [resendTriggered, setResendTriggered] = useState(false);
  const resentRef = useRef(false);
  useEffect(() => {
    if (!resendTriggered) return;
    setResendTriggered(false);
    if (resentRef.current) {
      setState("interviewing");
      return;
    }
    resentRef.current = true;
    setState("evaluating");
    void submitInterviewRef.current("manual");
  }, [resendTriggered]);

  /** The server has the result of a send this page did not see through. */
  const finishCheckedSend = async () => {
    setServerCheckWaiting(false);
    clearConversationDraft();
    integrity.finish();
    queryClient.invalidateQueries({ queryKey: ["applications"] });
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
        console.error("[ChatInterviewPhase] AVA analysis trigger failed:", err),
      );
      setState("completed");
    }
  };
  const finishCheckedSendRef = useRef(finishCheckedSend);
  finishCheckedSendRef.current = finishCheckedSend;

  const serverCheck = useServerCheck({
    storedResultKey: storedInterviewResult,
    serverStatus: session.serverStatus,
    loadResultKey,
    onLanded: () => void finishCheckedSendRef.current(),
    onOwed: () => {
      setServerCheckWaiting(false);
      setResendTriggered(true);
    },
    onStale: () => queryClient.invalidateQueries({ queryKey: ["chat-interview-application", id] }),
  });

  /** The waiting screen for a send the server is checking (or has on file).
   *  `baselineKey`: the stored result before this page's own send (a 409). */
  const waitForServerCheck = (alreadyOnFile = false, baselineKey?: string | null) => {
    setState("evaluating");
    if (application?.jobs?.processing_mode === "auto") {
      advance.begin();
      // The server holds the interview: the usual one-minute hand-over to the
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

  // The heartbeat says the server is checking this interview while it is still
  // on screen here: End was pressed on another device.
  useEffect(() => {
    if (state !== "interviewing" && state !== "intro") return;
    if (!resumeDecidedRef.current || isSubmitting || serverCheck.waiting) return;
    if (serverConversationState(null, session.serverStatus) !== "checking") return;
    waitForServerCheck();
    // waitForServerCheck reads the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.serverStatus, state, isSubmitting, serverCheck.waiting]);

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

  // Sent in this visit: the waiting screen, then "You've finished every
  // step" (or the next step's button).
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
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Done before this visit began (a bookmark, the back button): say where
  // things stand, never a dead end.
  if (resultAtFirstLoad && existingResult && state === "intro") {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName={journeyStep.title}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  const minQuestions = 5;
  const candidateResponseCount = messages.filter((message) => message.role === "user").length;
  const canEndInterview = questionCount >= minQuestions || candidateResponseCount >= minQuestions;

  return (
    <div className="ck-page relative mx-auto max-w-3xl space-y-6">
      {/* A quiet pause while focus is in another window, not an alarm */}
      <TestPausedOverlay
        show={integrity.away && state === "interviewing"}
        title="Interview paused"
        body="Click anywhere to pick back up. Leaving the interview is recorded."
      />

      <EndEarlyDialog
        open={confirmEndOpen}
        onOpenChange={setConfirmEndOpen}
        what="interview"
        answered={candidateResponseCount}
        usual={minQuestions}
        unit="answers"
        onConfirm={endInterview}
      />

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

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            {state === "intro"
              ? "Take your time — you can't break anything. About 10–15 minutes."
              : state === "interviewing"
                ? "Answer naturally, the way you would in person — there's no rush."
                : "Your answers are saved."}
          </p>
        </div>

        {state === "interviewing" && <TestRulesReminder recorded={integrity.flagged} />}
      </header>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {state === "intro" && (
            <div className="ck-reveal space-y-8">
              <div className="space-y-4 rounded-xl bg-muted/30 p-6">
                <h3 className="font-display text-lg text-foreground">How this works</h3>
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
                  <li className="flex items-start gap-3">
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Every answer is saved as you send it, and you can end the interview whenever you need to</span>
                  </li>
                </ul>
              </div>

              <TestRulesCard accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} />

              <div className="space-y-2">
                <Button
                  onClick={startInterview}
                  disabled={!rulesAccepted || !resumeDecided}
                  size="lg"
                  className="w-full gap-2 sm:w-auto"
                >
                  {resumeDecided ? <MessageSquare className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                  {resumeDecided ? "Start the interview" : "Getting your interview ready…"}
                </Button>
                {!rulesAccepted && (
                  <p className="text-xs text-muted-foreground">Tick the box above to start.</p>
                )}
              </div>
            </div>
          )}

          {(state === "interviewing" || state === "evaluating" || state === "completed") && (
            <>
              {/* Interview Info - Duration Only (not for an interview this
                  visit only watched being checked: it never ran here) */}
              {!serverCheckWaiting && (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/30 p-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="ck-num text-sm font-medium text-foreground">{getDuration()}</span>
                </div>
              )}

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

              {/* End Interview — quiet, never competing with the send action.
                  From the first answer on; before the usual five it asks first
                  ("End now — we'll send what you have"). */}
              {state === "interviewing" && candidateResponseCount > 0 && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => (canEndInterview ? endInterview() : setConfirmEndOpen(true))}
                    disabled={isTyping}
                    className="text-muted-foreground"
                  >
                    End the interview & send my answers
                  </Button>
                </div>
              )}

              {/* Sending — a held moment, not a bare spinner. In auto mode the
                  full-screen waiting screen takes over as soon as the send starts. */}
              {state === "evaluating" && (
                <div className="ck-reveal flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <span className="ck-seal-breathe">
                    <AvaSeal size={32} />
                  </span>
                  <p className="font-display text-lg text-foreground">
                    {serverCheckWaiting ? "We have your interview" : "Sending your interview"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {serverCheckWaiting
                      ? "It's being checked now. This page moves on by itself when it's done."
                      : "Keep this page open for a moment."}
                  </p>
                </div>
              )}

              {/* Completed (manual-review jobs) — a small seal-press payoff,
                  what happens next, and the way back. No timed redirect. */}
              {state === "completed" && (
                <div className="ck-reveal flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <AvaSeal size={40} tilt={-3} className="ck-seal-press" />
                  <p className="font-display text-lg text-foreground">Interview sent</p>
                  <p className="text-sm text-muted-foreground">
                    Your answers are saved. The hiring team will get back to you — you can close this page.
                  </p>
                  <Button onClick={() => navigate(`/applications/${id}`)} className="mt-2 w-full gap-2 sm:w-auto">
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
