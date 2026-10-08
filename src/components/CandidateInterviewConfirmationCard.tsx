import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { differenceInHours } from "date-fns";
import { ArrowRight, CalendarPlus, Check, Clock, ExternalLink, Loader2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CandidateRescheduleRequestDialog } from "./CandidateRescheduleRequestDialog";
import { getTimezoneAbbreviation, getTimezoneName } from "@/lib/timezone";
import { buildCandidateInterviewIcs, downloadIcsFile, icsFileStem } from "@/lib/calendarInvite";
import {
  SELECTED_TITLE,
  candidateInterviewStage,
  clockTime,
  interviewKindWords,
  interviewWhen,
  joinOpensWords,
  joinPlan,
  offeredWindows,
  openWindows,
  ticketDate,
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
 * The look is the "Ticket": the date on a stub, torn along a dashed line,
 * and no button anywhere is a dark slab (styles: src/styles/motion.css). The
 * owner chose it from three drawn options on 2026-10-07 after a photo of the
 * card it replaces: "why are we still using the ugly old design, black
 * buttons ... I don't like them. Always choose modern."
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

/** The date as a ticket stub: weekday, day, month. */
function Stub({ at, mini = false }: { at: string; mini?: boolean }) {
  const d = ticketDate(at);
  return (
    <div className={mini ? "hf-mini__stub" : "hf-ticket__stub"} aria-hidden>
      <span className="hf-ticket__wk">{d?.weekday}</span>
      <span className="hf-ticket__num">{d?.day}</span>
      <span className="hf-ticket__mo">{d?.month}</span>
    </div>
  );
}

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
  const who = [jobTitle?.trim(), employerName?.trim()].filter(Boolean).join(" · ");

  // Joining: a link of the team's own opens two hours before the start, the
  // built-in room fifteen minutes before (src/lib/candidateInterview.ts).
  const join = joinPlan({ ...interview, scheduled_at: effectiveScheduledAt, duration_minutes: effectiveDurationMinutes }, now);
  const canJoin = stage === "confirmed" && join.open;
  const hasBuiltInRoom = interview.meeting_provider === "daily";
  const ownLink = !hasBuiltInRoom && interview.meeting_link ? interview.meeting_link : null;
  const opensWords = join.opensAt ? interviewWhen(join.opensAt) : "";
  const opensShort = joinOpensWords(join.opensAt, now);
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

  /** One offered time, as a small ticket. Tapping it only asks; "Yes, book it" books. */
  const miniTicket = (w: OfferedWindow, action: "pick_slot" | "repick_slot" | null) => {
    const picking = pickingStart === w.start;
    const busy = pickingStart !== null;
    const ask = () => {
      if (!busy && action) setAsking({ window: w, action });
    };
    return (
      <div
        key={w.start}
        className="hf-mini"
        data-interview-slot={w.start}
        data-tappable={action && !busy ? "true" : undefined}
        data-busy={busy && !picking ? "true" : undefined}
        onClick={ask}
        title={interviewWhen(w.start)}
      >
        <Stub at={w.start} mini />
        <div className="hf-mini__main">
          <div className="hf-mini__time">{clockTime(w.start)}</div>
          <div className="hf-mini__sub">
            {w.durationMinutes} minutes · your time ({zone})
          </div>
        </div>
        {action ? (
          <button
            type="button"
            className="hf-pill hf-pill--mint hf-pill--sm"
            disabled={busy}
            aria-label={`Choose ${interviewWhen(w.start)}`}
            onClick={(e) => {
              e.stopPropagation();
              ask();
            }}
          >
            {picking ? "Booking" : "Choose"}
            {picking ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  };

  const slotList = (action: "pick_slot" | "repick_slot", slots: OfferedWindow[]) => (
    <div className="grid gap-3" data-interview-slots={slots.length}>
      {slots.map((w) => miniTicket(w, action))}
    </div>
  );

  /** Seal, small line, headline: the top of the two cards that are not tickets. */
  const header = (eyebrow: string, title: string, line: string, press: boolean) => (
    <div className="flex items-start gap-4 sm:gap-[18px]">
      <InterviewSeal size={54} press={press} />
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--brass)" }}>
          {eyebrow}
        </p>
        <h3 className="font-display mt-1.5 text-balance text-[24px] font-semibold leading-[1.12] text-foreground sm:text-[30px]">{title}</h3>
        {line && <p className="mt-2 text-[14.5px] leading-snug" style={{ color: "var(--ink-3)" }}>{line}</p>}
      </div>
    </div>
  );

  const noneWork = (question: string) => (
    <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[14.5px]" style={{ color: "var(--ink-3)" }}>
      <span>{question}</span>
      <button type="button" className="hf-pill hf-pill--text hf-pill--link" onClick={() => setSuggestOpen(true)} data-interview-suggest>
        Suggest other times
      </button>
      <span className="hf-chip ml-auto" data-interview-clock>
        <Clock />
        Your time · {zone}
      </span>
    </div>
  );

  /** The ticket itself: the stub with the date, and what goes beside it. */
  const ticket = (tone: "selected" | "confirmed", label: string, children: React.ReactNode) => (
    <div className="hf-ticket-wrap">
      <span className="hf-ticket__notch hf-ticket__notch--top" aria-hidden />
      <span className="hf-ticket__notch hf-ticket__notch--bottom" aria-hidden />
      <InterviewSurface id="interview" tone={tone} sparks={false} data-candidate-interview={stage} className="scroll-mt-24" aria-label={label}>
        <div className="hf-ticket">
          <Stub at={effectiveScheduledAt} />
          <div className="hf-ticket__main">{children}</div>
        </div>
      </InterviewSurface>
    </div>
  );

  const timeLine = (
    <div className="hf-ticket__time" data-interview-when title={interviewWhen(effectiveScheduledAt)}>
      {clockTime(effectiveScheduledAt)}
      <small>your time ({zone})</small>
    </div>
  );
  const facts = (
    <>
      {who && <p className="mt-2.5 break-words text-[15px] leading-snug [overflow-wrap:anywhere]" style={{ color: "var(--ink-2)" }}>{who}</p>}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <span className="hf-chip">
          <Video />
          {kind}
        </span>
        {effectiveDurationMinutes ? (
          <span className="hf-chip">
            <Clock />
            {effectiveDurationMinutes} minutes
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {/* ── Pick: the times the team offered ── */}
      {stage === "pick" && (
        <InterviewSurface id="interview" tone="selected" data-candidate-interview={stage} className="scroll-mt-24">
          <div className="p-5 sm:px-8 sm:py-[30px]">
            {futureWindows.length > 0 ? (
              <>
                {header(
                  "Congratulations",
                  SELECTED_TITLE,
                  futureWindows.length === 1
                    ? `${team} offered one time. Take it, or suggest another.`
                    : `${team} offered ${futureWindows.length} times. Pick the one that works for you.`,
                  true,
                )}
                <div className="mt-6">{slotList("pick_slot", futureWindows)}</div>
                {noneWork(futureWindows.length === 1 ? "Can't make it?" : "None of these work?")}
              </>
            ) : (
              <>
                {header("Congratulations", SELECTED_TITLE, `The times ${teamLower} offered have passed. Tell them what works for you.`, true)}
                <div className="mt-6">
                  <button type="button" className="hf-pill hf-pill--jade" onClick={() => setSuggestOpen(true)} data-interview-suggest>
                    Suggest times
                    <ArrowRight />
                  </button>
                </div>
              </>
            )}
          </div>
        </InterviewSurface>
      )}

      {/* ── Confirm: one time the team set ── */}
      {stage === "confirm" &&
        ticket(
          "selected",
          `${SELECTED_TITLE}: ${interviewWhen(effectiveScheduledAt)}`,
          <>
            <p className="text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--brass)" }}>
              Congratulations
            </p>
            <h3 className="font-display mt-1.5 text-balance text-[22px] font-semibold leading-[1.15] text-foreground sm:text-[26px]">{SELECTED_TITLE}</h3>
            {timeLine}
            {facts}
            <p className="mt-4 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
              Confirm it if it works, or ask for another time.
            </p>
            <div className="hf-acts mt-4">
              <button type="button" className="hf-pill hf-pill--jade hf-pill--lg" onClick={handleConfirm} disabled={isConfirming} data-interview-confirm>
                {isConfirming ? <Loader2 className="animate-spin" /> : <Check />}
                Confirm this time
              </button>
              <button type="button" className="hf-pill hf-pill--tonal hf-pill--lg" onClick={() => setSuggestOpen(true)} data-interview-suggest>
                Ask for another time
              </button>
            </div>
          </>,
        )}

      {/* ── Waiting: they suggested times ── */}
      {stage === "waiting" && (
        <InterviewSurface id="interview" tone="quiet" data-candidate-interview={stage} className="scroll-mt-24">
          <div className="p-5 sm:px-8 sm:py-[30px]">
            {header(
              "Your interview",
              "You asked for another interview time",
              `You suggested ${localProposedTimesCount === 1 ? "one time" : `${localProposedTimesCount} times`}. ${team} will reply here and by email. Nothing to do for now.`,
              false,
            )}
            {localCandidateNote && (
              <p className="mt-3 text-sm italic sm:pl-[72px]" style={{ color: "var(--ink-3)" }}>
                &ldquo;{localCandidateNote}&rdquo;
              </p>
            )}
            {futureWindows.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-[14.5px]" style={{ color: "var(--ink-3)" }}>
                  Changed your mind? {futureWindows.length === 1 ? "The time they offered is" : "The times they offered are"} still open:
                </p>
                {slotList("pick_slot", futureWindows)}
              </div>
            )}
          </div>
        </InterviewSurface>
      )}

      {/* ── Confirmed: when, how to join, and a way to change ── */}
      {stage === "confirmed" &&
        ticket(
          "confirmed",
          `Your interview is confirmed: ${interviewWhen(effectiveScheduledAt)}`,
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--brass)" }}>
                Interview confirmed
              </span>
              <span className="hf-chip hf-chip--ok">
                <Check />
                You&apos;re booked
              </span>
            </div>
            {timeLine}
            {facts}
            <div className="hf-acts mt-5">
              {(hasBuiltInRoom || ownLink) && (
                <button
                  type="button"
                  onClick={handleJoin}
                  className={canJoin ? "hf-pill hf-pill--jade hf-pill--lg" : "hf-pill hf-pill--tonal hf-pill--lg"}
                  data-interview-join={canJoin ? "open" : "not-yet"}
                >
                  {canJoin ? <Video /> : <span className="hf-dot" aria-hidden />}
                  {canJoin ? "Join interview now" : `Join opens ${opensShort}`}
                  {canJoin && ownLink && <ExternalLink style={{ width: 14, height: 14 }} />}
                </button>
              )}
              <button
                type="button"
                className="hf-pill hf-pill--mint hf-pill--lg"
                onClick={handleAddToCalendar}
                title="Saves a calendar file that works with Google, Apple and Outlook"
              >
                <CalendarPlus />
                Add to calendar
              </button>
              <button
                type="button"
                className="hf-pill hf-pill--text"
                onClick={() => (canFreeRepick ? setShowRepickSheet(true) : setSuggestOpen(true))}
                data-interview-change
              >
                Can&apos;t make it?
              </button>
            </div>
            <p
              className="mt-3.5 flex items-center gap-2 text-[13.5px] leading-snug"
              style={{ color: canJoin ? "var(--jade-soft-fg)" : joinAsked ? "var(--ink)" : "var(--ink-3)", fontWeight: joinAsked && !canJoin ? 500 : 400 }}
              data-interview-join-note
              aria-live="polite"
            >
              {canJoin && <span className="hf-dot hf-dot--live" aria-hidden />}
              {hasBuiltInRoom || ownLink
                ? canJoin
                  ? "The call is open: join when you are ready."
                  : `Join opens ${join.leadWords} before the start. Come back to this page then. Your calendar file has the link too.`
                : kind === "Video call"
                  ? `${team} will send you how to join.`
                  : `${team} will be in touch with the details.`}
            </p>
          </>,
        )}

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
        <AlertDialogContent data-interview-ask={asking?.action ?? ""} className="hf-sheet">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[22px] font-semibold">
              {asking?.action === "repick_slot" ? "Move your interview to this time?" : "Book this time?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {asking && (
                  <div className="mt-2" data-interview-ask-when aria-label={interviewWhen(asking.window.start)}>
                    {miniTicket(asking.window, null)}
                  </div>
                )}
                <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {team} is told right away. If something comes up you can change it from this page.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2.5 sm:gap-2.5 sm:space-x-0">
            <AlertDialogCancel className="hf-pill hf-pill--tonal" data-interview-ask-back>
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              className="hf-pill hf-pill--jade"
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
        <DialogContent className="hf-sheet sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-[22px] font-semibold">Pick a different time</DialogTitle>
            <DialogDescription>
              Choose another of the offered times and {teamLower} is told right away. No need to wait for approval.
            </DialogDescription>
          </DialogHeader>
          {slotList("repick_slot", otherFutureWindows)}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[14.5px]" style={{ color: "var(--ink-3)" }}>
            <span>None of these work?</span>
            <button
              type="button"
              className="hf-pill hf-pill--text hf-pill--link"
              onClick={() => {
                setShowRepickSheet(false);
                setSuggestOpen(true);
              }}
            >
              Suggest other times
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
