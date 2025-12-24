import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useInterviews, useUpdateInterview, useDeleteInterview } from "@/hooks/useInterviews";
import { supabase } from "@/integrations/supabase/client";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Clock, Video, MoreVertical, CheckCircle, XCircle, Sparkles, EyeOff, AlertCircle, Trash2 } from "lucide-react";
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
import InterviewQuestionsDialog from "@/components/InterviewQuestionsDialog";
import { EmployerRescheduleReviewDialog } from "@/components/EmployerRescheduleReviewDialog";
import { useNavigate } from "react-router-dom";
import type { InterviewWithDetails } from "@/hooks/useInterviews";
import { getTimezoneAbbreviation } from "@/lib/timezone";

// Human-readable status labels
const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-500",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
  no_show: "bg-yellow-500/20 text-yellow-500",
};

interface InterviewCardProps {
  interview: InterviewWithDetails;
  isEmployer: boolean;
  canScheduleInterviews: boolean;
  onStatusChange: (id: string, status: string) => void;
  onGenerateQuestions: (interview: InterviewWithDetails) => void;
  onReviewReschedule: (interview: InterviewWithDetails) => void;
  onDeleteInterview: (id: string) => void;
}

function InterviewCard({ 
  interview, 
  isEmployer, 
  canScheduleInterviews, 
  onStatusChange, 
  onGenerateQuestions,
  onReviewReschedule,
  onDeleteInterview
}: InterviewCardProps) {
  const application = interview.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  const isUpcoming = interview.status === "scheduled" && isFuture(new Date(interview.scheduled_at));
  const needsAction = interview.candidate_response === "reschedule_requested";

  return (
    <Card className={`
      bg-card border-border transition-all
      ${isUpcoming ? "hover:border-primary/50" : ""} 
      ${needsAction ? "border-amber-500/50 ring-1 ring-amber-500/20" : ""}
    `}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">
                  {isEmployer ? (profile?.full_name || "Candidate") : (job?.title || "Interview")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isEmployer ? job?.title : profile?.full_name || "Interviewer"}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                <Badge className={statusColors[interview.status]}>
                  {statusLabels[interview.status] || interview.status}
                </Badge>
                {isEmployer && canScheduleInterviews && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      {/* AI Questions - only for non-cancelled interviews */}
                      {interview.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => onGenerateQuestions(interview)}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Questions
                        </DropdownMenuItem>
                      )}
                      
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

            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(interview.scheduled_at), "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(interview.scheduled_at), "h:mm a")} ({getTimezoneAbbreviation()})</span>
              </div>
              {interview.duration_minutes && (
                <span>{interview.duration_minutes} min</span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Video className="h-4 w-4" />
                <span className="capitalize">{interview.interview_type || "Video"} Interview</span>
              </div>
              {interview.meeting_link && isUpcoming && (
                <Button size="sm" className="gap-1" asChild>
                  <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" />
                    Join Meeting
                  </a>
                </Button>
              )}
              {interview.ai_questions && interview.ai_questions.length > 0 && (
                <div className="flex items-center gap-1 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>{interview.ai_questions.length} AI questions</span>
                </div>
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
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer";
  const canScheduleInterviews = !isTeamMember || permissions?.canScheduleInterviews;
  const { data: interviews, isLoading, refetch } = useInterviews();
  const updateInterview = useUpdateInterview();
  const deleteInterview = useDeleteInterview();
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<InterviewWithDetails | null>(null);
  const [rescheduleInterview, setRescheduleInterview] = useState<InterviewWithDetails | null>(null);

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
      toast.success(`Interview marked as ${statusLabels[status] || status}`);
    } catch (error) {
      toast.error("Failed to update interview");
    }
  };

  const handleGenerateQuestions = (interview: InterviewWithDetails) => {
    setSelectedInterview(interview);
    setQuestionsDialogOpen(true);
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

  const handleQuestionsGenerated = async (questions: string[]) => {
    if (!selectedInterview) return;
    try {
      await updateInterview.mutateAsync({
        id: selectedInterview.id,
        ai_questions: questions,
      });
      refetch();
    } catch (error) {
      console.error("Failed to save questions:", error);
    }
  };

  const handleMessageCandidate = () => {
    if (rescheduleInterview?.applications?.candidate_id) {
      navigate(`/messages?recipient=${rescheduleInterview.applications.candidate_id}`);
    }
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Interviews</h2>
          <p className="text-muted-foreground mt-1">
            {isEmployer 
              ? "Schedule and manage candidate interviews" 
              : "View your upcoming interviews"}
          </p>
        </div>
        {isTeamMember && !canScheduleInterviews && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
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
                  onGenerateQuestions={handleGenerateQuestions}
                  onReviewReschedule={handleReviewReschedule}
                  onDeleteInterview={handleDeleteInterview}
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
                  onGenerateQuestions={handleGenerateQuestions}
                  onReviewReschedule={handleReviewReschedule}
                  onDeleteInterview={handleDeleteInterview}
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

      <InterviewQuestionsDialog
        interview={selectedInterview}
        open={questionsDialogOpen}
        onOpenChange={setQuestionsDialogOpen}
        onQuestionsGenerated={handleQuestionsGenerated}
      />

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
    </div>
  );
}
