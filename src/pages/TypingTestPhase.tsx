import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  functionErrorReply,
  gradingReplyOutcome,
  keepalivePost,
  serverConversationState,
  storedResultKey,
  useAssessmentSession,
  useResultKeyAtFirstLoad,
  useServerCheck,
} from "@/hooks/useAssessmentSession";
import { useTestIntegrity } from "@/hooks/useTestIntegrity";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
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
  CheckCircle,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import { GlyphClock } from "@/components/candidate/glyphs";
import { toast } from "sonner";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { NextStepCard, StepAdvanceScreen } from "@/components/candidate/NextStepCard";
import { TestPausedOverlay, TestRulesCard, TestRulesReminder } from "@/components/candidate/TestRulesCard";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";
import { useShowContinueOnComputer } from "@/components/candidate/continueOnComputerContext";
import { isComputerRequired, refusedDeviceKind, withDeviceKind } from "@/lib/deviceGate";

// The candidate passage is now chosen server-side by submit-typing-test's
// "start" action (supabase/functions/submit-typing-test/calculateResults.ts)
// and echoed back here — not picked client-side any more, so the server
// always grades against the exact same text the candidate was shown. The
// moment typing actually stops, "complete" stamps a server-side end time so
// elapsed time is pinned to that instant, not to whenever "submit" is later
// called. See docs/TRUSTED-RESULTS.md.

interface WorkflowStep {
  id: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
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
    required_wpm: number | null;
    workflow_steps?: WorkflowStep[] | null;
    /** Its own column, not part of workflow_steps. The submit path read this
     *  to compute hasQuiz, but the select never fetched it — so hasQuiz was
     *  always false there, not just in the header. */
    quiz_questions?: unknown[] | null;
  } | null;
}

export default function TypingTestPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [testState, setTestState] = useState<"intro" | "testing" | "completed">("intro");
  const [typedText, setTypedText] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [results, setResults] = useState<{
    wpm: number;
    accuracy: number;
    score: number;
    passed: boolean;
  } | null>(null);
  // The rules card's "I understand" — Start stays disabled until it is ticked.
  // A "Try again" keeps it: the rules have not changed.
  const [rulesAccepted, setRulesAccepted] = useState(false);
  // How typing stopped, for the server's record of this run: the clock ran
  // out, or the applicant pressed "Finish early".
  const endReasonRef = useRef<"time_up" | "finished_early">("time_up");
  // The server is already checking this test (409 already_checking: another
  // tab, or a retry whose first answer was lost): the page waits for the
  // result instead of offering a second send.
  const [serverCheckWaiting, setServerCheckWaiting] = useState(false);
  // The server says this step is finished (its result is on file and the
  // hiring team has not handed it back) in a manual-mode job: "saved", and
  // no Start (see the resume decision below).
  const [finishedOnServer, setFinishedOnServer] = useState(false);
  // What a "start" refused with 409 leads to; set further down, once the
  // waiting screen and the advance exist. A 400 computer_required hands the
  // step to "Continue on your computer" (CandidateStepGate).
  const showContinueOnComputer = useShowContinueOnComputer();
  const startRefusedRef = useRef<{
    finished: () => void;
    checking: () => void;
    computer: (kind: "phone" | "tablet" | null) => boolean;
  }>({
    finished: () => {},
    checking: () => {},
    computer: () => false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typedTextRef = useRef<string>("");
  const startTimeRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Copy, paste, switching away and screenshots: the one shared hook
  // (useTestIntegrity), live to the server while the clock runs. This page's
  // own copy counted one paste twice (the textarea and its container both
  // handled it), saw tab switches only, and "Try again" wiped the record.
  const integrity = useTestIntegrity({ applicationId: id, stepId, active: testState === "testing" });

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["typing-test-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, required_wpm, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      
      // Parse workflow_steps from JSON
      const parsed = {
        ...data,
        jobs: data.jobs ? {
          ...data.jobs,
          workflow_steps: Array.isArray(data.jobs.workflow_steps) 
            ? data.jobs.workflow_steps as unknown as WorkflowStep[]
            : null
        } : null
      };
      
      return parsed as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`typing-test-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["typing-test-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // After "Submit results": the waiting screen, then "Start <next step>" the
  // moment the row says the next step is open (see useStepAdvance).
  const advance = useStepAdvance({ applicationId: id, stepId, job: application?.jobs });

  const calculateResults = useCallback(() => {
    const currentTypedText = typedTextRef.current;
    const currentStartTime = startTimeRef.current;

    // Calculate elapsed time in minutes
    const elapsedMs = currentStartTime ? Date.now() - currentStartTime : 60000;
    const elapsedMinutes = Math.max(elapsedMs / 60000, 0.1); // At least 0.1 minutes to avoid division issues

    // Calculate Gross WPM (standard: 5 characters = 1 word)
    const charCount = currentTypedText.length;
    const grossWpm = Math.round((charCount / 5) / elapsedMinutes);

    // Word-by-word accuracy comparison (more forgiving than character position matching)
    const typedWords = currentTypedText.trim().split(/\s+/).filter(w => w.length > 0);
    const targetWords = targetText.trim().split(/\s+/).filter(w => w.length > 0);

    let correctWords = 0;
    for (let i = 0; i < typedWords.length; i++) {
      if (i < targetWords.length && typedWords[i] === targetWords[i]) {
        correctWords++;
      }
    }

    // Accuracy based on correctly typed words
    const accuracy = typedWords.length > 0
      ? Math.round((correctWords / typedWords.length) * 100)
      : 0;

    // Calculate overall score: Gross WPM weighted by accuracy
    // Score formula: (grossWpm / requiredWpm * 100) * (accuracy / 100)
    // The employer sets the required WPM (default 35)
    const requiredWpm = application?.jobs?.required_wpm || 35;
    const speedScore = Math.min(100, (grossWpm / requiredWpm) * 100);
    const score = Math.round(speedScore * (accuracy / 100));

    // NOTE: local 'passed' is for UI display ONLY. Backend trigger-ava-analysis is the SINGLE SOURCE OF TRUTH
    // for the official pass/fail decision via weighted ai_score calculation
    const passed = false; // Always false locally - backend decides

    return { wpm: grossWpm, accuracy, score, passed };
  }, [targetText, application]);

  // Stamps the SERVER-recorded end-of-typing instant — supabase/functions/
  // submit-typing-test's "complete" action. This must fire the moment
  // typing actually stops, not later when "Submit results" is clicked:
  // submit-typing-test's own "submit" step grades off ended_at - started_at
  // when this ran, so any time the candidate spends reading the "Nice
  // work" screen before pressing Submit never inflates the graded elapsed
  // time. Fire-and-forget (best effort) — "submit" falls back to grading
  // off its own request time if this never lands, matching the old
  // (imperfect but pre-existing) behavior rather than blocking the UI.
  //
  // It also carries what was typed and how typing stopped (wave 2): the
  // server stores that text as this run's snapshot and grades it, so if the
  // tab closes between the clock stopping and "Submit results" the hiring
  // team still has it. A server on the previous build ignores both fields.
  const completeTest = useCallback(async () => {
    if (!id || !stepId) return;
    try {
      const { error } = await supabase.functions.invoke("submit-typing-test", {
        body: withDeviceKind({
          action: "complete",
          applicationId: id,
          stepId,
          typedText: typedTextRef.current,
          reason: endReasonRef.current,
        }),
      });
      if (error) throw error;
    } catch (err) {
      console.error("[TypingTestPhase] Failed to record server-side test completion:", err);
    }
  }, [id, stepId]);

  const handleTestComplete = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const calculatedResults = calculateResults();
    setResults(calculatedResults);
    setTestState("completed");
    // Fired alongside the UI transition, not awaited — the results screen
    // should render instantly, but the server-side "end of typing" stamp
    // should also happen as close to this instant as possible.
    void completeTest();
  }, [calculateResults, completeTest]);

  // Timer countdown
  useEffect(() => {
    if (testState === "testing" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            endReasonRef.current = "time_up";
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
    // `timeLeft` is deliberately not a dep: setTimeLeft above already reads
    // the live value through the updater-function form specifically so this
    // effect doesn't need to re-run every tick (that would tear down and
    // restart the interval every second instead of letting it run).
    // handleTestComplete IS added — safe, since calling it sets testState to
    // "completed", which is this same effect's other guard, so a re-fire
    // after that can't start a second interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testState, handleTestComplete]);

  // While typing, what is typed so far goes to the server as it goes
  // ("snapshot": the server keeps one per 5 s of the run), at once when the
  // page is hidden (a phone can discard a tab in the background without any
  // pagehide), and with a keepalive request when the page closes. So the
  // hiring team sees how far the applicant got whether or not the tab ever
  // comes back.
  //
  // A real close also ends the run ("complete", which freezes the clock and
  // keeps that text as the run's). A pagehide into the back/forward cache
  // does not: the page may come back and carry on, and "complete" would have
  // frozen the run at that moment.
  useEffect(() => {
    if (testState !== "testing" || !id || !stepId) return;
    const path = "/functions/v1/submit-typing-test";
    let lastSent: string | null = null;
    let snapshotsOff = false;
    const snapshotBody = () => withDeviceKind({ action: "snapshot", applicationId: id, stepId, typedText: typedTextRef.current });
    const sendSnapshot = (viaKeepalive: boolean) => {
      const text = typedTextRef.current;
      if (snapshotsOff || text === lastSent || text.length === 0) return;
      lastSent = text;
      if (viaKeepalive) {
        keepalivePost(path, snapshotBody());
        return;
      }
      void supabase.functions
        .invoke("submit-typing-test", { body: snapshotBody() })
        .then(({ error }) => {
          // A server on the previous build answers "Unknown action" (400):
          // stop asking for this run. Anything else is tried again next time.
          const status = (error as { context?: { status?: number } } | null)?.context?.status;
          if (status === 400 || status === 404) snapshotsOff = true;
          else if (error) lastSent = null;
        })
        .catch(() => {
          lastSent = null;
        });
    };
    const interval = window.setInterval(() => sendSnapshot(false), 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendSnapshot(true);
    };
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        sendSnapshot(true);
        return;
      }
      keepalivePost(path, withDeviceKind({
        action: "complete",
        applicationId: id,
        stepId,
        typedText: typedTextRef.current,
      }));
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [testState, id, stepId]);

  // Records a SERVER-clock start time for this (application, step) and
  // fetches the passage to type — supabase/functions/submit-typing-test's
  // "start" action. The client no longer picks its own passage: the server
  // is the one source of truth for what text a submission is graded
  // against, and the elapsed time "submit" measures is always this
  // started_at, never anything the browser reports. Called fresh every
  // time the test truly begins, including a "Try again" retry.
  const startTest = useCallback(async () => {
    if (!id || !stepId) return;
    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-typing-test", {
        body: withDeviceKind({ action: "start", applicationId: id, stepId }),
      });
      if (error) {
        // 409: the server already has this test, so a new run would only be
        // thrown away. Its result is on file and nobody handed it back
        // (step_finished), or a send is being checked right now
        // (already_checking).
        const refused = await functionErrorReply(error);
        // 400 computer_required: the server reads this device as a phone or
        // a tablet (the page's own gate is the main line, this the backstop):
        // "Continue on your computer", never an error.
        if (isComputerRequired(refused?.status, refused?.body) && startRefusedRef.current.computer(refusedDeviceKind(refused?.body))) {
          return;
        }
        const code = refused?.status === 409 ? (refused.body as { code?: unknown } | null)?.code : null;
        if (code === "step_finished") {
          startRefusedRef.current.finished();
          return;
        }
        if (code === "already_checking") {
          startRefusedRef.current.checking();
          return;
        }
      }
      if (error || !data?.targetText) {
        throw error || new Error("No passage returned");
      }
      setTargetText(data.targetText as string);
      setTestState("testing");
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      setTypedText("");
      typedTextRef.current = "";
      setTimeLeft(60);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (err) {
      console.error("[TypingTestPhase] Failed to start typing test:", err);
      toast.error("Couldn't start the typing test — please try again.");
    } finally {
      setIsStarting(false);
    }
  }, [id, stepId]);

  /** The result is on file (this send, or one the server already had): the
   *  next step in auto mode, "sent" in manual mode. */
  const afterTypingSaved = async (isAutoMode: boolean) => {
    setServerCheckWaiting(false);
    integrity.finish();

    // Invalidate candidate applications to update the tile status
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
    queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

    if (isAutoMode) {
      // The result is stored. Which step opens next is the server's call
      // (it moves `phase`); the screen follows the row, and the trigger's
      // reply only speeds that up. invokeTriggerAvaAnalysis never throws.
      advance.markSaved();
      const reply = await invokeTriggerAvaAnalysis({
        applicationId: id!,
        autopilotDecision: true,
        currentPhaseId: stepId,
      });
      advance.settle(reply);
    } else {
      // Manual mode - NEVER auto-advance or reject. Employer controls.
      invokeTriggerAvaAnalysis({
        applicationId: id!,
        autopilotDecision: false,
        currentPhaseId: stepId,
      }).catch(err => console.error("[TypingTestPhase] AVA analysis trigger failed:", err));

      toast.success("Typing test sent", {
        description: "Your result is saved. The hiring team will review it and get back to you.",
      });
      // The page moves by itself after a send: replace, so Back from the
      // application page never lands on this sent step (docs/SHORT-JOB-LINKS.md).
      navigate(`/applications/${id}`, { replace: true });
    }
  };
  const afterTypingSavedRef = useRef(afterTypingSaved);
  afterTypingSavedRef.current = afterTypingSaved;

  const handleSubmit = async () => {
    if (!results || !application) return;

    setIsSubmitting(true);
    // The stored result before this send: a 409 "already being checked"
    // waits for a result different from this one.
    const resultBeforeSend = storedTypingResult;

    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      // This prevents stale cached data from causing auto-rejection in manual mode
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode")
        .eq("id", application.job_id)
        .single();

      const isAutoMode = freshJob?.processing_mode === "auto";

      // Auto mode: the waiting screen goes up now and stays until the next
      // step is open (useStepAdvance) — never a toast and a trip back to the
      // overview.
      if (isAutoMode) advance.begin();

      // Grade server-side: submit-typing-test computes elapsed time from
      // ITS OWN server-recorded start time (never anything this browser
      // reports), reproduces the same wpm/accuracy/score formula this page
      // used to compute locally, and writes notes.typingTestResult /
      // notes[stepId] / phase via recordStepResult — this page no longer
      // touches `applications` directly for this step at all.
      const { data: submitData, error: submitError } = await supabase.functions.invoke("submit-typing-test", {
        body: withDeviceKind({
          action: "submit",
          applicationId: id,
          stepId,
          typedText: typedTextRef.current,
          // The old-shape list, for a server that does not read the live
          // record yet; the record itself was sent as it happened.
          violations: integrity.violations,
        }),
      });

      if (submitError) {
        // 409: the server already has this test, being checked or on file.
        // "We have your answers": wait for the result and the next step,
        // never an error and never a second send.
        const reply = await functionErrorReply(submitError);
        // 400 computer_required: "Continue on your computer", never an error.
        if (isComputerRequired(reply?.status, reply?.body)) {
          advance.cancel();
          if (showContinueOnComputer(refusedDeviceKind(reply?.body))) return;
        }
        const outcome = reply ? gradingReplyOutcome(reply.status, reply.body) : "error";
        if (outcome === "on_file") {
          await afterTypingSaved(isAutoMode);
          return;
        }
        if (outcome === "checking") {
          if (isAutoMode) advance.markSaved();
          setServerCheckWaiting(true);
          serverCheck.begin(resultBeforeSend);
          return;
        }
      }
      if (submitError || submitData?.error) {
        throw submitError || new Error(submitData?.error || "Failed to submit typing test");
      }

      await afterTypingSaved(isAutoMode);
    } catch (error) {
      console.error("Error submitting typing test:", error);
      toast.error("That didn't send — please try again.");
      advance.cancel();
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
    // The integrity record of the first run is kept (it used to be wiped
    // here); the server numbers the next run itself, from its new start.
    // The next passage is chosen server-side, the moment "Start typing
    // test" calls startTest() again.
    setTargetText("");
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
      return notes.typingTestResult || null;
    } catch {
      return null;
    }
  })();

  // "Already done" is decided once, from the first read after this page
  // mounted. A refresh that brings back the result just sent (this page's own
  // realtime subscription does exactly that, seconds after "Submit results")
  // must never swap the waiting screen for a dead end.
  const resultAtFirstLoad = useResultAtFirstLoad(isFetchedAfterMount && !!application, !!existingResult);

  // The record the hiring team reads (docs/ASSESSMENT-RECORD.md): opened when
  // this page loads on a step that is not done, with a heartbeat while the
  // page is open, so staff see "Typing · active now" or that they left.
  // While the server checks a send this page did not see through, the
  // heartbeat goes on: it is how the page learns that the check failed.
  const session = useAssessmentSession({
    applicationId: id,
    stepId,
    enabled: resultAtFirstLoad === false,
    live: !advance.view || serverCheckWaiting,
    clientProgress: { screen: testState === "intro" ? "intro" : testState === "testing" ? "typing" : "results" },
  });

  // Waiting on a check another request holds (a 409): the result landing
  // finishes the send; a check that crashed ("failed") is sent again, once.
  const storedTypingResult = useMemo(
    () => storedResultKey(parseApplicationNotes(application?.notes).typingTestResult),
    [application?.notes],
  );
  // The baseline of a wait this page did not start with its own send (a
  // reload while the server checks it): the result as first read, never the
  // one cached since (useResultKeyAtFirstLoad).
  const loadResultKey = useResultKeyAtFirstLoad(isFetchedAfterMount && !!application, storedTypingResult);
  const resentRef = useRef(false);
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  const serverCheck = useServerCheck({
    storedResultKey: storedTypingResult,
    serverStatus: session.serverStatus,
    loadResultKey,
    onLanded: () => void afterTypingSavedRef.current(application?.jobs?.processing_mode === "auto"),
    onOwed: () => {
      setServerCheckWaiting(false);
      if (!results) {
        // A send from before a reload whose check crashed: this page has no
        // run of its own to send again. The test opens again; the server
        // still owes the result and grades the next run.
        advance.cancel();
        setTestState("intro");
        return;
      }
      if (resentRef.current) {
        advance.cancel();
        return;
      }
      resentRef.current = true;
      void handleSubmitRef.current();
    },
    onStale: () => queryClient.invalidateQueries({ queryKey: ["typing-test-application", id] }),
  });

  /** The server says the step is finished: never a Start that would be thrown away. */
  const showFinishedOnServer = () => {
    if (application?.jobs?.processing_mode === "auto") {
      // Auto mode: phase has not moved past this finished step yet (the tab
      // that sent it closed before asking). Ask now, exactly as after a send;
      // the move is idempotent.
      advance.begin();
      void afterTypingSavedRef.current(true);
      return;
    }
    setFinishedOnServer(true);
  };

  /** A send is being checked (a reload during it, or another tab): the waiting screen, never a second run. */
  const waitForCheckFromBefore = () => {
    setTestState("completed");
    setServerCheckWaiting(true);
    if (application?.jobs?.processing_mode === "auto") {
      advance.begin();
      advance.markSaved();
    }
    // No baseline: the result as this page first read it (loadResultKey).
    serverCheck.begin();
  };
  startRefusedRef.current = { finished: showFinishedOnServer, checking: waitForCheckFromBefore, computer: showContinueOnComputer };

  // What the server already says about this step, decided once, when the
  // record answers (start_assessment_session). The page's own rule (status
  // pending + phase on this step = a retake) cannot tell a step the hiring
  // team handed back from a manual-mode job, which never moves phase: it
  // offered Start on a finished test, the applicant typed a whole new run,
  // the server answered "already recorded" and the run was thrown away while
  // the page said it was saved. The server's word decides:
  //   - finished → no Start: the next step (auto mode) or "saved" (manual);
  //   - being checked (a reload while a send is checked) → the waiting screen;
  //   - owed (the check crashed) or open → the test as usual: the next run is
  //     the one graded.
  // Start waits for this decision (at most the record's 5 s settle time), as
  // on the conversation pages, so a quick tap never starts a run the server
  // already holds a result for.
  const resumeDecidedRef = useRef(false);
  const [resumeDecided, setResumeDecided] = useState(false);
  useEffect(() => {
    if (resumeDecidedRef.current || resultAtFirstLoad !== false || !session.settled || testState !== "intro") return;
    resumeDecidedRef.current = true;
    setResumeDecided(true);
    const where = serverConversationState(session.reply, session.serverStatus);
    if (where === "done") showFinishedOnServer();
    else if (where === "checking") waitForCheckFromBefore();
    // showFinishedOnServer and waitForCheckFromBefore are plain functions
    // that read the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultAtFirstLoad, session.settled, session.reply, session.serverStatus, testState]);

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md border-border bg-card">
          <CardContent className="p-8 text-center">
            <Keyboard className="mx-auto mb-4 h-10 w-10 text-muted-foreground opacity-40" />
            <h2 className="font-display mb-2 text-xl text-foreground">We couldn't find this application</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              It may have been removed, or you might not have access to it.
            </p>
            <Button variant="outline" onClick={() => navigate("/applications")}>
              Back to applications
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
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Done before this visit began (a bookmark, the back button): say where
  // things stand and offer the next step, never a dead end.
  if (resultAtFirstLoad && existingResult) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName={journeyStep.title}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  // The server says it is finished although the row reads like a retake (a
  // manual-mode job never moves phase): "saved", and the card never offers
  // this step again.
  if (finishedOnServer) {
    return <NextStepCard applicationId={id!} completedTitle={journeyStep.title} doneStepId={stepId} />;
  }

  const isAutoMode = application.jobs?.processing_mode !== "manual";

  // Quiet, real-time WPM readout while the clock is running — not a dashboard,
  // just the one number a nervous typist wants to glance at.
  const liveWpm = (() => {
    if (testState !== "testing" || !startTime) return 0;
    const elapsedMinutes = Math.max((Date.now() - startTime) / 60000, 1 / 60);
    return Math.max(0, Math.round((typedText.length / 5) / elapsedMinutes));
  })();

  const headerGuidance =
    testState === "testing"
      ? "Keep going — time's the only thing moving right now."
      : testState === "completed"
        ? serverCheckWaiting
          ? "We have your results — they're being checked now."
          : "Take a look below, then submit when you're ready."
        : "Takes about a minute. Read the passage once, then start when you're set.";

  return (
    <div ref={containerRef} className="ck-page mx-auto max-w-3xl space-y-6 select-none">
      <TestPausedOverlay
        show={integrity.away && testState === "testing"}
        body="You're in another window — click back to carry on. The clock keeps running, and leaving the test is recorded."
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
            Typing speed check
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">{headerGuidance}</p>
        </div>

        {testState === "testing" && <TestRulesReminder recorded={integrity.flagged} />}
      </header>

      {/* Main Test Card */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {/* Intro State */}
          {testState === "intro" && (
            <div className="space-y-6">
              <div className="space-y-4 rounded-lg bg-muted/30 p-6">
                <h3 className="font-display text-lg text-foreground">How this works</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <Timer className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      You'll have <strong className="text-foreground">60 seconds</strong> once you start — type as much of the passage as you can.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      We're looking for at least <strong className="text-foreground">{application.jobs?.required_wpm || 40} words a minute</strong>, with very few mistakes.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <GlyphClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Accuracy counts as much as speed — steady beats frantic.</span>
                  </li>
                </ul>
              </div>

              <TestRulesCard accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} />

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {rulesAccepted ? "The clock starts the moment you press start." : "Tick the box above to start."}
                </p>
                <Button
                  onClick={startTest}
                  disabled={isStarting || !rulesAccepted || !resumeDecided}
                  size="lg"
                  className="w-full gap-2 sm:w-auto"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Starting...
                    </>
                  ) : !resumeDecided ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Getting things ready…
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      Start typing test
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Testing State */}
          {testState === "testing" && (
            <div className="space-y-6">
              {/* Timer */}
              <div className="flex items-center justify-between gap-3">
                <Badge
                  className={`gap-1 ${
                    timeLeft <= 10
                      ? "bg-destructive/15 text-destructive border-destructive/30"
                      : "bg-primary/15 text-primary border-primary/30"
                  }`}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {timeLeft}s left
                </Badge>
                <span className="text-sm text-muted-foreground">
                  <span className="font-display ck-num text-foreground">{liveWpm}</span> wpm
                </span>
              </div>

              <Progress value={(60 - timeLeft) / 60 * 100} className="h-1.5 bg-[var(--track)]" />

              {/* Target Text — the focal point of this screen */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 sm:p-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  The passage
                </p>
                <p className="font-mono leading-relaxed text-foreground">
                  {targetText}
                </p>
              </div>

              {/* Typing Area */}
              <Textarea
                ref={textareaRef}
                value={typedText}
                onChange={(e) => {
                  setTypedText(e.target.value);
                  typedTextRef.current = e.target.value;
                }}
                placeholder="Start typing here..."
                className="min-h-[150px] font-mono text-lg"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    endReasonRef.current = "finished_early";
                    handleTestComplete();
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Finish early
                </Button>
              </div>
            </div>
          )}

          {/* Being checked: a send from before a reload (or another tab) is
              with the server. This page has no run of its own on screen. */}
          {testState === "completed" && !results && serverCheckWaiting && (
            <div className="space-y-4 py-6 text-center" aria-live="polite">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-display ck-ink text-2xl text-foreground">We have your results</h3>
                <p className="text-muted-foreground">
                  They're being checked now. This page moves on by itself when it's done.
                </p>
              </div>
            </div>
          )}

          {/* Completed State */}
          {testState === "completed" && results && (
            <div className="space-y-6">
              {/* Results — neutral and calm; the real decision comes after you submit */}
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                {serverCheckWaiting ? (
                  <div>
                    <h3 className="font-display ck-ink text-2xl text-foreground">We have your results</h3>
                    <p className="text-muted-foreground">
                      They're being checked now. This page moves on by itself when it's done.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-display ck-ink text-2xl text-foreground">Nice work</h3>
                    <p className="text-muted-foreground">
                      Submit when you're ready —{" "}
                      {isAutoMode
                        ? "your next step opens right after."
                        : "the hiring team will review it and follow up."}
                    </p>
                  </div>
                )}
              </div>

              {/* Performance Stats — one calm row, Fraunces for the numbers */}
              <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border">
                <div className="p-4 text-center">
                  <p className="font-display ck-num text-3xl text-foreground">{results.wpm}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    words / min · target {application.jobs?.required_wpm || 40}
                  </p>
                </div>
                <div className="p-4 text-center">
                  <p className="font-display ck-num text-3xl text-foreground">{results.accuracy}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">accuracy</p>
                </div>
              </div>

              {/* Actions — one primary, jade-filled; the redo is a quiet text-link */}
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                {serverCheckWaiting ? (
                  <span />
                ) : (
                  <Button variant="ghost" onClick={resetTest} className="gap-2 text-muted-foreground">
                    <RotateCcw className="h-4 w-4" />
                    Try again
                  </Button>
                )}
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || serverCheckWaiting}
                  className="w-full gap-2 sm:w-auto"
                  size="lg"
                >
                  {serverCheckWaiting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Being checked…
                    </>
                  ) : isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Submit results
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
