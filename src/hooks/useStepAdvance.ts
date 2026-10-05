import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCandidateJourney,
  type CandidateJourneyStep,
  type WorkflowStepLike,
} from "@/lib/candidateJourney";
import {
  SERVER_HELD_DECISIONS,
  advanceAfterStep,
  advanceFromServerReply,
  opensSameScreen,
  serverReplyIsFinal,
  stepRoute,
  type StepAdvanceOutcome,
} from "@/lib/journeyProgress";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";

/**
 * useStepAdvance — what a step page shows from the moment the candidate sends
 * it until they can start the next one.
 *
 * The owner's run on 2026-10-05 ended on a dead end four times out of five:
 * every step page waited on one long HTTP reply, and meanwhile its own
 * realtime refresh flipped the page to "<Step> Submitted · Back to
 * Application". Now the wait listens to the application row itself. The
 * server opens the next step by moving `phase`; the moment the row says so
 * (realtime, a light poll as a backstop, or the trigger's own reply naming a
 * step this journey knows), the page shows "Start <next step>" with a route
 * straight into it. If nothing moves for about a minute the page falls back
 * to the live NextStepCard, which keeps listening — never a spinner with no
 * exit.
 *
 * Lifecycle, driven by the page (auto-mode jobs only):
 *   begin()     the candidate pressed send            → view "evaluating",
 *               listen to the row
 *   markSaved() the step's own result is stored        → backstop poll and the
 *               one-minute clock
 *   settle(r)   trigger-ava-analysis replied (or not)  → resolve now if it can;
 *               a reply that is not final (an error, "not_ready") makes the
 *               hook ask the server once more, a few seconds later
 *   cancel()    the send failed                        → back to the step
 */

export type StepAdvanceView = "evaluating" | "passed" | "finished" | "held" | "failed";

interface JobLike {
  workflow_steps?: unknown;
  quiz_questions?: unknown;
}

export interface UseStepAdvanceOptions {
  applicationId: string | undefined;
  /** The step being sent — the route's `:stepId` ("application" / "quiz" for the synthetic stages). */
  stepId: string | undefined;
  job: JobLike | null | undefined;
  /** How long to wait for the next step to open before showing NextStepCard. */
  timeoutMs?: number;
  /** Backstop poll while waiting, in case a realtime event never arrives. */
  pollMs?: number;
}

type TriggerReply = { data?: unknown; error?: unknown } | null | undefined;

export interface StepAdvance {
  view: StepAdvanceView | null;
  /** The step's own result is stored on the server. */
  saved: boolean;
  /** Set when view is "passed": the step the row now points at. */
  nextStep: CandidateJourneyStep | null;
  nextRoute: string | null;
  /**
   * True unless an in-app navigation to the next step is known to be safe.
   *
   * CandidateStepGate stays mounted across a step-to-step navigation and
   * refreshes its idea of the phase only from its own realtime event. So an
   * in-app "Start" is safe only once THIS tab has received, over realtime,
   * the row update that moved `phase` (the gate's subscription got the same
   * event) and the gate has had a moment to re-read the row. A move learned
   * from the trigger's reply or a poll says nothing about the gate. And a
   * next step that opens the same page as this one would reuse this page's
   * finished state. In every other case the "Start" button loads the next
   * step's page fresh.
   */
  nextNeedsFullLoad: boolean;
  begin: () => void;
  markSaved: () => void;
  settle: (reply: TriggerReply) => void;
  cancel: () => void;
}

/** Time for CandidateStepGate's own re-read of the row (triggered by the same
 *  realtime event) to land before an in-app navigation relies on it. */
const GATE_REREAD_MS = 2_000;
/** Pause before asking the server once more after a reply that was not final. */
const RETRY_DELAY_MS = 3_000;

export function useStepAdvance({
  applicationId,
  stepId,
  job,
  timeoutMs = 60_000,
  pollMs = 4_000,
}: UseStepAdvanceOptions): StepAdvance {
  const workflowSteps = job?.workflow_steps;
  const quizQuestions = job?.quiz_questions;
  const steps = useMemo(
    () =>
      buildCandidateJourney((workflowSteps || []) as WorkflowStepLike[], {
        hasQuiz: Array.isArray(quizQuestions) && quizQuestions.length > 0,
      }),
    [workflowSteps, quizQuestions],
  );

  const [view, setView] = useState<StepAdvanceView | null>(null);
  const [saved, setSaved] = useState(false);
  const [nextStep, setNextStep] = useState<CandidateJourneyStep | null>(null);
  // This tab received the phase move over realtime, and the gate has had
  // GATE_REREAD_MS to re-read the row after the same event.
  const [gateHasMove, setGateHasMove] = useState(false);

  // Read through refs inside the watcher, so a background refetch of the page's
  // data (a fresh `job` object, a fresh `steps` array) never tears down the
  // subscription or restarts the one-minute clock.
  const viewRef = useRef(view);
  viewRef.current = view;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const retriedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (gateTimerRef.current) clearTimeout(gateTimerRef.current);
    retryTimerRef.current = null;
    gateTimerRef.current = null;
  }, []);

  /** Resolves a wait from an outcome. True when the screen moved on. */
  const apply = useCallback((outcome: StepAdvanceOutcome): boolean => {
    if (viewRef.current !== "evaluating") return false;
    switch (outcome.kind) {
      case "next":
        viewRef.current = "passed";
        setNextStep(outcome.step);
        setView("passed");
        return true;
      case "finished":
        viewRef.current = "finished";
        setView("finished");
        return true;
      case "closed":
        // Only a row the server itself marked rejected lands here — the
        // client never decides a rejection.
        viewRef.current = "failed";
        setView("failed");
        return true;
      default:
        return false;
    }
  }, []);

  /** The realtime event that moved `phase` reached this tab, so it reached
   *  CandidateStepGate's subscription too; allow its re-read to land. */
  const noteRealtimeMove = useCallback(() => {
    if (gateTimerRef.current) return;
    gateTimerRef.current = setTimeout(() => setGateHasMove(true), GATE_REREAD_MS);
  }, []);

  const checkNow = useCallback(async (): Promise<boolean> => {
    if (!applicationId || !stepId) return false;
    const { data, error } = await supabase
      .from("applications")
      .select("phase, status")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !data) return false;
    return apply(advanceAfterStep(stepsRef.current, stepId, data as { phase: string | null; status: string | null }));
  }, [applicationId, stepId, apply]);

  const checkNowRef = useRef(checkNow);
  checkNowRef.current = checkNow;

  const begin = useCallback(() => {
    clearTimers();
    retriedRef.current = false;
    viewRef.current = "evaluating";
    setNextStep(null);
    setSaved(false);
    setGateHasMove(false);
    setView("evaluating");
  }, [clearTimers]);

  const markSaved = useCallback(() => setSaved(true), []);

  const cancel = useCallback(() => {
    clearTimers();
    retriedRef.current = false;
    viewRef.current = null;
    setSaved(false);
    setNextStep(null);
    setGateHasMove(false);
    setView(null);
  }, [clearTimers]);

  // settle() and the retry call each other; the ref keeps that loop out of
  // the dependency lists. retriedRef stops it after one repeat.
  const settleRef = useRef<(reply: TriggerReply) => void>(() => {});

  /**
   * Asks the server once more, a few seconds after a reply that was not
   * final. Until a server-side sweep exists, nothing else would ever move an
   * auto-mode candidate on after a failed or too-early request. Same request
   * every page sends (the hook's stepId is the page's currentPhaseId).
   */
  const askAgain = useCallback(() => {
    if (retriedRef.current || !applicationId || !stepId) return;
    retriedRef.current = true;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      const now = viewRef.current;
      if (now !== "evaluating" && now !== "held") return;
      void invokeTriggerAvaAnalysis({
        applicationId,
        autopilotDecision: true,
        currentPhaseId: stepId,
      }).then((reply) => settleRef.current(reply));
    }, RETRY_DELAY_MS);
  }, [applicationId, stepId]);

  const settle = useCallback(
    (reply: TriggerReply) => {
      if (!stepId) return;
      const now = viewRef.current;
      // A late reply still counts after the one-minute fallback ("held"):
      // the live card is showing, and a failed request must still be retried.
      if (now !== "evaluating" && now !== "held") return;
      const data = reply?.data as { decision?: unknown } | null | undefined;
      if (now === "evaluating") {
        if (data?.decision === "rejected") {
          // The server only answers "rejected" when the row already is.
          apply({ kind: "closed" });
          return;
        }
        if (apply(advanceFromServerReply(stepsRef.current, stepId, data))) return;
        if (typeof data?.decision === "string" && SERVER_HELD_DECISIONS.has(data.decision)) {
          // The trigger has finished and opened nothing. Read the row once (a
          // person may have opened the next step meanwhile), then hand over to
          // the live card instead of holding the spinner for a minute.
          void checkNowRef.current().then((moved) => {
            if (!moved && viewRef.current === "evaluating") {
              viewRef.current = "held";
              setView("held");
            }
          });
          return;
        }
        // No reply, an error, or an answer this build does not know: keep
        // watching the row — it is the truth either way.
        void checkNowRef.current();
      }
      if (!serverReplyIsFinal(reply)) askAgain();
    },
    [stepId, apply, askAgain],
  );
  settleRef.current = settle;

  // Listen to the row from the moment the candidate presses send: a
  // per-instance realtime topic (the page and CandidateStepGate already hold
  // their own topics on this row). Joined before the server can move `phase`,
  // so the event that moves it is not missed. After "passed" it stays until
  // that event has arrived, which is what makes an in-app "Start" safe
  // (nextNeedsFullLoad).
  const instanceId = useId();
  const listening =
    !!applicationId && !!stepId && (view === "evaluating" || (view === "passed" && !gateHasMove));
  useEffect(() => {
    if (!listening || !applicationId || !stepId) return;
    let cancelled = false;
    const channel = supabase
      .channel(`step-advance-${applicationId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "applications", filter: `id=eq.${applicationId}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as { phase?: string | null; status?: string | null } | undefined;
          if (row && "phase" in row) {
            const outcome = advanceAfterStep(stepsRef.current, stepId, row);
            if (outcome.kind !== "pending") noteRealtimeMove();
            if (apply(outcome)) return;
          }
          if (viewRef.current === "evaluating") void checkNowRef.current();
        },
      )
      .subscribe((status) => {
        // Catch up on anything that landed before the socket joined.
        if (status === "SUBSCRIBED" && !cancelled && viewRef.current === "evaluating") void checkNowRef.current();
      });
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [listening, applicationId, stepId, instanceId, apply, noteRealtimeMove]);

  // Once the step's result is stored: a backstop poll, in case a realtime
  // event never arrives, and the one-minute fallback to NextStepCard.
  const waiting = saved && view === "evaluating" && !!applicationId && !!stepId;
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const poll = setInterval(() => {
      if (!cancelled && viewRef.current === "evaluating") void checkNowRef.current();
    }, pollMs);
    const timeout = setTimeout(() => {
      if (!cancelled && viewRef.current === "evaluating") {
        viewRef.current = "held";
        setView("held");
      }
    }, timeoutMs);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [waiting, pollMs, timeoutMs]);

  // The same page instance can be handed a different step (browser back and
  // forward between two steps of one type): start that step clean.
  const stepIdRef = useRef(stepId);
  useEffect(() => {
    if (stepIdRef.current === stepId) return;
    stepIdRef.current = stepId;
    cancel();
  }, [stepId, cancel]);

  useEffect(() => clearTimers, [clearTimers]);

  const doneStep = useMemo(() => steps.find((s) => s.id === stepId) ?? null, [steps, stepId]);
  const nextRoute = nextStep && applicationId ? stepRoute(applicationId, nextStep) : null;
  const nextNeedsFullLoad = !gateHasMove || (!!doneStep && !!nextStep && opensSameScreen(doneStep, nextStep));

  return { view, saved, nextStep, nextRoute, nextNeedsFullLoad, begin, markSaved, settle, cancel };
}

/**
 * True when the step's result was already on file the first time this page
 * read the application after mounting — the only time a step page may say
 * "already done".
 *
 * Judging it on every render is what sent the owner to a dead end: the page's
 * own realtime refresh brought back the result it had just sent, and the
 * waiting screen was swapped for "<Step> Submitted · Back to Application".
 * Waits for a fetch made AFTER mount (`fetchedAfterMount`), so a cached copy
 * from an earlier visit cannot decide it either way.
 */
export function useResultAtFirstLoad(fetchedAfterMount: boolean, hasResult: boolean): boolean | null {
  const ref = useRef<boolean | null>(null);
  if (ref.current === null && fetchedAfterMount) {
    ref.current = hasResult;
  }
  return ref.current;
}
