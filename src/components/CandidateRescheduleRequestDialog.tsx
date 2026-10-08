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
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Clock, Loader2, Plus, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getTimezoneAbbreviation, getTimezoneName } from "@/lib/timezone";

interface ProposedTime {
  date: Date | undefined;
  time: string;
}

interface RescheduleSuccessData {
  proposedTimesCount: number;
  candidateNote: string | null;
}

interface CandidateRescheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  applicationId: string;
  /**
   * The time that is set now, or null when none was ever agreed (the team
   * offered times and the applicant is answering "none of these work").
   */
  currentScheduledAt: string | null;
  /** The employer's public name, when it is on file. */
  employerName?: string | null;
  onSuccess?: (data: RescheduleSuccessData) => void;
}

/** "13:30" as people say it: "1:30 PM". */
function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The applicant suggests times of their own: when none of the offered times
 * work, or to move a time that is already set. The hiring team answers on
 * the Interviews page (EmployerRescheduleReviewDialog).
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
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposedTimes, setProposedTimes] = useState<ProposedTime[]>([
    { date: undefined, time: "" },
    { date: undefined, time: "" },
  ]);
  const [note, setNote] = useState("");

  const timeOptions = Array.from({ length: 24 }, (_, hour) => {
    return ["00", "30"].map((min) => {
      const h = hour.toString().padStart(2, "0");
      return `${h}:${min}`;
    });
  }).flat();

  const updateProposedTime = (index: number, field: "date" | "time", value: Date | string | undefined) => {
    setProposedTimes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addTimeSlot = () => {
    if (proposedTimes.length < 3) {
      setProposedTimes((prev) => [...prev, { date: undefined, time: "" }]);
    }
  };

  const removeTimeSlot = (index: number) => {
    if (proposedTimes.length > 2) {
      setProposedTimes((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    // Validate at least 2 complete time slots
    const validTimes = proposedTimes.filter((t) => t.date && t.time);
    if (validTimes.length < 2) {
      toast.error("Give at least 2 times that work for you");
      return;
    }

    setIsSubmitting(true);
    try {
      // Format proposed times as ISO strings
      const formattedTimes = validTimes.map((t) => {
        const [hours, minutes] = t.time.split(":");
        const datetime = new Date(t.date!);
        datetime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        return { datetime: datetime.toISOString() };
      });

      // Call edge function for reschedule request
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "reschedule_requested",
          interviewId,
          proposedTimes: formattedTimes,
          candidateNote: note || null,
          timeZone: getTimezoneName(),
        },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to submit reschedule request");
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });

      toast.success(`Sent. ${team === "the hiring team" ? "The hiring team" : team} will reply with a time.`);
      
      // Call success callback with optimistic data
      onSuccess?.({
        proposedTimesCount: formattedTimes.length,
        candidateNote: note || null,
      });
      
      onOpenChange(false);
      
      // Reset form
      setProposedTimes([{ date: undefined, time: "" }, { date: undefined, time: "" }]);
      setNote("");
    } catch (error) {
      console.error("Error requesting reschedule:", error);
      toast.error("Couldn't send your times. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hf-sheet sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px] font-semibold">{currentScheduledAt ? "Ask for another time" : "Suggest times that work for you"}</DialogTitle>
          <DialogDescription>
            {currentScheduledAt
              ? `Set now for ${format(new Date(currentScheduledAt), "EEEE, MMMM d 'at' h:mm a")} (${getTimezoneAbbreviation()}).`
              : `Give ${team} at least 2 times you can do.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {currentScheduledAt
              ? `Give at least 2 other times you can do. ${team === "the hiring team" ? "The hiring team" : team} picks one and you are told here and by email.`
              : `${team === "the hiring team" ? "The hiring team" : team} picks one and you are told here and by email.`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>Times are on your own clock ({getTimezoneAbbreviation()}).</span>
          </div>

          {proposedTimes.map((slot, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">Option {index + 1}</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn("hf-pill hf-pill--tonal hf-field flex-1", !slot.date && "hf-field--empty")}
                      >
                        <CalendarIcon />
                        {slot.date ? format(slot.date, "EEE, MMM d") : "Pick date"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={slot.date}
                        onSelect={(date) => updateProposedTime(index, "date", date)}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Select
                    value={slot.time}
                    onValueChange={(value) => updateProposedTime(index, "time", value)}
                  >
                    <SelectTrigger className="hf-field hf-field--select w-36">
                      <Clock className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {clockLabel(time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {proposedTimes.length > 2 && (
                <button type="button" className="hf-pill hf-pill--text shrink-0" aria-label={`Remove option ${index + 1}`} onClick={() => removeTimeSlot(index)}>
                  <X />
                </button>
              )}
            </div>
          ))}

          {proposedTimes.length < 3 && (
            <button type="button" className="hf-pill hf-pill--text hf-pill--link" onClick={addTimeSlot}>
              <Plus />
              Add another time
            </button>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Note to the team (optional)</Label>
            <Textarea
              id="note"
              className="hf-field hf-field--area"
              placeholder="Anything they should know, for example the hours you are free."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2.5 sm:gap-2.5 sm:space-x-0">
          <button type="button" className="hf-pill hf-pill--tonal" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className="hf-pill hf-pill--jade" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Send my times
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
