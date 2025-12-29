import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
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
  Send,
  CalendarIcon
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { triggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import CountryCodeSelect from "@/components/CountryCodeSelect";
import { convertPdfFileToImages, base64ToBlob } from "@/utils/pdfToImage";

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "file" | "date";
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
  ai_analysis: string | null;
  jobs: {
    title: string;
    processing_mode: string | null;
    passing_score: number | null;
    application_questions: ApplicationQuestion[] | null;
    workflow_steps: any[] | null;
    require_resume: boolean | null;
    quiz_questions: any[] | null;
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
  const { data: profile } = useProfile();
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
  const [usingProfileResume, setUsingProfileResume] = useState(false);

  // Evaluation screen state
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading } = useQuery({
    queryKey: ["application-form", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, application_questions, workflow_steps, require_resume, quiz_questions)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`application-form-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        console.log('[ApplicationFormPhase] Application updated via realtime:', payload);
        queryClient.invalidateQueries({ queryKey: ["application-form", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  // Get questions from job
  const questions: ApplicationQuestion[] = Array.isArray(application?.jobs?.application_questions)
    ? (application.jobs.application_questions as ApplicationQuestion[])
    : [];

  const requiresResume = application?.jobs?.require_resume !== false;
  const hasQuestions = questions.length > 0;
  const isAutoPilot = application?.jobs?.processing_mode === "auto";

  // Parse notes to check if already submitted
  const notes = application?.notes ? JSON.parse(application.notes) : {};
  const hasApplicationAnswers = !!(notes.applicationAnswers && notes.applicationAnswers.length > 0);
  
  // If application was reconsidered (status reset to pending), allow re-submission
  const isReconsidered = application?.status === "pending" && 
                         application?.phase === stepId && 
                         !application?.ai_analysis;
  const alreadySubmitted = hasApplicationAnswers && !isReconsidered;

  // Auto-fill form fields from candidate profile data
  const [hasPrefilledFromProfile, setHasPrefilledFromProfile] = useState(false);
  
  useEffect(() => {
    if (!profile || hasPrefilledFromProfile || alreadySubmitted) return;
    
    const prefilled: Record<string, string> = {};
    const prefilledCountryCodes: Record<string, string> = {};
    const prefilledFileUrls: Record<string, string> = {};
    
    // Pre-fill resume from profile if available and not already uploaded
    if (profile.resume_url && !application?.resume_url && !resumeFile) {
      setUsingProfileResume(true);
    }
    
    questions.forEach(q => {
      const questionLower = q.question.toLowerCase();
      
      // Full Name
      if ((questionLower.includes("full name") || questionLower === "name") && profile.full_name) {
        prefilled[q.id] = profile.full_name;
      }
      
      // Email
      if ((q.type === "email" || questionLower.includes("email")) && profile.email) {
        prefilled[q.id] = profile.email;
      }
      
      // Phone
      if ((q.type === "phone" || questionLower.includes("phone")) && profile.phone) {
        // Parse existing phone (might include country code)
        const phoneMatch = profile.phone.match(/^(\+\d+)?\s*(.*)$/);
        if (phoneMatch) {
          if (phoneMatch[1]) prefilledCountryCodes[q.id] = phoneMatch[1];
          prefilled[q.id] = phoneMatch[2] || profile.phone;
        } else {
          prefilled[q.id] = profile.phone;
        }
      }
      
      // Job Title / Current Position
      if ((questionLower.includes("job title") || questionLower.includes("current position") || questionLower.includes("current role")) && profile.job_title) {
        prefilled[q.id] = profile.job_title;
      }
      
      // Years of Experience
      if (questionLower.includes("years of experience") && profile.experience_years) {
        prefilled[q.id] = String(profile.experience_years);
      }
      
      // Location
      if ((questionLower.includes("location") || questionLower.includes("city")) && profile.location) {
        prefilled[q.id] = profile.location;
      }
      
      // LinkedIn
      if (questionLower.includes("linkedin") && profile.linkedin_url) {
        prefilled[q.id] = profile.linkedin_url;
      }
      
      // Portfolio
      if (questionLower.includes("portfolio") && profile.portfolio_url) {
        prefilled[q.id] = profile.portfolio_url;
      }
      
      // Pre-fill file questions (resume) from profile
      if (q.type === "file" && questionLower.includes("resume") && profile.resume_url && !questionFileUrls[q.id]) {
        prefilledFileUrls[q.id] = profile.resume_url;
        prefilled[q.id] = profile.resume_url;
      }
    });
    
    if (Object.keys(prefilled).length > 0) {
      setAnswers(prev => ({ ...prefilled, ...prev }));
      if (Object.keys(prefilledCountryCodes).length > 0) {
        setPhoneCountryCodes(prev => ({ ...prefilledCountryCodes, ...prev }));
      }
      if (Object.keys(prefilledFileUrls).length > 0) {
        setQuestionFileUrls(prev => ({ ...prefilledFileUrls, ...prev }));
      }
      setHasPrefilledFromProfile(true);
    }
  }, [profile, questions, hasPrefilledFromProfile, alreadySubmitted, application?.resume_url, resumeFile, questionFileUrls]);

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
    // PDF only for resume uploads
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
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
      
      // Upload original PDF
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      // Convert PDF to images for AI analysis (PRIMARY method)
      console.log("[ApplicationFormPhase] Converting PDF to images for AI analysis...");
      const imageBase64s = await convertPdfFileToImages(file, 2);
      const imageUrls: string[] = [];
      
      if (imageBase64s.length > 0) {
        for (let i = 0; i < imageBase64s.length; i++) {
          const blob = base64ToBlob(imageBase64s[i], "image/png");
          const imagePath = `${user?.id}/${Date.now()}_page${i + 1}.png`;
          
          const { error: imageUploadError } = await supabase.storage
            .from("resumes")
            .upload(imagePath, blob, { upsert: true });
          
          if (!imageUploadError) {
            const { data: imageUrlData } = supabase.storage
              .from("resumes")
              .getPublicUrl(imagePath);
            imageUrls.push(imageUrlData.publicUrl);
            console.log("[ApplicationFormPhase] Uploaded resume image page", i + 1);
          }
        }
      }
      
      // Update application with resume URL and image URLs in notes
      const currentNotes = notes || {};
      const updatedNotes = {
        ...currentNotes,
        resumeImageUrls: imageUrls,
      };
      
      await updateApplication.mutateAsync({
        id: id!,
        resume_url: urlData.publicUrl,
        notes: JSON.stringify(updatedNotes),
      });

      console.log("[ApplicationFormPhase] Resume uploaded with", imageUrls.length, "image pages");
      toast.success("Resume uploaded successfully");
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast.error("Failed to upload resume");
      setResumeFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Question file upload handlers - supports PDFs, docs, and images
  const handleQuestionFileSelect = async (file: File, questionId: string) => {
    // Accept PDFs, Word docs, and images
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp"
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF, Word document, or image file");
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
      
      // Upload original file
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      let imageUrls: string[] = [];

      if (isPdf) {
        // Convert PDF to images for AI analysis
        console.log("[ApplicationFormPhase] Converting question file PDF to images...");
        const imageBase64s = await convertPdfFileToImages(file, 2);
        
        if (imageBase64s.length > 0) {
          for (let i = 0; i < imageBase64s.length; i++) {
            const blob = base64ToBlob(imageBase64s[i], "image/png");
            const imagePath = `${user?.id}/${Date.now()}_${questionId}_page${i + 1}.png`;
            
            const { error: imageUploadError } = await supabase.storage
              .from("resumes")
              .upload(imagePath, blob, { upsert: true });
            
            if (!imageUploadError) {
              const { data: imageUrlData } = supabase.storage
                .from("resumes")
                .getPublicUrl(imagePath);
              imageUrls.push(imageUrlData.publicUrl);
            }
          }
        }
      } else if (isImage) {
        // For images, the uploaded file IS the image for AI analysis
        imageUrls = [urlData.publicUrl];
        console.log("[ApplicationFormPhase] Image uploaded directly for AI analysis");
      }

      // Store image URLs for this question in notes
      const currentNotes = notes || {};
      const fileUploads = currentNotes.fileUploads || {};
      fileUploads[questionId] = {
        fileUrl: urlData.publicUrl,
        imageUrls: imageUrls,
      };
      
      // Check if this is a resume-related question
      const question = questions.find(q => q.id === questionId);
      const isResumeQuestion = question?.question?.toLowerCase().includes("resume") || 
                               questionId.toLowerCase().includes("resume");
      
      const updatedNotes = {
        ...currentNotes,
        fileUploads,
        // If this is a resume question, also store in resumeImageUrls
        ...(isResumeQuestion && imageUrls.length > 0 ? { resumeImageUrls: imageUrls } : {}),
      };
      
      await updateApplication.mutateAsync({
        id: id!,
        notes: JSON.stringify(updatedNotes),
      });

      setQuestionFileUrls(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      setAnswers(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      console.log("[ApplicationFormPhase] Question file uploaded with", imageUrls.length, "image pages");
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
    // Also skip if using profile resume
    const hasFileQuestion = questions.some(q => q.type === "file");
    if (requiresResume && !hasFileQuestion && !resumeFile && !application?.resume_url && !usingProfileResume) {
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
      const quizQuestions = application.jobs?.quiz_questions;
      const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
      
      console.log("[ApplicationFormPhase] Building phases: hasQuizQuestions=", hasQuizQuestions, "quizQuestions=", quizQuestions);
      
      // Extract voice_interview step (goes AFTER review)
      const voiceInterviewStep = (workflowSteps as any[]).find((step: any) => step.type === 'voice_interview');
      
      const allPhases: { id: string; type: string; title?: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];
      
      // Add quiz phase if quiz_questions exist
      if (hasQuizQuestions) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
        console.log("[ApplicationFormPhase] Added quiz phase to allPhases");
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
      
      // Find current step index (application phase)
      const currentIndex = allPhases.findIndex((p) => p.type === "application" || p.id === stepId);
      
      // Determine next phase
      let nextPhase: { id: string; type: string; title?: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }

      if (nextPhase && nextPhase.type !== "review") {
        setNextPhaseInfo({ id: nextPhase.id, title: nextPhase.title || nextPhase.type });
      }

      // Handle autopilot mode: Call backend to run AI analysis AND make decision (bypasses RLS)
      if (isAutoPilot) {
        console.log("[ApplicationFormPhase] Autopilot mode: Calling backend for AI analysis + decision...");
        console.log("[ApplicationFormPhase] Next phase would be:", nextPhase?.id, "hasQuizQuestions=", hasQuizQuestions);
        
        const { data: autopilotResult, error: autopilotError } = await supabase.functions.invoke("trigger-ava-analysis", {
          body: { 
            applicationId: id!,
            autopilotDecision: true,
            currentPhaseId: "application",
          },
        });
        
        if (autopilotError) {
          console.error("[ApplicationFormPhase] Autopilot backend error:", autopilotError);
          // Don't block submission - show warning instead of error
          toast.warning("Application submitted. Analysis is still processing...", {
            description: "Check back shortly for results.",
          });
          queryClient.invalidateQueries({ queryKey: ["applications"] });
          navigate(`/applications/${id}`);
          return;
        }
        
        console.log("[ApplicationFormPhase] Autopilot backend result:", autopilotResult);
        
        const score = autopilotResult?.score || 0;
        setAiScore(score);
        
        if (autopilotResult?.decision === "advanced") {
          console.log(`[ApplicationFormPhase] Autopilot: PASSED - backend advanced to: ${autopilotResult.nextPhaseId}`);
          setEvaluationState("passed");
          setNextPhaseInfo({ 
            id: autopilotResult.nextPhaseId, 
            title: autopilotResult.nextPhaseTitle || autopilotResult.nextPhaseId 
          });
        } else if (autopilotResult?.decision === "rejected") {
          console.log(`[ApplicationFormPhase] Autopilot: FAILED - backend rejected the application`);
          setEvaluationState("failed");
        } else {
          // Fallback: just show passed if score is high enough
          const passingScore = application.jobs?.passing_score || 60;
          if (score >= passingScore) {
            setEvaluationState("passed");
          } else {
            setEvaluationState("failed");
          }
        }
      } else {
        // Manual mode - NEVER auto-advance phases.
        // We only persist the submission data (done above), trigger analysis, and return to the application.
        // Employers control advancement in manual review mode.

        supabase.functions.invoke("trigger-ava-analysis", {
          body: { applicationId: id! },
        }).catch(err => console.error("[ApplicationFormPhase] AVA analysis trigger failed:", err));

        toast.success("Application submitted successfully!", {
          description: "Awaiting employer review.",
        });
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

              {question.type === "date" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !answers[question.id] && "text-muted-foreground",
                        validationErrors[question.id] && "border-destructive"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {answers[question.id] 
                        ? format(new Date(answers[question.id]), "PPP") 
                        : "Select date"
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={answers[question.id] ? new Date(answers[question.id]) : undefined}
                      onSelect={(date) => setAnswers(prev => ({ 
                        ...prev, 
                        [question.id]: date ? format(date, "yyyy-MM-dd") : "" 
                      }))}
                      captionLayout="dropdown"
                      fromYear={1920}
                      toYear={new Date().getFullYear()}
                      disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
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
                  ) : questionFileUrls[question.id] ? (
                    <div className="flex items-center justify-center gap-2">
                      <File className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">Using resume from your profile</span>
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
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
                        Upload different
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp";
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
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, DOC, or images (PNG, JPG)
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
                ) : usingProfileResume && profile?.resume_url ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <File className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">Using resume from your profile</span>
                      <CheckCircle className="h-4 w-4 text-primary" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setUsingProfileResume(false);
                        fileInputRef.current?.click();
                      }}
                    >
                      Upload different resume
                    </Button>
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
                      PDF only, max 10MB
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
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
              onPaste={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
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
