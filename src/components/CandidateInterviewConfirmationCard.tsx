import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format, isFuture, differenceInMinutes, differenceInHours } from "date-fns";
import { Calendar, Clock, Video, Check, RefreshCw, Loader2, ExternalLink, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CandidateRescheduleRequestDialog } from "./CandidateRescheduleRequestDialog";
import { getTimezoneAbbreviation } from "@/lib/timezone";

// Candidate can join in-app starting this many minutes before the scheduled start.
const JOIN_WINDOW_MINUTES = 15;
// A confirmed windows-pick can be swapped for another proposed window, without
// waiting on the employer, as long as it's more than this far out.
const FREE_REPICK_HOURS = 12;

interface EmployerWindow {
  start: string;
  durationMinutes: number;
}

interface Interview {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  interview_type: string | null;
  meeting_link: string | null;
  status: string;
  candidate_response: string | null;
  proposed_times: any;
  candidate_note: string | null;
  employer_windows?: unknown;
  meeting_provider?: string | null;
  meeting_room_url?: string | null;
  meeting_room_name?: string | null;
}

interface CandidateInterviewConfirmationCardProps {
  interview: Interview;
  applicationId: string;
  employerName?: string | null;
}

function parseEmployerWindows(raw: unknown): EmployerWindow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && typeof (w as any).start === "string")
    .map((w) => ({
      start: w.start as string,
      durationMinutes: typeof w.durationMinutes === "number" ? (w.durationMinutes as number) : 30,
    }));
}

export function CandidateInterviewConfirmationCard({
  interview,
  applicationId,
  employerName,
}: CandidateInterviewConfirmationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [pickingStart, setPickingStart] = useState<string | null>(null);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showRepickSheet, setShowRepickSheet] = useState(false);

  // Local state for optimistic UI updates
  const [localCandidateResponse, setLocalCandidateResponse] = useState(interview.candidate_response);
  const [localProposedTimesCount, setLocalProposedTimesCount] = useState<number>(
    Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0
  );
  const [localCandidateNote, setLocalCandidateNote] = useState<string | null>(interview.candidate_note);
  // Optimistic override for the window the candidate just picked/re-picked —
  // cleared once the server row (interview.scheduled_at) catches up.
  const [localPickedWindow, setLocalPickedWindow] = useState<EmployerWindow | null>(null);

  // Ticking clock so the countdown / join-window / free-repick checks stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sync local state when prop changes
  useEffect(() => {
    setLocalCandidateResponse(interview.candidate_response);
    setLocalProposedTimesCount(Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0);
    setLocalCandidateNote(interview.candidate_note);
    setLocalPickedWindow(null);
  }, [interview.candidate_response, interview.proposed_times, interview.candidate_note, interview.scheduled_at]);

  const windows = useMemo(() => parseEmployerWindows(interview.employer_windows), [interview.employer_windows]);
  const hasWindows = windows.length > 0;
  // Only ever offer times that haven't already passed.
  const futureWindows = useMemo(() => windows.filter((w) => isFuture(new Date(w.start))), [windows]);

  // Use local state for immediate UI feedback
  const candidateResponse = localCandidateResponse || "pending";
  const isScheduled = interview.status === "scheduled";
  const isAwaitingPick = candidateResponse === "awaiting_pick" && hasWindows;

  const effectiveScheduledAt = localPickedWindow?.start ?? interview.scheduled_at;
  const effectiveDurationMinutes = localPickedWindow?.durationMinutes ?? interview.duration_minutes;
  const scheduledDate = new Date(effectiveScheduledAt);
  const isFutureInterview = isFuture(scheduledDate);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      // Call edge function for confirmation
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "confirm",
          interviewId: interview.id,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Failed to confirm interview");
      }

      // Optimistic update - immediately show confirmed state
      setLocalCandidateResponse("confirmed");

      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      toast.success("Interview confirmed!");
    } catch (error) {
      console.error("Error confirming interview:", error);
      toast.error("Failed to confirm interview");
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePickSlot = async (window: EmployerWindow, action: "pick_slot" | "repick_slot") => {
    setPickingStart(window.start);
    const previousResponse = localCandidateResponse;
    const previousPicked = localPickedWindow;

    // Optimistic: lock the UI onto this time right away.
    setLocalCandidateResponse("confirmed");
    setLocalPickedWindow(window);
    if (action === "repick_slot") setShowRepickSheet(false);

    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action,
          interviewId: interview.id,
          slotStart: window.start,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Failed to lock in that time");
      }

      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });

      toast.success(
        action === "repick_slot"
          ? `Time updated${employerName ? ` — ${employerName} has been notified.` : "."}`
          : "Time locked in!"
      );
    } catch (error) {
      console.error(`Error running ${action}:`, error);
      // Revert the optimistic guess
      setLocalCandidateResponse(previousResponse);
      setLocalPickedWindow(previousPicked);
      toast.error("Couldn't lock in that time. Please try again.");
    } finally {
      setPickingStart(null);
    }
  };

  const handleRescheduleSuccess = ({ proposedTimesCount, candidateNote }: { proposedTimesCount: number; candidateNote: string | null }) => {
    // Optimistic update with the actual count
    setLocalCandidateResponse("reschedule_requested");
    setLocalProposedTimesCount(proposedTimesCount);
    setLocalCandidateNote(candidateNote);
  };

  // Determine what to show based on candidate response
  const getStatusDisplay = () => {
    switch (candidateResponse) {
      case "awaiting_pick":
        return {
          badge: <Badge className="bg-[var(--amber-bg)] text-[var(--amber-fg)] border-[var(--brass-line)]">Pick a Time</Badge>,
          message: employerName
            ? `${employerName} proposed a few times for a conversation. Pick what works:`
            : "A few times have been proposed for a conversation. Pick what works:",
        };
      case "confirmed":
        return {
          badge: <Badge className="bg-success/20 text-success border-success/30">Confirmed</Badge>,
          message: hasWindows
            ? `Locked in — ${format(scheduledDate, "EEEE, MMMM d 'at' h:mm a")}. You'll join right from here.`
            : "You've confirmed this interview. See you there!",
        };
      case "reschedule_requested":
        return {
          badge: <Badge className="bg-[var(--amber-bg)] text-[var(--amber-fg)] border-[var(--brass-line)]">Reschedule Requested</Badge>,
          message: "Waiting for employer to review your proposed times.",
        };
      default:
        return {
          badge: <Badge className="bg-primary/20 text-primary border-primary/30">Action Required</Badge>,
          message: "Please confirm or request to reschedule this interview.",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Join / countdown
  const minutesToStart = differenceInMinutes(scheduledDate, now);
  const canJoin = candidateResponse === "confirmed" && minutesToStart <= JOIN_WINDOW_MINUTES;
  const hasDailyRoom = interview.meeting_provider === "daily";
  const hasLegacyLink = !hasDailyRoom && !!interview.meeting_link;

  const handleJoin = () => {
    if (hasDailyRoom) {
      navigate(`/applications/${applicationId}/interview-room`);
    }
  };

  // "Can't make it?" — free re-pick if other windows remain and we're well out.
  // Compare as epoch millis, not raw strings: Postgres re-serializes timestamptz
  // with a "+00:00" suffix while employer_windows keeps JS's "...Z" strings, so a
  // string comparison here would never match the currently-picked window.
  const effectiveScheduledAtMs = new Date(effectiveScheduledAt).getTime();
  const otherFutureWindows = windows.filter(
    (w) => new Date(w.start).getTime() !== effectiveScheduledAtMs && isFuture(new Date(w.start))
  );
  const hoursToStart = differenceInHours(scheduledDate, now);
  const canFreeRepick =
    hasWindows && candidateResponse === "confirmed" && otherFutureWindows.length > 0 && hoursToStart > FREE_REPICK_HOURS;

  const handleCantMakeIt = () => {
    if (canFreeRepick) {
      setShowRepickSheet(true);
    } else {
      setShowRescheduleDialog(true);
    }
  };

  if (!isScheduled) return null;
  if (!isAwaitingPick && !isFutureInterview) return null;

  const renderSlotGrid = (action: "pick_slot" | "repick_slot", slots: EmployerWindow[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {slots.map((w) => {
        const isThisPicking = pickingStart === w.start;
        const isDisabled = pickingStart !== null;
        return (
          <button
            key={w.start}
            type="button"
            disabled={isDisabled}
            onClick={() => handlePickSlot(w, action)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors",
              "border-border bg-card",
              !isDisabled && "hover:border-[var(--jade)] hover:bg-[var(--jade-soft)]",
              isThisPicking && "border-[var(--jade)] bg-[var(--jade-soft)]",
              isDisabled && !isThisPicking && "opacity-50"
            )}
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {format(new Date(w.start), "EEE, MMM d")}
            </span>
            <span className="text-base font-semibold text-foreground flex items-center gap-2">
              {isThisPicking ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--jade)]" />
              ) : (
                <Clock className="h-4 w-4 text-[var(--jade)]" />
              )}
              {format(new Date(w.start), "h:mm a")}
            </span>
            <span className="text-xs text-muted-foreground">{w.durationMinutes} min</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">
                  {isAwaitingPick ? "Pick a Time" : "Interview Scheduled"}
                </h3>
                {statusDisplay.badge}
              </div>
            </div>
          </div>

          {!isAwaitingPick && (
            <>
              {/* Interview Details */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(scheduledDate, "EEEE, MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(scheduledDate, "h:mm a")}{" "}
                    <span className="text-muted-foreground">({getTimezoneAbbreviation()})</span>
                  </span>
                  {effectiveDurationMinutes && (
                    <span className="text-muted-foreground">• {effectiveDurationMinutes} min</span>
                  )}
                </div>
              </div>

              {/* Timezone Note for Candidates */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                <Globe className="h-3 w-3" />
                <span>Times shown in your local timezone</span>
              </div>
            </>
          )}

          <p className="text-sm text-muted-foreground mb-4">{statusDisplay.message}</p>

          {/* Slot picker */}
          {isAwaitingPick && (
            <div className="mb-4">
              {futureWindows.length > 0 ? (
                <>
                  {renderSlotGrid("pick_slot", futureWindows)}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                    <Globe className="h-3 w-3" />
                    <span>Times shown in your local timezone ({getTimezoneAbbreviation()})</span>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-foreground">
                    Those times have passed. Let us know what works for you instead.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRescheduleDialog(true)}
                    className="gap-2 mt-3"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Ask for new times
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {candidateResponse === "pending" && (
              <>
                <Button onClick={handleConfirm} disabled={isConfirming} className="gap-2">
                  {isConfirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Confirm Interview
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRescheduleDialog(true)}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Request Reschedule
                </Button>
              </>
            )}

            {candidateResponse === "confirmed" && (hasDailyRoom || hasLegacyLink) && (
              <>
                {hasDailyRoom ? (
                  <Button onClick={handleJoin} disabled={!canJoin} className="gap-2">
                    <Video className="h-4 w-4" />
                    Join Interview
                  </Button>
                ) : (
                  <Button asChild disabled={!canJoin} className="gap-2">
                    <a
                      href={canJoin ? interview.meeting_link! : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!canJoin}
                      onClick={(e) => {
                        if (!canJoin) e.preventDefault();
                      }}
                    >
                      <Video className="h-4 w-4" />
                      Join Meeting
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                {!canJoin && (
                  <span className="text-xs text-muted-foreground">
                    Join opens {JOIN_WINDOW_MINUTES} min before — starts{" "}
                    {format(scheduledDate, "EEE, MMM d 'at' h:mm a")}
                  </span>
                )}
              </>
            )}

            {candidateResponse === "confirmed" && hasWindows && (
              <Button variant="ghost" size="sm" onClick={handleCantMakeIt} className="gap-2 text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                Can't make it?
              </Button>
            )}

            {candidateResponse === "reschedule_requested" && (
              <div className="text-sm text-muted-foreground">
                You proposed {localProposedTimesCount} alternative time(s).
                {localCandidateNote && (
                  <p className="mt-1 italic">"{localCandidateNote}"</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CandidateRescheduleRequestDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        interviewId={interview.id}
        applicationId={applicationId}
        currentScheduledAt={effectiveScheduledAt}
        onSuccess={handleRescheduleSuccess}
      />

      {/* Light re-pick sheet: swap to another proposed window, no employer approval needed */}
      <Dialog open={showRepickSheet} onOpenChange={setShowRepickSheet}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick a different time</DialogTitle>
            <DialogDescription>
              No need to wait for approval — pick another proposed time and
              {employerName ? ` ${employerName}` : " the employer"} will be told right away.
            </DialogDescription>
          </DialogHeader>
          {renderSlotGrid("repick_slot", otherFutureWindows)}
        </DialogContent>
      </Dialog>
    </>
  );
}
