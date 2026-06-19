import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useJobStats, useEmployerJobs, useDeleteJob, useCreateJob, type JobWithApplicationCount } from "@/hooks/useJobs";
import { useApplicationStats } from "@/hooks/useApplications";
import { useCandidateApplications } from "@/hooks/useApplications";
import { useUpcomingInterviews } from "@/hooks/useInterviews";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  Users,
  Clock,
  CheckCircle2,
  Link2,
  Copy,
  Share2,
  Eye,
  MoreVertical,
  Calendar,
  MapPin,
  Edit,
  Trash2,
  Loader2,
  Send,
  Rocket,
  Download,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import { FeatureDiscoveryTooltip } from "@/components/FeatureDiscoveryTooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Job } from "@/hooks/useJobs";
import type { ApplicationWithJob } from "@/hooks/useApplications";
import JobDetailsDialog from "@/components/JobDetailsDialog";
import JobWorkflowDialog from "@/components/JobWorkflowDialog";
import ActivityFeed from "@/components/ActivityFeed";
import PipelineHealthCard from "@/components/PipelineHealthCard";
import ProfileCompletionCard from "@/components/ProfileCompletionCard";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { AnimatedCounter } from "@/components/animations/AnimatedCounter";
import { ImprovementBlueprintCard } from "@/components/ImprovementBlueprintCard";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: "green" | "blue" | "purple";
  isLoading?: boolean;
  index?: number;
}

const colorConfig = {
  green: {
    border: "border-l-success",
    iconBg: "bg-success/15",
    iconColor: "text-success",
    glowColor: "hsla(155, 45%, 45%, 0.4)",
    gradientFrom: "from-success/5",
  },
  blue: {
    border: "border-l-accent",
    iconBg: "bg-accent/15",
    iconColor: "text-accent",
    glowColor: "hsla(160, 30%, 22%, 0.4)",
    gradientFrom: "from-accent/5",
  },
  purple: {
    border: "border-l-primary",
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
    glowColor: "hsla(37, 47%, 60%, 0.4)",
    gradientFrom: "from-primary/5",
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  }),
};

function StatCard({ title, value, subtitle, icon: Icon, color, isLoading, index = 0 }: StatCardProps) {
  const config = colorConfig[color];
  const numericValue = typeof value === "number" ? value : parseInt(value, 10) || 0;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      whileHover={{
        scale: 1.02,
        boxShadow: `0 0 30px -5px ${config.glowColor}`,
      }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card className={`relative overflow-hidden h-full bg-gradient-to-br ${config.gradientFrom} to-card/80 backdrop-blur-sm border-l-4 ${config.border} border border-transparent shadow-sm transition-all duration-300`}>
        <CardContent className="pt-4 md:pt-5 pb-4 md:pb-5 px-4 md:px-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs md:text-sm font-medium text-muted-foreground">{title}</p>
              {isLoading ? (
                <Skeleton className="h-8 md:h-10 w-14 md:w-16 mt-2" />
              ) : (
                <p className="text-2xl md:text-4xl font-bold text-foreground mt-1 md:mt-2">
                  <AnimatedCounter value={numericValue} />
                </p>
              )}
              <p className="text-xs text-muted-foreground/80 mt-1">{subtitle}</p>
            </div>
            <motion.div
              className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${config.iconBg} flex items-center justify-center`}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <Icon className={`h-5 w-5 md:h-6 md:w-6 ${config.iconColor}`} />
            </motion.div>
          </div>
        </CardContent>
        {/* Subtle bottom gradient accent */}
        <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradientFrom} via-transparent to-transparent opacity-50`} />
      </Card>
    </motion.div>
  );
}

interface JobPostingCardProps {
  job: JobWithApplicationCount;
  onViewDetails: (job: JobWithApplicationCount) => void;
  onViewWorkflow: (job: JobWithApplicationCount) => void;
  onEdit: (job: JobWithApplicationCount) => void;
  onDuplicate: (job: JobWithApplicationCount) => void;
  onDelete: (id: string) => void;
  onNavigateToApplicants: (jobId: string) => void;
  isDeleting: boolean;
}

function JobPostingCard({ job, onViewDetails, onViewWorkflow, onEdit, onDuplicate, onDelete, onNavigateToApplicants, isDeleting }: JobPostingCardProps) {
  const getApplyLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/find-jobs?job=${job.id}`;
  };

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.job_code) {
      navigator.clipboard.writeText(job.job_code);
      toast.success("Job code copied to clipboard");
    }
  };

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getApplyLink());
    toast.success("Application link copied to clipboard");
  };

  const shareJob = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareData = {
      title: `Apply for ${job.title}`,
      text: `Check out this job opportunity: ${job.title}`,
      url: getApplyLink(),
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error - fall back to copy
        navigator.clipboard.writeText(getApplyLink());
        toast.success("Application link copied to clipboard");
      }
    } else {
      navigator.clipboard.writeText(getApplyLink());
      toast.success("Application link copied to clipboard");
    }
  };

  const statusStyles = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-primary/20 text-primary",
    closed: "bg-destructive/20 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };

  const handleCardClick = () => {
    onNavigateToApplicants(job.id);
  };

  return (
    <Card 
      className="bg-card border-border card-interactive"
      onClick={handleCardClick}
    >
      <CardContent className="p-3 md:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 md:space-y-3 flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base md:text-lg font-semibold text-foreground truncate">{job.title}</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0 h-8 w-8">
                    <MoreVertical className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={() => onViewDetails(job)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewWorkflow(job)}>
                    <AvaGlyph className="h-4 w-4 mr-2" />
                    View Workflow
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEdit(job)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Job
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(job)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => onDelete(job.id)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs font-medium ${statusStyles[job.status]}`}>
                {job.status}
              </span>
              {job.ai_bias_score && job.ai_bias_score >= 80 && (
                <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs font-medium bg-accent/20 text-accent flex items-center gap-1">
                  <AvaGlyph className="h-3 w-3" />
                  <span className="hidden sm:inline">AI Optimized</span>
                </span>
              )}
            </div>

            {job.job_code && (
              <FeatureDiscoveryTooltip
                featureId="job_code"
                title="Quick Apply Code"
                description="Share this code with candidates so they can apply directly at /apply without searching for the job."
                icon={<ClipboardList className="h-4 w-4" />}
                position="bottom"
              >
                <div className="p-2 md:p-3 rounded-lg bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs md:text-sm text-muted-foreground">Code:</span>
                    <span className="text-xs md:text-sm font-bold text-primary">{job.job_code}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-primary gap-1 h-7 md:h-8 px-2 text-xs" onClick={copyCode}>
                      <Copy className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="hidden sm:inline">Code</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-primary gap-1 h-7 md:h-8 px-2 text-xs" onClick={copyLink}>
                      <Link2 className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="hidden sm:inline">Link</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-primary gap-1 h-7 md:h-8 px-2 text-xs" onClick={shareJob}>
                      <Share2 className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="hidden sm:inline">Share</span>
                    </Button>
                  </div>
                </div>
              </FeatureDiscoveryTooltip>
            )}

            <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
              <span>{job.location || "Remote"}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">{job.job_type || "Full-Time"}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 md:h-4 md:w-4" />
                <span>{job.application_count} applicant{job.application_count !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-xs hidden md:inline">Created {format(new Date(job.created_at), "MM/dd/yyyy")}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground/50 hidden max-sm:block self-center flex-shrink-0 mt-2 animate-fade-in" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { getApplicationDisplayState, statusColors } from "@/utils/getApplicationDisplayState";

function ApplicationCard({ application, onOpenBlueprint }: { application: ApplicationWithJob; onOpenBlueprint?: (id: string) => void }) {
  const navigate = useNavigate();
  const job = application.jobs;
  const displayState = getApplicationDisplayState(application);
  const phase = application.phase || "application";

  return (
    <Card 
      className={`bg-card border-border card-interactive ${
        displayState.isRejected 
          ? "border-destructive/30 opacity-75" 
          : displayState.showActionButton 
            ? "border-primary/50 hover:border-primary shadow-lg shadow-primary/5" 
            : ""
      }`}
      onClick={() => {
        if (!displayState.isRejected) {
          navigate(`/applications/${application.id}`);
        }
      }}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start sm:items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className={`font-medium text-sm md:text-base truncate ${displayState.isRejected ? "text-muted-foreground" : "text-foreground"}`}>
              {job?.title || "Unknown Position"}
            </h4>
            <div className="flex items-center gap-2 md:gap-3 mt-1 text-xs md:text-sm text-muted-foreground flex-wrap">
              {job?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              <span>{format(new Date(application.created_at), "MMM d, yyyy")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Action button when phase needs completion */}
            {displayState.showActionButton && displayState.actionIcon && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground gap-1.5 px-3 py-1 text-xs font-medium animate-pulse hover:bg-primary/90 h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  const stepId = phase;
                  const route = displayState.actionRoute;
                  if (["application", "quiz", "video-intro", "chat-simulation", "chat-interview", "sales-simulation", "voice-interview", "portfolio"].includes(route)) {
                    navigate(`/applications/${application.id}/${route}/${stepId}`);
                  } else {
                    navigate(`/applications/${application.id}/${route}`);
                  }
                }}
              >
                <displayState.actionIcon className="h-3 w-3" />
                {displayState.actionLabel}
              </Button>
            )}
            {displayState.isRejected && onOpenBlueprint && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:text-primary h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBlueprint(application.id);
                }}
              >
                <Download className="h-3 w-3" />
                Get Report
              </Button>
            )}
            {/* Only show status badge when no action button and not rejected */}
            {!displayState.showActionButton && !displayState.isRejected && (
              <Badge className={`${displayState.statusColor} text-xs`}>
                {displayState.statusLabel}
              </Badge>
            )}
            {displayState.isRejected && (
              <Badge className={`${displayState.statusColor} text-xs`}>
                Not Selected
              </Badge>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/50 hidden max-sm:block self-center flex-shrink-0 animate-fade-in" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { role, user, isTeamMember } = useAuth();
  const navigate = useNavigate();
  const isEmployer = role === "employer";
  const showOnboardingTestControls = import.meta.env.DEV;

  // Redirect team members to team portal
  useEffect(() => {
    if (isTeamMember) {
      navigate("/team-portal", { replace: true });
    }
  }, [isTeamMember, navigate]);
  
  // Employer data
  const { data: jobStats, isLoading: isLoadingJobStats, refetch: refetchJobStats } = useJobStats();
  const { data: appStats, isLoading: isLoadingAppStats, refetch: refetchAppStats } = useApplicationStats();
  const { data: jobs, isLoading: isLoadingJobs, refetch: refetchJobs } = useEmployerJobs();
  const deleteJob = useDeleteJob();
  const createJob = useCreateJob();
  
  // Candidate data
  const { data: candidateApps, isLoading: isLoadingCandidateApps, refetch: refetchCandidateApps } = useCandidateApplications();
  const { data: upcomingInterviews, refetch: refetchInterviews } = useUpcomingInterviews();
  
  // Subscription for testing onboarding
  const { refetch: refetchSubscription } = useSubscription();
  
  // Mobile detection and pull-to-refresh
  const isMobile = useIsMobile();
  
  const handleRefresh = useCallback(async () => {
    if (isEmployer) {
      await Promise.all([refetchJobStats(), refetchAppStats(), refetchJobs()]);
    } else {
      await Promise.all([refetchCandidateApps(), refetchInterviews()]);
    }
  }, [isEmployer, refetchJobStats, refetchAppStats, refetchJobs, refetchCandidateApps, refetchInterviews]);
  

  // Test onboarding handler
  const handleTestOnboarding = async () => {
    if (!user) return;
    
    await supabase
      .from('subscriptions')
      .update({ onboarding_completed: false })
      .eq('user_id', user.id);
    
    await refetchSubscription();
    toast.success("Onboarding reset - reloading...");
    setTimeout(() => window.location.reload(), 500);
  };

  // Job details dialog state
  const [selectedJob, setSelectedJob] = useState<JobWithApplicationCount | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [showBlueprintDialog, setShowBlueprintDialog] = useState(false);
  const [blueprintApplicationId, setBlueprintApplicationId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  
  // Getting Started Checklist state
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    return localStorage.getItem("gettingStartedDismissed") === "true";
  });
  
  const handleDismissChecklist = () => {
    setChecklistDismissed(true);
    localStorage.setItem("gettingStartedDismissed", "true");
  };
  
  // Determine if we should show the getting started checklist
  const showGettingStarted = useMemo(() => {
    if (checklistDismissed) return false;
    if (!isEmployer) return false;
    if (isTeamMember) return false;
    // Don't show while data is still loading to prevent flash
    if (isLoadingJobs || isLoadingAppStats) return false;
    
    const hasJobs = (jobs?.length || 0) > 0;
    const hasApplicants = (appStats?.total || 0) > 0;
    
    // Show if missing jobs OR applicants (new user experience)
    return !hasJobs || !hasApplicants;
  }, [checklistDismissed, isEmployer, isTeamMember, isLoadingJobs, isLoadingAppStats, jobs, appStats]);
  
  const handleOpenBlueprintDialog = (applicationId: string) => {
    setBlueprintApplicationId(applicationId);
    setShowBlueprintDialog(true);
  };

  // Real-time subscription for application updates
  useEffect(() => {
    if (!user || !isEmployer) return;

    const channel = supabase
      .channel('dashboard-applications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
        },
        () => {
          // Refetch jobs to update application counts
          queryClient.invalidateQueries({ queryKey: ["jobs", "employer", user.id] });
          queryClient.invalidateQueries({ queryKey: ["applications", "stats", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isEmployer, queryClient]);

  const isEmployerLoading = isLoadingJobStats || isLoadingAppStats;
  const isCandidateLoading = isLoadingCandidateApps;

  // Job action handlers
  const handleViewDetails = (job: JobWithApplicationCount) => {
    setSelectedJob(job);
    setShowDetailsDialog(true);
  };

  const handleViewWorkflow = (job: JobWithApplicationCount) => {
    setSelectedJob(job);
    setShowWorkflowDialog(true);
  };

  const handleEdit = (job: JobWithApplicationCount) => {
    navigate(`/jobs/edit/${job.id}`);
  };

  const handleNavigateToApplicants = (jobId: string) => {
    navigate(`/applicants?job=${jobId}`);
  };

  const handleDuplicate = async (job: Job) => {
    try {
      const { id, created_at, updated_at, employer_id, job_code, ...jobData } = job;
      await createJob.mutateAsync({
        ...jobData,
        title: `${job.title} (Copy)`,
        status: "draft",
      });
      toast.success("Job duplicated successfully");
    } catch (error) {
      toast.error("Failed to duplicate job");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteJob.mutateAsync(id);
      toast.success("Job deleted successfully");
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

  // Candidate stats
  const candidateStats = candidateApps?.reduce(
    (acc, app) => {
      acc.total++;
      if (app.status === "interview") acc.interviews++;
      if (app.status === "reviewing" || app.status === "pending") acc.inReview++;
      if (app.status === "offered" || app.status === "hired") acc.offers++;
      return acc;
    },
    { total: 0, interviews: 0, inReview: 0, offers: 0 }
  ) || { total: 0, interviews: 0, inReview: 0, offers: 0 };

  return (
    <motion.div 
      className="space-y-4 md:space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Test Onboarding Button - Development Only */}
      {showOnboardingTestControls && isEmployer && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTestOnboarding}
            className="text-muted-foreground text-xs opacity-50 hover:opacity-100"
          >
            <Rocket className="h-4 w-4 mr-1" />
            Test Onboarding
          </Button>
        </div>
      )}
      
      {/* Getting Started Checklist */}
      {showGettingStarted && (
        <motion.div variants={staggerItem}>
          <GettingStartedChecklist
            hasJobs={(jobs?.length || 0) > 0}
            hasApplicants={(appStats?.total || 0) > 0}
            hasInterviews={(upcomingInterviews?.length || 0) > 0}
            onDismiss={handleDismissChecklist}
          />
        </motion.div>
      )}
      
      {/* Stats Grid */}
      <motion.div variants={staggerItem} className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {isEmployer ? (
          <>
            <StatCard
              title="Active Jobs"
              value={jobStats?.published || 0}
              subtitle="Open positions"
              icon={Briefcase}
              color="green"
              isLoading={isEmployerLoading}
              index={0}
            />
            <StatCard
              title="Total Applicants"
              value={appStats?.total || 0}
              subtitle={appStats?.total ? "Applications received" : "No applications"}
              icon={Users}
              color="blue"
              isLoading={isEmployerLoading}
              index={1}
            />
            <StatCard
              title="Under Review"
              value={appStats?.reviewing || 0}
              subtitle={appStats?.reviewing ? "Being reviewed" : "No pending"}
              icon={Clock}
              color="purple"
              isLoading={isEmployerLoading}
              index={2}
            />
            <StatCard
              title="Hired"
              value={appStats?.hired || 0}
              subtitle={appStats?.hired ? "Candidates hired" : "No hires"}
              icon={CheckCircle2}
              color="green"
              isLoading={isEmployerLoading}
              index={3}
            />
          </>
        ) : (
          <>
            <StatCard
              title="Applications"
              value={candidateStats.total}
              subtitle="Submitted"
              icon={Briefcase}
              color="green"
              isLoading={isCandidateLoading}
              index={0}
            />
            <StatCard
              title="Interviews"
              value={upcomingInterviews?.length || 0}
              subtitle="Scheduled"
              icon={Calendar}
              color="blue"
              isLoading={isCandidateLoading}
              index={1}
            />
            <StatCard
              title="In Review"
              value={candidateStats.inReview}
              subtitle="Pending"
              icon={Clock}
              color="purple"
              isLoading={isCandidateLoading}
              index={2}
            />
            <StatCard
              title="Offers"
              value={candidateStats.offers}
              subtitle="Received"
              icon={CheckCircle2}
              color="green"
              isLoading={isCandidateLoading}
              index={3}
            />
          </>
        )}
      </motion.div>

      {/* Pipeline Health & Activity Feed - Employer */}
      {isEmployer && (
        <motion.div variants={staggerItem} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <PipelineHealthCard />
          <ActivityFeed limit={10} />
        </motion.div>
      )}

      {/* Candidate Portal Link - Employer */}
      {isEmployer && (
        <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="text-base md:text-lg font-semibold text-foreground">Candidate Portal</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share this link with candidates so they can create accounts and enter their job codes
                </p>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2 border border-border">
                <Link2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                  {window.location.origin}/candidate
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary h-8 px-2"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/candidate`);
                    toast.success("Candidate portal link copied!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Job Postings - Employer */}
      {isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 md:px-6 py-3 md:py-4">
            <div>
              <CardTitle className="text-base md:text-lg">Recent Job Postings</CardTitle>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">Your latest jobs with application codes</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground text-xs md:text-sm h-8 md:h-9" asChild>
              <Link to="/jobs">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6 pb-3 md:pb-6">
            {isLoadingJobs ? (
              <>
                <Skeleton className="h-32 md:h-40 w-full" />
                <Skeleton className="h-32 md:h-40 w-full" />
              </>
            ) : jobs && jobs.length > 0 ? (
              jobs.slice(0, 3).map((job) => (
                <JobPostingCard 
                  key={job.id} 
                  job={job}
                  onViewDetails={handleViewDetails}
                  onViewWorkflow={handleViewWorkflow}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onNavigateToApplicants={handleNavigateToApplicants}
                  isDeleting={deleteJob.isPending}
                />
              ))
            ) : (
              <motion.div 
                className="text-center py-8 md:py-12"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative inline-block mb-4">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <Briefcase className="h-14 w-14 md:h-16 md:w-16 text-primary/60" />
                  </motion.div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <AvaGlyph className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Ready to Start Hiring?</h3>
                <p className="text-sm text-muted-foreground mb-1 max-w-xs mx-auto">
                  Ava will help you create a job posting in under 2 minutes.
                </p>
                <p className="text-xs text-muted-foreground/80 mb-4">
                  Your applicants will be automatically screened.
                </p>
                <Button className="gap-2" asChild>
                  <Link to="/jobs/create">
                    <AvaGlyph className="h-4 w-4" />
                    Create with Ava
                  </Link>
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profile Completion Card - Candidate */}
      {!isEmployer && (
        <motion.div variants={staggerItem}>
          <ProfileCompletionCard />
        </motion.div>
      )}

      {/* Apply Now CTA - Candidate */}
      {!isEmployer && (
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
          <CardContent className="p-4 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 md:space-y-2">
              <h3 className="text-xl md:text-2xl font-bold text-foreground">Ready to Apply?</h3>
              <p className="text-sm md:text-base text-muted-foreground max-w-md">
                Have an application code from an employer? Enter it to view and apply for the position.
              </p>
            </div>
            <Button size="lg" className="h-11 md:h-14 px-6 md:px-8 text-base md:text-lg w-full sm:w-auto" asChild>
              <Link to="/apply">
                <Send className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                Apply Now
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Applications - Candidate */}
      {!isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 md:px-6 py-3 md:py-4">
            <div>
              <CardTitle className="text-base md:text-lg">Recent Applications</CardTitle>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">Track your job applications</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground text-xs md:text-sm h-8 md:h-9" asChild>
              <Link to="/applications">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 md:space-y-3 px-3 md:px-6 pb-3 md:pb-6">
            {isLoadingCandidateApps ? (
              <>
                <Skeleton className="h-16 md:h-20 w-full" />
                <Skeleton className="h-16 md:h-20 w-full" />
              </>
            ) : candidateApps && candidateApps.length > 0 ? (
              candidateApps.slice(0, 5).map((app) => (
                <ApplicationCard 
                  key={app.id} 
                  application={app}
                  onOpenBlueprint={handleOpenBlueprintDialog}
                />
              ))
            ) : (
              <motion.div 
                className="text-center py-8 md:py-12"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative inline-block mb-4">
                  <motion.div
                    animate={{ 
                      y: [0, -5, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Briefcase className="h-14 w-14 md:h-16 md:w-16 text-primary/60" />
                  </motion.div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Applications Yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                  Have an application code from an employer? Enter it to start applying.
                </p>
                <Button className="gap-2" asChild>
                  <Link to="/apply">
                    <Send className="h-4 w-4" />
                    Apply Now
                  </Link>
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job Details Dialog */}
      <JobDetailsDialog
        job={selectedJob}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        showApplyButton={false}
      />

      {/* Job Workflow Dialog */}
      <JobWorkflowDialog
        job={selectedJob}
        open={showWorkflowDialog}
        onOpenChange={setShowWorkflowDialog}
      />
      
      {/* Blueprint Dialog */}
      <Dialog open={showBlueprintDialog} onOpenChange={setShowBlueprintDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your Improvement Blueprint</DialogTitle>
          </DialogHeader>
          {blueprintApplicationId && (
            <ImprovementBlueprintCard applicationId={blueprintApplicationId} />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
