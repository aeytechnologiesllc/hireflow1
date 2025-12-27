import { useState } from "react";
import { useCreateInterview } from "@/hooks/useInterviews";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ScheduleInterviewDialogProps {
  applicationId: string | null;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ScheduleInterviewDialog({
  applicationId,
  candidateName,
  open,
  onOpenChange,
}: ScheduleInterviewDialogProps) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("15");
  const [interviewType, setInterviewType] = useState("video");
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  
  const createInterview = useCreateInterview();
  const updateApplication = useUpdateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId || !scheduledAt) return;

    try {
      await createInterview.mutateAsync({
        application_id: applicationId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: parseInt(duration),
        interview_type: interviewType,
        meeting_link: meetingLink || null,
        notes: notes || null,
      });
      
      await updateApplication.mutateAsync({
        id: applicationId,
        status: "interview",
      });

      toast.success("Interview scheduled successfully!");
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to schedule interview");
    }
  };

  const resetForm = () => {
    setScheduledAt("");
    setDuration("60");
    setInterviewType("video");
    setMeetingLink("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Schedule Interview</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Schedule an interview with {candidateName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheduledAt" className="text-foreground">Date & Time</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="bg-background border-border"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Type</Label>
              <Select value={interviewType} onValueChange={setInterviewType}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="video">Video Call</SelectItem>
                  <SelectItem value="phone">Phone Call</SelectItem>
                  <SelectItem value="in-person">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetingLink" className="text-foreground">Meeting Link</Label>
            <Input
              id="meetingLink"
              placeholder="https://zoom.us/j/..."
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-foreground">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Interview details, topics to cover..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="bg-background border-border resize-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createInterview.isPending}>
              {createInterview.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Schedule Interview
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
