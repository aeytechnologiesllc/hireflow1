import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Send, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  MapPin,
  DollarSign,
  Building2,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import JobApplicationDialog from "@/components/JobApplicationDialog";
import type { Tables } from "@/integrations/supabase/types";

export default function ApplyWithCode() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get("code") || "";
  
  const [jobCode, setJobCode] = useState(initialCode);
  const [isSearching, setIsSearching] = useState(false);
  const [foundJob, setFoundJob] = useState<Tables<"jobs"> | null>(null);
  const [error, setError] = useState("");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const isEmployer = role === "employer";

  const handleSearch = async () => {
    if (!jobCode.trim()) {
      setError("Please enter an application code");
      return;
    }

    setIsSearching(true);
    setError("");
    setFoundJob(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("jobs")
        .select("*")
        .eq("job_code", jobCode.trim().toUpperCase())
        .eq("status", "published")
        .single();

      if (fetchError || !data) {
        setError("No job found with this code. Please check and try again.");
        return;
      }

      setFoundJob(data);
    } catch (err) {
      setError("An error occurred while searching. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Competitive";
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground">Apply Now</h1>
        <p className="text-muted-foreground mt-2">
          Enter the application code provided by the employer to view and apply for the position
        </p>
      </div>

      {/* Code Entry Card */}
      <Card className="max-w-xl mx-auto bg-card border-border">
        <CardContent className="p-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-code" className="text-base font-medium">
                Application Code
              </Label>
              <div className="flex gap-3">
                <Input
                  id="job-code"
                  value={jobCode}
                  onChange={(e) => {
                    setJobCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter code (e.g., ABC123)"
                  className="text-lg font-mono tracking-widest uppercase"
                />
                <Button 
                  onClick={handleSearch} 
                  disabled={isSearching || !jobCode.trim()}
                  className="min-w-[120px]"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                The employer will provide you with this code
              </p>
            </div>

            {/* Error State */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Found Job Card */}
      <AnimatePresence>
        {foundJob && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="max-w-2xl mx-auto"
          >
            <Card className="bg-card border-primary/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-sm text-primary font-medium mb-1">Job Found</p>
                      <h2 className="text-2xl font-bold text-foreground">{foundJob.title}</h2>
                      {foundJob.department && (
                        <p className="text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-4 w-4" />
                          {foundJob.department}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{foundJob.location || "Remote"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{foundJob.job_type || "Full-Time"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        <span>{formatSalary(foundJob.salary_min, foundJob.salary_max, foundJob.salary_currency)}</span>
                      </div>
                    </div>

                    <p className="text-muted-foreground line-clamp-3">
                      {foundJob.description}
                    </p>

                    {foundJob.skills_required && foundJob.skills_required.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {foundJob.skills_required.slice(0, 6).map((skill, index) => (
                          <span 
                            key={index}
                            className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md"
                          >
                            {skill}
                          </span>
                        ))}
                        {foundJob.skills_required.length > 6 && (
                          <span className="px-2 py-1 text-muted-foreground text-xs">
                            +{foundJob.skills_required.length - 6} more
                          </span>
                        )}
                      </div>
                    )}

                    <Button 
                      onClick={() => setApplyDialogOpen(true)}
                      size="lg"
                      className="w-full"
                    >
                      Apply for this Position
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Job Yet Placeholder */}
      {!foundJob && !error && (
        <div className="text-center py-12">
          <Briefcase className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">
            Enter an application code above to get started
          </p>
        </div>
      )}

      {/* Application Dialog */}
      <JobApplicationDialog
        job={foundJob}
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
      />
    </div>
  );
}