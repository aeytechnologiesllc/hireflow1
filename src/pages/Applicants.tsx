import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { useEmployerApplications, useApplicationStats, useUpdateApplication, useDeleteApplication } from "@/hooks/useApplications";

import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useJob } from "@/hooks/useJobs";
import { useAIShortlist } from "@/hooks/useAIShortlist";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Filter, Users, MoreVertical, Mail, Eye, CheckCircle, XCircle, Calendar, Sparkles, ArrowLeft, CheckSquare, Square, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { format } from "date-fns";
import ScheduleInterviewDialog from "@/components/ScheduleInterviewDialog";
import AIShortlistDialog from "@/components/AIShortlistDialog";
import BulkActionsBar from "@/components/BulkActionsBar";
import BulkRejectDialog from "@/components/BulkRejectDialog";
import BulkMessageDialog from "@/components/BulkMessageDialog";
import { FeatureDiscoveryTooltip } from "@/components/FeatureDiscoveryTooltip";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { applicationStatusColors, applicationStatusLabels } from "@/lib/terminology";

interface ApplicantCardProps {
  application: ApplicationWithCandidate;
  onStatusChange: (id: string, status: string) => void;
  onScheduleInterview: (application: ApplicationWithCandidate) => void;
  onNavigateToDetails: (id: string) => void;
  onDeleteApplication: (application: ApplicationWithCandidate) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

function ApplicantCard({ application, onStatusChange, onScheduleInterview, onNavigateToDetails, onDeleteApplication, isSelectionMode, isSelected, onToggleSelect }: ApplicantCardProps) {
  const profile = application.profiles;
  const job = application.jobs;
  
  // Extract applicant name from application notes (Full Name answer) or fall back to profile/email
  const applicantName = (() => {
    if (application.notes) {
      try {
        const parsed = JSON.parse(application.notes);
        const fullNameAnswer = parsed.applicationAnswers?.find(
          (a: { question: string; answer: string }) =>
            a.question.toLowerCase().includes("full name") ||
            a.question.toLowerCase() === "name"
        );
        if (fullNameAnswer?.answer) return fullNameAnswer.answer;
        
        // For in-progress applications, show name from initial notes or email
        if (application.status === "in_progress") {
          if (parsed.candidateName) return parsed.candidateName;
          if (parsed.candidateEmail) return parsed.candidateEmail;
        }
      } catch {}
    }
    return profile?.full_name || profile?.email || "Unknown Candidate";
  })();
  
  const initials = applicantName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

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

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      onToggleSelect(application.id);
    } else {
      onNavigateToDetails(application.id);
    }
  };

  return (
    <Card 
      className={`bg-card border-border hover:border-primary/50 transition-colors cursor-pointer ${isSelected ? "ring-2 ring-primary border-primary" : ""}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          {isSelectionMode && (
            <div className="flex items-center justify-center pt-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox 
                checked={isSelected} 
                onCheckedChange={() => onToggleSelect(application.id)}
                className="h-5 w-5"
              />
            </div>
          )}
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">
                  {applicantName}
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDeleteApplication(application); }} 
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Application
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Badge className={applicationStatusColors[application.status]}>
                {applicationStatusLabels[application.status] || 
                  (phaseName || application.status.charAt(0).toUpperCase() + application.status.slice(1))
                }
              </Badge>
              {application.status === "in_progress" && (
                <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30 text-orange-500">
                  Filling out application
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {application.status === "in_progress" ? "Started application for" : "Applied for"} <span className="text-foreground font-medium">{job?.title}</span>
              </span>
            </div>

            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              {profile?.location && <span>{profile.location}</span>}
              {profile?.experience_years && (
                <span>{profile.experience_years} years exp.</span>
              )}
              <span>Applied {format(new Date(application.created_at), "MMM d, yyyy")}</span>
            </div>

            {application.ai_score && (() => {
              const passingScore = application.jobs?.passing_score || 60;
              const isFailing = application.ai_score < passingScore;
              const scoreColor = isFailing ? "text-rose-400" : "text-primary";
              const barColor = isFailing ? "bg-rose-400" : "bg-primary";
              
              return (
                <div className="mt-3 flex items-center gap-2">
                  <Sparkles className={`h-4 w-4 ${scoreColor}`} />
                  <div className="text-xs font-medium text-muted-foreground">AI Score:</div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${barColor} rounded-full`}
                        style={{ width: `${application.ai_score}%` }}
                      />
                    </div>
                    <span className={`text-sm font-medium ${scoreColor}`}>{application.ai_score}%</span>
                  </div>
                </div>
              );
            })()}
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
  const { role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer" || isTeamMember;
  const { data: applications, isLoading, refetch: refetchApplications } = useEmployerApplications();
  const { data: filteredJob } = useJob(jobIdFilter || undefined);
  const { data: stats, refetch: refetchStats } = useApplicationStats();
  const updateApplication = useUpdateApplication();
  const { generateShortlist, shortlist, isLoading: isShortlistLoading, clearShortlist } = useAIShortlist();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Mobile pull-to-refresh
  const isMobile = useIsMobile();
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchApplications(), refetchStats()]);
  }, [refetchApplications, refetchStats]);
  
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithCandidate | null>(null);
  
  // Selection state for bulk actions
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [bulkMessageDialogOpen, setBulkMessageDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<ApplicationWithCandidate | null>(null);
  
  const deleteApplication = useDeleteApplication();
  const queryClient = useQueryClient();

  // Real-time subscription for application updates (phase changes, status updates)
  useEffect(() => {
    const channel = supabase
      .channel('applications-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
        },
        (payload) => {
          console.log('Applications updated in real-time:', payload);
          queryClient.invalidateQueries({ queryKey: ["applications", "employer"] });
          queryClient.invalidateQueries({ queryKey: ["applications", "stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Permission checks
  const canManagePipeline = !isTeamMember || permissions?.canManagePipeline;
  const canScheduleInterviews = !isTeamMember || permissions?.canScheduleInterviews;
  const canMessageCandidates = !isTeamMember || permissions?.canMessageCandidates;
  const canSendDocuments = !isTeamMember || permissions?.canSendDocuments;

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

  const handleDeleteClick = (application: ApplicationWithCandidate) => {
    setApplicationToDelete(application);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!applicationToDelete) return;
    
    try {
      await deleteApplication.mutateAsync(applicationToDelete.id);
      toast.success("Application deleted successfully");
      setDeleteDialogOpen(false);
      setApplicationToDelete(null);
    } catch (error) {
      toast.error("Failed to delete application");
    }
  };

  // Bulk action handlers
  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredApplications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApplications.map((app) => app.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleGenerateShortlist = async () => {
    if (!jobIdFilter || !filteredJob) {
      toast.error("Please filter by a specific job to generate a shortlist");
      return;
    }
    setShortlistDialogOpen(true);
    await generateShortlist(
      jobIdFilter,
      filteredJob.title,
      filteredJob.description,
      filteredApplications
    );
  };

  const handleShortlistScheduleInterview = (candidateName: string, applicationId?: string) => {
    const app = filteredApplications.find(a => a.id === applicationId);
    if (app) {
      setSelectedApplication(app);
      setScheduleDialogOpen(true);
    }
  };

  const filteredApplications = useMemo(() => {
    let result = applications || [];
    
    // Filter by assigned job IDs for team members
    if (isTeamMember && permissions?.assignedJobIds?.length) {
      result = result.filter((app) => permissions.assignedJobIds.includes(app.job_id));
    }
    
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
  }, [applications, isTeamMember, permissions?.assignedJobIds, jobIdFilter, searchQuery]);

  const selectedApplications = useMemo(() => {
    return filteredApplications.filter((app) => selectedIds.has(app.id));
  }, [filteredApplications, selectedIds]);

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
    <motion.div 
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Applicants for {filteredJob.title}</h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Review applications for this position</p>
            </>
          ) : (
            <>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Applicants</h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Review and manage job applications</p>
          </>
            )}
        </div>
        {/* AI Shortlist Button - only show when filtered by job and 2+ applicants */}
        {jobIdFilter && filteredJob && filteredApplications.length >= 2 && (
          <FeatureDiscoveryTooltip
            featureId="ai_shortlist"
            title="Ava's Shortlist"
            description="Let Ava analyze all applicants and rank them by fit for this role. She'll highlight top candidates and explain why."
            icon={<Sparkles className="h-4 w-4" />}
            position="bottom"
          >
            <Button 
              onClick={handleGenerateShortlist}
              className="w-full sm:w-auto gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
              disabled={isShortlistLoading}
            >
              <Sparkles className="h-4 w-4" />
              AI Shortlist
            </Button>
          </FeatureDiscoveryTooltip>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div variants={staggerItem} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Pending</p>
            <p className="text-xl sm:text-2xl font-bold text-yellow-500">{stats?.pending || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Reviewing</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-500">{stats?.reviewing || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Interview</p>
            <p className="text-xl sm:text-2xl font-bold text-purple-500">{stats?.interview || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Hired</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{stats?.hired || 0}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search applicants..." 
            className="pl-10 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <FeatureDiscoveryTooltip
            featureId="bulk_actions"
            title="Bulk Actions"
            description="Select multiple candidates to message, reject, or advance them all at once."
            icon={<CheckSquare className="h-4 w-4" />}
            position="bottom"
          >
            <Button 
              variant={isSelectionMode ? "default" : "outline"} 
              className="gap-2 flex-1 sm:flex-none"
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) {
                  setSelectedIds(new Set());
                }
              }}
            >
              {isSelectionMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {isSelectionMode ? "Done" : "Select"}
            </Button>
          </FeatureDiscoveryTooltip>
          {isSelectionMode && filteredApplications.length > 0 && (
            <Button variant="outline" onClick={handleSelectAll} className="hidden sm:flex">
              {selectedIds.size === filteredApplications.length ? "Deselect All" : "Select All"}
            </Button>
          )}
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
        </div>
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
              onDeleteApplication={handleDeleteClick}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(application.id)}
              onToggleSelect={handleToggleSelect}
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

      <AIShortlistDialog
        open={shortlistDialogOpen}
        onOpenChange={(open) => {
          setShortlistDialogOpen(open);
          if (!open) clearShortlist();
        }}
        shortlist={shortlist}
        isLoading={isShortlistLoading}
        onScheduleInterview={handleShortlistScheduleInterview}
      />

      {/* Bulk Actions */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onReject={() => setBulkRejectDialogOpen(true)}
        onScheduleInterview={() => toast.info("Bulk interview scheduling coming soon")}
        onSendDocument={() => navigate("/documents")}
        onSendMessage={() => setBulkMessageDialogOpen(true)}
        onClearSelection={handleClearSelection}
        canManagePipeline={canManagePipeline}
        canScheduleInterviews={canScheduleInterviews}
        canSendDocuments={canSendDocuments}
        canMessageCandidates={canMessageCandidates}
      />

      <BulkRejectDialog
        open={bulkRejectDialogOpen}
        onOpenChange={setBulkRejectDialogOpen}
        selectedApplications={selectedApplications}
        onSuccess={handleClearSelection}
      />

      <BulkMessageDialog
        open={bulkMessageDialogOpen}
        onOpenChange={setBulkMessageDialogOpen}
        selectedApplications={selectedApplications}
        onSuccess={handleClearSelection}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Application
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3" asChild>
              <div>
                <p>
                  Are you sure you want to delete the application from{" "}
                  <strong>{applicationToDelete?.profiles?.full_name || "this candidate"}</strong>?
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                  <p className="font-medium text-destructive mb-1">⚠️ This will permanently delete:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>The application and all submitted data</li>
                    <li>All messages with this applicant</li>
                    <li>All scheduled interviews</li>
                    <li>All documents sent to this applicant</li>
                  </ul>
                </div>
                <p className="text-destructive font-medium">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteApplication.isPending}
            >
              {deleteApplication.isPending ? "Deleting..." : "Delete Application"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
