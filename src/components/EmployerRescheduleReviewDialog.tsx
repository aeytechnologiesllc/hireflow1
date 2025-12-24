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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Calendar, Clock, Loader2, MessageSquare, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
}

export function EmployerRescheduleReviewDialog({
  open,
  onOpenChange,
  interviewId,
  applicationId,
  currentScheduledAt,
  proposedTimes,
  candidateNote,
  onMessageCandidate,
}: EmployerRescheduleReviewDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [action, setAction] = useState<"accept" | "keep" | null>(null);

  const handleAcceptTime = async () => {
    if (!selectedTime) {
      toast.error("Please select a time slot");
      return;
    }

    setIsSubmitting(true);
    setAction("accept");
    try {
      // First get the application to find candidate_id
      const { data: interview } = await supabase
        .from("interviews")
        .select("applications(candidate_id, jobs(title))")
        .eq("id", interviewId)
        .single();

      const { error } = await supabase
        .from("interviews")
        .update({
          scheduled_at: selectedTime,
          candidate_response: "pending", // Reset for re-confirmation
          proposed_times: null,
          candidate_note: null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      // Create notification for candidate
      const candidateId = (interview?.applications as any)?.candidate_id;
      const jobTitle = (interview?.applications as any)?.jobs?.title || "Interview";
      
      if (candidateId) {
        await supabase.from("notifications").insert({
          user_id: candidateId,
          type: "interview",
          title: "Interview Rescheduled",
          message: `Your interview for ${jobTitle} has been rescheduled to a new time. Please confirm.`,
          link: `/applications`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      
      toast.success("Interview rescheduled! Candidate will need to confirm the new time.");
      onOpenChange(false);
    } catch (error) {
      console.error("Error accepting reschedule:", error);
      toast.error("Failed to reschedule interview");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeepOriginal = async () => {
    setIsSubmitting(true);
    setAction("keep");
    try {
      // First get the application to find candidate_id
      const { data: interview } = await supabase
        .from("interviews")
        .select("applications(candidate_id, jobs(title)), scheduled_at")
        .eq("id", interviewId)
        .single();

      const { error } = await supabase
        .from("interviews")
        .update({
          candidate_response: "pending", // Reset - they need to confirm original
          proposed_times: null,
          candidate_note: null,
        })
        .eq("id", interviewId);

      if (error) throw error;

      // Create notification for candidate
      const candidateId = (interview?.applications as any)?.candidate_id;
      const jobTitle = (interview?.applications as any)?.jobs?.title || "Interview";
      
      if (candidateId) {
        await supabase.from("notifications").insert({
          user_id: candidateId,
          type: "interview",
          title: "Interview Time Confirmed",
          message: `The employer has kept the original interview time for ${jobTitle}. Please confirm your attendance.`,
          link: `/applications`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      
      toast.success("Original time kept. Candidate will be notified.");
      onOpenChange(false);
    } catch (error) {
      console.error("Error keeping original time:", error);
      toast.error("Failed to update interview");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMessageCandidate = () => {
    onOpenChange(false);
    onMessageCandidate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Reschedule Request</DialogTitle>
          <DialogDescription>
            The candidate has requested to reschedule this interview.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Original Time */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Original Time
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(currentScheduledAt), "EEEE, MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(currentScheduledAt), "h:mm a")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Candidate's Note */}
          {candidateNote && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-xs text-amber-500 uppercase tracking-wide mb-1">Candidate's Note</p>
              <p className="text-sm text-foreground italic">"{candidateNote}"</p>
            </div>
          )}

          {/* Proposed Times */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Candidate's Proposed Times</p>
            <RadioGroup value={selectedTime} onValueChange={setSelectedTime}>
              {proposedTimes.map((time, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <RadioGroupItem value={time.datetime} id={`time-${index}`} />
                  <Label htmlFor={`time-${index}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{format(new Date(time.datetime), "EEEE, MMMM d, yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{format(new Date(time.datetime), "h:mm a")}</span>
                      </div>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 flex-shrink-0 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleMessageCandidate}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Message Candidate
          </Button>
          <Button
            variant="outline"
            onClick={handleKeepOriginal}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && action === "keep" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Keep Original
          </Button>
          <Button
            onClick={handleAcceptTime}
            disabled={isSubmitting || !selectedTime}
            className="gap-2"
          >
            {isSubmitting && action === "accept" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Accept Selected Time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
