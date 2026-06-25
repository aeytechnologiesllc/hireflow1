import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Send, 
  Loader2, 
  AlertCircle,
  Briefcase,
  KeyRound,
  Clock3,
  ArrowRight,
  ClipboardList,
  FileText,
  RefreshCw,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { isPast } from "date-fns";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { fetchRoleByCode, type ShowcaseRole } from "@/lib/showcaseApply";
import { detectSchemaMode } from "@/cockpit/data/showcaseSource";

interface JobPreview {
  id: string;
  title: string;
  description: string;
  location: string | null;
  job_type: string | null;
  experience_level: string | null;
  department: string | null;
  application_questions: Array<{ id: string; question: string; type: string; required?: boolean }> | null;
  quiz_questions: Array<{ id: string; question: string; type: string; time_limit_seconds?: number }> | null;
  workflow_steps: Array<{ id: string; title?: string; type: string; description?: string }> | null;
  require_resume: boolean | null;
  application_deadline: string | null;
  employer_id: string;
}

const STEP_TIME_MAP: Record<string, number> = {
  typing_test: 5,
  video_message: 5,
  chat_simulation: 10,
  sales_simulation: 10,
  portfolio_upload: 5,
  chat_interview: 12,
  voice_interview: 15,
};

function estimateCandidateTime(job: JobPreview) {
  const questionMinutes = (job.application_questions?.length || 0) * 1;
  const quizMinutes = (job.quiz_questions || []).reduce(
    (total, question) => total + Math.ceil((question.time_limit_seconds || 30) / 60),
    0
  );
  const workflowMinutes = (job.workflow_steps || []).reduce(
    (total, step) => total + (STEP_TIME_MAP[step.type] || 5),
    0
  );

  const total = Math.max(5, questionMinutes + quizMinutes + workflowMinutes + 5);
  return {
    total,
    range: `${Math.max(5, total - 3)}-${total + 4} min`,
  };
}

function getRequiredMaterials(job: JobPreview) {
  const materials = new Set<string>();

  if (job.require_resume !== false) {
    materials.add("Resume");
  }

  if ((job.application_questions || []).some((question) => question.type === "file")) {
    materials.add("Requested file upload");
  }

  if ((job.quiz_questions || []).length > 0) {
    materials.add("Time for a short assessment");
  }

  if ((job.workflow_steps || []).some((step) => step.type === "portfolio_upload")) {
    materials.add("Portfolio samples");
  }

  if ((job.workflow_steps || []).some((step) => step.type === "video_message" || step.type === "voice_interview")) {
    materials.add("A quiet place for a recording");
  }

  return Array.from(materials);
}

function getPreviewStages(job: JobPreview) {
  const stages: string[] = [];

  if ((job.application_questions || []).length > 0 || job.require_resume !== false) {
    stages.push("Application review");
  }

  if ((job.quiz_questions || []).length > 0) {
    stages.push("Assessment");
  }

  (job.workflow_steps || []).forEach((step) => {
    stages.push(step.title || step.type.replace(/_/g, " "));
  });

  return stages.length > 0 ? stages : ["Review"];
}

export default function ApplyWithCode() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get("code") || "";
  
  const [jobCode, setJobCode] = useState(initialCode);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [previewJob, setPreviewJob] = useState<JobPreview | null>(null);
  const [showcaseRole, setShowcaseRole] = useState<ShowcaseRole | null>(null);
  const autoLoadedCodeRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEmployer = role === "employer";
  const candidateJobPath = (jobId: string) => (role === "candidate" ? `/job/${jobId}` : `/candidate/job/${jobId}`);

  const handleSearch = useCallback(async (rawCode?: string) => {
    const normalizedCode = (rawCode ?? jobCode).trim().toUpperCase();

    if (!normalizedCode) {
      setError("Please enter an application code");
      return;
    }

    setIsSearching(true);
    setError("");
    setJobCode(normalizedCode);
    setShowcaseRole(null);
    setPreviewJob(null);

    try {
      const mode = await detectSchemaMode();
      if (mode === "showcase") {
        const role = await fetchRoleByCode(normalizedCode);
        if (!role) {
          setError("No job found with this code. Please check and try again.");
          return;
        }
        setShowcaseRole(role);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("jobs")
        .select("id, title, description, location, job_type, experience_level, department, application_questions, quiz_questions, workflow_steps, require_resume, application_deadline, employer_id")
        .eq("job_code", normalizedCode)
        .eq("status", "published")
        .single();

      if (fetchError || !data) {
        setError("No job found with this code. Please check and try again.");
        setPreviewJob(null);
        return;
      }

      if (data.application_deadline && isPast(new Date(data.application_deadline))) {
        setError("This job is no longer accepting applications.");
        setPreviewJob(null);
        return;
      }

      const { data: limitData, error: limitError } = await supabase.functions.invoke("check-applicant-limit", {
        body: { employerId: data.employer_id, jobId: data.id },
      });

      if (limitError) {
        console.error("Failed to check applicant limit from code preview:", limitError);
      } else if (limitData?.limitReached) {
        setError("This employer is not currently accepting new applications for this role.");
        setPreviewJob(null);
        return;
      }

      setPreviewJob(data as JobPreview);
    } catch (err) {
      setError("An error occurred while searching. Please try again.");
      setPreviewJob(null);
    } finally {
      setIsSearching(false);
    }
  }, [jobCode]);

  useEffect(() => {
    const normalizedInitialCode = initialCode.trim().toUpperCase();

    if (!normalizedInitialCode) {
      autoLoadedCodeRef.current = null;
      return;
    }

    if (autoLoadedCodeRef.current === normalizedInitialCode) {
      return;
    }

    autoLoadedCodeRef.current = normalizedInitialCode;
    void handleSearch(normalizedInitialCode);
  }, [handleSearch, initialCode]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleSearchAnotherCode = useCallback(() => {
    setPreviewJob(null);
    setShowcaseRole(null);
    setError("");
    setJobCode("");
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

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
    <CandidateShell className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10">
      <AnimatePresence mode="wait">
        {showcaseRole ? (
          <motion.div
            key="showcase-preview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl"
          >
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Position found
              </div>
              <h1 className="text-4xl font-bold text-foreground">Review the role</h1>
              <p className="mt-2 text-muted-foreground">No account needed — apply in about a minute.</p>
              <button type="button" onClick={handleSearchAnotherCode} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                <RefreshCw className="h-4 w-4" />
                Search another code
              </button>
            </div>
            <Card className="border-border bg-card shadow-xl overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary via-cyan-400 to-emerald-400" />
              <CardContent className="p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">{showcaseRole.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{showcaseRole.location} · {showcaseRole.pay}</p>
                  {showcaseRole.description && <p className="mt-3 text-sm text-muted-foreground line-clamp-4">{showcaseRole.description}</p>}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button size="lg" className="flex-1 gap-2" onClick={() => navigate(`/candidate/apply/${showcaseRole.id}/form`)}>
                    Start application
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => navigate("/candidate/continue")} className="gap-2">
                    <KeyRound className="h-4 w-4" />
                    Continue your application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : previewJob ? (
          <motion.div
            key="job-preview-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-2xl"
          >
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Position found
              </div>
              <h1 className="text-4xl font-bold text-foreground">Review the role</h1>
              <p className="mt-2 text-muted-foreground">
                Make sure this is the right job, then continue to the application.
              </p>
              <button
                type="button"
                onClick={handleSearchAnotherCode}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                <RefreshCw className="h-4 w-4" />
                Search another code
              </button>
            </div>

            <Card className="relative overflow-hidden border-border bg-card shadow-xl">
              <div className="h-1.5 bg-gradient-to-r from-primary via-cyan-400 to-emerald-400" />
              <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Role preview
                    </Badge>
                    {previewJob.department && <Badge variant="outline">{previewJob.department}</Badge>}
                    {previewJob.job_type && <Badge variant="outline" className="capitalize">{previewJob.job_type.replace(/_/g, " ")}</Badge>}
                    {previewJob.experience_level && <Badge variant="outline" className="capitalize">{previewJob.experience_level}</Badge>}
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">{previewJob.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {previewJob.location ? previewJob.location : "Location not specified"}{" "}
                      {previewJob.department ? `• ${previewJob.department}` : ""}
                    </p>
                  </div>

                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-4">
                    {previewJob.description}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Clock3 className="h-4 w-4" />
                      <span className="text-sm font-medium">Estimated time</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{estimateCandidateTime(previewJob).range}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <ClipboardList className="h-4 w-4" />
                      <span className="text-sm font-medium">Stages</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{getPreviewStages(previewJob).length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">Materials</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{getRequiredMaterials(previewJob).length}</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-sm font-medium text-foreground mb-3">What you’ll do</p>
                    <div className="space-y-2">
                      {getPreviewStages(previewJob).slice(0, 5).map((stage, index) => (
                        <div key={`${stage}-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <span>{stage}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-sm font-medium text-foreground mb-3">What you should have ready</p>
                    <div className="flex flex-wrap gap-2">
                      {getRequiredMaterials(previewJob).map((material) => (
                        <Badge key={material} variant="secondary" className="max-w-full whitespace-normal text-left">
                          {material}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => navigate(candidateJobPath(previewJob.id))}
                    size="lg"
                    className="flex-1 gap-2"
                  >
                    Continue to application
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleSearchAnotherCode}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Search another code
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="job-search-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-md"
          >
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-foreground">Enter Job Code</h1>
              <p className="mt-2 max-w-md text-muted-foreground">
                Enter the application code you received from the employer to view and apply for the position
              </p>
            </motion.div>

            <Card className="bg-card border-border">
              <CardContent className="p-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="job-code" className="text-base font-medium">
                      Job Application Code
                    </Label>
                    <Input
                      id="job-code"
                      ref={inputRef}
                      value={jobCode}
                      onChange={(e) => {
                        setJobCode(e.target.value.toUpperCase());
                        setError("");
                        setPreviewJob(null);
                      }}
                      onKeyDown={handleKeyPress}
                      placeholder="Enter code (e.g., ABC123)"
                      className="h-14 text-center font-mono text-xl uppercase tracking-[0.3em]"
                    />
                  </div>

                  <Button 
                    onClick={() => void handleSearch()} 
                    disabled={isSearching || !jobCode.trim()}
                    size="lg"
                    className="w-full h-12 text-lg"
                  >
                    {isSearching ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="mr-2 h-5 w-5" />
                        Find Position
                      </>
                    )}
                  </Button>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-center text-sm text-muted-foreground">
                    Already applied?{" "}
                    <Link to="/candidate/continue" className="text-primary hover:underline">
                      Continue your application
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </CandidateShell>
  );
}
