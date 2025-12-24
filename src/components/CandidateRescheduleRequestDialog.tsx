import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { format, addDays } from "date-fns";
import { CalendarIcon, Clock, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ProposedTime {
  date: Date | undefined;
  time: string;
}

interface CandidateRescheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  applicationId: string;
  currentScheduledAt: string;
  onSuccess?: () => void;
}

export function CandidateRescheduleRequestDialog({
  open,
  onOpenChange,
  interviewId,
  applicationId,
  currentScheduledAt,
  onSuccess,
}: CandidateRescheduleRequestDialogProps) {
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

  const updateProposedTime = (index: number, field: "date" | "time", value: any) => {
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
      toast.error("Please provide at least 2 alternative time slots");
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

      const { error } = await supabase
        .from("interviews")
        .update({
          candidate_response: "reschedule_requested",
          proposed_times: formattedTimes,
          candidate_note: note || null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });

      toast.success("Reschedule request sent to employer");
      
      // Call success callback for optimistic UI update
      onSuccess?.();
      
      onOpenChange(false);
      
      // Reset form
      setProposedTimes([{ date: undefined, time: "" }, { date: undefined, time: "" }]);
      setNote("");
    } catch (error) {
      console.error("Error requesting reschedule:", error);
      toast.error("Failed to send reschedule request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Reschedule</DialogTitle>
          <DialogDescription>
            Current interview: {format(new Date(currentScheduledAt), "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Please provide at least 2 alternative times that work for you. The employer will review your request.
          </p>

          {proposedTimes.map((slot, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">Option {index + 1}</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !slot.date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {slot.date ? format(slot.date, "MMM d, yyyy") : "Pick date"}
                      </Button>
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
                    <SelectTrigger className="w-28">
                      <Clock className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {proposedTimes.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeTimeSlot(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {proposedTimes.length < 3 && (
            <Button variant="outline" size="sm" onClick={addTimeSlot} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Another Time Option
            </Button>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Note to Employer (optional)</Label>
            <Textarea
              id="note"
              placeholder="Explain why you need to reschedule..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
