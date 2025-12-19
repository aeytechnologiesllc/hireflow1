import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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
  Send,
  X,
  File,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { isPast } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCreateApplication, useUpdateApplication, useCandidateApplications } from "@/hooks/useApplications";
import CountryCodeSelect from "@/components/CountryCodeSelect";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import type { Tables, Json } from "@/integrations/supabase/types";

interface CandidateApplicationWizardProps {
  job: Tables<"jobs">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "file";
  required: boolean;
  options?: string[];
}

// Email validation regex
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Format phone number with dashes (e.g., 123-456-7890)
const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
};

export default function CandidateApplicationWizard({ 
  job, 
  open, 
  onOpenChange 
}: CandidateApplicationWizardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication();
  const { data: existingApplications } = useCandidateApplications();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if application deadline has passed
  const isDeadlinePassed = job.application_deadline && isPast(new Date(job.application_deadline));

  // Parse application questions from job
  const applicationQuestions: ApplicationQuestion[] = Array.isArray(job.application_questions) 
    ? (job.application_questions as unknown as ApplicationQuestion[])
    : [];

  // Determine wizard steps based on job configuration
  const hasQuestions = applicationQuestions.length > 0;
  const requiresResume = job.require_resume !== false;
  const hasFileQuestionInQuestions = applicationQuestions.some(q => q.type === "file");

  const steps = [
    ...(hasQuestions ? [{ id: "questions", title: "Application Questions", icon: ClipboardList }] : []),
    { id: "resume", title: hasFileQuestionInQuestions ? "Cover Letter" : "Resume & Cover Letter", icon: FileText },
    { id: "review", title: "Review & Submit", icon: Send },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phoneCountryCodes, setPhoneCountryCodes] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUrl, setResumeUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [questionFiles, setQuestionFiles] = useState<Record<string, File>>({});
  const [questionFileUrls, setQuestionFileUrls] = useState<Record<string, string>>({});
  const [uploadingQuestions, setUploadingQuestions] = useState<Record<string, boolean>>({});
  const [draggingQuestion, setDraggingQuestion] = useState<string | null>(null);
  const questionFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Evaluation screen state for autopilot mode
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  const [createdApplicationId, setCreatedApplicationId] = useState<string | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  const currentStepData = steps[currentStep];

  // Check for existing application (draft or submitted) for this job
  const existingApplication = existingApplications?.find(app => app.job_id === job.id);
  const existingDraft = existingApplication?.status === "in_progress" ? existingApplication : null;

  // Create draft application when wizard opens
  useEffect(() => {
    const createDraftApplication = async () => {
      // Don't create if deadline passed, already creating, already have an application, or dialog not open
      if (!open || isDeadlinePassed || isCreatingDraft || existingApplication || !user) return;

      setIsCreatingDraft(true);
      try {
        // Fetch user profile to get email for initial notes
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", user.id)
          .single();

        // Create initial notes with candidate email for visibility
        const initialNotes = JSON.stringify({
          applicationAnswers: [],
          candidateEmail: profile?.email || user.email,
          candidateName: profile?.full_name || null,
        });

        const draftApp = await createApplication.mutateAsync({
          job_id: job.id,
          status: "in_progress" as any,
          phase: "application",
          notes: initialNotes,
        });

        setCreatedApplicationId(draftApp.id);
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      } catch (error: any) {
        // Handle duplicate application error - user already has a submitted application
        if (error.message?.includes("applications_job_id_candidate_id_key") || error.code === "23505") {
          // Silently ignore - the existing application will be used
        } else {
          console.error("Failed to create draft application:", error);
        }
      } finally {
        setIsCreatingDraft(false);
      }
    };

    createDraftApplication();
  }, [open, job.id, user, isDeadlinePassed, existingApplication]);

  // If there's an existing draft, use its ID
  useEffect(() => {
    if (existingDraft && !createdApplicationId) {
      setCreatedApplicationId(existingDraft.id);
    }
  }, [existingDraft, createdApplicationId]);

  const resetWizard = () => {
    setCurrentStep(0);
    setAnswers({});
    setPhoneCountryCodes({});
    setResumeFile(null);
    setResumeUrl("");
    setCoverLetter("");
    setValidationErrors({});
    setQuestionFiles({});
    setQuestionFileUrls({});
    setUploadingQuestions({});
    setDraggingQuestion(null);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  // File upload handlers for resume step
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

  // Question file upload handlers
  const handleQuestionDragOver = useCallback((e: React.DragEvent, questionId: string) => {
    e.preventDefault();
    setDraggingQuestion(questionId);
  }, []);

  const handleQuestionDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDraggingQuestion(null);
  }, []);

  const handleQuestionDrop = useCallback((e: React.DragEvent, questionId: string) => {
    e.preventDefault();
    setDraggingQuestion(null);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleQuestionFileSelect(files[0], questionId);
    }
  }, []);

  const handleQuestionFileSelect = async (file: File, questionId: string) => {
    // Validate file type
    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF or Word document");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setQuestionFiles(prev => ({ ...prev, [questionId]: file }));
    setUploadingQuestions(prev => ({ ...prev, [questionId]: true }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${questionId}-${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("resumes")
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      setQuestionFileUrls(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      setAnswers(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      
      // If this is a resume file question (type: file), also set resumeUrl for tracking
      const question = applicationQuestions.find(q => q.id === questionId);
      if (question?.type === "file" && (question.question?.toLowerCase().includes("resume") || questionId.toLowerCase().includes("resume"))) {
        setResumeUrl(urlData.publicUrl);
      }
      
      toast.success("File uploaded successfully");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload file. Please try again.");
      setQuestionFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[questionId];
        return newFiles;
      });
    } finally {
      setUploadingQuestions(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleQuestionFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, questionId: string) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleQuestionFileSelect(files[0], questionId);
    }
  };

  const removeQuestionFile = (questionId: string) => {
    // Check if this is a resume file question
    const question = applicationQuestions.find(q => q.id === questionId);
    if (question?.type === "file" && (question.question?.toLowerCase().includes("resume") || questionId.toLowerCase().includes("resume"))) {
      setResumeUrl("");
    }
    
    setQuestionFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[questionId];
      return newFiles;
    });
    setQuestionFileUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[questionId];
      return newUrls;
    });
    setAnswers(prev => {
      const newAnswers = { ...prev };
      delete newAnswers[questionId];
      return newAnswers;
    });
    if (questionFileInputRefs.current[questionId]) {
      questionFileInputRefs.current[questionId]!.value = "";
    }
  };

  const handleFileSelect = async (file: File) => {
    // Validate file type
    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF or Word document");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setResumeFile(file);
    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("resumes")
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      setResumeUrl(urlData.publicUrl);
      toast.success("Resume uploaded successfully");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload resume. Please try again.");
      setResumeFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const removeFile = () => {
    setResumeFile(null);
    setResumeUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Validation for email/phone fields
  const validateField = (question: ApplicationQuestion, value: string) => {
    if (question.type === "email" && value && !isValidEmail(value)) {
      return "Please enter a valid email address";
    }
    if (question.type === "phone" && value) {
      const phoneDigits = value.replace(/\D/g, "");
      if (phoneDigits.length < 10) {
        return "Please enter a valid phone number";
      }
    }
    return "";
  };

  const handleAnswerChange = (questionId: string, value: string, question: ApplicationQuestion) => {
    let formattedValue = value;
    
    // Format phone numbers
    if (question.type === "phone") {
      formattedValue = formatPhoneNumber(value);
    }

    setAnswers(prev => ({ ...prev, [questionId]: formattedValue }));

    // Validate on change
    const error = validateField(question, formattedValue);
    setValidationErrors(prev => ({ ...prev, [questionId]: error }));
  };

  const canProceed = () => {
    if (!currentStepData) return false;

    switch (currentStepData.id) {
      case "questions":
        // Check all required questions are answered and valid
        const hasRequiredAnswers = applicationQuestions.every(q => {
          if (!q.required) return true;
          if (q.type === "file") {
            return !!questionFileUrls[q.id];
          }
          return answers[q.id] && answers[q.id].trim();
        });
        const hasNoErrors = Object.values(validationErrors).every(err => !err);
        const noUploadsInProgress = !Object.values(uploadingQuestions).some(v => v);
        return hasRequiredAnswers && hasNoErrors && noUploadsInProgress;
      case "resume":
        // Resume is required if job requires it AND there's no file question in application questions
        if (requiresResume && !hasFileQuestionInQuestions && !resumeUrl.trim()) return false;
        return !isUploading;
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
    // Double-check deadline hasn't passed before submitting
    if (isDeadlinePassed) {
      toast.error("The application deadline for this job has passed");
      onOpenChange(false);
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Run AI analysis
      const aiResult = await analyzeApplication();
      setAiScore(aiResult?.score || null);

      // Prepare notes with application answers
      const notes = applicationQuestions.length > 0
        ? JSON.stringify({
            applicationAnswers: Object.entries(answers).map(([id, answer]) => {
              const question = applicationQuestions.find(q => q.id === id);
              return { question: question?.question || id, answer };
            }),
          })
        : null;

      // Determine if autopilot mode and what the next phase should be
      const isAutoMode = job.processing_mode !== "manual";
      const passingScore = job.passing_score || 60;
      const passed = aiResult?.score !== null && aiResult.score >= passingScore;

      // Build the phases list to determine next phase
      const workflowSteps = (job.workflow_steps as any[]) || [];
      const quizQuestions = (job.quiz_questions as any[]) || [];
      
      const allPhases: { id: string; type: string; title: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist
      if (quizQuestions.length > 0) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }
      
      // Add workflow steps
      workflowSteps.forEach((step: any) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });
      
      // Add final phases
      allPhases.push(
        { id: "review", type: "review", title: "Review" },
        { id: "interview", type: "interview", title: "Interview" },
        { id: "hired", type: "hired", title: "Hired" }
      );

      // Determine phase and status based on mode and score
      let newPhase = "application";
      let newStatus: "pending" | "rejected" = "pending";
      
      if (isAutoMode && aiResult?.score !== null) {
        if (passed) {
          // Advance to next phase
          const currentIndex = 0; // application is index 0
          if (currentIndex < allPhases.length - 1) {
            newPhase = allPhases[currentIndex + 1].id;
            setNextPhaseInfo({
              id: allPhases[currentIndex + 1].id,
              title: allPhases[currentIndex + 1].title,
            });
          }
        } else {
          // Failed - reject
          newStatus = "rejected";
        }
      }

      // Update the existing draft application or create new if somehow no draft exists
      let finalAppId = createdApplicationId;
      
      if (createdApplicationId) {
        // Update the existing draft application
        await updateApplication.mutateAsync({
          id: createdApplicationId,
          cover_letter: coverLetter || null,
          resume_url: resumeUrl || null,
          ai_analysis: aiResult?.analysis || null,
          ai_score: aiResult?.score || null,
          notes,
          phase: newPhase,
          status: newStatus,
        });
      } else {
        // Fallback: create new application if no draft exists
        const createdApp = await createApplication.mutateAsync({
          job_id: job.id,
          cover_letter: coverLetter || null,
          resume_url: resumeUrl || null,
          ai_analysis: aiResult?.analysis || null,
          ai_score: aiResult?.score || null,
          notes,
          phase: newPhase,
          status: newStatus,
        });
        finalAppId = createdApp.id;
        setCreatedApplicationId(createdApp.id);
      }

      queryClient.invalidateQueries({ queryKey: ["applications"] });

      if (isAutoMode && aiResult?.score !== null) {
        // Show evaluation screen
        setEvaluationState(passed ? "passed" : "failed");
      } else {
        // Manual mode - just toast and navigate
        toast.success("Application submitted successfully!");
        handleClose();
        navigate("/applications");
      }
    } catch (error: any) {
      // Check for duplicate application error
      if (error.message?.includes("applications_job_id_candidate_id_key") || 
          error.code === "23505") {
        toast.error("You have already submitted an application for this job. You cannot submit duplicate applications.");
      } else {
        toast.error(error.message || "Failed to submit application");
      }
      setEvaluationState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for evaluation screen
  const handleStartNextPhase = () => {
    if (!nextPhaseInfo || !createdApplicationId) return;
    
    const workflowSteps = (job.workflow_steps as any[]) || [];
    const nextStep = workflowSteps.find((s: any) => s.id === nextPhaseInfo.id);
    
    handleClose();
    
    if (nextStep) {
      const phaseRoutes: Record<string, string> = {
        typing_test: "typing-test",
        video_intro: "video-intro",
        video_message: "video-intro",
        portfolio_upload: "portfolio",
        chat_simulation: "chat-simulation",
        chat_interview: "chat-interview",
        sales_simulation: "sales-simulation",
        voice_interview: "voice-interview",
        quiz: "quiz",
      };
      const route = phaseRoutes[nextStep.type] || nextStep.type;
      navigate(`/applications/${createdApplicationId}/${route}/${nextPhaseInfo.id}`);
    } else if (nextPhaseInfo.id === "quiz") {
      navigate(`/applications/${createdApplicationId}/quiz/quiz`);
    } else if (nextPhaseInfo.id === "review") {
      navigate(`/applications/${createdApplicationId}`);
    } else {
      navigate(`/applications/${createdApplicationId}`);
    }
  };

  const handleDoLater = () => {
    handleClose();
    navigate(`/applications/${createdApplicationId}`);
  };

  const isPending = isSubmitting || isAnalyzing;

  // Show evaluation screen for autopilot mode
  if (evaluationState) {
    // Show CandidateStatusScreen for failed state
    if (evaluationState === "failed") {
      return (
        <CandidateStatusScreen
          state="rejected"
          jobTitle={job.title}
          applicationData={{ id: createdApplicationId, jobs: job, status: "rejected" } as any}
          candidateId={undefined}
          onClose={() => {
            handleClose();
            navigate("/applications");
          }}
        />
      );
    }
    
    // Show EvaluationScreen for passed/evaluating states
    return (
      <EvaluationScreen
        state={evaluationState}
        onStartNextPhase={nextPhaseInfo ? handleStartNextPhase : undefined}
        onDoLater={handleDoLater}
        nextPhaseName={nextPhaseInfo?.title}
        score={aiScore ?? undefined}
        passingScore={job.passing_score || 60}
      />
    );
  }

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
                        onChange={(e) => handleAnswerChange(question.id, e.target.value, question)}
                        placeholder="Enter your answer..."
                        className="min-h-[100px]"
                        onPaste={(e) => { e.preventDefault(); toast.error("Copying and pasting is not allowed"); }}
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
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
                    ) : question.type === "email" ? (
                      <div className="space-y-1">
                        <Input
                          type="email"
                          value={answers[question.id] || ""}
                          onChange={(e) => handleAnswerChange(question.id, e.target.value, question)}
                          placeholder="email@example.com"
                          className={validationErrors[question.id] ? "border-destructive" : ""}
                          onPaste={(e) => { e.preventDefault(); toast.error("Copying and pasting is not allowed"); }}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        {validationErrors[question.id] && (
                          <p className="text-sm text-destructive">{validationErrors[question.id]}</p>
                        )}
                      </div>
                    ) : question.type === "phone" ? (
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          <CountryCodeSelect
                            value={phoneCountryCodes[question.id] || "+1"}
                            onValueChange={(value) => setPhoneCountryCodes(prev => ({ ...prev, [question.id]: value }))}
                          />
                          <Input
                            type="tel"
                            value={answers[question.id] || ""}
                            onChange={(e) => handleAnswerChange(question.id, e.target.value, question)}
                            placeholder="123-456-7890"
                            className={`flex-1 ${validationErrors[question.id] ? "border-destructive" : ""}`}
                            maxLength={12}
                          />
                        </div>
                        {validationErrors[question.id] && (
                          <p className="text-sm text-destructive">{validationErrors[question.id]}</p>
                        )}
                      </div>
                    ) : question.type === "file" ? (
                      <div className="space-y-2">
                        {/* Hidden file input */}
                        <input
                          ref={(el) => { questionFileInputRefs.current[question.id] = el; }}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => handleQuestionFileInputChange(e, question.id)}
                          className="hidden"
                        />

                        {/* Drag & Drop Zone */}
                        {!questionFiles[question.id] ? (
                          <div
                            onDragOver={(e) => handleQuestionDragOver(e, question.id)}
                            onDragLeave={handleQuestionDragLeave}
                            onDrop={(e) => handleQuestionDrop(e, question.id)}
                            onClick={() => questionFileInputRefs.current[question.id]?.click()}
                            className={`
                              relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
                              transition-all duration-200
                              ${draggingQuestion === question.id 
                                ? "border-primary bg-primary/10" 
                                : "border-border hover:border-primary/50 hover:bg-muted/30"
                              }
                            `}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className={`
                                w-12 h-12 rounded-full flex items-center justify-center transition-colors
                                ${draggingQuestion === question.id ? "bg-primary/20" : "bg-muted"}
                              `}>
                                <Upload className={`h-5 w-5 ${draggingQuestion === question.id ? "text-primary" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <p className="text-foreground font-medium text-sm">
                                  {draggingQuestion === question.id ? "Drop your file here" : "Drag and drop your file"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  or <span className="text-primary underline">browse files</span>
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Supports PDF, DOC, DOCX (max 10MB)
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-border rounded-xl p-3 bg-muted/20">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                <File className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate">{questionFiles[question.id].name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(questionFiles[question.id].size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                              {uploadingQuestions[question.id] ? (
                                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                              ) : questionFileUrls[question.id] ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeQuestionFile(question.id);
                                }}
                                className="shrink-0 h-8 w-8"
                                disabled={uploadingQuestions[question.id]}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input
                        value={answers[question.id] || ""}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value, question)}
                        placeholder="Enter your answer..."
                        onPaste={(e) => { e.preventDefault(); toast.error("Copying and pasting is not allowed"); }}
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
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
                {/* Only show resume upload if there's no file-type question in application questions */}
                {!hasFileQuestionInQuestions && (
                  <div className="space-y-3">
                    <Label className="text-base">
                      Resume
                      {requiresResume && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {/* Drag & Drop Zone */}
                    {!resumeFile ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                          transition-all duration-200
                          ${isDragging 
                            ? "border-primary bg-primary/10" 
                            : "border-border hover:border-primary/50 hover:bg-muted/30"
                          }
                        `}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className={`
                            w-14 h-14 rounded-full flex items-center justify-center transition-colors
                            ${isDragging ? "bg-primary/20" : "bg-muted"}
                          `}>
                            <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div>
                            <p className="text-foreground font-medium">
                              {isDragging ? "Drop your resume here" : "Drag and drop your resume"}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              or <span className="text-primary underline">browse files</span>
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Supports PDF, DOC, DOCX (max 10MB)
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-border rounded-xl p-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <File className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{resumeFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          {isUploading ? (
                            <Loader2 className="h-5 w-5 text-primary animate-spin" />
                          ) : resumeUrl ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile();
                            }}
                            className="shrink-0"
                            disabled={isUploading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                    onPaste={(e) => { e.preventDefault(); toast.error("Copying and pasting is not allowed"); }}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                  />
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