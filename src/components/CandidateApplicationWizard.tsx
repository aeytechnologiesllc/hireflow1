import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, 
  ChevronLeft, 
  FileText, 
  Upload, 
  CheckCircle2, 
  Loader2,
  Sparkles,
  ClipboardList,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCreateApplication } from "@/hooks/useApplications";
import type { Tables, Json } from "@/integrations/supabase/types";

interface CandidateApplicationWizardProps {
  job: Tables<"jobs">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  options?: string[];
}

export default function CandidateApplicationWizard({ 
  job, 
  open, 
  onOpenChange 
}: CandidateApplicationWizardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createApplication = useCreateApplication();

  // Parse application questions from job
  const applicationQuestions: ApplicationQuestion[] = Array.isArray(job.application_questions) 
    ? (job.application_questions as unknown as ApplicationQuestion[])
    : [];

  // Determine wizard steps based on job configuration
  const hasQuestions = applicationQuestions.length > 0;
  const requiresResume = job.require_resume !== false;

  const steps = [
    ...(hasQuestions ? [{ id: "questions", title: "Application Questions", icon: ClipboardList }] : []),
    { id: "resume", title: "Resume & Cover Letter", icon: FileText },
    { id: "review", title: "Review & Submit", icon: Send },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resumeUrl, setResumeUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const currentStepData = steps[currentStep];

  const resetWizard = () => {
    setCurrentStep(0);
    setAnswers({});
    setResumeUrl("");
    setCoverLetter("");
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  const canProceed = () => {
    if (!currentStepData) return false;

    switch (currentStepData.id) {
      case "questions":
        // Check all required questions are answered
        return applicationQuestions.every(q => 
          !q.required || (answers[q.id] && answers[q.id].trim())
        );
      case "resume":
        // Resume is required if job requires it
        if (requiresResume && !resumeUrl.trim()) return false;
        return true;
      case "review":
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const analyzeApplication = async () => {
    setIsAnalyzing(true);
    try {
      const content = `
Job Title: ${job.title}
Job Description: ${job.description}
Requirements: ${job.requirements || "Not specified"}

Application Answers:
${Object.entries(answers).map(([id, answer]) => {
  const question = applicationQuestions.find(q => q.id === id);
  return `Q: ${question?.question || id}\nA: ${answer}`;
}).join("\n\n")}

Cover Letter:
${coverLetter || "Not provided"}

Resume URL: ${resumeUrl || "Not provided"}
      `;

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "application",
          content,
          context: {
            skills_required: job.skills_required,
            experience_level: job.experience_level,
          },
        },
      });

      if (error) throw error;

      const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      return {
        analysis: data.analysis,
        score: score && score >= 0 && score <= 100 ? score : null,
      };
    } catch (error) {
      console.error("AI analysis error:", error);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Run AI analysis
      const aiResult = await analyzeApplication();

      // Prepare notes with application answers
      const notes = applicationQuestions.length > 0
        ? JSON.stringify({
            applicationAnswers: Object.entries(answers).map(([id, answer]) => {
              const question = applicationQuestions.find(q => q.id === id);
              return { question: question?.question || id, answer };
            }),
          })
        : null;

      await createApplication.mutateAsync({
        job_id: job.id,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl || null,
        ai_analysis: aiResult?.analysis || null,
        ai_score: aiResult?.score || null,
        notes,
        phase: "application",
      });

      toast.success("Application submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      handleClose();
      navigate("/applications");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = isSubmitting || isAnalyzing;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        {/* Progress Header */}
        <div className="border-b border-border p-6 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                {currentStepData && <currentStepData.icon className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{currentStepData?.title}</h2>
                <p className="text-sm text-muted-foreground">
                  Applying for {job.title}
                </p>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex gap-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <AnimatePresence mode="wait">
            {/* Application Questions Step */}
            {currentStepData?.id === "questions" && (
              <motion.div
                key="questions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {applicationQuestions.map((question, index) => (
                  <div key={question.id} className="space-y-2">
                    <Label className="text-base">
                      {index + 1}. {question.question}
                      {question.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    
                    {question.type === "textarea" ? (
                      <Textarea
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                        placeholder="Enter your answer..."
                        className="min-h-[100px]"
                      />
                    ) : question.type === "select" && question.options ? (
                      <RadioGroup
                        value={answers[question.id] || ""}
                        onValueChange={(value) => setAnswers(prev => ({ ...prev, [question.id]: value }))}
                        className="space-y-2"
                      >
                        {question.options.map((option) => (
                          <div key={option} className="flex items-center space-x-2">
                            <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                            <Label htmlFor={`${question.id}-${option}`} className="font-normal">
                              {option}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    ) : (
                      <Input
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                        placeholder="Enter your answer..."
                      />
                    )}
                  </div>
                ))}

                {applicationQuestions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No application questions for this position</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Resume & Cover Letter Step */}
            {currentStepData?.id === "resume" && (
              <motion.div
                key="resume"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="resumeUrl" className="text-base">
                    Resume URL
                    {requiresResume && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <div className="relative">
                    <Upload className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="resumeUrl"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      placeholder="https://example.com/my-resume.pdf"
                      className="pl-10"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Provide a link to your resume (Google Drive, Dropbox, etc.)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverLetter" className="text-base">
                    Cover Letter (Optional)
                  </Label>
                  <Textarea
                    id="coverLetter"
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell us why you're a great fit for this role..."
                    className="min-h-[150px]"
                  />
                </div>

                <div className="flex items-center gap-2 p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <Sparkles className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">AI-Powered Analysis</p>
                    <p className="text-sm text-muted-foreground">
                      Your application will be analyzed by AI to help match you with this role
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Review Step */}
            {currentStepData?.id === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Ready to Submit</h3>
                  <p className="text-muted-foreground mt-2">
                    Review your application before submitting
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Summary Cards */}
                  {applicationQuestions.length > 0 && (
                    <div className="p-4 rounded-lg bg-muted/30 border border-border">
                      <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Application Questions
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {Object.keys(answers).filter(k => answers[k]).length} of {applicationQuestions.length} questions answered
                      </p>
                    </div>
                  )}

                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Resume & Cover Letter
                    </h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Resume: {resumeUrl ? "Provided" : "Not provided"}</p>
                      <p>Cover Letter: {coverLetter ? "Provided" : "Not provided"}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex items-center justify-between bg-card">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? handleClose : handleBack}
            disabled={isPending}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            {currentStep === 0 ? "Cancel" : "Back"}
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={isPending}
              className="relative overflow-hidden"
              style={{
                boxShadow: "0 0 15px hsl(var(--primary) / 0.3)",
              }}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isAnalyzing ? "Analyzing..." : "Submitting..."}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Application
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}