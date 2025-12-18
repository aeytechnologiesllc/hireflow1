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
import { AlertTriangle, Loader2 } from "lucide-react";
import { useUpdateApplication } from "@/hooks/useApplications";
import { toast } from "sonner";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";

interface BulkRejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedApplications: ApplicationWithCandidate[];
  onSuccess: () => void;
}

export default function BulkRejectDialog({
  open,
  onOpenChange,
  selectedApplications,
  onSuccess,
}: BulkRejectDialogProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const updateApplication = useUpdateApplication();

  const handleReject = async () => {
    setIsLoading(true);
    try {
      await Promise.all(
        selectedApplications.map((app) =>
          updateApplication.mutateAsync({
            id: app.id,
            status: "rejected",
            employer_notes: reason || undefined,
          })
        )
      );
      toast.success(`${selectedApplications.length} applicant${selectedApplications.length !== 1 ? "s" : ""} rejected`);
      onSuccess();
      onOpenChange(false);
      setReason("");
    } catch (error) {
      toast.error("Failed to reject some applicants");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reject {selectedApplications.length} Applicant{selectedApplications.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            This action will reject all selected applicants and notify them of the decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Selected Applicants</Label>
            <ScrollArea className="h-32 mt-2 rounded-lg border border-border">
              <div className="p-2 space-y-2">
                {selectedApplications.map((app) => (
                  <div key={app.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {getInitials(app.profiles?.full_name, app.profiles?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {app.profiles?.full_name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {app.jobs?.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Rejection Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Enter a reason for rejection (internal note only)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reject {selectedApplications.length} Applicant{selectedApplications.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
