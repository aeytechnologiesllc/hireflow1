import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useJob } from "@/hooks/useJobs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Briefcase, 
  MapPin, 
  DollarSign, 
  Clock, 
  Building2,
  Calendar,
  Users,
  CheckCircle2,
  ArrowLeft,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import CandidateApplicationWizard from "@/components/CandidateApplicationWizard";

export default function JobDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: job, isLoading, error } = useJob(id);
  const [showApplicationWizard, setShowApplicationWizard] = useState(false);

  const isEmployer = role === "employer";

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Competitive Salary";
    const curr = currency || "USD";
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    return `Up to ${curr} ${max?.toLocaleString()}`;
  };

  if (isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate Access Only</h2>
            <p className="text-muted-foreground">
              This page is for job seekers. Use the Jobs section to manage your job postings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Job Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This job may no longer be available or the link is invalid.
            </p>
            <Button onClick={() => navigate("/apply")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Apply
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate("/apply")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Apply
        </Button>

        {/* Job Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-card border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Briefcase className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-foreground">{job.title}</h1>
                      {job.department && (
                        <p className="text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-4 w-4" />
                          {job.department}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.location || "Remote"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <Briefcase className="h-3 w-3" />
                      {job.job_type || "Full-Time"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatSalary(job.salary_min, job.salary_max, job.salary_currency)}
                    </Badge>
                    {job.experience_level && (
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {job.experience_level}
                      </Badge>
                    )}
                  </div>

                  {job.application_deadline && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Application deadline: {format(new Date(job.application_deadline), "MMMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Job Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-6">
                  {/* Description */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">About This Role</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                  </div>

                  {/* Responsibilities */}
                  {job.responsibilities && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Responsibilities</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">{job.responsibilities}</p>
                    </div>
                  )}

                  {/* Requirements */}
                  {job.requirements && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Requirements</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">{job.requirements}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Apply CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-card border-primary/50 overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="text-center">
                    <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-foreground">Ready to Apply?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Start your application and take the first step
                    </p>
                  </div>
                  
                  {/* Premium Glowing Apply Button */}
                  <Button
                    onClick={() => setShowApplicationWizard(true)}
                    size="lg"
                    className="w-full h-14 text-lg font-semibold relative overflow-hidden group"
                    style={{
                      boxShadow: "0 0 20px hsl(var(--primary) / 0.4), 0 0 40px hsl(var(--primary) / 0.2)",
                    }}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />
                    <span className="relative flex items-center gap-2">
                      Apply Now
                      <motion.span
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Sparkles className="h-5 w-5" />
                      </motion.span>
                    </span>
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Your application will be reviewed by the hiring team
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Skills */}
            {job.skills_required && job.skills_required.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Required Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {job.skills_required.map((skill, index) => (
                        <Badge key={index} variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Benefits</h3>
                    <ul className="space-y-2">
                      {job.benefits.map((benefit, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Job Meta */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Job Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posted</span>
                      <span className="text-foreground">{format(new Date(job.created_at), "MMM d, yyyy")}</span>
                    </div>
                    {job.job_code && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Job Code</span>
                        <span className="font-mono text-primary">{job.job_code}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Application Wizard */}
      <CandidateApplicationWizard
        job={job}
        open={showApplicationWizard}
        onOpenChange={setShowApplicationWizard}
      />
    </>
  );
}