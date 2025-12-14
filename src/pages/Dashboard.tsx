import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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
}

function StatCard({ title, value, subtitle, icon: Icon, color, borderColor, iconBgColor, iconColor }: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden bg-card border-l-4 ${borderColor}`}>
      <CardContent className="pt-4 pb-16">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-4xl font-bold text-foreground mt-2">{value}</p>
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
  title: string;
  status: "active" | "paused" | "closed";
  isAutoPilot?: boolean;
  code: string;
  company: string;
  type: string;
  applicants: number;
  createdDate: string;
}

function JobPostingCard({ title, status, isAutoPilot, code, company, type, applicants, createdDate }: JobPostingCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                status === "active" 
                  ? "bg-primary/20 text-primary" 
                  : status === "paused"
                  ? "bg-warning/20 text-warning"
                  : "bg-muted text-muted-foreground"
              }`}>
                {status}
              </span>
              {isAutoPilot && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Auto-Pilot
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ChevronUp className="h-5 w-5" />
          </Button>
        </div>

        {/* Code section */}
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Code:</span>
            <span className="text-sm font-bold text-primary">{code}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-primary gap-1 h-8">
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

        {/* Job details */}
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{company}</span>
          <span>•</span>
          <span>{type}</span>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{applicants} applicants</span>
          </div>
          <span className="text-xs">Created {createdDate}</span>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 h-8">
            <Eye className="h-4 w-4" />
            View Applicants
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 h-8">
            <MoreVertical className="h-4 w-4" />
            More Actions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isEmployer ? (
          <>
            <StatCard
              title="Active Jobs"
              value={1}
              subtitle="Open positions"
              icon={Briefcase}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
            />
            <StatCard
              title="Total Applicants"
              value={0}
              subtitle="No applications"
              icon={Users}
              color="blue"
              borderColor="border-l-blue-500"
              iconBgColor="bg-blue-500/20"
              iconColor="text-blue-500"
            />
            <StatCard
              title="Under Review"
              value={0}
              subtitle="No pending"
              icon={Clock}
              color="purple"
              borderColor="border-l-accent"
              iconBgColor="bg-accent/20"
              iconColor="text-accent"
            />
            <StatCard
              title="Hired"
              value={0}
              subtitle="No hires"
              icon={CheckCircle2}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
            />
          </>
        ) : (
          <>
            <StatCard
              title="Applications"
              value={0}
              subtitle="Submitted"
              icon={Briefcase}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
            />
            <StatCard
              title="Interviews"
              value={0}
              subtitle="Scheduled"
              icon={Clock}
              color="blue"
              borderColor="border-l-blue-500"
              iconBgColor="bg-blue-500/20"
              iconColor="text-blue-500"
            />
            <StatCard
              title="In Review"
              value={0}
              subtitle="Pending"
              icon={Users}
              color="purple"
              borderColor="border-l-accent"
              iconBgColor="bg-accent/20"
              iconColor="text-accent"
            />
            <StatCard
              title="Offers"
              value={0}
              subtitle="Received"
              icon={CheckCircle2}
              color="green"
              borderColor="border-l-primary"
              iconBgColor="bg-primary/20"
              iconColor="text-primary"
            />
          </>
        )}
      </div>

      {/* Recent Job Postings */}
      {isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Job Postings</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your latest jobs with application codes</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground">
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <JobPostingCard
              title="Chat Support"
              status="active"
              isAutoPilot={true}
              code="7CZNT4"
              company="Souther Digital Tech"
              type="Full-Time"
              applicants={0}
              createdDate="11/28/2025"
            />
          </CardContent>
        </Card>
      )}

      {/* Candidate View - Recent Applications */}
      {!isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Applications</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Track your job applications</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No applications yet</p>
              <p className="text-sm mt-1">Start applying to jobs to track your progress</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
