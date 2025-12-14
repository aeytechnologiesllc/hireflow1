import { useAuth } from "@/hooks/useAuth";
import { usePublishedJobs } from "@/hooks/useJobs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, MapPin, Briefcase, DollarSign, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import JobApplicationDialog from "@/components/JobApplicationDialog";
import type { Tables } from "@/integrations/supabase/types";

export default function FindJobs() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: jobs, isLoading } = usePublishedJobs();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<Tables<"jobs"> | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const filteredJobs = jobs?.filter((job) => {
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLocation = !locationQuery || 
      job.location?.toLowerCase().includes(locationQuery.toLowerCase());
    return matchesSearch && matchesLocation;
  });

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Competitive";
    const curr = currency || "USD";
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    return `Up to ${curr} ${max?.toLocaleString()}`;
  };

  const handleApply = (job: Tables<"jobs">) => {
    setSelectedJob(job);
    setApplyDialogOpen(true);
  };

  if (isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate Access Only</h2>
            <p className="text-muted-foreground">
              This page is for job seekers. Use the Jobs section to manage your job postings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Find Jobs</h2>
        <p className="text-muted-foreground mt-1">Discover opportunities that match your skills</p>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search jobs by title, company, or keywords..." 
            className="pl-10 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="relative w-64">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Location" 
            className="pl-10 bg-card border-border"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Results count */}
      {!isLoading && filteredJobs && (
        <p className="text-sm text-muted-foreground">
          {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Job Listings */}
      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : filteredJobs && filteredJobs.length > 0 ? (
          filteredJobs.map((job) => (
            <Card key={job.id} className="bg-card border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{job.title}</h3>
                      <p className="text-sm text-muted-foreground">{job.department || "Company"}</p>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{job.location || "Remote"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{job.job_type || "Full-Time"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        <span>{formatSalary(job.salary_min, job.salary_max, job.salary_currency)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>Posted {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.description}
                    </p>

                    {job.skills_required && job.skills_required.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {job.skills_required.slice(0, 5).map((skill, index) => (
                          <span 
                            key={index}
                            className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md"
                          >
                            {skill}
                          </span>
                        ))}
                        {job.skills_required.length > 5 && (
                          <span className="px-2 py-1 text-muted-foreground text-xs">
                            +{job.skills_required.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button onClick={() => handleApply(job)}>Apply Now</Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Briefcase className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No jobs available</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                There are no job postings matching your search criteria. Try adjusting your filters or check back later.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <JobApplicationDialog
        job={selectedJob}
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
      />
    </div>
  );
}
