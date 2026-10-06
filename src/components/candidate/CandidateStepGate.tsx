import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { buildCandidateJourney, resolveGatedStep, type WorkflowStepLike } from "@/lib/candidateJourney";
import { stepIsDone } from "@/lib/journeyProgress";
import { kindNeedsComputer, readThisDevice, stepNeedsComputer } from "@/lib/deviceGate";
import type { DeviceKind } from "@/lib/connectionTest";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { ContinueOnComputer } from "@/components/candidate/ContinueOnComputer";
import {
  ComputerHandoverContext,
  ContinueOnComputerContext,
  type ShowContinueOnComputer,
} from "@/components/candidate/continueOnComputerContext";
import { NextStepCard } from "@/components/candidate/NextStepCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, ArrowLeft, AlertTriangle } from "lucide-react";

interface GateJob {
  workflow_steps?: unknown;
  quiz_questions?: unknown;
  title?: string | null;
}

/**
 * Wraps every candidate phase route (`/applications/:id/<phase>/:stepId`).
 *
 * A candidate can open any of those URLs directly — bookmarked, guessed, or
 * typed by hand — well before they've actually reached that step. Only
 * VoiceInterviewPhase ever checked for this; the other eight phase pages
 * rendered immediately, started their side effects (a quiz's timer, a chat
 * session), and only found out later, if ever, that the candidate had no
 * business being there yet.
 *
 * This is the one place that decision gets made, before the real phase
 * component — and anything it does on mount — ever renders. It mirrors the
 * position logic VoiceInterviewPhase pioneered — build the job's real journey
 * (`candidateJourney.ts`) and compare the URL's step against where the
 * candidate's OWN application record (`phase` / `status` — never the URL)
 * says they actually are — but STRICTER than that original check: `phase`
 * is required and names the step `type` this particular route represents
 * (e.g. "voice_interview" for `/voice-interview/:stepId`). `resolveGatedStep`
 * only grants access when `stepId` names a real step in this job's own
 * journey AND that step's `type` matches this route's `phase`. Anything
 * else — an unrecognized stepId, or a real stepId opened under the wrong
 * route — is refused outright rather than falling back to some other
 * position, which is what let a candidate through on any unrecognized
 * stepId, or by reusing their own real stepId under a different phase's
 * route, before this check existed.
 */
export default function CandidateStepGate({
  children,
  phase,
}: {
  children: ReactNode;
  /** The step `type` this route represents (e.g. "voice_interview",
   *  "typing_test") — checked against the step `resolveGatedStep` matches by
   *  id, never inferred from the URL alone. */
  phase: string;
}) {
  const { id: applicationId, stepId } = useParams();
  const navigate = useNavigate();
  // Per-instance topic: realtime-js hands back the SAME channel for a repeated
  // topic, and two gates for one application (a step and its next step during
  // a switch) would add listeners to an already-subscribed channel.
  const channelId = useId();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [job, setJob] = useState<GateJob | null>(null);
  const [appPhase, setAppPhase] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [appNotes, setAppNotes] = useState<unknown>(null);
  const [voiceResult, setVoiceResult] = useState<unknown>(null);
  // This device, by the connection check's own reading (deviceGate.ts):
  // null until read. Read for every step, so a step page's requests can
  // carry it (withDeviceKind); only a gated step waits for it.
  const [deviceKind, setDeviceKind] = useState<DeviceKind | null>(null);
  // The server refused one of this step's calls with computer_required: the
  // step it refused, and the device it named.
  const [refused, setRefused] = useState<{ stepId: string | undefined; kind: "phone" | "tablet" | null } | null>(null);
  // Set the moment the server's refusal swaps the step page out, before it
  // unmounts: the page's integrity monitor reads it and does not record
  // "left the test page" for a move the person did not make
  // (useTestIntegrity). A new step in the URL is a new page.
  const handoverRef = useRef(false);
  useEffect(() => {
    handoverRef.current = false;
  }, [stepId]);

  useEffect(() => {
    let cancelled = false;
    void readThisDevice().then((reading) => {
      if (!cancelled) setDeviceKind(reading.kind);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showContinueOnComputer = useCallback<ShowContinueOnComputer>(
    (kind) => {
      handoverRef.current = true;
      setRefused({ stepId, kind: kind === "phone" || kind === "tablet" ? kind : null });
      return true;
    },
    [stepId],
  );

  useEffect(() => {
    if (!applicationId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;
    // A new step in the URL is a new question: show the gate's own loading
    // state until it is answered, rather than the previous step's verdict.
    setLoading(true);

    const load = async () => {
      const { data: app, error } = await supabase
        .from("applications")
        .select("phase, status, notes, voice_interview_result, jobs:job_id ( workflow_steps, quiz_questions, title )")
        .eq("id", applicationId)
        .maybeSingle();

      if (cancelled) return;

      // A row that errors or simply isn't there (wrong id, or an application
      // this candidate can't see under RLS) is "not found" either way — never
      // fall through and let the phase underneath render against no data.
      if (error || !app) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setNotFound(false);
      const gateJob = app.jobs as GateJob | null;
      setJob({
        workflow_steps: gateJob?.workflow_steps ?? [],
        quiz_questions: gateJob?.quiz_questions ?? [],
        title: gateJob?.title ?? null,
      });
      setAppPhase(app.phase ?? null);
      setAppStatus(app.status ?? null);
      setAppNotes(app.notes ?? null);
      setVoiceResult(app.voice_interview_result ?? null);
      setLoading(false);
    };

    load();

    // An employer resetting this phase (or advancing/rejecting the
    // application) while the candidate already has this tab open must close
    // the gate live, not just at first load — otherwise a step reset out from
    // under a still-open tab stays reachable until the candidate reloads.
    const channel = supabase
      .channel(`step-gate-${applicationId}-${channelId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "applications", filter: `id=eq.${applicationId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [applicationId, stepId, channelId]);

  // The job's real journey, and where this URL's stepId resolves in it —
  // strictly: only a stepId that names a real step of THIS route's own
  // `phase` type resolves at all. An unrecognized stepId, or a real stepId
  // that belongs to a different phase type, never resolves — it is refused
  // below, not treated as some other position.
  const steps = useMemo(
    () =>
      buildCandidateJourney((job?.workflow_steps ?? []) as WorkflowStepLike[], {
        hasQuiz: Array.isArray(job?.quiz_questions) && (job!.quiz_questions as unknown[]).length > 0,
      }),
    [job],
  );
  const resolution = useMemo(() => resolveGatedStep(steps, { stepId, expectedType: phase }), [steps, stepId, phase]);

  // Where the candidate ACTUALLY is — from application.phase / .status only,
  // deliberately never from the URL. This is the only signal that decides
  // access; a candidate steering the URL controls `resolution` above, never
  // this.
  const actualPosition = useJourneyPosition(job, { phase: appPhase, status: appStatus });

  const hasReachedThisStep = resolution.matched && actualPosition.index >= resolution.index;

  // The computer-only rule (docs/COMPUTER-ONLY-TESTS.md): is this step one
  // the rule puts on a computer, and is it still theirs to take (not behind
  // them, and its result not on file unless the hiring team handed it back)?
  // A closed application (rejected or hired) has nothing left to take: its
  // `phase` stays where the decision found it, so the step it was waiting
  // on still reads as reached, but it is never "continue on your computer".
  const thisStep = resolution.matched ? steps[resolution.index] : null;
  const needsComputer = !!thisStep && stepNeedsComputer(steps, thisStep.id);
  const closed = appStatus === "rejected" || appStatus === "hired";
  const stepBehind =
    !!thisStep &&
    (closed ||
      actualPosition.index > resolution.index ||
      stepIsDone(
        { phase: appPhase, status: appStatus, notes: parseApplicationNotes(appNotes), voiceInterviewResult: voiceResult },
        thisStep,
      ));

  // Both refusals below send the person on with `replace`: a step URL that is
  // refused is not a page worth coming Back to, so Back from where they land
  // goes to where they were before it (docs/SHORT-JOB-LINKS.md §2).

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Application not found</h2>
              <p className="text-muted-foreground">
                We couldn't find this application, or you don't have access to it.
              </p>
            </div>
            <Button onClick={() => navigate("/applications", { replace: true })} className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to your applications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasReachedThisStep) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Clock className="h-8 w-8 text-[var(--jade-bright)]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Not quite time yet</h2>
              <p className="text-muted-foreground">
                This step opens once you've finished the steps before it. Head back to your
                application to pick up where you left off.
              </p>
            </div>
            <Button onClick={() => navigate(`/applications/${applicationId}`, { replace: true })} className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to your application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A gated step waits for the device reading, so a phone never mounts the step page.
  if (needsComputer && deviceKind === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const refusedHere = refused && refused.stepId === stepId ? refused : null;
  if (thisStep && ((needsComputer && kindNeedsComputer(deviceKind)) || refusedHere)) {
    // Behind them already (sent, moved past, or the application is closed):
    // the card the step page shows for a finished step, never "continue" for
    // something left to do. A closed application wins even over a refusal.
    if (closed || (stepBehind && !refusedHere)) {
      return <NextStepCard applicationId={applicationId!} completedTitle={thisStep.title} />;
    }
    return (
      <ContinueOnComputer
        applicationId={applicationId!}
        step={thisStep}
        index={resolution.index}
        total={steps.length}
        jobTitle={job?.title}
        deviceKind={refusedHere?.kind ?? (kindNeedsComputer(deviceKind) ? deviceKind : null)}
        startedHere={!!refusedHere}
      />
    );
  }

  return (
    <ComputerHandoverContext.Provider value={handoverRef}>
      <ContinueOnComputerContext.Provider value={showContinueOnComputer}>{children}</ContinueOnComputerContext.Provider>
    </ComputerHandoverContext.Provider>
  );
}
