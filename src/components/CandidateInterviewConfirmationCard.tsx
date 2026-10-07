import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { differenceInHours } from "date-fns";
import { CalendarPlus, Check, Clock, ExternalLink, Loader2, RefreshCw, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CandidateRescheduleRequestDialog } from "./CandidateRescheduleRequestDialog";
import { getTimezoneAbbreviation, getTimezoneName } from "@/lib/timezone";
import { buildCandidateInterviewIcs, downloadIcsFile, icsFileStem } from "@/lib/calendarInvite";
import {
  SELECTED_TITLE,
  candidateInterviewStage,
  interviewKindWords,
  interviewWhen,
  joinPlan,
  offeredWindows,
  openWindows,
  type OfferedWindow,
} from "@/lib/candidateInterview";
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
import { InterviewSeal, InterviewSurface } from "@/components/candidate/InterviewCelebration";
import { markOwnInterviewChange } from "@/lib/ownInterviewChange";
import type { Json } from "@/integrations/supabase/types";

/**
 * The applicant's side of an interview with the hiring team: the times they
 * were offered, the one they chose, and how to join (docs/INTERVIEWS.md,
 * "What the applicant sees").
 *
 * Four stages, read by src/lib/candidateInterview.ts so this card, the
 * applications list and the pop-up always agree:
 *  - pick: the team offered times. They choose one, or say none work and
 *    suggest their own.
 *  - confirm: the team set one time. They confirm it or ask for another.
 *  - waiting: they suggested times; the team has not answered. The offered
 *    times stay pickable.
 *  - confirmed: the time, how to join, a calendar file, and a way to change.
 *
 * Every time here is on the reader's own clock, and says so.
 *
 * Nothing is booked on one tap: choosing a time asks "Book this time?" first
 * (the owner, 2026-10-07: "as soon as I clicked on the time, it just went
 * ahead and did it. It didn't say, are you sure"). And the way in is a button
 * that always answers: before it opens it says when it will ("maybe allow
 * them to click on a button. The button will just say it will be available a
 * couple hours before").
 */
// A confirmed pick can be swapped for another offered time, without waiting
// on the team, as long as it is more than this far out.
const FREE_REPICK_HOURS = 12;

interface Interview {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  interview_type: string | null;
  meeting_link: string | null;
  status: string;
  candidate_response: string | null;
  proposed_times: Json | null;
  candidate_note: string | null;
  employer_windows?: unknown;
  meeting_provider?: string | null;
  meeting_room_url?: string | null;
  meeting_room_name?: string | null;
  /** Drives the calendar invite's SEQUENCE, so a reschedule updates the existing event instead of duplicating it. */
  updated_at?: string;
}

interface CandidateInterviewConfirmationCardProps {
  interview: Interview;
  applicationId: string;
  employerName?: string | null;
  jobTitle?: string | null;
}

const dayWords = (at: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(at));
const clockWords = (at: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(at)).replace(/\s+/g, " ");

export function CandidateInterviewConfirmationCard({
  interview,
  applicationId,
  employerName,
  jobTitle,
}: CandidateInterviewConfirmationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [pickingStart, setPickingStart] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [showRepickSheet, setShowRepickSheet] = useState(false);
  // The time they tapped, waiting for "Yes, book it".
  const [asking, setAsking] = useState<{ window: OfferedWindow; action: "pick_slot" | "repick_slot" } | null>(null);
  // They pressed Join before it opens: say when it will, on the card.
  const [joinAsked, setJoinAsked] = useState(false);

  // What the applicant just did, shown at once and dropped when the server's
  // row catches up.
  const [localCandidateResponse, setLocalCandidateResponse] = useState(interview.candidate_response);
  const [localProposedTimesCount, setLocalProposedTimesCount] = useState<number>(
    Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0
  );
  const [localCandidateNote, setLocalCandidateNote] = useState<string | null>(interview.candidate_note);
  const [localPickedWindow, setLocalPickedWindow] = useState<OfferedWindow | null>(null);

  // A ticking clock keeps the countdown, the join window and "passed" honest.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setLocalCandidateResponse(interview.candidate_response);
    setLocalProposedTimesCount(Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0);
    setLocalCandidateNote(interview.candidate_note);
    setLocalPickedWindow(null);
  }, [interview.candidate_response, interview.proposed_times, interview.candidate_note, interview.scheduled_at]);

  const windows = useMemo(() => offeredWindows(interview.employer_windows), [interview.employer_windows]);
  const hasWindows = windows.length > 0;
  const futureWindows = useMemo(() => openWindows(windows, now), [windows, now]);

  const effectiveScheduledAt = localPickedWindow?.start ?? interview.scheduled_at;
  const effectiveDurationMinutes = localPickedWindow?.durationMinutes ?? interview.duration_minutes;
  const scheduledDate = new Date(effectiveScheduledAt);

  const stage = candidateInterviewStage(
    { ...interview, candidate_response: localCandidateResponse, scheduled_at: effectiveScheduledAt },
    now,
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    markOwnInterviewChange(interview.id);
    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: { action: "confirm", interviewId: interview.id, timeZone: getTimezoneName() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to confirm interview");

      setLocalCandidateResponse("confirmed");
      refresh();
      toast.success("Interview confirmed");
    } catch (error) {
      console.error("Error confirming interview:", error);
      toast.error("Couldn't confirm. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePickSlot = async (window: OfferedWindow, action: "pick_slot" | "repick_slot") => {
    setPickingStart(window.start);
    const previousResponse = localCandidateResponse;
    const previousPicked = localPickedWindow;

    // Shown at once; put back if the server says no.
    setLocalCandidateResponse("confirmed");
    setLocalPickedWindow(window);
    if (action === "repick_slot") setShowRepickSheet(false);
    // Their own doing: the page must not announce it back as "rescheduled".
    markOwnInterviewChange(interview.id);

    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        // Their own time zone words the time for the team when the team's is not on file.
        body: { action, interviewId: interview.id, slotStart: window.start, timeZone: getTimezoneName() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to lock in that time");

      refresh();
      toast.success(
        action === "repick_slot"
          ? `Time changed${employerName ? `. ${employerName} has been told.` : "."}`
          : `You're booked for ${interviewWhen(window.start)}`
      );
    } catch (error) {
      console.error(`Error running ${action}:`, error);
      setLocalCandidateResponse(previousResponse);
      setLocalPickedWindow(previousPicked);
      toast.error("Couldn't lock in that time. Please try again.");
    } finally {
      setPickingStart(null);
    }
  };

  const handleSuggested = ({ proposedTimesCount, candidateNote }: { proposedTimesCount: number; candidateNote: string | null }) => {
    setLocalCandidateResponse("reschedule_requested");
    setLocalProposedTimesCount(proposedTimesCount);
    setLocalCandidateNote(candidateNote);
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
  };

  if (!stage) return null;

  const team = employerName?.trim() || "The hiring team";
  const teamLower = employerName?.trim() || "the hiring team";
  const zone = getTimezoneAbbreviation();
  const kind = interviewKindWords(interview.interview_type);
  const facts = [jobTitle?.trim(), employerName?.trim(), kind, effectiveDurationMinutes ? `${effectiveDurationMinutes} minutes` : null].filter(Boolean).join(" · ");

  // Joining: a link of the team's own opens two hours before the start, the
  // built-in room fifteen minutes before (src/lib/candidateInterview.ts).
  const join = joinPlan({ ...interview, scheduled_at: effectiveScheduledAt, duration_minutes: effectiveDurationMinutes }, now);
  const canJoin = stage === "confirmed" && join.open;
  const hasBuiltInRoom = interview.meeting_provider === "daily";
  const ownLink = !hasBuiltInRoom && interview.meeting_link ? interview.meeting_link : null;
  const opensWords = join.opensAt ? interviewWhen(join.opensAt) : "";
  const handleJoin = () => {
    if (!canJoin) {
      // Not open yet: the button still answers, with when it will.
      setJoinAsked(true);
      toast.message(`Join opens ${join.leadWords} before your interview`, { description: opensWords ? `That is ${opensWords}. Come back to this page then.` : undefined });
      return;
    }
    if (hasBuiltInRoom) navigate(`/applications/${applicationId}/interview-room`);
    else if (ownLink) window.open(ownLink, "_blank", "noopener,noreferrer");
  };

  // Changing a confirmed time: swap to another offered time while well out,
  // otherwise ask the team. Compared as instants, never as text: Postgres
  // writes "+00:00" where the offered times keep JavaScript's "Z".
  const scheduledMs = scheduledDate.getTime();
  const otherFutureWindows = futureWindows.filter((w) => new Date(w.start).getTime() !== scheduledMs);
  const canFreeRepick =
    stage === "confirmed" && hasWindows && otherFutureWindows.length > 0 && differenceInHours(scheduledDate, now) > FREE_REPICK_HOURS;

  const handleAddToCalendar = () => {
    const joinUrl = hasBuiltInRoom ? `${window.location.origin}/applications/${applicationId}/interview-room` : null;
    const ics = buildCandidateInterviewIcs({
      interviewId: interview.id,
      scheduledAt: effectiveScheduledAt,
      durationMinutes: effectiveDurationMinutes,
      updatedAt: interview.updated_at ?? new Date().toISOString(),
      interviewType: interview.interview_type,
      joinUrl,
      externalMeetingLink: hasBuiltInRoom ? null : interview.meeting_link,
      jobTitle: jobTitle || "the role",
      companyName: employerName || "This employer",
    });
    downloadIcsFile(`interview-${icsFileStem(employerName || "hireflow")}`, ics);
  };

  const slotGrid = (action: "pick_slot" | "repick_slot", slots: OfferedWindow[]) => (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" data-interview-slots={slots.length}>
      {slots.map((w) => {
        const picking = pickingStart === w.start;
        const disabled = pickingStart !== null;
        return (
          <button
            key={w.start}
            type="button"
            disabled={disabled}
            // One tap only asks: "Book this time?" does the booking.
            onClick={() => setAsking({ window: w, action })}
            data-interview-slot={w.start}
            className={cn(
              "flex min-h-[64px] items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors",
              "border-[var(--hair)]",
              !disabled && "hover:border-[var(--jade)] hover:bg-[var(--jade-soft)]",
              picking && "border-[var(--jade)] bg-[var(--jade-soft)]",
              disabled && !picking && "opacity-50",
            )}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{dayWords(w.start)}</span>
              <span className="ck-num mt-0.5 block text-lg font-semibold leading-tight text-foreground">{clockWords(w.start)}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--jade)]">
              {picking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {picking ? "Booking" : "Choose"}
            </span>
          </button>
        );
      })}
    </div>
  );

  const ownClockNote = (
    <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3 shrink-0" />
      Times are on your own clock ({zone}).
    </p>
  );

  // Just chosen, and not answered yet: the surface celebrates.
  const selected = stage === "pick" || stage === "confirm";
  const title = selected ? SELECTED_TITLE : stage === "confirmed" ? "Your interview is confirmed" : "You asked for another interview time";
  const eyebrow = selected ? "Congratulations" : stage === "confirmed" ? "You're booked" : "Your interview";

  return (
    <>
      <InterviewSurface
        id="interview"
        tone={stage === "waiting" ? "quiet" : stage === "confirmed" ? "confirmed" : "selected"}
        data-candidate-interview={stage}
        className="scroll-mt-24"
      >
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4 sm:gap-5">
            <InterviewSeal size={58} press={selected} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--brass)" }}>
                {eyebrow}
              </p>
              <h3 className="font-display mt-1 text-balance text-[22px] font-semibold leading-[1.15] text-foreground sm:text-[28px]">{title}</h3>
              {facts && <p className="mt-1.5 break-words text-[13.5px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{facts}</p>}
            </div>
          </div>

          {/* ── Pick: the times the team offered ── */}
          {stage === "pick" && (
            <div className="mt-4">
              {futureWindows.length > 0 ? (
                <>
                  <p className="mb-3 text-sm text-foreground">
                    {futureWindows.length === 1
                      ? `${team} offered one time. Take it, or suggest another.`
                      : `${team} offered ${futureWindows.length} times. Pick the one that works for you.`}
                  </p>
                  {slotGrid("pick_slot", futureWindows)}
                  {ownClockNote}
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--hair)] pt-4">
                    <span className="text-sm text-muted-foreground">{futureWindows.length === 1 ? "Can't make it?" : "None of these work?"}</span>
                    <Button variant="outline" size="sm" onClick={() => setSuggestOpen(true)} className="gap-2" data-interview-suggest>
                      <RefreshCw className="h-4 w-4" />
                      Suggest other times
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground">The times {teamLower} offered have passed. Tell them what works for you.</p>
                  <Button onClick={() => setSuggestOpen(true)} className="mt-3 gap-2" data-interview-suggest>
                    <RefreshCw className="h-4 w-4" />
                    Suggest times
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Confirm: one time the team set ── */}
          {stage === "confirm" && (
            <div className="mt-4">
              <p className="font-display ck-num text-xl font-semibold leading-snug text-foreground" data-interview-when>
                {interviewWhen(effectiveScheduledAt)}
              </p>
              {ownClockNote}
              <p className="mt-3 text-sm text-foreground">Confirm it if it works, or ask for another time.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Button onClick={handleConfirm} disabled={isConfirming} className="gap-2" data-interview-confirm>
                  {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirm this time
                </Button>
                <Button variant="outline" onClick={() => setSuggestOpen(true)} className="gap-2" data-interview-suggest>
                  <RefreshCw className="h-4 w-4" />
                  Ask for another time
                </Button>
              </div>
            </div>
          )}

          {/* ── Waiting: they suggested times ── */}
          {stage === "waiting" && (
            <div className="mt-4">
              <p className="text-sm text-foreground">
                You suggested {localProposedTimesCount === 1 ? "one time" : `${localProposedTimesCount} times`}. {team} will reply here and by
                email. Nothing to do for now.
              </p>
              {localCandidateNote && <p className="mt-2 text-sm italic text-muted-foreground">&ldquo;{localCandidateNote}&rdquo;</p>}
              {futureWindows.length > 0 && (
                <div className="mt-4 border-t border-[var(--hair)] pt-4">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Changed your mind? {futureWindows.length === 1 ? "The time they offered is" : "The times they offered are"} still open:
                  </p>
                  {slotGrid("pick_slot", futureWindows)}
                  {ownClockNote}
                </div>
              )}
            </div>
          )}

          {/* ── Confirmed: when, how to join, and a way to change ── */}
          {stage === "confirmed" && (
            <div className="mt-4">
              <p className="font-display ck-num text-xl font-semibold leading-snug text-foreground" data-interview-when>
                {interviewWhen(effectiveScheduledAt)}
              </p>
              {ownClockNote}

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {(hasBuiltInRoom || ownLink) && (
                  <Button
                    onClick={handleJoin}
                    variant={canJoin ? "default" : "outline"}
                    className="h-auto gap-2.5 py-2.5"
                    data-interview-join={canJoin ? "open" : "not-yet"}
                    // Sizes inline: the phone stylesheet's button rule outranks any class.
                    style={{ minHeight: 52, paddingInline: 20, fontSize: 15 }}
                  >
                    <Video className="h-4 w-4 shrink-0" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="font-semibold">{canJoin ? "Join interview now" : "Join interview"}</span>
                      {!canJoin && opensWords && (
                        <span className="text-[12px] font-normal text-muted-foreground">Opens {opensWords}</span>
                      )}
                    </span>
                    {canJoin && ownLink && <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleAddToCalendar}
                  className="gap-2"
                  title="Saves a calendar file that works with Google, Apple and Outlook"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Add to calendar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (canFreeRepick ? setShowRepickSheet(true) : setSuggestOpen(true))}
                  className="gap-2 text-muted-foreground"
                  data-interview-change
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Can&apos;t make it?
                </Button>
              </div>

              <p
                className={cn("mt-3 text-sm", joinAsked && !canJoin ? "font-medium text-foreground" : "text-muted-foreground")}
                data-interview-join-note
                aria-live="polite"
              >
                {hasBuiltInRoom || ownLink
                  ? canJoin
                    ? "The call is open: join when you are ready."
                    : `Join opens ${join.leadWords} before the start${opensWords ? `: ${opensWords}` : ""}. Come back to this page then and press Join. The calendar file has the link too.`
                  : kind === "Video call"
                    ? `${team} will send you how to join.`
                    : `${team} will be in touch with the details.`}
              </p>
            </div>
          )}
        </div>
      </InterviewSurface>

      <CandidateRescheduleRequestDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        interviewId={interview.id}
        applicationId={applicationId}
        // No time was ever agreed while they are still choosing: nothing to call "current".
        currentScheduledAt={stage === "pick" || stage === "waiting" ? null : effectiveScheduledAt}
        employerName={employerName}
        onSuccess={handleSuggested}
      />

      {/* "Are you sure?": nothing is booked on one tap. */}
      <AlertDialog open={!!asking} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent data-interview-ask={asking?.action ?? ""} style={{ borderTop: "3px solid var(--brass-line)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">
              {asking?.action === "repick_slot" ? "Move your interview to this time?" : "Book this time?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="font-display ck-num text-[22px] font-semibold leading-snug text-foreground" data-interview-ask-when>
                  {asking ? interviewWhen(asking.window.start) : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  On your own clock ({zone}){asking ? ` · ${asking.window.durationMinutes} minutes` : ""}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {team} is told right away. If something comes up you can change it from this page.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-interview-ask-back>Go back</AlertDialogCancel>
            <AlertDialogAction
              data-interview-ask-yes
              onClick={() => {
                const chosen = asking;
                setAsking(null);
                if (chosen) void handlePickSlot(chosen.window, chosen.action);
              }}
            >
              {asking?.action === "repick_slot" ? "Yes, move it" : "Yes, book it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Swap to another offered time: no approval needed. */}
      <Dialog open={showRepickSheet} onOpenChange={setShowRepickSheet}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick a different time</DialogTitle>
            <DialogDescription>
              Choose another of the offered times and {teamLower} is told right away. No need to wait for approval.
            </DialogDescription>
          </DialogHeader>
          {slotGrid("repick_slot", otherFutureWindows)}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <span className="text-sm text-muted-foreground">None of these work?</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowRepickSheet(false);
                setSuggestOpen(true);
              }}
            >
              Suggest other times
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
