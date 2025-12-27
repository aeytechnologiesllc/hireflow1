import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useEmployerJobs, useJobStats, useDeleteJob, useCreateJob } from "@/hooks/useJobs";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  Briefcase,
  Users,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Copy,
  Link2,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { staggerContainer, staggerItem, pulsingGlowWithScale } from "@/lib/animations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import JobDetailsDialog from "@/components/JobDetailsDialog";
import JobWorkflowDialog from "@/components/JobWorkflowDialog";
import { ProcessingModeToggle } from "@/components/ProcessingModeToggle";
import FirstJobTooltip from "@/components/FirstJobTooltip";
import type { JobWithApplicationCount } from "@/hooks/useJobs";

interface JobCardProps {
  job: JobWithApplicationCount;
  onDelete: () => void;
  onViewDetails: (job: JobWithApplicationCount) => void;
  onViewWorkflow: (job: JobWithApplicationCount) => void;
  onEdit: (job: JobWithApplicationCount) => void;
  onDuplicate: (job: JobWithApplicationCount) => void;
  onCardClick: (job: JobWithApplicationCount) => void;
  isDeleting: boolean;
  canDelete: boolean;
  canEdit: boolean;
  showFirstJobTooltip?: boolean;
  onTooltipDismiss?: () => void;
}

function JobCard({ job, onDelete, onViewDetails, onViewWorkflow, onEdit, onDuplicate, onCardClick, isDeleting, canDelete, canEdit, showFirstJobTooltip, onTooltipDismiss }: JobCardProps) {
  const statusStyles = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-primary/20 text-primary",
    closed: "bg-destructive/20 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };

  return (
    <Card 
      className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => onCardClick(job)}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-foreground">{job.title}</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetails(job); }}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewWorkflow(job); }}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    View Workflow
                  </DropdownMenuItem>
                  {canEdit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(job); }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Job
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(job); }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyles[job.status]}`}>
                {job.status}
              </span>
              {job.processing_mode && (
                <div className="relative">
                  {showFirstJobTooltip && job.processing_mode === "auto" && (
                    <FirstJobTooltip 
                      show={showFirstJobTooltip} 
                      onDismiss={onTooltipDismiss || (() => {})} 
                    />
                  )}
                  <ProcessingModeToggle
                    jobId={job.id}
                    jobTitle={job.title}
                    currentMode={job.processing_mode as "auto" | "manual"}
                    disabled={!canEdit}
                  />
                </div>
              )}
              {job.ai_bias_score && job.ai_bias_score >= 80 && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Optimized
                </span>
              )}
            </div>

            {job.job_code && (
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Code:</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(job.job_code!);
                    toast.success("Job code copied to clipboard");
                  }}
                  className="font-bold text-primary hover:text-primary/80 hover:underline cursor-pointer transition-colors"
                >
                  {job.job_code}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
              <span>{job.location || "Remote"}</span>
              <span className="hidden sm:inline">•</span>
              <span>{job.job_type || "Full-Time"}</span>
              <span className="hidden sm:inline">•</span>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>{job.application_count} applicant{job.application_count !== 1 ? "s" : ""}</span>
              </div>
              <span className="text-xs hidden sm:inline">Created {format(new Date(job.created_at), "MM/dd/yyyy")}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Jobs() {
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const navigate = useNavigate();
  const isEmployer = role === "employer" || isTeamMember;
  const { data: jobs, isLoading, refetch: refetchJobs } = useEmployerJobs();
  const { data: stats, refetch: refetchStats } = useJobStats();
  const deleteJob = useDeleteJob();
  const createJob = useCreateJob();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Mobile pull-to-refresh
  const isMobile = useIsMobile();
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchJobs(), refetchStats()]);
  }, [refetchJobs, refetchStats]);
  const { handlers: pullHandlers, PullIndicator } = usePullToRefresh({ onRefresh: handleRefresh });
  const [selectedJob, setSelectedJob] = useState<JobWithApplicationCount | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<JobWithApplicationCount | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(() => {
    return localStorage.getItem("firstJobTooltipDismissed") === "true";
  });

  // Permission checks
  const canCreateJobs = !isTeamMember || permissions?.canCreateJobs;
  const canDeleteJobs = !isTeamMember || permissions?.canDeleteJobs;
  const canEditJobs = !isTeamMember || permissions?.canCreateJobs; // Create permission implies edit

  const handleDeleteClick = (job: JobWithApplicationCount) => {
    setJobToDelete(job);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    try {
      await deleteJob.mutateAsync(jobToDelete.id);
      toast.success("Job deleted successfully");
      setShowDeleteConfirm(false);
      setJobToDelete(null);
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

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

  const handleDuplicate = async (job: JobWithApplicationCount) => {
    try {
      const { id, created_at, updated_at, employer_id, job_code, application_count, ...jobData } = job;
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

  const handleCardClick = (job: JobWithApplicationCount) => {
    navigate(`/applicants?job=${job.id}`);
  };

  // Filter jobs for team members by assigned job IDs
  const filteredJobs = useMemo(() => {
    let result = jobs || [];
    
    // Filter by assigned job IDs for team members
    if (isTeamMember && permissions?.assignedJobIds?.length) {
      result = result.filter((job) => permissions.assignedJobIds.includes(job.id));
    }
    
    // Filter by search query
    if (searchQuery) {
      result = result.filter((job) =>
        job.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return result;
  }, [jobs, isTeamMember, permissions?.assignedJobIds, searchQuery]);

  if (!isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Employer Access Only</h2>
            <p className="text-muted-foreground">
              This page is only accessible to employers. Please use the "Find Jobs" section to browse available positions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      {...(isMobile ? pullHandlers : {})}
    >
      {isMobile && <PullIndicator />}
      {/* Header */}
      <motion.div variants={staggerItem} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Job Postings</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your job listings and track applications</p>
        </div>
        {canCreateJobs && (
          <motion.div
            animate={pulsingGlowWithScale.animate}
            transition={pulsingGlowWithScale.transition}
            className="rounded-lg"
          >
            <Button 
              className="w-full sm:w-auto bg-[hsl(220,15%,11%)] hover:bg-[hsl(220,15%,15%)] text-white border border-[hsl(220,15%,20%)] transition-all duration-300" 
              asChild
            >
              <Link to="/jobs/create">
                Create with Ava
              </Link>
            </Button>
          </motion.div>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div variants={staggerItem} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search jobs..." 
            className="pl-10 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={staggerItem} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Total Jobs</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Published</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{stats?.published || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Drafts</p>
            <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{stats?.draft || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Closed</p>
            <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{stats?.closed || 0}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Job List */}
      <motion.div variants={staggerItem} className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : filteredJobs && filteredJobs.length > 0 ? (
          filteredJobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <JobCard 
                job={job} 
                onDelete={() => handleDeleteClick(job)}
                onViewDetails={handleViewDetails}
                onViewWorkflow={handleViewWorkflow}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onCardClick={handleCardClick}
                isDeleting={deleteJob.isPending}
                canDelete={!!canDeleteJobs}
                canEdit={!!canEditJobs}
                showFirstJobTooltip={index === 0 && filteredJobs.length === 1 && !tooltipDismissed}
                onTooltipDismiss={() => setTooltipDismissed(true)}
              />
            </motion.div>
          ))
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Briefcase className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No jobs yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Create your first job posting to start receiving applications.
              </p>
              {canCreateJobs && (
                <motion.div
                  animate={pulsingGlowWithScale.animate}
                  transition={pulsingGlowWithScale.transition}
                  className="rounded-lg inline-block"
                >
                  <Button 
                    className="bg-[hsl(220,15%,11%)] hover:bg-[hsl(220,15%,15%)] text-white border border-[hsl(220,15%,20%)] transition-all duration-300" 
                    asChild
                  >
                    <Link to="/jobs/create">
                      Create with Ava
                    </Link>
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>

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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl">Delete Job Permanently?</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-foreground font-medium">
                  You are about to delete: <span className="text-primary">"{jobToDelete?.title}"</span>
                </p>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">This will permanently remove:</p>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      All applicant data and applications ({jobToDelete?.application_count || 0} applicants)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      All interview recordings and scores
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      All messages with candidates
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      All document requests and uploads
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      All AI analysis and evaluation data
                    </li>
                  </ul>
                </div>
                <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={deleteJob.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteJob.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteJob.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
