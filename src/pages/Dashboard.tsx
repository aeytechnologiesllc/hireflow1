import { useAuth } from "@/hooks/useAuth";
import { useJobStats, useEmployerJobs } from "@/hooks/useJobs";
import { useApplicationStats } from "@/hooks/useApplications";
import { useCandidateApplications } from "@/hooks/useApplications";
import { useUpcomingInterviews } from "@/hooks/useInterviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Sparkles,
  ChevronUp,
  Calendar,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Job } from "@/hooks/useJobs";
import type { ApplicationWithJob } from "@/hooks/useApplications";

// Wave SVG component for stat cards
function WaveGradient({ color }: { color: string }) {
  const gradientId = `wave-gradient-${color}-${Math.random()}`;
  
  const colorMap: Record<string, { from: string; to: string }> = {
    green: { from: "#10b981", to: "#059669" },
    blue: { from: "#3b82f6", to: "#2563eb" },
    purple: { from: "#a855f7", to: "#7c3aed" },
  };

  const colors = colorMap[color] || colorMap.green;

  return (
    <svg
      className="absolute bottom-0 left-0 right-0 h-16 w-full"
      viewBox="0 0 400 60"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors.from} stopOpacity="0.3" />
          <stop offset="50%" stopColor={colors.to} stopOpacity="0.1" />
          <stop offset="100%" stopColor={colors.from} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path
        d="M0,30 Q50,10 100,30 T200,30 T300,30 T400,30 L400,60 L0,60 Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M0,40 Q50,20 100,40 T200,40 T300,40 T400,40 L400,60 L0,60 Z"
        fill={`url(#${gradientId})`}
        opacity="0.5"
      />
    </svg>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: "green" | "blue" | "purple";
  borderColor: string;
  iconBgColor: string;
  iconColor: string;
  isLoading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, color, borderColor, iconBgColor, iconColor, isLoading }: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden bg-card border-l-4 ${borderColor}`}>
      <CardContent className="pt-4 pb-16">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-10 w-16 mt-2" />
            ) : (
              <p className="text-4xl font-bold text-foreground mt-2">{value}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={`w-10 h-10 rounded-lg ${iconBgColor} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
      <WaveGradient color={color} />
    </Card>
  );
}

interface JobPostingCardProps {
  job: Job;
}

function JobPostingCard({ job }: JobPostingCardProps) {
  const copyCode = () => {
    if (job.job_code) {
      navigator.clipboard.writeText(job.job_code);
      toast.success("Code copied to clipboard");
    }
  };

  const statusMap: Record<string, "active" | "paused" | "closed"> = {
    published: "active",
    draft: "paused",
    closed: "closed",
    archived: "closed",
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">{job.title}</h3>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                job.status === "published" 
                  ? "bg-primary/20 text-primary" 
                  : job.status === "draft"
                  ? "bg-warning/20 text-warning"
                  : "bg-muted text-muted-foreground"
              }`}>
                {job.status}
              </span>
              {job.ai_bias_score && job.ai_bias_score >= 80 && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Optimized
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ChevronUp className="h-5 w-5" />
          </Button>
        </div>

        {job.job_code && (
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Code:</span>
              <span className="text-sm font-bold text-primary">{job.job_code}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-primary gap-1 h-8" onClick={copyCode}>
                <Copy className="h-4 w-4" />
                Code
              </Button>
              <Button variant="ghost" size="sm" className="text-primary gap-1 h-8">
                <Link2 className="h-4 w-4" />
                Link
              </Button>
              <Button variant="ghost" size="sm" className="text-primary gap-1 h-8">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{job.department || "Company"}</span>
          <span>•</span>
          <span>{job.job_type || "Full-Time"}</span>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>0 applicants</span>
          </div>
          <span className="text-xs">Created {format(new Date(job.created_at), "MM/dd/yyyy")}</span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 h-8" asChild>
            <Link to="/applicants">
              <Eye className="h-4 w-4" />
              View Applicants
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 h-8" asChild>
            <Link to="/jobs">
              <MoreVertical className="h-4 w-4" />
              More Actions
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  reviewing: "bg-blue-500/20 text-blue-500",
  interview: "bg-purple-500/20 text-purple-500",
  offered: "bg-primary/20 text-primary",
  hired: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

function ApplicationCard({ application }: { application: ApplicationWithJob }) {
  const job = application.jobs;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">{job?.title || "Unknown Position"}</h4>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {job?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              <span>{format(new Date(application.created_at), "MMM d, yyyy")}</span>
            </div>
          </div>
          <Badge className={statusColors[application.status]}>
            {application.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  
  // Employer data
  const { data: jobStats, isLoading: isLoadingJobStats } = useJobStats();
  const { data: appStats, isLoading: isLoadingAppStats } = useApplicationStats();
  const { data: jobs, isLoading: isLoadingJobs } = useEmployerJobs();
  
  // Candidate data
  const { data: candidateApps, isLoading: isLoadingCandidateApps } = useCandidateApplications();
  const { data: upcomingInterviews } = useUpcomingInterviews();

  const isEmployerLoading = isLoadingJobStats || isLoadingAppStats;
  const isCandidateLoading = isLoadingCandidateApps;

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
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isEmployer ? (
          <>
            <StatCard
              title="Active Jobs"
              value={jobStats?.published || 0}
              subtitle="Open positions"
              icon={Briefcase}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
              isLoading={isEmployerLoading}
            />
            <StatCard
              title="Total Applicants"
              value={appStats?.total || 0}
              subtitle={appStats?.total ? "Applications received" : "No applications"}
              icon={Users}
              color="blue"
              borderColor="border-l-blue-500"
              iconBgColor="bg-blue-500/20"
              iconColor="text-blue-500"
              isLoading={isEmployerLoading}
            />
            <StatCard
              title="Under Review"
              value={appStats?.reviewing || 0}
              subtitle={appStats?.reviewing ? "Being reviewed" : "No pending"}
              icon={Clock}
              color="purple"
              borderColor="border-l-accent"
              iconBgColor="bg-accent/20"
              iconColor="text-accent"
              isLoading={isEmployerLoading}
            />
            <StatCard
              title="Hired"
              value={appStats?.hired || 0}
              subtitle={appStats?.hired ? "Candidates hired" : "No hires"}
              icon={CheckCircle2}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
              isLoading={isEmployerLoading}
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
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
              isLoading={isCandidateLoading}
            />
            <StatCard
              title="Interviews"
              value={upcomingInterviews?.length || 0}
              subtitle="Scheduled"
              icon={Calendar}
              color="blue"
              borderColor="border-l-blue-500"
              iconBgColor="bg-blue-500/20"
              iconColor="text-blue-500"
              isLoading={isCandidateLoading}
            />
            <StatCard
              title="In Review"
              value={candidateStats.inReview}
              subtitle="Pending"
              icon={Clock}
              color="purple"
              borderColor="border-l-accent"
              iconBgColor="bg-accent/20"
              iconColor="text-accent"
              isLoading={isCandidateLoading}
            />
            <StatCard
              title="Offers"
              value={candidateStats.offers}
              subtitle="Received"
              icon={CheckCircle2}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
              isLoading={isCandidateLoading}
            />
          </>
        )}
      </div>

      {/* Recent Job Postings - Employer */}
      {isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Job Postings</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your latest jobs with application codes</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground" asChild>
              <Link to="/jobs">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingJobs ? (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : jobs && jobs.length > 0 ? (
              jobs.slice(0, 3).map((job) => (
                <JobPostingCard key={job.id} job={job} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No jobs posted yet</p>
                <p className="text-sm mt-1">Create your first job posting to get started</p>
                <Button className="mt-4" asChild>
                  <Link to="/jobs">Create Job</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Applications - Candidate */}
      {!isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Applications</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Track your job applications</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground" asChild>
              <Link to="/applications">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingCandidateApps ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : candidateApps && candidateApps.length > 0 ? (
              candidateApps.slice(0, 5).map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No applications yet</p>
                <p className="text-sm mt-1">Start applying to jobs to track your progress</p>
                <Button className="mt-4" asChild>
                  <Link to="/find-jobs">Browse Jobs</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
