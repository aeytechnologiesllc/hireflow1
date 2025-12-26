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
import { AlertTriangle, Loader2, CalendarX } from "lucide-react";
import { useUpdateApplication } from "@/hooks/useApplications";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";
import { getApplicantDisplayName, getInitialsFromName } from "@/utils/getApplicantDisplayName";
import { format } from "date-fns";

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
  const { user } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const queryClient = useQueryClient();

  // Query for scheduled interviews across all selected applications
  const applicationIds = selectedApplications.map(app => app.id);
  const { data: scheduledInterviews } = useQuery({
    queryKey: ["interviews", "bulk-scheduled", applicationIds],
    queryFn: async () => {
      if (applicationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("interviews")
        .select("id, scheduled_at, application_id, interview_type")
        .in("application_id", applicationIds)
        .eq("status", "scheduled");
      if (error) throw error;
      return data || [];
    },
    enabled: open && applicationIds.length > 0,
  });

  const handleReject = async () => {
    if (!user) return;
    setIsLoading(true);
    
    // Determine rejection type: team member vs regular employer
    const rejectedByType = permissions?.isTeamMember ? 'team_member' : 'user';
    
    try {
      // First, delete all scheduled interviews for these applications
      if (applicationIds.length > 0) {
        const { error: interviewError } = await supabase
          .from("interviews")
          .delete()
          .in("application_id", applicationIds);
        
        if (interviewError) {
          console.error("Failed to delete interviews:", interviewError);
        }
      }

      // Then reject all applications
      await Promise.all(
        selectedApplications.map((app) =>
          updateApplication.mutateAsync({
            id: app.id,
            status: "rejected",
            employer_notes: reason || undefined,
            rejected_by: user.id,
            rejected_by_type: rejectedByType,
          })
        )
      );
      
      // Invalidate interview queries
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      
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

  const getDisplayName = (app: ApplicationWithCandidate) => 
    getApplicantDisplayName(app.notes, app.profiles?.full_name, app.profiles?.email);

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
                        {getInitialsFromName(getDisplayName(app))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getDisplayName(app)}
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

          {/* Scheduled Interviews Warning */}
          {scheduledInterviews && scheduledInterviews.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-destructive flex items-center gap-2">
                <CalendarX className="h-4 w-4" />
                {scheduledInterviews.length} scheduled interview{scheduledInterviews.length !== 1 ? 's' : ''} will be canceled
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-20 overflow-y-auto">
                {scheduledInterviews.map((interview) => (
                  <li key={interview.id}>
                    • {format(new Date(interview.scheduled_at), "PPP 'at' p")}
                    {interview.interview_type && ` (${interview.interview_type})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
