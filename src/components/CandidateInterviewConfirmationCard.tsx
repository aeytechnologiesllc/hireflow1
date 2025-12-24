import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, isFuture } from "date-fns";
import { Calendar, Clock, Video, Check, RefreshCw, Loader2, ExternalLink, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CandidateRescheduleRequestDialog } from "./CandidateRescheduleRequestDialog";
import { getTimezoneAbbreviation } from "@/lib/timezone";

interface Interview {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  interview_type: string | null;
  meeting_link: string | null;
  status: string;
  candidate_response: string | null;
  proposed_times: any;
  candidate_note: string | null;
}

interface CandidateInterviewConfirmationCardProps {
  interview: Interview;
  applicationId: string;
}

export function CandidateInterviewConfirmationCard({
  interview,
  applicationId,
}: CandidateInterviewConfirmationCardProps) {
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  
  // Local state for optimistic UI updates
  const [localCandidateResponse, setLocalCandidateResponse] = useState(interview.candidate_response);
  const [localProposedTimesCount, setLocalProposedTimesCount] = useState<number>(
    Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0
  );
  const [localCandidateNote, setLocalCandidateNote] = useState<string | null>(interview.candidate_note);
  
  // Sync local state when prop changes
  useEffect(() => {
    setLocalCandidateResponse(interview.candidate_response);
    setLocalProposedTimesCount(Array.isArray(interview.proposed_times) ? interview.proposed_times.length : 0);
    setLocalCandidateNote(interview.candidate_note);
  }, [interview.candidate_response, interview.proposed_times, interview.candidate_note]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      // Call edge function for confirmation
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "confirm",
          interviewId: interview.id,
        },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to confirm interview");
      }

      // Optimistic update - immediately show confirmed state
      setLocalCandidateResponse("confirmed");

      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      toast.success("Interview confirmed!");
    } catch (error) {
      console.error("Error confirming interview:", error);
      toast.error("Failed to confirm interview");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRescheduleSuccess = ({ proposedTimesCount, candidateNote }: { proposedTimesCount: number; candidateNote: string | null }) => {
    // Optimistic update with the actual count
    setLocalCandidateResponse("reschedule_requested");
    setLocalProposedTimesCount(proposedTimesCount);
    setLocalCandidateNote(candidateNote);
  };

  // Use local state for immediate UI feedback
  const candidateResponse = localCandidateResponse || "pending";
  const isScheduled = interview.status === "scheduled";
  const isFutureInterview = isFuture(new Date(interview.scheduled_at));

  // Determine what to show based on candidate response
  const getStatusDisplay = () => {
    switch (candidateResponse) {
      case "confirmed":
        return {
          badge: <Badge className="bg-success/20 text-success border-success/30">Confirmed</Badge>,
          message: "You've confirmed this interview. See you there!",
        };
      case "reschedule_requested":
        return {
          badge: <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Reschedule Requested</Badge>,
          message: "Waiting for employer to review your proposed times.",
        };
      default:
        return {
          badge: <Badge className="bg-primary/20 text-primary border-primary/30">Action Required</Badge>,
          message: "Please confirm or request to reschedule this interview.",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  if (!isScheduled || !isFutureInterview) return null;

  return (
    <>
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Interview Scheduled</h3>
                {statusDisplay.badge}
              </div>
            </div>
          </div>

          {/* Interview Details */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(interview.scheduled_at), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(interview.scheduled_at), "h:mm a")}{" "}
                <span className="text-muted-foreground">({getTimezoneAbbreviation()})</span>
              </span>
              {interview.duration_minutes && (
                <span className="text-muted-foreground">• {interview.duration_minutes} min</span>
              )}
            </div>
          </div>

          {/* Timezone Note for Candidates */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <Globe className="h-3 w-3" />
            <span>Times shown in your local timezone</span>
          </div>

          <p className="text-sm text-muted-foreground mb-4">{statusDisplay.message}</p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {candidateResponse === "pending" && (
              <>
                <Button onClick={handleConfirm} disabled={isConfirming} className="gap-2">
                  {isConfirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Confirm Interview
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRescheduleDialog(true)}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Request Reschedule
                </Button>
              </>
            )}

            {candidateResponse === "confirmed" && interview.meeting_link && (
              <Button asChild className="gap-2">
                <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="h-4 w-4" />
                  Join Meeting
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}

            {candidateResponse === "reschedule_requested" && (
              <div className="text-sm text-muted-foreground">
                You proposed {localProposedTimesCount} alternative time(s).
                {localCandidateNote && (
                  <p className="mt-1 italic">"{localCandidateNote}"</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CandidateRescheduleRequestDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        interviewId={interview.id}
        applicationId={applicationId}
        currentScheduledAt={interview.scheduled_at}
        onSuccess={handleRescheduleSuccess}
      />
    </>
  );
}
