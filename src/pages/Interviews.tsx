import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useInterviews, useUpdateInterview, useDeleteInterview } from "@/hooks/useInterviews";
import { supabase } from "@/integrations/supabase/client";

import { useIsMobile } from "@/hooks/use-mobile";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Clock, Video, MoreVertical, CheckCircle, XCircle, EyeOff, AlertCircle, Trash2, Check, RefreshCw, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, isPast, isFuture } from "date-fns";

import { EmployerRescheduleReviewDialog } from "@/components/EmployerRescheduleReviewDialog";
import { CandidateRescheduleRequestDialog } from "@/components/CandidateRescheduleRequestDialog";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { InterviewWithDetails } from "@/hooks/useInterviews";
import { getTimezoneAbbreviation } from "@/lib/timezone";
import { interviewStatusLabels, interviewStatusColors } from "@/lib/terminology";

interface InterviewCardProps {
  interview: InterviewWithDetails;
  isEmployer: boolean;
  canScheduleInterviews: boolean;
  onStatusChange: (id: string, status: string) => void;
  onReviewReschedule: (interview: InterviewWithDetails) => void;
  onDeleteInterview: (id: string) => void;
  onCandidateConfirm: (interviewId: string) => Promise<void>;
  onCandidateReschedule: (interview: InterviewWithDetails) => void;
  isConfirming: boolean;
}

function InterviewCard({ 
  interview, 
  isEmployer, 
  canScheduleInterviews, 
  onStatusChange, 
  onReviewReschedule,
  onDeleteInterview,
  onCandidateConfirm,
  onCandidateReschedule,
  isConfirming,
}: InterviewCardProps) {
  const application = interview.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  const isUpcoming = interview.status === "scheduled" && isFuture(new Date(interview.scheduled_at));
  const needsAction = interview.candidate_response === "reschedule_requested";
  
  // Candidate-specific status checks
  const candidateNeedsToConfirm = !isEmployer && isUpcoming && 
    (!interview.candidate_response || interview.candidate_response === "pending");
  const candidateConfirmed = !isEmployer && interview.candidate_response === "confirmed";
  const candidateRequestedReschedule = !isEmployer && interview.candidate_response === "reschedule_requested";

  return (
    <Card className={`
      bg-card border-border transition-all
      ${isUpcoming ? "hover:border-primary/50" : ""} 
      ${needsAction ? "border-amber-500/50 ring-1 ring-amber-500/20" : ""}
    `}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm sm:text-base">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {isEmployer ? (profile?.full_name || "Candidate") : (job?.title || "Interview")}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {isEmployer ? job?.title : profile?.full_name || "Interviewer"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Show candidate response status for employers */}
                {isEmployer && interview.candidate_response && (
                  <Badge className={
                    interview.candidate_response === 'confirmed' 
                      ? 'bg-success/20 text-success border-success/30' 
                      : interview.candidate_response === 'reschedule_requested'
                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                      : 'bg-muted text-muted-foreground'
                  }>
                    {interview.candidate_response === 'confirmed' ? 'Candidate Confirmed' : 
                     interview.candidate_response === 'reschedule_requested' ? 'Reschedule Requested' : 
                     'Awaiting Response'}
                  </Badge>
                )}
                {isEmployer && !interview.candidate_response && interview.status === 'scheduled' && (
                  <Badge className="bg-muted text-muted-foreground">
                    Awaiting Response
                  </Badge>
                )}
                
                {/* Show candidate-specific status badges */}
                {candidateNeedsToConfirm && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 animate-pulse">
                    Action Required
                  </Badge>
                )}
                {candidateConfirmed && (
                  <Badge className="bg-success/20 text-success border-success/30">
                    Confirmed
                  </Badge>
                )}
                {candidateRequestedReschedule && (
                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                    Reschedule Pending
                  </Badge>
                )}
                
                {/* Review button for reschedule requests */}
                {isEmployer && needsAction && canScheduleInterviews && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReviewReschedule(interview)}
                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 gap-1"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Review
                  </Button>
                )}
                <Badge className={interviewStatusColors[interview.status]}>
                  {interviewStatusLabels[interview.status] || interview.status}
                </Badge>
                {isEmployer && canScheduleInterviews && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      
                      {/* Status actions - only for scheduled interviews */}
                      {interview.status === "scheduled" && (
                        <>
                          <DropdownMenuItem onClick={() => onStatusChange(interview.id, "completed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark as Completed
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(interview.id, "no_show")} className="text-yellow-500">
                            <XCircle className="h-4 w-4 mr-2" />
                            Mark as No Show
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onStatusChange(interview.id, "cancelled")} className="text-destructive">
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel Interview
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      {/* Delete option - only for cancelled/completed/no_show interviews */}
                      {(interview.status === "cancelled" || interview.status === "completed" || interview.status === "no_show") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => onDeleteInterview(interview.id)} 
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Interview
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{format(new Date(interview.scheduled_at), "EEEE, MMMM d, yyyy")}</span>
                <span className="sm:hidden">{format(new Date(interview.scheduled_at), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>{format(new Date(interview.scheduled_at), "h:mm a")} ({getTimezoneAbbreviation()})</span>
              </div>
              {interview.duration_minutes && (
                <span>{interview.duration_minutes} min</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Video className="h-4 w-4" />
                <span className="capitalize">{interview.interview_type || "Video"} Interview</span>
              </div>
              
              {/* Candidate action buttons - show confirm/reschedule when pending */}
              {candidateNeedsToConfirm && (
                <>
                  <Button 
                    size="sm" 
                    className="gap-1"
                    onClick={() => onCandidateConfirm(interview.id)}
                    disabled={isConfirming}
                  >
                    {isConfirming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Confirm Interview
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={() => onCandidateReschedule(interview)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Request Reschedule
                  </Button>
                </>
              )}
              
              {/* Show Join Meeting only when interview is confirmed */}
              {interview.meeting_link && isUpcoming && interview.candidate_response === "confirmed" && (
                <Button size="sm" className="gap-1" asChild>
                  <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" />
                    Join Meeting
                  </a>
                </Button>
              )}
            </div>

            {interview.notes && (
              <p className="mt-3 text-sm text-muted-foreground">{interview.notes}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Interviews() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer";
  const canScheduleInterviews = !isTeamMember || permissions?.canScheduleInterviews;
  const { data: interviews, isLoading, refetch } = useInterviews();
  const updateInterview = useUpdateInterview();
  const deleteInterview = useDeleteInterview();
  const [rescheduleInterview, setRescheduleInterview] = useState<InterviewWithDetails | null>(null);
  const [candidateRescheduleInterview, setCandidateRescheduleInterview] = useState<InterviewWithDetails | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Mobile pull-to-refresh
  const isMobile = useIsMobile();
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  

  // Real-time subscription for interview updates
  useEffect(() => {
    const channel = supabase
      .channel('interviews-realtime-page')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interviews',
        },
        (payload) => {
          console.log('Interview changed in real-time:', payload);
          refetch();
          
          // Show toast notifications for interview changes
          const newData = payload.new as any;
          const oldData = payload.old as any;
          
          // Status change notifications
          if (newData?.status !== oldData?.status) {
            if (newData?.status === "cancelled") {
              toast.error("An interview has been cancelled");
            } else if (newData?.status === "completed") {
              toast.success("An interview has been marked as completed");
            } else if (newData?.status === "no_show") {
              toast.warning("An interview has been marked as no-show");
            }
          }
          
          // Candidate response notifications
          if (newData?.candidate_response === "reschedule_requested" && 
              oldData?.candidate_response !== "reschedule_requested") {
            toast.info("A candidate has requested to reschedule an interview", {
              action: {
                label: "Review",
                onClick: () => {
                  // Find the interview and open dialog
                  refetch().then(() => {
                    const interview = interviews?.find(i => i.id === newData.id);
                    if (interview) {
                      setRescheduleInterview(interview);
                    }
                  });
                }
              }
            });
          } else if (newData?.candidate_response === "confirmed" && 
                     oldData?.candidate_response !== "confirmed") {
            toast.success("A candidate has confirmed their interview!");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, interviews]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateInterview.mutateAsync({ id, status: status as any });
      toast.success(`Interview marked as ${interviewStatusLabels[status] || status}`);
    } catch (error) {
      toast.error("Failed to update interview");
    }
  };

  const handleReviewReschedule = (interview: InterviewWithDetails) => {
    setRescheduleInterview(interview);
  };

  const handleDeleteInterview = async (id: string) => {
    try {
      await deleteInterview.mutateAsync(id);
      toast.success("Interview deleted");
    } catch (error) {
      toast.error("Failed to delete interview");
    }
  };


  const handleMessageCandidate = () => {
    if (rescheduleInterview?.applications?.candidate_id) {
      navigate(`/messages?recipient=${rescheduleInterview.applications.candidate_id}`);
    }
  };

  // Candidate confirm handler
  const handleCandidateConfirm = async (interviewId: string) => {
    setIsConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "confirm",
          interviewId,
        },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to confirm interview");
      }

      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      toast.success("Interview confirmed!");
      refetch();
    } catch (error) {
      console.error("Error confirming interview:", error);
      toast.error("Failed to confirm interview");
    } finally {
      setIsConfirming(false);
    }
  };

  // Candidate reschedule handler
  const handleCandidateReschedule = (interview: InterviewWithDetails) => {
    setCandidateRescheduleInterview(interview);
  };

  // Fix filtering: upcoming = scheduled + future, past = everything else
  const upcomingInterviews = interviews?.filter(
    (i) => i.status === "scheduled" && isFuture(new Date(i.scheduled_at))
  );
  
  const pastInterviews = interviews?.filter(
    (i) => 
      i.status === "completed" || 
      i.status === "no_show" ||
      i.status === "cancelled" ||
      (i.status === "scheduled" && isPast(new Date(i.scheduled_at)))
  );

  // Parse proposed times safely
  const proposedTimes = rescheduleInterview?.proposed_times 
    ? (Array.isArray(rescheduleInterview.proposed_times) 
        ? rescheduleInterview.proposed_times 
        : []) as { datetime: string }[]
    : [];

  return (
    <div className="space-y-6" {...(isMobile ? pullHandlers : {})}>
      {isMobile && <PullIndicator />}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Interviews</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isEmployer 
              ? "Schedule and manage candidate interviews" 
              : "View your upcoming interviews"}
          </p>
        </div>
        {isTeamMember && !canScheduleInterviews && (
          <Badge variant="outline" className="gap-1 text-muted-foreground self-start sm:self-auto">
            <EyeOff className="h-3 w-3" />
            View Only
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : interviews && interviews.length > 0 ? (
        <>
          {/* Upcoming Interviews */}
          {upcomingInterviews && upcomingInterviews.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Upcoming</h3>
              {upcomingInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  isEmployer={isEmployer}
                  canScheduleInterviews={!!canScheduleInterviews}
                  onStatusChange={handleStatusChange}
                  onReviewReschedule={handleReviewReschedule}
                  onDeleteInterview={handleDeleteInterview}
                  onCandidateConfirm={handleCandidateConfirm}
                  onCandidateReschedule={handleCandidateReschedule}
                  isConfirming={isConfirming}
                />
              ))}
            </div>
          )}

          {/* Past Interviews */}
          {pastInterviews && pastInterviews.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-muted-foreground">Past</h3>
              {pastInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  isEmployer={isEmployer}
                  canScheduleInterviews={!!canScheduleInterviews}
                  onStatusChange={handleStatusChange}
                  onReviewReschedule={handleReviewReschedule}
                  onDeleteInterview={handleDeleteInterview}
                  onCandidateConfirm={handleCandidateConfirm}
                  onCandidateReschedule={handleCandidateReschedule}
                  isConfirming={isConfirming}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No interviews scheduled</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isEmployer
                ? "Schedule interviews with candidates to see them here."
                : "When employers schedule interviews with you, they'll appear here."}
            </p>
          </CardContent>
        </Card>
      )}


      <EmployerRescheduleReviewDialog
        open={!!rescheduleInterview}
        onOpenChange={(open) => !open && setRescheduleInterview(null)}
        interviewId={rescheduleInterview?.id || ""}
        applicationId={rescheduleInterview?.applications?.id || ""}
        currentScheduledAt={rescheduleInterview?.scheduled_at || ""}
        proposedTimes={proposedTimes}
        candidateNote={rescheduleInterview?.candidate_note || null}
        onMessageCandidate={handleMessageCandidate}
      />

      {/* Candidate Reschedule Dialog */}
      {candidateRescheduleInterview && (
        <CandidateRescheduleRequestDialog
          open={!!candidateRescheduleInterview}
          onOpenChange={(open) => !open && setCandidateRescheduleInterview(null)}
          interviewId={candidateRescheduleInterview.id}
          applicationId={candidateRescheduleInterview.applications?.id || ""}
          currentScheduledAt={candidateRescheduleInterview.scheduled_at}
          onSuccess={() => {
            refetch();
            setCandidateRescheduleInterview(null);
          }}
        />
      )}
    </div>
  );
}
