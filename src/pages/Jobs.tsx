import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface JobCardProps {
  title: string;
  status: "draft" | "published" | "closed" | "archived";
  code: string;
  location: string;
  type: string;
  applicants: number;
  createdDate: string;
  isAutoPilot?: boolean;
}

function JobCard({ title, status, code, location, type, applicants, createdDate, isAutoPilot }: JobCardProps) {
  const statusStyles = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-primary/20 text-primary",
    closed: "bg-destructive/20 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };

  return (
    <Card className="bg-card border-border hover:border-primary/50 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Job
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyles[status]}`}>
                {status}
              </span>
              {isAutoPilot && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Auto-Pilot
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Code:</span>
              <span className="font-bold text-primary">{code}</span>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{location}</span>
              <span>•</span>
              <span>{type}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{applicants} applicants</span>
              </div>
              <span className="text-xs">Created {createdDate}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Jobs() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Job Postings</h2>
          <p className="text-muted-foreground mt-1">Manage your job listings and track applications</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Job
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search jobs..." 
            className="pl-10 bg-card border-border"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Jobs</p>
            <p className="text-2xl font-bold text-foreground">1</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Published</p>
            <p className="text-2xl font-bold text-primary">1</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Drafts</p>
            <p className="text-2xl font-bold text-muted-foreground">0</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Closed</p>
            <p className="text-2xl font-bold text-muted-foreground">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Job List */}
      <div className="space-y-4">
        <JobCard
          title="Chat Support"
          status="published"
          code="7CZNT4"
          location="Remote"
          type="Full-Time"
          applicants={0}
          createdDate="11/28/2025"
          isAutoPilot={true}
        />
      </div>
    </div>
  );
}
