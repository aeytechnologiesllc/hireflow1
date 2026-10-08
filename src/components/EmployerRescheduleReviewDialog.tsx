import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { format, isValid, parseISO } from "date-fns";
import { Calendar, Clock, Loader2, MessageSquare, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getTimezoneAbbreviation } from "@/lib/timezone";
import { applicantEmailTime, localTimeZone } from "@/lib/interviewTimes";
import { fetchApplicantTimeZone } from "@/hooks/useApplicantTimeZone";

/**
 * The hiring team's answer when an applicant suggests interview times of
 * their own (docs/INTERVIEWS.md, "When the applicant suggests other times").
 *
 * Two different situations reach it, and they must not be confused:
 *  - a time was agreed (or set) and the applicant asks to move it: there is
 *    a time to keep;
 *  - the applicant was still choosing among offered times and says none
 *    work (`fromOffer`): no time was ever agreed, and the row's own time is
 *    only a placeholder. There is nothing to "keep": the other answer is to
 *    send them back to the offered times.
 *
 * Accepting one of the applicant's own times settles it: they suggested it,
 * so nobody is asked to confirm it again.
 */

// Helper to safely format dates
const safeFormatDate = (dateStr: string | null | undefined, formatStr: string): string => {
  if (!dateStr) return "Not specified";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (!isValid(date)) return "Invalid date";
    return format(date, formatStr);
  } catch {
    return "Invalid date";
  }
};

interface ProposedTime {
  datetime: string;
}

interface EmployerRescheduleReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  applicationId: string;
  currentScheduledAt: string;
  proposedTimes: ProposedTime[];
  candidateNote: string | null;
  onMessageCandidate: () => void;
  /** The applicant's name, for the wording. */
  candidateName?: string | null;
  /** They were answering offered times: no time was ever agreed. */
  fromOffer?: boolean;
  /** The offered times that have not passed (start instants), for sending them back to. */
  openOfferedTimes?: string[];
}

type JoinedApplication = { candidate_id?: string; jobs?: { title?: string } | null } | null;

export function EmployerRescheduleReviewDialog({
  open,
  onOpenChange,
  interviewId,
  applicationId,
  currentScheduledAt,
  proposedTimes,
  candidateNote,
  onMessageCandidate,
  candidateName,
  fromOffer = false,
  openOfferedTimes = [],
}: EmployerRescheduleReviewDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [action, setAction] = useState<"accept" | "keep" | null>(null);

  const first = candidateName?.trim().split(/\s+/)[0] || "They";
  const them = candidateName?.trim().split(/\s+/)[0] || "them";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["interviews"] });
  };

  /** Who the interview is with, and for which job: what every email here needs. */
  const lookUp = async () => {
    const { data } = await supabase
      .from("interviews")
      .select("applications(candidate_id, jobs(title)), scheduled_at")
      .eq("id", interviewId)
      .single();
    const application = (data?.applications ?? null) as JoinedApplication;
    return {
      candidateId: application?.candidate_id ?? null,
      jobTitle: application?.jobs?.title || "Interview",
      scheduledAt: (data?.scheduled_at as string | undefined) ?? null,
    };
  };

  const handleAcceptTime = async () => {
    if (!selectedTime) {
      toast.error("Choose one of their times first");
      return;
    }

    setIsSubmitting(true);
    setAction("accept");
    try {
      const { candidateId, jobTitle } = await lookUp();

      const { error } = await supabase
        .from("interviews")
        .update({
          scheduled_at: selectedTime,
          // They suggested this time themselves: it is agreed, not waiting on
          // a second confirmation from them.
          candidate_response: "confirmed",
          proposed_times: null,
          candidate_note: null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      // The applicant's bell is the database's own
      // (notify_interview_scheduled_or_rescheduled, on this scheduled_at change).
      if (candidateId) {
        try {
          // On the applicant's own clock, with the zone named (src/lib/interviewTimes.ts).
          const written = applicantEmailTime(parseISO(selectedTime), await fetchApplicantTimeZone(applicationId), localTimeZone());
          const { notifyInterviewScheduled, notifyInterviewRescheduled } = await import("@/utils/emailNotifications");
          // A first agreed time reads as "scheduled"; a moved one as "rescheduled".
          if (fromOffer) await notifyInterviewScheduled(candidateId, jobTitle, written.date, written.time, undefined);
          else await notifyInterviewRescheduled(candidateId, jobTitle, written.date, written.time);
        } catch (emailErr) {
          console.error("Failed to email the agreed time:", emailErr);
        }
      }

      refresh();
      toast.success(`Interview set for ${safeFormatDate(selectedTime, "EEE, MMM d 'at' h:mm a")}`, {
        description: `${first === "They" ? "They have" : `${first} has`} been told. It is confirmed: they suggested this time.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error accepting a suggested time:", error);
      toast.error("Couldn't set that time. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /** A time was set before they asked: it stays, and they are asked to confirm it. */
  const handleKeepOriginal = async () => {
    setIsSubmitting(true);
    setAction("keep");
    try {
      const { candidateId, jobTitle, scheduledAt } = await lookUp();

      const { error } = await supabase
        .from("interviews")
        .update({
          candidate_response: "pending", // They are asked to confirm the time that stands
          proposed_times: null,
          candidate_note: null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      if (candidateId) {
        await supabase.from("notifications").insert({
          user_id: candidateId,
          type: "interview",
          title: "Your interview time stays as it was",
          message: `The hiring team kept the interview time for ${jobTitle}. Please confirm it, or message them.`,
          link: `/applications`,
        });

        if (scheduledAt) {
          try {
            const { notifyInterviewRescheduled } = await import("@/utils/emailNotifications");
            const written = applicantEmailTime(parseISO(scheduledAt), await fetchApplicantTimeZone(applicationId), localTimeZone());
            await notifyInterviewRescheduled(candidateId, jobTitle, written.date, written.time);
          } catch (emailErr) {
            console.error("Failed to email the kept time:", emailErr);
          }
        }
      }

      refresh();
      toast.success("The time stays as it was", { description: `${first === "They" ? "They are" : `${first} is`} asked to confirm it.` });
      onOpenChange(false);
    } catch (error) {
      console.error("Error keeping the time:", error);
      toast.error("Couldn't update the interview. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * No time was agreed and none of theirs work: back to the times that were
   * offered. Never "keep the original": there was none, only a placeholder.
   */
  const handleBackToOffer = async () => {
    setIsSubmitting(true);
    setAction("keep");
    try {
      const { candidateId, jobTitle } = await lookUp();

      const { error } = await supabase
        .from("interviews")
        .update({
          candidate_response: "awaiting_pick",
          proposed_times: null,
          candidate_note: null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      if (candidateId) {
        await supabase.from("notifications").insert({
          user_id: candidateId,
          type: "interview",
          title: "Please pick one of the offered times",
          message: `The times you suggested for ${jobTitle} don't work for the hiring team. Pick one of the times they offered, or message them.`,
          link: `/applications/${applicationId}`,
        });

        try {
          const theirZone = await fetchApplicantTimeZone(applicationId);
          const lines = openOfferedTimes.map((start) => applicantEmailTime(parseISO(start), theirZone, localTimeZone()).line);
          const { notifyInterviewPickTime } = await import("@/utils/emailNotifications");
          await notifyInterviewPickTime(candidateId, jobTitle, lines, undefined);
        } catch (emailErr) {
          console.error("Failed to email the offered times again:", emailErr);
        }
      }

      refresh();
      toast.success(`${first === "They" ? "They are" : `${first} is`} asked to pick one of your offered times`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending them back to the offered times:", error);
      toast.error("Couldn't update the interview. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMessageCandidate = () => {
    onOpenChange(false);
    onMessageCandidate();
  };

  const theirTimes = (proposedTimes ?? []).filter((time) => time?.datetime);
  const zone = getTimezoneAbbreviation();
  const canGoBackToOffer = openOfferedTimes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hf-sheet sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col" data-review-suggested={fromOffer ? "offer" : "set"}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-[22px] font-semibold">{fromOffer ? "Other times suggested" : "Another time asked for"}</DialogTitle>
          <DialogDescription>
            {fromOffer
              ? `${first} can't make the times you offered and suggested ${theirTimes.length === 1 ? "this one" : "these"} instead.`
              : `${first} asked to move this interview and suggested ${theirTimes.length === 1 ? "this time" : "these times"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {/* The time that stands. Not shown for an answer to offered times: none was agreed. */}
          {!fromOffer && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Set now for</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{safeFormatDate(currentScheduledAt, "EEEE, MMMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {safeFormatDate(currentScheduledAt, "h:mm a")} ({zone})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {candidateNote && (
            <div className="bg-[var(--amber-bg)] border border-[var(--brass-line)] rounded-lg p-4">
              <p className="text-xs text-[var(--amber-fg)] uppercase tracking-wide mb-1">Their note</p>
              <p className="text-sm text-foreground italic">&ldquo;{candidateNote}&rdquo;</p>
            </div>
          )}

          {theirTimes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {theirTimes.length === 1 ? "Their time" : "Their times"} <span className="font-normal text-muted-foreground">(on your clock, {zone})</span>
              </p>
              <RadioGroup value={selectedTime} onValueChange={setSelectedTime}>
                {theirTimes.map((time, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                  >
                    <RadioGroupItem value={time.datetime} id={`time-${index}`} />
                    <Label htmlFor={`time-${index}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{safeFormatDate(time.datetime, "EEEE, MMMM d, yyyy")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{safeFormatDate(time.datetime, "h:mm a")}</span>
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg">They did not suggest a time.</div>
          )}

          {fromOffer && (
            <p className="text-xs text-muted-foreground" data-review-offer-note>
              {canGoBackToOffer
                ? `If none of these work for you, ${them} can be sent back to the ${openOfferedTimes.length === 1 ? "time" : `${openOfferedTimes.length} times`} you offered.`
                : `The times you offered have passed. Accept one of theirs, or message ${them} to agree another.`}
            </p>
          )}
        </div>

        {/* Three answers: each label stays on one line, and the row wraps instead of squeezing them. */}
        <DialogFooter className="flex-col gap-2 flex-shrink-0 pt-4 border-t border-border sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 sm:space-x-0">
          <button type="button" className="hf-pill hf-pill--text" onClick={handleMessageCandidate}>
            <MessageSquare />
            Message {them}
          </button>
          {fromOffer ? (
            <button
              type="button"
              className="hf-pill hf-pill--tonal"
              onClick={handleBackToOffer}
              disabled={isSubmitting || !canGoBackToOffer}
              data-review-back-to-offer
            >
              {isSubmitting && action === "keep" ? <Loader2 className="animate-spin" /> : <X />}
              None of these work
            </button>
          ) : (
            <button type="button" className="hf-pill hf-pill--tonal" onClick={handleKeepOriginal} disabled={isSubmitting} data-review-keep>
              {isSubmitting && action === "keep" ? <Loader2 className="animate-spin" /> : <X />}
              Keep the time as it is
            </button>
          )}
          <button type="button" className="hf-pill hf-pill--jade" onClick={handleAcceptTime} disabled={isSubmitting || !selectedTime} data-review-accept>
            {isSubmitting && action === "accept" ? <Loader2 className="animate-spin" /> : <Check />}
            Accept this time
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
