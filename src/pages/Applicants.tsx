import { useState, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmployerApplications, useApplicationStats, useUpdateApplication } from "@/hooks/useApplications";
import { useJob } from "@/hooks/useJobs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Filter, Users, MoreVertical, Mail, Eye, CheckCircle, XCircle, Calendar, Sparkles, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import ScheduleInterviewDialog from "@/components/ScheduleInterviewDialog";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  reviewing: "bg-blue-500/20 text-blue-500",
  interview: "bg-purple-500/20 text-purple-500",
  offered: "bg-primary/20 text-primary",
  hired: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

interface ApplicantCardProps {
  application: ApplicationWithCandidate;
  onStatusChange: (id: string, status: string) => void;
  onScheduleInterview: (application: ApplicationWithCandidate) => void;
  onNavigateToDetails: (id: string) => void;
}

function ApplicantCard({ application, onStatusChange, onScheduleInterview, onNavigateToDetails }: ApplicantCardProps) {
  const profile = application.profiles;
  const job = application.jobs;
  
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || "?";

  // Get human-readable phase name from workflow steps
  const getPhaseName = (phase: string | null) => {
    if (!phase) return null;
    
    // Check for standard phase names
    const standardPhases: Record<string, string> = {
      application: "Application",
      review: "Review",
      interview: "Interview",
      hired: "Hired",
      rejected: "Rejected",
    };
    
    if (standardPhases[phase.toLowerCase()]) {
      return standardPhases[phase.toLowerCase()];
    }
    
    // Look up in job workflow_steps
    if (job?.workflow_steps && Array.isArray(job.workflow_steps)) {
      const step = (job.workflow_steps as any[]).find((s) => s.id === phase);
      if (step?.title) {
        return step.title;
      }
    }
    
    // Fallback: try to extract a readable name from the phase
    if (phase.startsWith("step_")) {
      return "In Progress";
    }
    
    return phase;
  };

  const phaseName = getPhaseName(application.phase);

  return (
    <Card 
      className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => onNavigateToDetails(application.id)}
    >
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
                  {profile?.full_name || "Unknown Candidate"}
                </h3>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigateToDetails(application.id); }}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Message
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(application.id, "reviewing"); }}>
                    <Eye className="h-4 w-4 mr-2" />
                    Mark as Reviewing
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onScheduleInterview(application); }}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Interview
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(application.id, "offered"); }}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Extend Offer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(application.id, "hired"); }}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Hired
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(application.id, "rejected"); }} className="text-destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Badge className={statusColors[application.status]}>
                {application.status}
              </Badge>
              {phaseName && (
                <Badge variant="outline" className="text-xs">
                  Phase: {phaseName}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Applied for <span className="text-foreground font-medium">{job?.title}</span>
              </span>
            </div>

            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              {profile?.location && <span>{profile.location}</span>}
              {profile?.experience_years && (
                <span>{profile.experience_years} years exp.</span>
              )}
              <span>Applied {format(new Date(application.created_at), "MMM d, yyyy")}</span>
            </div>

            {application.ai_score && (
              <div className="mt-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="text-xs font-medium text-muted-foreground">AI Score:</div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${application.ai_score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-primary">{application.ai_score}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Applicants() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobIdFilter = searchParams.get("job");
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: applications, isLoading } = useEmployerApplications();
  const { data: filteredJob } = useJob(jobIdFilter || undefined);
  const { data: stats } = useApplicationStats();
  const updateApplication = useUpdateApplication();
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithCandidate | null>(null);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateApplication.mutateAsync({ id, status: status as any });
      toast.success(`Application status updated to ${status}`);
    } catch (error) {
      toast.error("Failed to update application status");
    }
  };

  const handleScheduleInterview = (application: ApplicationWithCandidate) => {
    setSelectedApplication(application);
    setScheduleDialogOpen(true);
  };

  const handleNavigateToDetails = (id: string) => {
    navigate(`/applicants/${id}`);
  };

  const filteredApplications = useMemo(() => {
    let result = applications || [];
    
    // Filter by job if jobIdFilter is present
    if (jobIdFilter) {
      result = result.filter((app) => app.job_id === jobIdFilter);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((app) => {
        const name = app.profiles?.full_name?.toLowerCase() || "";
        const email = app.profiles?.email?.toLowerCase() || "";
        return name.includes(query) || email.includes(query);
      });
    }
    
    return result;
  }, [applications, jobIdFilter, searchQuery]);

  if (!isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Employer Access Only</h2>
            <p className="text-muted-foreground">
              This page is only accessible to employers.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {jobIdFilter && filteredJob ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-muted-foreground hover:text-foreground">
                  <Link to="/jobs">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to Jobs
                  </Link>
                </Button>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Applicants for {filteredJob.title}</h2>
              <p className="text-muted-foreground mt-1">Review applications for this position</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-foreground">Applicants</h2>
              <p className="text-muted-foreground mt-1">Review and manage job applications</p>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-500">{stats?.pending || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Reviewing</p>
            <p className="text-2xl font-bold text-blue-500">{stats?.reviewing || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Interview</p>
            <p className="text-2xl font-bold text-purple-500">{stats?.interview || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Hired</p>
            <p className="text-2xl font-bold text-primary">{stats?.hired || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search applicants..." 
            className="pl-10 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Applicant List */}
      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : filteredApplications && filteredApplications.length > 0 ? (
          filteredApplications.map((application) => (
            <ApplicantCard 
              key={application.id} 
              application={application}
              onStatusChange={handleStatusChange}
              onScheduleInterview={handleScheduleInterview}
              onNavigateToDetails={handleNavigateToDetails}
            />
          ))
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No applicants yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                When candidates apply to your job postings, they'll appear here. Share your job links to start receiving applications.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <ScheduleInterviewDialog
        applicationId={selectedApplication?.id || null}
        candidateName={selectedApplication?.profiles?.full_name || "Candidate"}
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
      />
    </div>
  );
}
