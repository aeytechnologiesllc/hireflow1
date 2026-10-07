import { useAuth } from "@/hooks/useAuth";
import { useCandidateApplications } from "@/hooks/useApplications";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  MapPin,
  Briefcase,
  Calendar,
  ChevronRight,
  Trash2,
  Download,
  MoreVertical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationWithJob } from "@/hooks/useApplications";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImprovementBlueprintCard } from "@/components/ImprovementBlueprintCard";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import {
  getApplicationDisplayState,
  statusLabels,
  type ApplicationDisplayState,
} from "@/utils/getApplicationDisplayState";
import { phaseDurationEstimates } from "@/lib/phaseDurations";
import { GlyphJourney, GlyphLetter } from "@/components/candidate/glyphs";
import { buildCandidateJourney, positionFor } from "@/lib/candidateJourney";
import { stepRoute } from "@/lib/journeyProgress";
import { thisDeviceKind } from "@/lib/deviceGate";
import { isFreshArrival, stepWaitingOnComputer } from "@/lib/resumeOnComputer";
import { candidateInterviewWords, type CandidateInterviewWords } from "@/lib/candidateInterview";

/* The brand glyph kit's components render plain SVGs, not lucide's
   ForwardRefExoticComponent shape — EmptyStateCard's props type them as
   LucideIcon just to size/color a passed-in icon, so this cast is the
   honest way to hand it a brand glyph instead of a stock lucide mark. */
const JourneyIdentityGlyph = GlyphJourney as unknown as LucideIcon;
const LetterIdentityGlyph = GlyphLetter as unknown as LucideIcon;

interface ApplicationCardProps {
  application: ApplicationWithJob;
  onOpenBlueprint?: (applicationId: string) => void;
  /** The employer's real, publicly-safe company name — resolved via the
   *  employer_public_branding view, never the job's internal department
   *  field. Absent (not a placeholder) when it truly isn't on file. */
  companyName?: string | null;
}

/* ── The journey, derived from the job's own workflow ───────────────────
   Built from the shared candidateJourney lib, so "Step X of N" here always
   agrees with the phase screens themselves — no invented step counts. */

function journeyForCard(application: ApplicationWithJob) {
  const job = application.jobs;
  const workflowSteps = (job?.workflow_steps as { id: string; type: string; title?: string }[] | null) || [];
  const quizQuestions = job?.quiz_questions;
  const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
  const steps = buildCandidateJourney(workflowSteps, { hasQuiz });
  const { index } = positionFor(steps, { phase: application.phase, status: application.status });
  return { steps, index };
}

/* ── Status, in journey terms — never internal phase/status jargon ────── */

type ChipTone = { label: string; bg: string; fg: string };

function getStatusChip(application: ApplicationWithJob, displayState: ApplicationDisplayState): ChipTone | null {
  if (displayState.isHired) return { label: "Hired", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" };
  if (application.status === "offered") return { label: "Offer extended", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" };
  if (displayState.isRejected) return { label: "Not selected", bg: "var(--surface-2)", fg: "var(--ink-2)" };

  // Interview chips first, and NOT gated on isWaitingPhase. The scheduling
  // wizard sets status "interview" without moving the phase, so a candidate
  // asked to pick a time could fall past this whole branch and out to a bare
  // "In review" chip — the exact opposite of what they were emailed.
  if (displayState.interviewNeedsTimePick) return { label: "Pick your time", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
  if (displayState.hasScheduledInterview && displayState.interviewConfirmed) return { label: "Interview confirmed", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" };
  if (displayState.hasScheduledInterview && displayState.interviewNeedsConfirmation) return { label: "Needs your response", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };

  if (displayState.isWaitingPhase) {
    if (displayState.interviewConfirmed) return { label: "Interview confirmed", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" };
    if (displayState.interviewNeedsConfirmation) return { label: "Needs your response", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
    if (displayState.interviewRescheduleRequested) return { label: "Reschedule requested", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
    if (application.status === "interview") return { label: "Interview stage", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
    return { label: "In review", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
  }

  if (displayState.isPendingReview) {
    return {
      label: displayState.isVoiceInterviewComplete ? "Interview complete — in review" : "In review",
      bg: "var(--amber-bg)",
      fg: "var(--amber-fg)",
    };
  }

  // Action needed is carried by the primary button, not a second chip.
  if (displayState.showActionButton) return null;

  return { label: statusLabels[application.status] || "In progress", bg: "var(--surface-2)", fg: "var(--ink-2)" };
}

/** One warm line, only where it adds something the chip and button don't
 *  already say. */
function getGuidanceCopy(displayState: ApplicationDisplayState): string | null {
  if (displayState.showActionButton) {
    const estimate = phaseDurationEstimates[displayState.phaseType]?.label;
    return estimate ? `Your turn — about ${estimate}.` : "Your turn — pick this up when you're ready.";
  }
  // An interview with the team is said by its own block on the card
  // (InterviewCallout), with its own button: no second line about it here.
  return null;
}

function getOutcomeCopy(application: ApplicationWithJob, displayState: ApplicationDisplayState): string | null {
  if (displayState.isHired) return "Congratulations — the team will be in touch about next steps.";
  // No offer email exists in this system, so "check your email" sent them
  // looking for something that was never sent.
  if (application.status === "offered") return "An offer's been extended — the team will be in touch with the details.";
  if (displayState.isRejected) return "This one didn't move forward. There's always the next role.";
  return null;
}

function StatusChip({ tone }: { tone: ChipTone }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

/**
 * The interview with the hiring team, on the card itself: what is asked of
 * the applicant and the button that opens it. Before 2026-10-07 an applicant
 * who had been offered times saw a small chip beside "Take Assessment" and
 * had to guess that the row opened to them (the owner, testing as one: "make
 * it very clear when the interview is scheduled").
 */
function InterviewCallout({ words, onOpen }: { words: CandidateInterviewWords; onOpen: (e: React.MouseEvent) => void }) {
  const settled = words.stage === "confirmed";
  return (
    <div
      data-interview-callout={words.stage}
      className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[10px] border px-3.5 py-3"
      style={{
        borderColor: settled ? "var(--hair)" : "var(--brass-line)",
        background: settled ? "var(--jade-soft)" : "var(--amber-bg)",
      }}
    >
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          <Calendar className="h-4 w-4 shrink-0" style={{ color: settled ? "var(--jade-soft-fg)" : "var(--amber-fg)" }} />
          {words.title}
        </p>
        <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {words.body}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        data-testid="interview-open"
        className={
          words.theirMove
            ? "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-semibold transition-[filter] hover:brightness-110 active:scale-[0.98]"
            : "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-2)]"
        }
        style={words.theirMove ? { background: "var(--jade)", color: "var(--btn-fg)" } : { borderColor: "var(--hair)", color: "var(--ink)" }}
      >
        {words.action}
      </button>
    </div>
  );
}

function JourneyProgress({ index, total, title }: { index: number; total: number; title: string }) {
  const pct = Math.min(100, Math.max(0, Math.round((index / Math.max(total - 1, 1)) * 100)));
  return (
    <div className="mt-3.5">
      <div className="text-[11px] font-medium" style={{ color: "var(--ink-2)" }}>
        Step {index + 1} of {total} — {title}
      </div>
      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: "var(--jade)" }}
        />
      </div>
    </div>
  );
}

function ApplicationCard({ application, onDelete, onOpenBlueprint, companyName }: ApplicationCardProps & { onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const job = application.jobs;

  // Use shared display state utility - SINGLE SOURCE OF TRUTH
  const displayState = getApplicationDisplayState(application);
  const ActionIcon = displayState.actionIcon;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", application.id);

      if (error) throw error;
      toast.success("Application withdrawn successfully");
      onDelete(application.id);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to withdraw application");
    } finally {
      setIsDeleting(false);
    }
  };

  // Determine if the row should navigate — only employer-controlled waits are locked.
  //
  // "Employer-controlled" is the whole test, and it was being applied too
  // widely: the entire isWaitingPhase branch was locked, including the states
  // where the chip on this very row says "Needs your response". The candidate
  // was told to act and then given a row that does nothing. The detail page
  // renders CandidateInterviewConfirmationCard for exactly these states, so the
  // destination existed the whole time — only the door was shut.
  //
  // A confirmed interview opens too: that is where the time, the meeting link
  // and Add to calendar live, and wanting to look at them again is normal.
  const candidateHasSomethingToDo =
    displayState.interviewNeedsConfirmation ||
    displayState.interviewRescheduleRequested ||
    displayState.interviewConfirmed ||
    // The scheduling wizard writes "awaiting_pick", which matches none of the
    // three above — so an employer who offered three windows produced a row
    // that still would not open. This was the gap left by the first pass.
    displayState.interviewNeedsTimePick;
  const isFinal = displayState.isHired || displayState.isRejected || application.status === "offered";

  const { steps: journeySteps, index: stepIndex } = journeyForCard(application);
  const currentStepTitle = journeySteps[stepIndex]?.title || "";

  const guidance = getGuidanceCopy(displayState);
  const outcome = getOutcomeCopy(application, displayState);

  // The interview with the team, when one is live: its own block and button.
  const interviewWords = isFinal ? null : candidateInterviewWords(application.latestInterview, { company: companyName, now: new Date() });
  const chip: ChipTone | null = interviewWords
    ? interviewWords.stage === "confirmed"
      ? { label: interviewWords.chip, bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" }
      : { label: interviewWords.chip, bg: "var(--amber-bg)", fg: "var(--amber-fg)" }
    : getStatusChip(application, displayState);

  // A live interview always opens: that is where its times, its link and its
  // calendar file are.
  const isLocked =
    (displayState.isPendingReview || displayState.isWaitingPhase) && !candidateHasSomethingToDo && !interviewWords;

  const goToDetail = () => {
    if (!isLocked) navigate(`/applications/${application.id}`);
  };

  const openInterview = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/applications/${application.id}#interview`);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // The candidate's true current step (journeyForCard: phase + status),
    // opened through the one step-to-route map every step page and the
    // overview use (journeyProgress.stepRoute), so every step type App.tsx
    // routes is covered. A hand-kept list of route segments used to sit
    // here and missed the connection check and the typing test: their
    // buttons went to /applications/<id>/connection with no step, a 404.
    const step = journeySteps[stepIndex];
    const route = step ? stepRoute(application.id, step) : null;
    navigate(route ?? `/applications/${application.id}`);
  };

  return (
    <div
      className={`ck-card ck-reveal group relative p-5 ${!isLocked ? "ck-row cursor-pointer" : ""}`}
      role={!isLocked ? "button" : undefined}
      tabIndex={!isLocked ? 0 : undefined}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (isLocked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-[17px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {job?.title || "Unknown Position"}
          </h3>
          {companyName && (
            <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--ink-3)" }}>
              {companyName}
            </p>
          )}
        </div>
        {chip && <StatusChip tone={chip} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
        {job?.location && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words [overflow-wrap:anywhere]">{job.location}</span>
          </span>
        )}
        {job?.job_type && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words [overflow-wrap:anywhere]">{job.job_type}</span>
          </span>
        )}
        <span className="inline-flex min-w-0 items-center gap-1">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          Applied {format(new Date(application.created_at), "MMM d, yyyy")}
        </span>
      </div>

      {isFinal
        ? outcome && (
            <p className="mt-3.5 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
              {outcome}
            </p>
          )
        : (
            <>
              {interviewWords && <InterviewCallout words={interviewWords} onOpen={openInterview} />}
              <JourneyProgress index={stepIndex} total={journeySteps.length} title={currentStepTitle} />
            </>
          )}

      {guidance && (
        <p className="mt-2 text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
          {guidance}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {displayState.showActionButton && (
          <button
            type="button"
            onClick={handleActionClick}
            data-testid="application-action"
            // One solid button per card: when the interview is theirs to
            // answer, that is the one, and the step's button steps back.
            className={
              interviewWords?.theirMove
                ? "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border px-5 text-sm font-semibold transition-colors hover:bg-[var(--surface-2)]"
                : "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-semibold transition-[filter] hover:brightness-110 active:scale-[0.98]"
            }
            style={
              interviewWords?.theirMove
                ? { borderColor: "var(--hair)", color: "var(--ink)" }
                : { background: "var(--jade)", color: "var(--btn-fg)" }
            }
          >
            {ActionIcon && <ActionIcon className="h-4 w-4" />}
            {displayState.actionLabel}
          </button>
        )}

        {displayState.isRejected && onOpenBlueprint && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBlueprint(application.id);
            }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition-colors hover:bg-[var(--amber-bg)]"
            style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
          >
            <Download className="h-4 w-4" />
            {/* The price belongs on the button, not behind it — never conceal
                a charge until after the click, especially here. While billing
                is off (app_settings 'blueprint_paid' = false) the report is
                free, so the button says so honestly instead of quoting a
                price nobody will be charged. */}
            <>Get Improvement Report</>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)]"
              style={{ color: "var(--ink-3)" }}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmWithdrawOpen(true);
              }}
              className="text-[var(--crit)] focus:bg-[var(--crit-bg)] focus:text-[var(--crit)]"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Withdraw application
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={confirmWithdrawOpen} onOpenChange={setConfirmWithdrawOpen}>
          <AlertDialogContent
            onClick={(e) => e.stopPropagation()}
            style={{ borderTop: "3px solid var(--brass-line)" }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-xl">Withdraw this application?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes your application for &ldquo;{job?.title}&rdquo; for good. If you change your mind,
                you're welcome to apply again from the job's page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Withdrawing..." : "Withdraw Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!isLocked && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />}
      </div>
    </div>
  );
}

function StatTile({ label, value, tone, index }: { label: string; value: number; tone?: "jade"; index: number }) {
  return (
    <div className="ck-card ck-reveal px-4 py-3.5" style={{ ["--ck-i" as string]: index }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      <div className="ck-num mt-1.5 text-[22px] font-semibold leading-none" style={{ color: tone === "jade" ? "var(--jade)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

export default function Applications() {
  const { role, user } = useAuth();
  const isEmployer = role === "employer";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: applications, isLoading, isError, refetch } = useCandidateApplications();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter] = useState<string | null>(null);
  const [showBlueprintDialog, setShowBlueprintDialog] = useState(false);
  const [blueprintApplicationId, setBlueprintApplicationId] = useState<string | null>(null);
  const [rejectedAnnouncement, setRejectedAnnouncement] = useState<{
    applicationId: string;
    jobTitle?: string | null;
    companyName?: string | null;
  } | null>(null);

  // "Continue on your computer" promises: on the computer, go to
  // <site>/applications, sign in, and you are taken straight to the step
  // (docs/COMPUTER-ONLY-TESTS.md). So a FRESH arrival here (opened by its
  // address, or straight from signing in) on a computer, with exactly one
  // step waiting for a computer, opens that step. Arriving from inside the
  // app is the list, so nobody is bounced off a page they asked for.
  // Decided once per visit: a realtime refetch never forwards later.
  const freshArrival = isFreshArrival(location);
  const [forwardDecided, setForwardDecided] = useState(false);
  const waitingOnComputer = useMemo(
    () => (freshArrival && !forwardDecided && !isEmployer ? stepWaitingOnComputer(applications) : null),
    [freshArrival, forwardDecided, isEmployer, applications],
  );
  useEffect(() => {
    if (forwardDecided || !applications) return;
    if (!waitingOnComputer) {
      setForwardDecided(true);
      return;
    }
    let cancelled = false;
    void thisDeviceKind().then((kind) => {
      if (cancelled) return;
      if (kind === "computer") navigate(waitingOnComputer.route, { replace: true });
      setForwardDecided(true);
    });
    return () => {
      cancelled = true;
    };
  }, [forwardDecided, applications, waitingOnComputer, navigate]);
  // While that is being decided the list waits under its skeleton, so a
  // computer does not see it flash before the step opens.
  const deciding = !!waitingOnComputer;

  const handleDeleteApplication = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
  };

  // The employer's real, public-safe company name. jobs.department is a job
  // department, not a company — employer_public_branding is the honest
  // source (RLS keeps raw employer profiles invisible to candidates).
  const employerIds = useMemo(
    () =>
      Array.from(
        new Set(
          (applications ?? [])
            .map((app) => app.jobs?.employer_id)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [applications]
  );

  const { data: employerNames } = useQuery({
    queryKey: ["applications", "employer-branding", employerIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_public_branding")
        .select("user_id, company_name")
        .in("user_id", employerIds);

      if (error) throw error;

      const map: Record<string, string> = {};
      (data ?? []).forEach((row) => {
        if (row.user_id && row.company_name) map[row.user_id] = row.company_name;
      });
      return map;
    },
    enabled: employerIds.length > 0,
  });

  const handleOpenBlueprintDialog = (applicationId: string) => {
    setBlueprintApplicationId(applicationId);
    setShowBlueprintDialog(true);
  };

  // Subscribe to real-time updates for all candidate applications
  useEffect(() => {
    if (!user || isEmployer) return;

    const channel = supabase
      .channel("candidate-applications")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${user.id}`,
        },
        (payload) => {
          const newStatus = payload.new.status as string | undefined;
          const oldStatus = payload.old?.status as string | undefined;

          if (newStatus === "rejected" && oldStatus !== "rejected") {
            const updatedApplicationId = payload.new.id as string;
            const existingApplication = applications?.find((application) => application.id === updatedApplicationId);

            const employerId = existingApplication?.jobs?.employer_id;
            setRejectedAnnouncement({
              applicationId: updatedApplicationId,
              jobTitle: existingApplication?.jobs?.title,
              companyName: employerId ? employerNames?.[employerId] : undefined,
            });
          }

          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isEmployer, refetch, applications, employerNames]);

  const filteredApplications = applications?.filter((app) => {
    const matchesSearch = app.jobs?.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || app.status === statusFilter;
    return matchesSearch !== false && matchesStatus;
  });

  const stats = applications?.reduce(
    (acc, app) => {
      acc.total++;
      if (app.status === "pending") acc.pending++;
      if (app.status === "reviewing" || app.status === "interview") acc.active++;
      if (app.status === "hired" || app.status === "offered") acc.success++;
      return acc;
    },
    { total: 0, pending: 0, active: 0, success: 0 }
  ) || { total: 0, pending: 0, active: 0, success: 0 };

  if (isEmployer) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="ck-card max-w-md p-8 text-center">
          <GlyphLetter size={40} className="mx-auto mb-4" style={{ color: "var(--ink-3)" }} />
          <h2 className="font-display text-xl font-semibold" style={{ color: "var(--ink)" }}>
            Candidate Access Only
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
            This page is for job seekers. Use the Applicants section to view applications to your jobs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ck-page space-y-6">
      <CandidateStatusScreen
        state={rejectedAnnouncement ? "rejected" : null}
        jobTitle={rejectedAnnouncement?.jobTitle ?? undefined}
        companyName={rejectedAnnouncement?.companyName ?? undefined}
        applicationId={rejectedAnnouncement?.applicationId}
        onClose={() => setRejectedAnnouncement(null)}
      />

      {/* Header */}
      <div>
        <h1 className="font-display ck-ink text-[26px] font-semibold leading-tight sm:text-[28px]" style={{ color: "var(--ink)" }}>
          Your applications
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
          Everything you've applied to, and exactly where each one stands.
        </p>
      </div>

      {/* Stats + search only earn their space once there's enough to sift through */}
      {(applications?.length ?? 0) >= 3 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile index={0} label="Applied" value={stats.total} />
            <StatTile index={1} label="Awaiting review" value={stats.pending} />
            <StatTile index={2} label="In progress" value={stats.active} />
            <StatTile index={3} label="Offers &amp; hires" value={stats.success} tone="jade" />
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
            <Input
              placeholder="Search applications..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Application List */}
      <div className="space-y-3">
        {isLoading || deciding ? (
          <>
            <Skeleton className="h-40 w-full rounded-[14px]" />
            <Skeleton className="h-40 w-full rounded-[14px]" />
          </>
        ) : isError ? (
          // A failed fetch used to fall through to the empty state, which told a
          // candidate they had never applied to anything — the most alarming
          // possible reading of a network blip, on the screen where they check
          // whether their applications still exist. Say what actually happened
          // and give them the retry.
          <div className="ck-card px-5 py-8 text-center">
            <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
              We couldn't load your applications
            </p>
            <p className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
              Nothing has been lost — this is on our end. Check your connection and try again.
            </p>
            <Button className="mt-4" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : filteredApplications && filteredApplications.length > 0 ? (
          filteredApplications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              onDelete={handleDeleteApplication}
              onOpenBlueprint={handleOpenBlueprintDialog}
              companyName={application.jobs?.employer_id ? employerNames?.[application.jobs.employer_id] : undefined}
            />
          ))
        ) : (
          <EmptyStateCard
            icon={JourneyIdentityGlyph}
            title="Ready to Start Your Job Search?"
            description="See the roles the Zulu Support Team has open. Each one has its own page with an Apply button."
            action={{
              // The open roles, not the job-code box: nobody who came from a
              // job's link has a code (docs/SHORT-JOB-LINKS.md). With one open
              // role, the careers page opens it.
              label: "See open roles",
              onClick: () => navigate("/"),
              icon: LetterIdentityGlyph,
            }}
          />
        )}
      </div>

      {/* Blueprint Dialog */}
      <Dialog open={showBlueprintDialog} onOpenChange={setShowBlueprintDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your Improvement Blueprint</DialogTitle>
          </DialogHeader>
          {blueprintApplicationId && (
            <ImprovementBlueprintCard applicationId={blueprintApplicationId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
