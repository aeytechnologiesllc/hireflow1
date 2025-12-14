import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useInterviews, useUpdateInterview } from "@/hooks/useInterviews";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Plus, Clock, Video, MoreVertical, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, isPast, isFuture } from "date-fns";
import InterviewQuestionsDialog from "@/components/InterviewQuestionsDialog";
import type { InterviewWithDetails } from "@/hooks/useInterviews";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-500",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
  no_show: "bg-yellow-500/20 text-yellow-500",
};

interface InterviewCardProps {
  interview: InterviewWithDetails;
  isEmployer: boolean;
  onStatusChange: (id: string, status: string) => void;
  onGenerateQuestions: (interview: InterviewWithDetails) => void;
}

function InterviewCard({ interview, isEmployer, onStatusChange, onGenerateQuestions }: InterviewCardProps) {
  const application = interview.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  const isUpcoming = isFuture(new Date(interview.scheduled_at));

  return (
    <Card className={`bg-card border-border ${isUpcoming ? "hover:border-primary/50" : ""} transition-colors`}>
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
                <Badge className={statusColors[interview.status]}>
                  {interview.status}
                </Badge>
                {isEmployer && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem onClick={() => onGenerateQuestions(interview)}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI Questions
                      </DropdownMenuItem>
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
                <span>{format(new Date(interview.scheduled_at), "h:mm a")}</span>
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
                <Button variant="link" size="sm" className="h-auto p-0" asChild>
                  <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer">
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
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: interviews, isLoading, refetch } = useInterviews();
  const updateInterview = useUpdateInterview();
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<InterviewWithDetails | null>(null);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateInterview.mutateAsync({ id, status: status as any });
      toast.success(`Interview marked as ${status}`);
    } catch (error) {
      toast.error("Failed to update interview");
    }
  };

  const handleGenerateQuestions = (interview: InterviewWithDetails) => {
    setSelectedInterview(interview);
    setQuestionsDialogOpen(true);
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

  const upcomingInterviews = interviews?.filter(
    (i) => i.status === "scheduled" && isFuture(new Date(i.scheduled_at))
  );
  const pastInterviews = interviews?.filter(
    (i) => i.status !== "scheduled" || isPast(new Date(i.scheduled_at))
  );

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
                  onStatusChange={handleStatusChange}
                  onGenerateQuestions={handleGenerateQuestions}
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
                  onStatusChange={handleStatusChange}
                  onGenerateQuestions={handleGenerateQuestions}
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
    </div>
  );
}
