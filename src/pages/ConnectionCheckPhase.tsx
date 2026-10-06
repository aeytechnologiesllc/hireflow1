import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  functionErrorReply,
  gradingReplyOutcome,
  serverConversationState,
  storedResultKey,
  useAssessmentSession,
  useResultKeyAtFirstLoad,
  useServerCheck,
} from "@/hooks/useAssessmentSession";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle, Loader2, Monitor, RotateCcw, Send, Smartphone } from "lucide-react";
import { GlyphEcho } from "@/components/ava/employerGlyphs";
import { toast } from "sonner";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { NextStepCard, StepAdvanceScreen } from "@/components/candidate/NextStepCard";
import { PhaseContextCard } from "@/components/PhaseContextCard";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";
import {
  barsBelow,
  barsFromConfig,
  createInvokeTransport,
  createMarkerSender,
  describeDevice,
  MAX_RUNS,
  readDevice,
  runConnectionChain,
  type BarName,
  type ChainProgress,
  type ChainSamples,
  type ConnectionBars,
  type DeviceKind,
  type DeviceReading,
  type InvokeLike,
  type RunningEstimate,
  type ServerRunFigures,
  type StepKind,
} from "@/lib/connectionTest";

// The computer and connection check (docs/EQUIPMENT-CHECK.md §3): three
// screens in one card. Which computer (with phone detection and the "run it
// here anyway" escape hatch), the test (one chain of requests against the
// connection-test function, every response's stamp handed back with the
// next request, so the server times every step on its own clock), and the
// result ("Send this result" / "Run it again", up to three runs). Every
// figure that is recorded comes from the server's `record` op, which
// recomputes it from the stamps. When a run finishes, its stamps go to the
// server once more (`op=event`, the `test_finished` marker) and the result
// screen shows the figures the server timed; only when that answer does not
// come does it show this page's own estimate, marked as such. The moments
// in between (the device read, the answer, each run started and finished)
// are written on the record as they happen, so staff see every run and how
// far a closed tab got. No copy/paste or screen-switch rules here (rule 5):
// nothing to cheat by copying.

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
    workflow_steps?: WorkflowStep[] | null;
    /** Its own column, not part of workflow_steps; the journey counts it. */
    quiz_questions?: unknown[] | null;
  } | null;
}

/** The answer to the computer question, in the words `record` stores (§5). */
type UsingThisComputer = "yes" | "no_switched" | "ran_here_anyway";

/** One chain that finished: what "Send this result" hands to the server. */
interface FinishedRun {
  run: number;
  stamps: string[];
  estimate: RunningEstimate;
  /** The server's figures for this run (op=event), or null when they did not come. */
  server: ServerRunFigures | null;
  samples: ChainSamples;
  durationMs: number;
  finishedAt: string;
  /** The server refused to save this run (stale, broken): its words. Such a
   *  run can never be sent again, so it does not count toward MAX_RUNS. */
  refused?: string | null;
}

/** What an earlier visit's hint says about the computer question: a "No"
 *  (answered, carried forward, or a phone or tablet that never ran it anyway)
 *  and the device it came from. */
interface EarlierNo {
  deviceSig: string | null;
}

type ChainState =
  | { status: "idle" }
  | { status: "running"; progress: ChainProgress | null }
  | { status: "failed"; message: string };

const PHASE_WORDS: Record<StepKind, string> = {
  ping: "Checking the round trip to our server…",
  download: "Checking how fast we can send you data…",
  upload: "Checking how fast you can send us data…",
};

const BAR_WORDS: Record<BarName, string> = {
  download: "download",
  upload: "upload",
  latency: "response time",
};

/** The figures a run shows: the server's when it timed the run, else this page's own estimate. */
function shownFigures(run: FinishedRun): RunningEstimate {
  return run.server ?? run.estimate;
}

/** The device in one line, for telling two devices apart (never shown). */
function deviceSignature(reading: DeviceReading): string {
  const d = reading.device;
  return [reading.kind, d.os, d.osVersion, d.browser, d.browserVersion, d.screen, d.dpr, d.cores, d.memoryGb, d.touch, d.timezone]
    .map((v) => (v === null || v === undefined ? "" : String(v)))
    .join("|");
}

/** The earlier "No" in a hint the record kept (progress.client), or null. */
function earlierNoOf(hint: unknown): EarlierNo | null {
  if (!hint || typeof hint !== "object" || Array.isArray(hint)) return null;
  const h = hint as Record<string, unknown>;
  const sig = (v: unknown) => (typeof v === "string" && v ? v : null);
  // Carried forward by a page that read it and has not answered yet.
  if (h.prior_answer === "no") return { deviceSig: sig(h.prior_device_sig) };
  if (h.answer === "no") return { deviceSig: sig(h.device_sig) };
  // A phone or tablet is treated like "No" (§1 rule 2), unless it ran anyway.
  if ((h.device_kind === "phone" || h.device_kind === "tablet") && h.answer !== "ran_here_anyway") {
    return { deviceSig: sig(h.device_sig) };
  }
  return null;
}

/** The functions client as the chain and the markers use it. */
const invokeConnectionTest: InvokeLike = (name, options) =>
  supabase.functions.invoke(name, options as Parameters<typeof supabase.functions.invoke>[1]);

function formatMbps(value: number | null): string {
  if (value === null) return "—";
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

export default function ConnectionCheckPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const instanceId = useId();

  const [screen, setScreen] = useState<"computer" | "test" | "result">("computer");
  // What the browser says this device is; read once the page mounts.
  const [reading, setReading] = useState<DeviceReading | null>(null);
  // "No" on a computer: the instruction to switch, with the escape hatch under it.
  const [saidNo, setSaidNo] = useState(false);
  const [usingThisComputer, setUsingThisComputer] = useState<UsingThisComputer | null>(null);
  const [chain, setChain] = useState<ChainState>({ status: "idle" });
  const [runs, setRuns] = useState<FinishedRun[]>([]);
  // The run "Send this result" sends: the latest unless the applicant picks another.
  const [chosenRun, setChosenRun] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The server refused the sent chain (400 with a reason in plain words):
  // shown on the result screen, with "Run it again" as the way on.
  const [refusal, setRefusal] = useState<string | null>(null);
  // The server is already saving this check (409 already_checking: another
  // tab, or a retry whose first answer was lost): the page waits for the
  // result instead of offering a second send.
  const [serverCheckWaiting, setServerCheckWaiting] = useState(false);
  // The server says this step is finished (its result is on file and the
  // hiring team has not handed it back) in a manual-mode job: "saved", and
  // no test (see the resume decision below).
  const [finishedOnServer, setFinishedOnServer] = useState(false);
  // A "No" an earlier visit left on the record (another device, or a phone
  // that never ran it): read once from the record's first answer, and
  // carried forward in this page's own hint until the question is answered
  // here, so this page's heartbeat (which replaces the hint) never erases it.
  const [earlierNo, setEarlierNo] = useState<EarlierNo | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runsRef = useRef<FinishedRun[]>([]);
  runsRef.current = runs;

  // The page's moments, written on the record as they happen
  // (connection-test?op=event). Each marker's key is unique to this page
  // load, so a retry writes nothing twice and a reload starts afresh.
  const markers = useMemo(
    () => (id && stepId ? createMarkerSender(invokeConnectionTest, { applicationId: id, stepId }) : null),
    [id, stepId],
  );
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const loadKeyRef = useRef(`pg-${Math.random().toString(36).slice(2, 10)}`);
  const chainCountRef = useRef(0);
  const deviceMarkedRef = useRef(false);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["connection-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;

      const parsed = {
        ...data,
        jobs: data.jobs
          ? {
            ...data.jobs,
            workflow_steps: Array.isArray(data.jobs.workflow_steps)
              ? (data.jobs.workflow_steps as unknown as WorkflowStep[])
              : null,
          }
          : null,
      };

      return parsed as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets — per instance (useId), so two
  // mounts for one application never add listeners to a subscribed channel.
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`connection-phase-${id}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["connection-application", id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, instanceId, queryClient]);

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. Never invented.
  const journeyStep = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // After "Send this result": the waiting screen, then "Start <next step>" the
  // moment the row says the next step is open (see useStepAdvance).
  const advance = useStepAdvance({ applicationId: id, stepId, job: application?.jobs });

  // The job's bars, from this step's own config (§2); the server reads the same.
  const bars: ConnectionBars = useMemo(
    () => barsFromConfig(application?.jobs?.workflow_steps?.find((s) => s.id === stepId)?.config),
    [application?.jobs?.workflow_steps, stepId],
  );

  // The device, read once: userAgentData with the high-entropy values when
  // granted, the UA string otherwise (src/lib/connectionTest.ts).
  useEffect(() => {
    let cancelled = false;
    readDevice()
      .then((result) => {
        if (!cancelled) setReading(result);
      })
      .catch((err) => {
        console.error("[ConnectionCheckPhase] Could not read the device:", err);
        if (!cancelled) {
          setReading({
            device: {
              os: null, osVersion: null, browser: null, browserVersion: null, screen: null, dpr: null, cores: null,
              memoryGb: null, touch: null, language: null, timezone: null, connectionType: null, model: null,
            },
            kind: "computer",
            network: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deviceKind: DeviceKind = reading?.kind ?? "computer";
  const looksLikePhone = deviceKind !== "computer";

  /** One chain, in order; a finished one becomes a run on the result screen. */
  const startChain = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScreen("test");
    setRefusal(null);
    setChain({ status: "running", progress: null });
    const runNumber = runsRef.current.length + 1;
    const chainKey = `${loadKeyRef.current}:${++chainCountRef.current}`;
    markersRef.current?.mark("test_started", { run: runNumber }, `${chainKey}:started`);
    const transport = createInvokeTransport(invokeConnectionTest);
    const outcome = await runConnectionChain(transport, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (!controller.signal.aborted) setChain({ status: "running", progress });
      },
    });
    if (controller.signal.aborted) return;
    // `=== false`, not `!`: the app tsconfig is not strict, and only equality
    // narrows the union there.
    if (outcome.ok === false) {
      if (outcome.reason === "aborted") return;
      console.error("[ConnectionCheckPhase] The chain did not finish:", outcome.reason, outcome.step, outcome.phase);
      setChain({ status: "failed", message: outcome.message });
      return;
    }
    // The run's own stamps go to the server once more: it times the run
    // (the figures `record` will store for it) and writes the run on the
    // record. The gauge stays up, at its last step, until it answers.
    const server = markersRef.current
      ? await markersRef.current.finishRun({ run: runNumber, estimate: outcome.estimate, stamps: outcome.stamps, key: `${chainKey}:finished` })
      : null;
    if (controller.signal.aborted) return;
    const run: FinishedRun = {
      run: runNumber,
      stamps: outcome.stamps,
      estimate: outcome.estimate,
      server,
      samples: outcome.samples,
      durationMs: outcome.durationMs,
      finishedAt: new Date().toISOString(),
    };
    setRuns((current) => [...current, run]);
    setChosenRun(run.run);
    setChain({ status: "idle" });
    setScreen("result");
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** The result is on file (this send, or one the server already had): the
   *  next step in auto mode, "sent" in manual mode. */
  const afterCheckSaved = async (isAutoMode: boolean, serverWords?: string | null) => {
    setServerCheckWaiting(false);
    abortRef.current?.abort();

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
      }).catch((err) => console.error("[ConnectionCheckPhase] analysis trigger failed:", err));

      toast.success("Connection check sent", {
        description: serverWords
          ? `${serverWords} The hiring team will review it and get back to you.`
          : "Your result is saved. The hiring team will review it and get back to you.",
      });
      navigate(`/applications/${id}`);
    }
  };
  const afterCheckSavedRef = useRef(afterCheckSaved);
  afterCheckSavedRef.current = afterCheckSaved;

  const chosen = runs.find((r) => r.run === chosenRun) ?? runs[runs.length - 1] ?? null;

  const handleSubmit = async () => {
    if (!chosen || !application || !reading || !usingThisComputer) return;

    setIsSubmitting(true);
    setRefusal(null);
    // The stored result before this send: a 409 "already being checked"
    // waits for a result different from this one.
    const resultBeforeSend = storedCheckResult;

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

      // The server verifies the chain, computes the three figures from the
      // stamps alone and writes notes.equipmentCheckResult / notes[stepId]
      // via recordStepResult — this page never touches `applications` for
      // this step. Every finished run travels too (its count is §5's `runs`;
      // its figures land in grading.raw), the sent one marked; the page's
      // own numbers are never what is recorded.
      const { data: submitData, error: submitError } = await supabase.functions.invoke("connection-test?op=record", {
        body: {
          application_id: id,
          step_id: stepId,
          stamps: chosen.stamps,
          device: reading.device,
          using_this_computer: usingThisComputer,
          device_kind: reading.kind,
          runs: runs.map((r) => ({
            run: r.run,
            sent: r.run === chosen.run,
            download_mbps: r.estimate.downloadMbps,
            upload_mbps: r.estimate.uploadMbps,
            latency_ms: r.estimate.latencyMs,
            server: r.server,
            duration_ms: Math.round(r.durationMs),
            finished_at: r.finishedAt,
          })),
          estimate: {
            run: chosen.run,
            download_mbps: chosen.estimate.downloadMbps,
            upload_mbps: chosen.estimate.uploadMbps,
            latency_ms: chosen.estimate.latencyMs,
            duration_ms: Math.round(chosen.durationMs),
            finished_at: chosen.finishedAt,
          },
          network: reading.network,
        },
      });

      if (submitError) {
        const reply = await functionErrorReply(submitError);
        const outcome = reply ? gradingReplyOutcome(reply.status, reply.body) : "error";
        const code = reply && typeof reply.body === "object" && reply.body ? (reply.body as { code?: unknown }).code : null;
        const words = reply && typeof reply.body === "object" && reply.body ? (reply.body as { error?: unknown }).error : null;
        // 409: the server already has this check, being checked or on file.
        // "We have your result": wait for it and the next step, never an
        // error and never a second send.
        if (outcome === "on_file" || (reply?.status === 409 && code === "step_finished")) {
          await afterCheckSaved(isAutoMode);
          return;
        }
        if (outcome === "checking") {
          if (isAutoMode) advance.markSaved();
          setServerCheckWaiting(true);
          serverCheck.begin(resultBeforeSend);
          return;
        }
        // 400 with a code: the chain did not add up (stale, broken, too
        // few steps). The server wrote the reason in plain words for this
        // screen; a fresh run is the way on.
        if (reply?.status === 400 && typeof code === "string") {
          advance.cancel();
          const said = typeof words === "string" && words ? words : "That run could not be saved. Run it again.";
          setRefusal(said);
          // That run can never be saved (a stale or broken chain stays so):
          // it stops counting toward MAX_RUNS, so "Run it again" is always
          // there, and the latest run that can still be sent is picked.
          const next = runsRef.current.map((r) => (r.run === chosen.run ? { ...r, refused: said } : r));
          setRuns(next);
          const sendable = next.filter((r) => !r.refused);
          setChosenRun(sendable.length ? sendable[sendable.length - 1].run : chosen.run);
          return;
        }
      }
      if (submitError || submitData?.error) {
        throw submitError || new Error(submitData?.error || "Failed to record the connection check");
      }

      const results = submitData?.results as { downloadMbps?: unknown; uploadMbps?: unknown; latencyMs?: unknown } | undefined;
      const serverWords =
        results && typeof results.downloadMbps === "number" && typeof results.uploadMbps === "number" && typeof results.latencyMs === "number"
          ? `Download ${formatMbps(results.downloadMbps)} Mbps, upload ${formatMbps(results.uploadMbps)} Mbps, ${Math.round(results.latencyMs)} ms, timed by our server.`
          : null;
      await afterCheckSaved(isAutoMode, serverWords);
    } catch (error) {
      console.error("Error sending the connection check:", error);
      toast.error("That didn't send — please try again.");
      advance.cancel();
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
      return notes.equipmentCheckResult || null;
    } catch {
      return null;
    }
  })();

  // "Already done" is decided once, from the first read after this page
  // mounted. A refresh that brings back the result just sent (this page's own
  // realtime subscription does exactly that, seconds after "Send this result")
  // must never swap the waiting screen for a dead end.
  const resultAtFirstLoad = useResultAtFirstLoad(isFetchedAfterMount && !!application, !!existingResult);

  // The record the hiring team reads (docs/ASSESSMENT-RECORD.md): opened when
  // this page loads on a step that is not done, with a heartbeat while the
  // page is open, so staff see "running the speed test · active just now".
  // The hint carries the screen, the answer, the device kind and the run so
  // a tab closed mid-test still shows how far they got; it is returned to
  // the applicant, so nothing secret goes in it.
  const session = useAssessmentSession({
    applicationId: id,
    stepId,
    enabled: resultAtFirstLoad === false,
    live: !advance.view || serverCheckWaiting,
    clientProgress: {
      screen,
      ...(reading ? { device_kind: reading.kind, device_sig: deviceSignature(reading) } : {}),
      ...(usingThisComputer ? { answer: usingThisComputer } : saidNo ? { answer: "no" } : {}),
      ...(earlierNo && !usingThisComputer
        ? { prior_answer: "no", ...(earlierNo.deviceSig ? { prior_device_sig: earlierNo.deviceSig } : {}) }
        : {}),
      ...(chain.status === "running" ? { run: runs.length + 1, step: chain.progress?.step ?? 0 } : {}),
      ...(chain.status === "failed" ? { run: runs.length + 1, failed: true } : {}),
      ...(runs.length ? { runs_done: runs.length } : {}),
    },
  });

  // The record's first answer (start_assessment_session) carries the hint the
  // last visit left, before this page's own heartbeat replaces it.
  const earlierReadRef = useRef(false);
  useEffect(() => {
    if (earlierReadRef.current || !session.reply) return;
    earlierReadRef.current = true;
    setEarlierNo(earlierNoOf(session.reply.progress?.client));
  }, [session.reply]);

  // "No" answered on ANOTHER device earlier (a phone counts as one): a "Yes"
  // here is the switch the instruction asked for. The same device saying No
  // and then Yes (a reload, a tap by mistake) switched nothing.
  const thisDeviceSig = reading ? deviceSignature(reading) : null;
  const switchedHere = !!earlierNo && (earlierNo.deviceSig === null || thisDeviceSig === null || earlierNo.deviceSig !== thisDeviceSig);

  // Waiting on a check another request holds (a 409): the result landing
  // finishes the send; a check that crashed ("failed") is sent again, once.
  const storedCheckResult = useMemo(
    () => storedResultKey(parseApplicationNotes(application?.notes).equipmentCheckResult),
    [application?.notes],
  );
  // The baseline of a wait this page did not start with its own send (a
  // reload while the server checks it): the result as first read, never the
  // one cached since (useResultKeyAtFirstLoad).
  const loadResultKey = useResultKeyAtFirstLoad(isFetchedAfterMount && !!application, storedCheckResult);
  const resentRef = useRef(false);
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  const serverCheck = useServerCheck({
    storedResultKey: storedCheckResult,
    serverStatus: session.serverStatus,
    loadResultKey,
    onLanded: () => void afterCheckSavedRef.current(application?.jobs?.processing_mode === "auto"),
    onOwed: () => {
      setServerCheckWaiting(false);
      if (!runsRef.current.length) {
        // A send from before a reload whose check crashed: this page has no
        // run of its own to send again. The question opens again; the server
        // still owes the result and records the next run.
        advance.cancel();
        setScreen("computer");
        return;
      }
      if (resentRef.current) {
        advance.cancel();
        return;
      }
      resentRef.current = true;
      void handleSubmitRef.current();
    },
    onStale: () => queryClient.invalidateQueries({ queryKey: ["connection-application", id] }),
  });

  /** The server says the step is finished: never a run that would be thrown away. */
  const showFinishedOnServer = () => {
    if (application?.jobs?.processing_mode === "auto") {
      // Auto mode: phase has not moved past this finished step yet (the tab
      // that sent it closed before asking). Ask now, exactly as after a send;
      // the move is idempotent.
      advance.begin();
      void afterCheckSavedRef.current(true);
      return;
    }
    setFinishedOnServer(true);
  };

  /** A send is being checked (a reload during it, or another tab): the waiting screen, never a second run. */
  const waitForCheckFromBefore = () => {
    setScreen("result");
    setServerCheckWaiting(true);
    if (application?.jobs?.processing_mode === "auto") {
      advance.begin();
      advance.markSaved();
    }
    // No baseline: the result as this page first read it (loadResultKey).
    serverCheck.begin();
  };

  // What the server already says about this step, decided once, when the
  // record answers (start_assessment_session). The page's own rule (status
  // pending + phase on this step = a retake) cannot tell a step the hiring
  // team handed back from a manual-mode job, which never moves phase. The
  // server's word decides:
  //   - finished → no test: the next step (auto mode) or "saved" (manual);
  //   - being checked (a reload while a send is checked) → the waiting screen;
  //   - owed (the check crashed) or open → the question as usual: the next
  //     run is the one recorded.
  // The Yes / run buttons wait for this decision (at most the record's 5 s
  // settle time), so a quick tap never starts a run the server already holds
  // a result for.
  const resumeDecidedRef = useRef(false);
  const [resumeDecided, setResumeDecided] = useState(false);
  useEffect(() => {
    if (resumeDecidedRef.current || resultAtFirstLoad !== false || !session.settled || screen !== "computer") return;
    resumeDecidedRef.current = true;
    setResumeDecided(true);
    const where = serverConversationState(session.reply, session.serverStatus);
    if (where === "done") showFinishedOnServer();
    else if (where === "checking") waitForCheckFromBefore();
    // showFinishedOnServer and waitForCheckFromBefore are plain functions
    // that read the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultAtFirstLoad, session.settled, session.reply, session.serverStatus, screen]);

  // The device as the page read it, on the record once the step is open
  // here (not when the server says it is finished or being saved).
  useEffect(() => {
    if (deviceMarkedRef.current || !resumeDecided || !reading || screen !== "computer" || finishedOnServer || advance.view) return;
    deviceMarkedRef.current = true;
    markersRef.current?.mark("device_read", { device_kind: reading.kind, device: reading.device }, `${loadKeyRef.current}:device`);
  }, [resumeDecided, reading, screen, finishedOnServer, advance.view]);

  /** The answer to the computer question, on the record as it is given. */
  const markAnswer = (answer: UsingThisComputer | "no") =>
    markersRef.current?.mark("computer_answer", { answer }, `${loadKeyRef.current}:answer:${answer}`);

  const answerYes = () => {
    const answer: UsingThisComputer = switchedHere ? "no_switched" : "yes";
    setUsingThisComputer(answer);
    markAnswer(answer);
    void startChain();
  };
  const answerNo = () => {
    setSaidNo(true);
    markAnswer("no");
  };
  // "No" by mistake: back to Yes on the same page, never a false flag.
  const answerOnItAfterAll = () => {
    setSaidNo(false);
    answerYes();
  };
  const runHereAnyway = () => {
    setUsingThisComputer("ran_here_anyway");
    markAnswer("ran_here_anyway");
    void startChain();
  };

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
            <GlyphEcho className="mx-auto mb-4 h-10 w-10 text-muted-foreground opacity-40" size={40} />
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

  // A run the server refused to save never counts toward the limit: "Run it
  // again" stays until three runs that can be sent are on screen.
  const sendableRuns = runs.filter((r) => !r.refused);
  const canRunAgain = sendableRuns.length < MAX_RUNS;

  const headerGuidance =
    screen === "test"
      ? chain.status === "failed"
        ? "That run didn't finish. Try it again when you're ready."
        : "About 20 seconds. Keep this tab open until it's done."
      : screen === "result"
        ? serverCheckWaiting
          ? "We have your result — it's being saved now."
          : canRunAgain
            ? "Take a look, then send it or run it once more."
            : "Pick the run to send."
        : "Takes about 20 seconds. We run our own speed test right here — nothing to install.";

  const progress = chain.status === "running" ? chain.progress : null;
  const gaugePhase: StepKind = progress?.phase ?? "ping";
  const gaugeValue =
    gaugePhase === "ping"
      ? progress?.estimate.latencyMs === null || progress?.estimate.latencyMs === undefined
        ? "—"
        : String(progress.estimate.latencyMs)
      : gaugePhase === "download"
        ? formatMbps(progress?.estimate.downloadMbps ?? null)
        : formatMbps(progress?.estimate.uploadMbps ?? null);
  const gaugeUnit = gaugePhase === "ping" ? "ms round trip" : gaugePhase === "download" ? "Mbps down" : "Mbps up";
  const gaugePct = progress ? Math.round((progress.step / progress.total) * 100) : 0;

  // The server's figures when it timed the run (exact), else this page's
  // own estimate ("about").
  const shown = chosen ? shownFigures(chosen) : null;
  const about = chosen?.server ? "" : "about ";
  const below = shown ? barsBelow(shown, bars) : [];
  const resultRows: Array<{ key: BarName; label: string; value: string; ask: string }> = shown
    ? [
      {
        key: "download",
        label: "Download",
        value: `${about}${formatMbps(shown.downloadMbps)} Mbps`,
        ask: `we ask for ${formatMbps(bars.minDownloadMbps)}`,
      },
      {
        key: "upload",
        label: "Upload",
        value: `${about}${formatMbps(shown.uploadMbps)} Mbps`,
        ask: `we ask for ${formatMbps(bars.minUploadMbps)}`,
      },
      {
        key: "latency",
        label: "Response time",
        value: shown.latencyMs === null ? "—" : `${about}${Math.round(shown.latencyMs)} ms`,
        ask: `we ask for ${bars.maxLatencyMs} or under`,
      },
    ]
    : [];
  // The chain is done and the server is timing it: the gauge waits at its last step.
  const confirming = !!progress && progress.step >= progress.total;

  return (
    <div className="ck-page mx-auto max-w-3xl space-y-6">
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
            Your computer and connection
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyStep.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">{headerGuidance}</p>
        </div>
      </header>

      {screen === "computer" && <PhaseContextCard phaseType="equipment_check" />}

      <Card className="bg-card border-border">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {/* Screen 1: which computer */}
          {screen === "computer" && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-4">
                {looksLikePhone ? (
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This device</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {reading ? describeDevice(reading.device) : "Reading…"}
                  </p>
                </div>
              </div>

              {looksLikePhone ? (
                <div className="space-y-4">
                  <h3 className="font-display text-lg text-foreground">
                    This looks like a {deviceKind === "tablet" ? "tablet" : "phone"}.
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    The job is done on a computer. Sign in on that computer and open this step there; the test
                    runs there. This step stays open until a test is sent.
                  </p>
                  <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="outline" onClick={() => navigate(`/applications/${id}`)} className="w-full sm:w-auto">
                      Back to my application
                    </Button>
                    <button
                      type="button"
                      onClick={runHereAnyway}
                      disabled={!resumeDecided || !reading}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
                    >
                      I can't right now, run it here anyway.
                    </button>
                  </div>
                </div>
              ) : saidNo ? (
                <div className="space-y-4">
                  <h3 className="font-display text-lg text-foreground">Open this step on that computer</h3>
                  <p className="text-sm text-muted-foreground">
                    Sign in on the computer you'll work from and open this step there; the test runs there. This
                    step stays open until a test is sent.
                  </p>
                  <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="outline" onClick={() => navigate(`/applications/${id}`)} className="w-full sm:w-auto">
                      Back to my application
                    </Button>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      {/* "No" by mistake: back to Yes here, never a false flag. */}
                      <button
                        type="button"
                        onClick={answerOnItAfterAll}
                        disabled={!resumeDecided || !reading}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
                      >
                        I'm on it after all — run the test.
                      </button>
                      <button
                        type="button"
                        onClick={runHereAnyway}
                        disabled={!resumeDecided || !reading}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
                      >
                        I can't right now, run it here anyway.
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-display text-lg text-foreground">
                    Are you on the computer you'll use for this job right now?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    We measure this computer and this connection, so it should be the ones you'd work from.
                  </p>
                  <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-end">
                    <Button variant="outline" size="lg" onClick={answerNo} className="w-full sm:w-auto">
                      No
                    </Button>
                    <Button
                      onClick={answerYes}
                      disabled={!resumeDecided || !reading}
                      size="lg"
                      className="w-full gap-2 sm:w-auto"
                    >
                      {!resumeDecided || !reading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Getting things ready…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Yes, run the test
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screen 2: the test */}
          {screen === "test" && chain.status !== "failed" && (
            <div className="space-y-6" aria-live="polite">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Run {runs.length + 1}
                  {runs.length > 0 && runs.length < MAX_RUNS ? ` of ${MAX_RUNS}` : ""}
                </p>
                <p className="font-display ck-num mt-3 text-5xl text-foreground sm:text-6xl">{gaugeValue}</p>
                <p className="mt-1 text-sm text-muted-foreground">{gaugeUnit}</p>
              </div>

              <Progress value={gaugePct} className="h-1.5 bg-[var(--track)]" />

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                <span>
                  {progress?.retrying
                    ? "One request didn't get through — sending it again…"
                    : confirming
                      ? "Getting the exact figures from our server…"
                      : PHASE_WORDS[gaugePhase]}
                </span>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Timed by our server. {progress ? `${progress.step} of ${progress.total} steps done.` : "Starting…"}
              </p>
            </div>
          )}

          {/* The chain did not finish: say so, offer a fresh one. */}
          {screen === "test" && chain.status === "failed" && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h3 className="font-display ck-ink text-2xl text-foreground">That run didn't finish</h3>
                <p className="text-sm text-muted-foreground">{chain.message}</p>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                {runs.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setChain({ status: "idle" }); setScreen("result"); }} className="text-muted-foreground">
                    Keep my earlier run
                  </Button>
                ) : (
                  <span />
                )}
                <Button onClick={() => void startChain()} size="lg" className="w-full gap-2 sm:w-auto">
                  <RotateCcw className="h-4 w-4" />
                  Try again
                </Button>
              </div>
            </div>
          )}

          {/* Being saved: a send from before a reload (or another tab) is
              with the server. This page has no run of its own on screen. */}
          {screen === "result" && !chosen && serverCheckWaiting && (
            <div className="space-y-4 py-6 text-center" aria-live="polite">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-display ck-ink text-2xl text-foreground">We have your result</h3>
                <p className="text-muted-foreground">
                  It's being saved now. This page moves on by itself when it's done.
                </p>
              </div>
            </div>
          )}

          {/* Screen 3: result and send */}
          {screen === "result" && chosen && (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                  <CheckCircle className="h-7 w-7 text-primary" />
                </div>
                {serverCheckWaiting ? (
                  <>
                    <h3 className="font-display ck-ink text-2xl text-foreground">We have your result</h3>
                    <p className="text-muted-foreground">It's being saved now. This page moves on by itself when it's done.</p>
                  </>
                ) : (
                  <>
                    <h3 className="font-display ck-ink text-2xl text-foreground">
                      {below.length === 0 ? "Looks good for this job" : `A little under on ${below.map((b) => BAR_WORDS[b]).join(" and ")}`}
                    </h3>
                    <p className="text-muted-foreground">
                      {below.length === 0
                        ? "Send it when you're ready — "
                        : canRunAgain
                          ? "You can send it as it is, or run it again on a steadier moment — "
                          : "You can send it as it is — "}
                      {isAutoMode ? "your next step opens right after." : "the hiring team will review it and follow up."}
                    </p>
                  </>
                )}
              </div>

              <div className="divide-y divide-border rounded-lg border border-border">
                {resultRows.map((row) => {
                  const short = below.includes(row.key);
                  return (
                    <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{row.label}</p>
                        <p className="text-xs text-muted-foreground">{row.ask}</p>
                      </div>
                      <p className={`font-display ck-num shrink-0 text-lg ${short ? "text-[var(--amber-fg)]" : "text-foreground"}`}>
                        {row.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="text-center text-xs text-muted-foreground">
                {chosen.server
                  ? "Timed by our server. These are the figures we record when you send."
                  : "These are this page's own numbers. Our server times the test and records the exact figures when you send."}
              </p>

              {runs.length > 1 && !serverCheckWaiting && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Which run to send</p>
                  <div className="flex flex-wrap gap-2">
                    {runs.map((r) => {
                      const picked = r.run === chosen.run;
                      const f = shownFigures(r);
                      // The page's own estimate is marked, as on the result rows:
                      // only the server's figures stand unmarked.
                      const approx = r.server ? "" : "about ";
                      return (
                        <button
                          key={r.run}
                          type="button"
                          onClick={() => setChosenRun(r.run)}
                          disabled={!!r.refused}
                          aria-pressed={picked}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                            picked
                              ? "border-primary bg-primary/15 text-foreground"
                              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {r.refused ? (
                            <>Run {r.run} · couldn't be saved</>
                          ) : (
                            <>
                              Run {r.run} · {approx}↓ {formatMbps(f.downloadMbps)} ↑ {formatMbps(f.uploadMbps)} ·{" "}
                              {f.latencyMs === null ? "—" : Math.round(f.latencyMs)} ms
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {refusal && (
                <p className="rounded-lg bg-muted/30 p-3 text-sm text-foreground" role="status">
                  {refusal}
                </p>
              )}

              {/* Actions — one primary; "Run it again" is a quiet text-link, gone after three runs */}
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                {serverCheckWaiting ? (
                  <span />
                ) : canRunAgain ? (
                  <Button variant="ghost" onClick={() => void startChain()} disabled={isSubmitting} className="gap-2 text-muted-foreground">
                    <RotateCcw className="h-4 w-4" />
                    Run it again
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">That's {MAX_RUNS} runs — pick the one to send.</p>
                )}
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || serverCheckWaiting || !usingThisComputer || !!chosen.refused}
                  className="w-full gap-2 sm:w-auto"
                  size="lg"
                >
                  {serverCheckWaiting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Being saved…
                    </>
                  ) : isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send this result
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
