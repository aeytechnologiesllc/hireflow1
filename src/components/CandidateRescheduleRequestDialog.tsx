import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getTimezoneAbbreviation, getTimezoneName } from "@/lib/timezone";
import { interviewWhen } from "@/lib/candidateInterview";

interface AvailabilitySentData {
  /** What they wrote, as sent. */
  availability: string;
}

interface CandidateRescheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  applicationId: string;
  /**
   * The time they are saying no to (the one offered, or the one that was
   * set), or null when there is none on the table (it passed, or someone
   * else booked it).
   */
  currentScheduledAt: string | null;
  /** The employer's public name, when it is on file. */
  employerName?: string | null;
  onSuccess?: (data: AvailabilitySentData) => void;
}

/** The shortest answer taken ("Any day" is one) and the longest kept: the function's own limits. */
const MIN_LENGTH = 3;
const MAX_LENGTH = 500;

/**
 * "I can't make it": the applicant writes when they are free, in their own
 * words, and the hiring team sets the new time (Interviews page,
 * EmployerRescheduleReviewDialog).
 *
 * There are no time pickers here, on purpose. The owner, 2026-10-07: "if
 * they cannot make it on that time, don't let them just select times. Let
 * them write a message ... type out your availability. Not like actual time,
 * your availability ... because I don't want them to pick two times and then
 * I can't do those two times. Then we have to do too much back and forth."
 * Until then this pop-up asked for at least two exact times.
 */
export function CandidateRescheduleRequestDialog({
  open,
  onOpenChange,
  interviewId,
  applicationId,
  currentScheduledAt,
  employerName,
  onSuccess,
}: CandidateRescheduleRequestDialogProps) {
  const team = employerName?.trim() || "the hiring team";
  const Team = team === "the hiring team" ? "The hiring team" : team;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availability, setAvailability] = useState("");

  const written = availability.trim();
  const ready = written.length >= MIN_LENGTH;

  const handleSubmit = async () => {
    if (!ready) {
      toast.error("Write which days and times you are free");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "reschedule_requested",
          interviewId,
          availability: written,
          // Their own clock: the team is told how far it is from theirs.
          timeZone: getTimezoneName(),
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send availability");

      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      toast.success(`Sent. ${Team} will set a new time.`, { description: "You will be told here and by email." });
      onSuccess?.({ availability: written });
      onOpenChange(false);
      setAvailability("");
    } catch (error) {
      console.error("Error sending availability:", error);
      toast.error("Couldn't send that. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hf-sheet sm:max-w-lg" data-interview-availability>
        <DialogHeader>
          <DialogTitle className="font-display text-[22px] font-semibold">
            {currentScheduledAt ? "Can't make it?" : "Tell them when you're free"}
          </DialogTitle>
          <DialogDescription>
            {currentScheduledAt
              ? `No problem. Instead of ${interviewWhen(currentScheduledAt)}, tell ${team} when you are free and they will set a new time.`
              : `Tell ${team} when you are free and they will set a time.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 py-3">
          <Label htmlFor="interview-availability" className="text-[14.5px] font-semibold text-foreground">
            Your availability
          </Label>
          <p className="text-[14px] leading-snug" style={{ color: "var(--ink-2)" }}>
            Which days are you free, and from what time to what time?
          </p>
          <Textarea
            id="interview-availability"
            className="hf-field hf-field--area"
            style={{ minHeight: 132 }}
            placeholder="For example: Monday to Wednesday, 9:00 AM to 2:00 PM. Friday any time after 4:00 PM."
            value={availability}
            maxLength={MAX_LENGTH}
            onChange={(e) => setAvailability(e.target.value)}
            rows={5}
            autoFocus
            data-interview-availability-text
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="hf-chip" data-interview-clock>
              <Clock />
              Write times on your own clock · {getTimezoneAbbreviation()}
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--ink-3)" }} aria-hidden>
              {availability.length} / {MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2.5 sm:gap-2.5 sm:space-x-0">
          <button type="button" className="hf-pill hf-pill--tonal" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="hf-pill hf-pill--jade"
            onClick={handleSubmit}
            disabled={isSubmitting || !ready}
            data-interview-availability-send
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            Send my availability
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
