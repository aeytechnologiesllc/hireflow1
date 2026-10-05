import { useEffect, useId, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlyphCheckSeal, GlyphClock } from "@/components/candidate/glyphs";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { buildCandidateJourney, type WorkflowStepLike } from "@/lib/candidateJourney";
import { stepRoute, whereCandidateStands } from "@/lib/journeyProgress";
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { cn } from "@/lib/utils";
import type { StepAdvance } from "@/hooks/useStepAdvance";

// A slim brass rule across the top of a card — the letterhead mark every
// considered candidate card opens with.
const BRASS_RULE = (
  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
);

interface NextStepRow {
  id: string;
  phase: string | null;
  status: string | null;
  notes: string | null;
  voice_interview_result: unknown;
  jobs: {
    workflow_steps: unknown;
    quiz_questions: unknown;
    processing_mode: string | null;
  } | null;
}

function journeyOf(row: NextStepRow | undefined) {
  return buildCandidateJourney((row?.jobs?.workflow_steps ?? []) as WorkflowStepLike[], {
    hasQuiz: Array.isArray(row?.jobs?.quiz_questions) && (row!.jobs!.quiz_questions as unknown[]).length > 0,
  });
}

function standingOf(row: NextStepRow) {
  return whereCandidateStands(journeyOf(row), {
    phase: row.phase,
    status: row.status,
    notes: parseApplicationNotes(row.notes),
    voiceInterviewResult: row.voice_interview_result,
  });
}

interface NextStepCardProps {
  applicationId: string;
  /** The step this card follows (its journey title), if any. */
  completedTitle?: string;
}

/**
 * NextStepCard — what a candidate sees when a step is behind them.
 *
 * It replaces "<Step> Submitted · Back to Application", the card with one
 * button that sent the owner back to an overview four times on 2026-10-05.
 * Reads the application fresh and keeps listening to it (a per-instance
 * realtime topic), so it says exactly one true thing and changes the moment
 * the row does:
 *
 *   - the step at `phase` is open and not yet taken → "Start <step>", straight in
 *   - this step is done, the next one is not open   → saved, and who opens it
 *   - nothing left                                  → you've finished every step
 *
 * It only ever offers the step the step gate allows (see whereCandidateStands).
 * Candidate copy: never names Ava or any machinery.
 *
 * "Start <step>" always loads the next page fresh. This card only ever shows
 * inside a step page, so CandidateStepGate is mounted around it and stays
 * mounted across an in-app navigation, judging the next step from the phase
 * it last read; this card may have seen the move through its own poll or
 * refetch, which the gate never does.
 */
export function NextStepCard({ applicationId, completedTitle }: NextStepCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["candidate-next-step", applicationId], [applicationId]);

  const { data: row, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, phase, status, notes, voice_interview_result, jobs(workflow_steps, quiz_questions, processing_mode)")
        .eq("id", applicationId)
        .single();
      if (error) throw error;
      return data as unknown as NextStepRow;
    },
    enabled: !!applicationId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    // While the card says "your next step opens here", also re-read the row
    // every 10 s — a backstop for a tab realtime is not reaching.
    refetchInterval: (query) => {
      const current = query.state.data as NextStepRow | undefined;
      return current && standingOf(current).kind === "waiting" ? 10_000 : false;
    },
  });

  const instanceId = useId();
  useEffect(() => {
    if (!applicationId) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey });
    const channel = supabase
      .channel(`next-step-card-${applicationId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "applications", filter: `id=eq.${applicationId}` },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [applicationId, instanceId, queryClient, queryKey]);

  const steps = useMemo(() => journeyOf(row), [row]);
  const standing = useMemo(() => (row ? standingOf(row) : null), [row]);

  const goToApplication = () => navigate(`/applications/${applicationId}`);

  let heading = "";
  let body = "";
  let primary: { label: string; onClick: () => void } | null = null;
  let finishedMark = false;

  if (standing?.kind === "take") {
    const route = stepRoute(applicationId, standing.step);
    heading = completedTitle ? "Saved — you can move on" : "Your next step is open";
    body = `Next up: ${standing.step.title}. Step ${standing.index + 1} of ${steps.length}.`;
    if (route) {
      primary = {
        label: `Start ${standing.step.title}`,
        onClick: () => window.location.assign(route),
      };
    }
  } else if (standing?.kind === "waiting") {
    // Auto mode: the server opens the next step within seconds of a send, and
    // asks again once if the first request failed. Past that, only a person
    // opens it, so the copy says so instead of promising it will happen by
    // itself.
    heading = "Your answers are saved";
    body =
      row?.jobs?.processing_mode === "manual"
        ? "The hiring team opens your next step. You can close this page — your place is kept."
        : "Your next step opens here, and this page updates by itself. If it hasn't opened in a few minutes, you can close this page — the hiring team will open it and your place is kept.";
  } else if (standing?.kind === "finished") {
    finishedMark = true;
    heading = "You've finished every step";
    body = "Sent — you can close this page. The hiring team will review your application and get back to you.";
  } else if (standing?.kind === "closed") {
    heading = standing.outcome === "hired" ? "You're hired" : "The hiring team has made a decision";
    body =
      standing.outcome === "hired"
        ? "Congratulations — the employer will be in touch with next steps."
        : "Open your application to see where things stand.";
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="relative w-full max-w-md overflow-hidden border-border bg-card">
        {BRASS_RULE}
        <CardContent className="space-y-6 p-6 text-center sm:p-8" aria-live="polite">
          {isLoading || (!row && !isError) ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
            </div>
          ) : isError || !standing ? (
            <div className="space-y-2">
              <h2 className="font-display text-xl text-foreground">Your answers are saved</h2>
              <p className="text-sm text-muted-foreground">
                Open your application to see your next step.
              </p>
            </div>
          ) : (
            <>
              {standing.kind === "waiting" ? (
                <GlyphClock size={44} className="mx-auto text-[var(--jade)]" />
              ) : (
                <GlyphCheckSeal
                  size={44}
                  className={cn("mx-auto ck-seal-press", finishedMark ? "text-[var(--brass)]" : "text-[var(--jade)]")}
                />
              )}
              <div className="space-y-2">
                <h2 className="font-display break-words text-xl text-foreground [overflow-wrap:anywhere] sm:text-2xl">
                  {heading}
                </h2>
                <p className="break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {body}
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            {primary && (
              <Button onClick={primary.onClick} size="lg" className="w-full gap-2">
                {primary.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant={primary ? "ghost" : "default"}
              onClick={goToApplication}
              className={cn("min-h-[44px] w-full gap-2", primary && "text-muted-foreground")}
            >
              <ArrowLeft className="h-4 w-4" />
              {standing?.kind === "closed" ? "See your application" : "Back to your application"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StepAdvanceScreenProps {
  advance: StepAdvance;
  applicationId: string;
  jobTitle?: string;
  /** The journey title of the step that was just sent. */
  completedTitle?: string;
}

/**
 * The single screen every step page shows after a send — the one road for the
 * waiting state, "Start <next step>", "You've finished every step", the
 * server-confirmed rejection, and the live NextStepCard fallback.
 */
export function StepAdvanceScreen({ advance, applicationId, jobTitle, completedTitle }: StepAdvanceScreenProps) {
  const navigate = useNavigate();
  const back = () => navigate(`/applications/${applicationId}`);

  if (!advance.view) return null;

  if (advance.view === "failed") {
    return <CandidateStatusScreen state="rejected" jobTitle={jobTitle} onClose={back} />;
  }

  // A "passed" with nowhere to send them (a step type this build cannot open)
  // is no better than a wait — hand it to the card, which says what is true.
  if (advance.view === "held" || (advance.view === "passed" && !advance.nextRoute)) {
    return <NextStepCard applicationId={applicationId} completedTitle={completedTitle} />;
  }

  const nextRoute = advance.nextRoute;
  const startNext = () => {
    if (!nextRoute) return;
    // In-app only when CandidateStepGate (still mounted around the next page)
    // is known to have the new phase and the next step is a different page;
    // otherwise load it fresh (see StepAdvance.nextNeedsFullLoad).
    if (advance.nextNeedsFullLoad) window.location.assign(nextRoute);
    else navigate(nextRoute);
  };
  return (
    <EvaluationScreen
      state={advance.view}
      saved={advance.saved}
      nextPhaseName={advance.nextStep?.title}
      onStartNextPhase={nextRoute ? startNext : undefined}
      onDoLater={back}
    />
  );
}

/**
 * The rules line shown before every timed test (skills check, typing test,
 * chat practice, written interview), in the owner's words: copy and paste
 * are off, stay on the page, and every switch away is recorded and reported.
 * One component so the four tests can never word it four ways.
 */
export function TestRulesNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-warning/20 bg-warning/10 px-3 py-2.5 text-left",
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-warning">
        <strong className="font-semibold">Copy and paste are turned off.</strong> Stay on this page — don't
        switch tabs, windows or apps. Every switch is recorded and the hiring team is told.
      </p>
    </div>
  );
}
