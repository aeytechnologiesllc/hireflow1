import { useEffect, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, ArrowLeft, AlertTriangle } from "lucide-react";

interface GateJob {
  workflow_steps?: unknown;
  quiz_questions?: unknown;
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
 * exact position logic VoiceInterviewPhase pioneered: build the job's real
 * journey (`useJourneyPosition` / `candidateJourney.ts`), find where the
 * URL's `stepId` sits in it, and compare that against where the candidate's
 * OWN application record (`phase` / `status` — never the URL) says they
 * actually are. Every phase now agrees, instead of nine near-identical
 * copies drifting apart.
 */
export default function CandidateStepGate({ children }: { children: ReactNode }) {
  const { id: applicationId, stepId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [job, setJob] = useState<GateJob | null>(null);
  const [appPhase, setAppPhase] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data: app, error } = await supabase
        .from("applications")
        .select("phase, status, jobs:job_id ( workflow_steps, quiz_questions )")
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
      setJob({
        workflow_steps: (app.jobs as GateJob | null)?.workflow_steps ?? [],
        quiz_questions: (app.jobs as GateJob | null)?.quiz_questions ?? [],
      });
      setAppPhase(app.phase ?? null);
      setAppStatus(app.status ?? null);
      setLoading(false);
    };

    load();

    // An employer resetting this phase (or advancing/rejecting the
    // application) while the candidate already has this tab open must close
    // the gate live, not just at first load — otherwise a step reset out from
    // under a still-open tab stays reachable until the candidate reloads.
    const channel = supabase
      .channel(`step-gate-${applicationId}`)
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
  }, [applicationId]);

  // Where this URL's stepId sits in the job's real journey. Falls back to the
  // candidate's real phase when stepId doesn't match any known step, so an
  // unrecognized step id never fabricates a bogus "ahead of everything"
  // position — it behaves as if the URL had picked out today's real step.
  const journey = useJourneyPosition(job, { stepId, phase: appPhase });

  // Where the candidate ACTUALLY is — from application.phase / .status only,
  // deliberately never from the URL. This is the only signal that decides
  // access; a candidate steering the URL controls journey.index above, never
  // this.
  const actualPosition = useJourneyPosition(job, { phase: appPhase, status: appStatus });

  const hasReachedThisStep = actualPosition.index >= journey.index;

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
            <Button onClick={() => navigate("/applications")} className="w-full gap-2">
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
            <Button onClick={() => navigate(`/applications/${applicationId}`)} className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to your application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
