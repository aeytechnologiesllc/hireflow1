import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  ArrowRight,
  ClipboardList, 
  CheckCircle,
  Loader2,
  FileText,
  Upload,
  X,
  File,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import CountryCodeSelect from "@/components/CountryCodeSelect";

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "file";
  required: boolean;
  options?: string[];
}

interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
  resume_url: string | null;
  cover_letter: string | null;
  status: string;
  jobs: {
    title: string;
    processing_mode: string | null;
    passing_score: number | null;
    application_questions: ApplicationQuestion[] | null;
    workflow_steps: any[] | null;
    require_resume: boolean | null;
  } | null;
}

// Email validation regex
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Format phone number with dashes
const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
};

export default function ApplicationFormPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateApplication = useUpdateApplication();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [questionFiles, setQuestionFiles] = useState<Record<string, File>>({});
  const [questionFileUrls, setQuestionFileUrls] = useState<Record<string, string>>({});
  const [uploadingQuestions, setUploadingQuestions] = useState<Record<string, boolean>>({});
  const [draggingQuestion, setDraggingQuestion] = useState<string | null>(null);
  const questionFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Evaluation screen state
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["application-form", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, application_questions, workflow_steps, require_resume)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user,
  });

  // Get questions from job
  const questions: ApplicationQuestion[] = Array.isArray(application?.jobs?.application_questions)
    ? (application.jobs.application_questions as ApplicationQuestion[])
    : [];

  const requiresResume = application?.jobs?.require_resume !== false;
  const hasQuestions = questions.length > 0;
  const isAutoPilot = application?.jobs?.processing_mode === "auto";

  // Parse notes to check if already submitted
  const notes = application?.notes ? JSON.parse(application.notes) : {};
  const alreadySubmitted = !!(notes.applicationAnswers && notes.applicationAnswers.length > 0);

  // File upload handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = async (file: File) => {
    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF or Word document");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setResumeFile(file);
    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      // Update application with resume URL
      await updateApplication.mutateAsync({
        id: id!,
        resume_url: urlData.publicUrl,
      });

      toast.success("Resume uploaded successfully");
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast.error("Failed to upload resume");
      setResumeFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Question file upload handlers
  const handleQuestionFileSelect = async (file: File, questionId: string) => {
    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF or Word document");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setQuestionFiles(prev => ({ ...prev, [questionId]: file }));
    setUploadingQuestions(prev => ({ ...prev, [questionId]: true }));

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user?.id}/${Date.now()}_${questionId}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      setQuestionFileUrls(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      setAnswers(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      toast.success("File uploaded successfully");
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
      setQuestionFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[questionId];
        return newFiles;
      });
    } finally {
      setUploadingQuestions(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Validate required questions
    questions.forEach(q => {
      if (q.required && !answers[q.id]?.trim()) {
        errors[q.id] = "This field is required";
      }
      if (q.type === "email" && answers[q.id] && !isValidEmail(answers[q.id])) {
        errors[q.id] = "Please enter a valid email address";
      }
    });

    // Validate resume if required and not already uploaded
    // Skip this check if there's a file-type question (it handles the resume)
    const hasFileQuestion = questions.some(q => q.type === "file");
    if (requiresResume && !hasFileQuestion && !resumeFile && !application?.resume_url) {
      errors.resume = "Please upload your resume";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !application) return;

    setIsSubmitting(true);
    setEvaluationState("evaluating");

    try {
      // Format answers for storage
      const applicationAnswers = questions.map(q => ({
        questionId: q.id,
        question: q.question,
        answer: q.type === "phone" && phoneCountryCodes[q.id]
          ? `${phoneCountryCodes[q.id]} ${answers[q.id] || ""}`
          : answers[q.id] || "",
        type: q.type,
      }));

      // Update notes with application answers
      const updatedNotes = {
        ...notes,
        applicationAnswers,
      };

      // Update application
      await updateApplication.mutateAsync({
        id: id!,
        notes: JSON.stringify(updatedNotes),
        cover_letter: coverLetter || application.cover_letter,
        status: "pending",
      });

      // Get workflow steps to find next phase - build full phases list
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = (application.jobs as any)?.quiz_questions as any[] | undefined;
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = (workflowSteps as any[]).find((step: any) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string; title?: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist
      if (quizQuestions && quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      (workflowSteps as any[]).filter((step: any) => step.type !== 'voice_interview').forEach((step: any) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add Review phase
      allPhases.push({ id: "review", type: "review", title: "Review" });
      
      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({ 
          id: (voiceInterviewStep as any).id, 
          type: "voice_interview", 
          title: (voiceInterviewStep as any).title || "Ava Interview" 
        });
      }
      
      // Add final phases
      allPhases.push(
        { id: "interview", type: "interview", title: "Interview" },
        { id: "hired", type: "hired", title: "Hired" }
      );
      
      // Find current step index
      let currentIndex = allPhases.findIndex((p) => p.type === "application" || p.id === stepId);
      
      // Determine next phase
      let nextPhase: { id: string; type: string; title?: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }

      if (nextPhase && nextPhase.type !== "review") {
        setNextPhaseInfo({ id: nextPhase.id, title: nextPhase.title || nextPhase.type });
      }
      
      // Determine new phase - advance to next if auto mode OR if next phase is review
      let newPhase = application.phase || "application";
      if (isAutoPilot || nextPhase?.type === "review") {
        if (nextPhase) {
          newPhase = nextPhase.id;
        }
      }
      
      // Update the phase in the database
      await supabase
        .from("applications")
        .update({ phase: newPhase })
        .eq("id", id!);

      // Always trigger AVA analysis (for both manual and auto modes)
      if (isAutoPilot) {
        // Trigger analysis and evaluate - wait for it in auto mode
        await triggerAvaAnalysis(id!);
        
        // Fetch updated score
        const { data: updatedApp } = await supabase
          .from("applications")
          .select("ai_score")
          .eq("id", id!)
          .single();

        const score = updatedApp?.ai_score || 0;
        const passingScore = application.jobs?.passing_score || 60;
        setAiScore(score);

        if (score >= passingScore) {
          setEvaluationState("passed");
        } else {
          setEvaluationState("failed");
        }
      } else {
        // Manual mode - trigger analysis in background and navigate
        triggerAvaAnalysis(id!).catch(console.error);
        toast.success("Application submitted successfully!");
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      toast.error("Failed to submit application");
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEvaluationComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    navigate(`/applications/${id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Application Not Found</h2>
            <p className="text-muted-foreground">
              This application does not exist or you don't have access to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show already submitted screen
  if (alreadySubmitted) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName="Application"
        isManualMode={!isAutoPilot}
      />
    );
  }

  // Show evaluation screen
  if (evaluationState) {
    return (
      <EvaluationScreen
        state={evaluationState}
        nextPhaseName={nextPhaseInfo?.title}
        onStartNextPhase={handleEvaluationComplete}
        onDoLater={handleEvaluationComplete}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/applications/${id}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Complete Your Application</h1>
          <p className="text-muted-foreground">
            {application.jobs?.title}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Application Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Application Questions */}
          {questions.map((question) => (
            <div key={question.id} className="space-y-2">
              <Label className="text-foreground">
                {question.question}
                {question.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              
              {question.type === "text" && (
                <Input
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                />
              )}
              
              {question.type === "textarea" && (
                <Textarea
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  rows={4}
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                />
              )}
              
              {question.type === "email" && (
                <Input
                  type="email"
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="email@example.com"
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                />
              )}
              
              {question.type === "phone" && (
                <div className="flex gap-2">
                  <CountryCodeSelect
                    value={phoneCountryCodes[question.id] || "+1"}
                    onValueChange={(value) => setPhoneCountryCodes(prev => ({ ...prev, [question.id]: value }))}
                  />
                  <Input
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswers(prev => ({ 
                      ...prev, 
                      [question.id]: formatPhoneNumber(e.target.value) 
                    }))}
                    placeholder="123-456-7890"
                    className={`flex-1 ${validationErrors[question.id] ? "border-destructive" : ""}`}
                  />
                </div>
              )}
              
              {question.type === "select" && question.options && (
                <RadioGroup
                  value={answers[question.id] || ""}
                  onValueChange={(value) => setAnswers(prev => ({ ...prev, [question.id]: value }))}
                >
                  {question.options.map((option, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`${question.id}-${idx}`} />
                      <Label htmlFor={`${question.id}-${idx}`}>{option}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
              
              {question.type === "file" && (
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    draggingQuestion === question.id ? "border-primary bg-primary/5" : "border-border"
                  } ${validationErrors[question.id] ? "border-destructive" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDraggingQuestion(question.id); }}
                  onDragLeave={() => setDraggingQuestion(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingQuestion(null);
                    if (e.dataTransfer.files.length > 0) {
                      handleQuestionFileSelect(e.dataTransfer.files[0], question.id);
                    }
                  }}
                >
                  {uploadingQuestions[question.id] ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Uploading...
                    </div>
                  ) : questionFiles[question.id] ? (
                    <div className="flex items-center justify-center gap-2">
                      <File className="h-5 w-5 text-primary" />
                      <span className="text-sm">{questionFiles[question.id].name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setQuestionFiles(prev => {
                            const newFiles = { ...prev };
                            delete newFiles[question.id];
                            return newFiles;
                          });
                          setQuestionFileUrls(prev => {
                            const newUrls = { ...prev };
                            delete newUrls[question.id];
                            return newUrls;
                          });
                          setAnswers(prev => {
                            const newAnswers = { ...prev };
                            delete newAnswers[question.id];
                            return newAnswers;
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".pdf,.doc,.docx";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) handleQuestionFileSelect(file, question.id);
                        };
                        input.click();
                      }}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {validationErrors[question.id] && (
                <p className="text-sm text-destructive">{validationErrors[question.id]}</p>
              )}
            </div>
          ))}

          {/* Resume Upload - only if no questions have file type */}
          {requiresResume && !questions.some(q => q.type === "file") && (
            <div className="space-y-2">
              <Label className="text-foreground">
                Resume <span className="text-destructive">*</span>
              </Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-border"
                } ${validationErrors.resume ? "border-destructive" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Uploading...
                  </div>
                ) : resumeFile || application.resume_url ? (
                  <div className="flex items-center justify-center gap-2">
                    <File className="h-5 w-5 text-primary" />
                    <span className="text-sm">{resumeFile?.name || "Resume uploaded"}</span>
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                ) : (
                  <div
                    className="cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop your resume
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF or Word document, max 10MB
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {validationErrors.resume && (
                <p className="text-sm text-destructive">{validationErrors.resume}</p>
              )}
            </div>
          )}

          {/* Cover Letter */}
          <div className="space-y-2">
            <Label className="text-foreground">Cover Letter (Optional)</Label>
            <Textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              placeholder="Write a brief cover letter..."
              rows={6}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-2"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Application
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
