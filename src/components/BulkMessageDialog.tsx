import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { useSendMessage } from "@/hooks/useMessages";
import { toast } from "sonner";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";

interface BulkMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedApplications: ApplicationWithCandidate[];
  onSuccess: () => void;
}

export default function BulkMessageDialog({
  open,
  onOpenChange,
  selectedApplications,
  onSuccess,
}: BulkMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sendMessage = useSendMessage();

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setIsLoading(true);
    try {
      await Promise.all(
        selectedApplications.map((app) =>
          sendMessage.mutateAsync({
            receiver_id: app.candidate_id,
            content: message,
            application_id: app.id,
          })
        )
      );
      toast.success(`Message sent to ${selectedApplications.length} applicant${selectedApplications.length !== 1 ? "s" : ""}`);
      onSuccess();
      onOpenChange(false);
      setMessage("");
    } catch (error) {
      toast.error("Failed to send some messages");
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase();
    }
    return email?.[0]?.toUpperCase() || "?";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Message {selectedApplications.length} Applicant{selectedApplications.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Send the same message to all selected applicants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Recipients</Label>
            <ScrollArea className="h-24 mt-2 rounded-lg border border-border">
              <div className="p-2 flex flex-wrap gap-2">
                {selectedApplications.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted/50 text-sm"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {getInitials(app.profiles?.full_name, app.profiles?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-foreground">
                      {app.profiles?.full_name || app.profiles?.email || "Unknown"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isLoading || !message.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
