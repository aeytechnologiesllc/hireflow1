import { useState, useRef, useCallback, useEffect } from "react";
import { formatFileSize } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
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
  XCircle,
  User,
  CalendarIcon
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isPast, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCreateApplication, useUpdateApplication, useCandidateApplications } from "@/hooks/useApplications";
import CountryCodeSelect from "@/components/CountryCodeSelect";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { CandidateStatusScreen } from "@/components/CandidateStatusScreen";
import { convertPdfToImage } from "@/utils/pdfToImage";
import { extractPdfTextFromUrl } from "@/utils/pdfText";
import type { Tables, Json } from "@/integrations/supabase/types";

interface CandidateApplicationWizardProps {
  job: Tables<"jobs">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "file" | "date";
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
  const { data: profile } = useProfile();
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
  const [questionFileImageUrls, setQuestionFileImageUrls] = useState<Record<string, string[]>>({});
  const [uploadingQuestions, setUploadingQuestions] = useState<Record<string, boolean>>({});
  const [draggingQuestion, setDraggingQuestion] = useState<string | null>(null);
  const questionFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [resumeImageUrls, setResumeImageUrls] = useState<string[]>([]);
  const [resumeConversionStatus, setResumeConversionStatus] = useState<"idle" | "converting" | "ready" | "failed">("idle");
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

  // Pre-fill answers from profile data
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    if (!profile || !open) return;
    
    const newAnswers: Record<string, string> = {};
    const prefilled = new Set<string>();
    
    applicationQuestions.forEach((question) => {
      const qLower = question.question.toLowerCase();
      const idLower = question.id.toLowerCase();
      
      // Match common question patterns to profile fields
      if ((qLower.includes("name") || idLower.includes("name")) && !qLower.includes("company")) {
        if (profile.full_name && !answers[question.id]) {
          newAnswers[question.id] = profile.full_name;
          prefilled.add(question.id);
        }
      } else if (qLower.includes("email") || idLower.includes("email") || question.type === "email") {
        if (profile.email && !answers[question.id]) {
          newAnswers[question.id] = profile.email;
          prefilled.add(question.id);
        }
      } else if (qLower.includes("phone") || idLower.includes("phone") || question.type === "phone") {
        if (profile.phone && !answers[question.id]) {
          newAnswers[question.id] = profile.phone;
          prefilled.add(question.id);
        }
      } else if (qLower.includes("location") || qLower.includes("city") || idLower.includes("location")) {
        if (profile.location && !answers[question.id]) {
          newAnswers[question.id] = profile.location;
          prefilled.add(question.id);
        }
      } else if (qLower.includes("linkedin") || idLower.includes("linkedin")) {
        if (profile.linkedin_url && !answers[question.id]) {
          newAnswers[question.id] = profile.linkedin_url;
          prefilled.add(question.id);
        }
      } else if (qLower.includes("portfolio") || qLower.includes("website") || idLower.includes("portfolio")) {
        if (profile.portfolio_url && !answers[question.id]) {
          newAnswers[question.id] = profile.portfolio_url;
          prefilled.add(question.id);
        }
      }
    });
    
    if (Object.keys(newAnswers).length > 0) {
      setAnswers((prev) => ({ ...prev, ...newAnswers }));
      setPrefilledFields(prefilled);
    }
    
    // Pre-fill resume if available
    // CRITICAL: Always set resumeUrl for the dedicated resume step when job requires it
    // This ensures the resume is ALWAYS available regardless of other file questions
    if (profile.resume_url && !resumeUrl) {
      // Always set the dedicated resume step URL when job requires resume
      if (requiresResume) {
        setResumeUrl(profile.resume_url);
        console.log("[CandidateApplicationWizard] Pre-filling resume from profile for dedicated resume step");
      }
      
      // ALSO populate any resume file question if it exists (for backwards compat)
      const resumeFileQuestion = applicationQuestions.find(q => {
        if (q.type !== "file") return false;
        const qText = q.question.toLowerCase();
        return ['resume', 'cv', 'curriculum'].some(kw => qText.includes(kw));
      });
      
      if (resumeFileQuestion && !questionFileUrls[resumeFileQuestion.id]) {
        setQuestionFileUrls(prev => ({ ...prev, [resumeFileQuestion.id]: profile.resume_url }));
        setAnswers(prev => ({ ...prev, [resumeFileQuestion.id]: profile.resume_url }));
        console.log("[CandidateApplicationWizard] Pre-filling resume file question with profile resume");
      }
      
      // CRITICAL: Convert profile resume PDF to images for AVA vision analysis
      // Without this conversion, AVA cannot "see" the resume content
      (async () => {
        setResumeConversionStatus("converting");
        try {
          console.log("[CandidateApplicationWizard] Converting profile resume to images...");
          const response = await fetch(profile.resume_url);
          const blob = await response.blob();
          const file = new globalThis.File([blob], "profile-resume.pdf", { type: "application/pdf" });
          
          const { convertPdfFileToImages, base64ToBlob } = await import("@/utils/pdfToImage");
          const imageBase64s = await convertPdfFileToImages(file, 2);
          
          if (imageBase64s.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              setResumeConversionStatus("failed");
              return;
            }
            
            const imageUrls: string[] = [];
            for (let i = 0; i < imageBase64s.length; i++) {
              const imgBlob = base64ToBlob(imageBase64s[i], "image/png");
              const imagePath = `${user.id}/profile-resume-${Date.now()}_page${i + 1}.png`;
              
              const { error: uploadError } = await supabase.storage
                .from("resumes")
                .upload(imagePath, imgBlob, { upsert: true });
              
              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from("resumes")
                  .getPublicUrl(imagePath);
                imageUrls.push(urlData.publicUrl);
              }
            }
            
            if (imageUrls.length > 0) {
              setResumeImageUrls(imageUrls);
              // Also set for the file question if applicable
              if (resumeFileQuestion) {
                setQuestionFileImageUrls(prev => ({ ...prev, [resumeFileQuestion.id]: imageUrls }));
              }
              setResumeConversionStatus("ready");
              console.log("[CandidateApplicationWizard] Profile resume converted:", imageUrls.length, "pages");
            } else {
              setResumeConversionStatus("failed");
            }
          } else {
            setResumeConversionStatus("failed");
          }
        } catch (error) {
          console.error("[CandidateApplicationWizard] Failed to convert profile resume:", error);
          setResumeConversionStatus("failed");
        }
      })();
    }
  }, [profile, open, applicationQuestions, questionFileUrls]);

  const resetWizard = () => {
    setCurrentStep(0);
    setAnswers({});
    setPhoneCountryCodes({});
    setResumeFile(null);
    setResumeUrl("");
    setResumeImageUrls([]);
    setResumeConversionStatus("idle");
    setCoverLetter("");
    setValidationErrors({});
    setQuestionFiles({});
    setQuestionFileUrls({});
    setQuestionFileImageUrls({});
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
    // Check if this is a resume question - if so, enforce PDF only
    const question = applicationQuestions.find(q => q.id === questionId);
    const questionText = (question?.question || questionId).toLowerCase();
    const isResumeQuestion = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
    
    if (isResumeQuestion && question?.type === "file") {
      // Resume questions: PDF ONLY for AI vision analysis
      if (file.type !== "application/pdf") {
        toast.error("Resume must be a PDF file", {
          description: "AVA requires PDF format to analyze your resume"
        });
        return;
      }
    } else {
      // Non-resume file questions: Accept PDFs, Word docs, and images
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

      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      let imageUrls: string[] = [];

      if (isPdf) {
        // Convert PDF to images for AI analysis
        const { convertPdfFileToImages, base64ToBlob } = await import("@/utils/pdfToImage");
        const imageBase64s = await convertPdfFileToImages(file, 2);
        
        if (imageBase64s.length > 0) {
          for (let i = 0; i < imageBase64s.length; i++) {
            const blob = base64ToBlob(imageBase64s[i], "image/png");
            const imagePath = `${user.id}/${questionId}-${Date.now()}_page${i + 1}.png`;
            
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
      }

      setQuestionFileUrls(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      setAnswers(prev => ({ ...prev, [questionId]: urlData.publicUrl }));
      
      // Save the image URLs for AI analysis
      if (imageUrls.length > 0) {
        setQuestionFileImageUrls(prev => ({ ...prev, [questionId]: imageUrls }));
      }
      
      // If this is a resume file question (type: file), also set resumeUrl and resumeImageUrls for tracking
      const question = applicationQuestions.find(q => q.id === questionId);
      const questionText = (question?.question || questionId).toLowerCase();
      const isResumeQuestion = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
      if (question?.type === "file" && isResumeQuestion) {
        setResumeUrl(urlData.publicUrl);
        if (imageUrls.length > 0) {
          setResumeImageUrls(imageUrls);
          console.log("[CandidateApplicationWizard] Set resumeImageUrls from file question:", imageUrls.length, "pages");
        }
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
    const questionText = (question?.question || questionId).toLowerCase();
    const isResumeQ = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
    if (question?.type === "file" && isResumeQ) {
      setResumeUrl("");
      setResumeImageUrls([]);
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
    setQuestionFileImageUrls(prev => {
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
    // PDF only for resume uploads
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
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

      // Convert PDF to images for AI analysis
      const { convertPdfFileToImages, base64ToBlob } = await import("@/utils/pdfToImage");
      const imageBase64s = await convertPdfFileToImages(file, 2);
      const imageUrls: string[] = [];
      
      if (imageBase64s.length > 0) {
        for (let i = 0; i < imageBase64s.length; i++) {
          const blob = base64ToBlob(imageBase64s[i], "image/png");
          const imagePath = `${user.id}/${Date.now()}_page${i + 1}.png`;
          
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

      setResumeUrl(urlData.publicUrl);
      // CRITICAL: Save the image URLs so backend can use them for resume vision analysis
      if (imageUrls.length > 0) {
        setResumeImageUrls(imageUrls);
        console.log("[CandidateApplicationWizard] Resume uploaded with", imageUrls.length, "image pages, saved to state");
      }
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
    setResumeImageUrls([]);
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
        // Resume is required if job requires it - ALWAYS enforce, regardless of file questions
        if (requiresResume && !resumeUrl.trim()) return false;
        // Block if resume is still being converted/prepared
        if (resumeConversionStatus === "converting") return false;
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

  // NOTE: Frontend AI analysis removed - all scoring is done by backend trigger-ava-analysis
  // This is the SINGLE SOURCE OF TRUTH for scoring

  const handleSubmit = async () => {
    // Double-check deadline hasn't passed before submitting
    if (isDeadlinePassed) {
      toast.error("The application deadline for this job has passed");
      onOpenChange(false);
      return;
    }
    
    // Block submission if resume is still being prepared
    if (resumeConversionStatus === "converting" && requiresResume) {
      toast.error("Please wait for your resume to finish processing");
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Prepare notes with application answers - NORMALIZED SCHEMA for backend matching
      // Schema: { questionId, question, answer, type } - SINGLE SOURCE OF TRUTH
      const applicationAnswers = Object.entries(answers).map(([id, answer]) => {
        const question = applicationQuestions.find(q => q.id === id);
        return { 
          questionId: id, // Canonical ID field (backend uses this for matching)
          id, // Legacy compat - keep both for now
          question: question?.question || id, 
          answer,
          type: question?.type || "text", // Include type for file/resume detection
        };
      });
      
      // Build fileUploads object for backend - maps questionId to file metadata
      const fileUploads: Record<string, { url: string; imageUrls?: string[] }> = {};
      for (const [questionId, fileUrl] of Object.entries(questionFileUrls)) {
        fileUploads[questionId] = {
          url: fileUrl,
          imageUrls: questionFileImageUrls[questionId] || undefined,
        };
      }
      
      // Determine which image URLs to use for resume analysis
      let finalResumeImageUrls = resumeImageUrls;
      
      // If no resume step images, check if a resume file question has images
      if (finalResumeImageUrls.length === 0) {
        for (const [questionId, fileData] of Object.entries(fileUploads)) {
          const question = applicationQuestions.find(q => q.id === questionId);
          if (question?.type === "file" && fileData.imageUrls?.length) {
            const questionText = (question.question || questionId).toLowerCase();
            const isResumeQuestion = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
            if (isResumeQuestion) {
              finalResumeImageUrls = fileData.imageUrls;
              console.log("[CandidateApplicationWizard] Using resume images from file question:", finalResumeImageUrls.length, "pages");
              break;
            }
          }
        }
      }
      
      // Build notes with all necessary data for backend analysis
      const notesObject: Record<string, any> = {
        applicationAnswers,
        resumeImageUrls: finalResumeImageUrls.length > 0 ? finalResumeImageUrls : undefined,
        fileUploads: Object.keys(fileUploads).length > 0 ? fileUploads : undefined,
      };
      
      const notes = JSON.stringify(notesObject);
      console.log("[CandidateApplicationWizard] Submitting with notes:", { 
        answersCount: applicationAnswers.length,
        resumeImageUrlsCount: finalResumeImageUrls.length,
        fileUploadsCount: Object.keys(fileUploads).length,
      });

      // Detect resume URL: SINGLE SOURCE OF TRUTH logic
      // Priority 1: resumeUrl state (dedicated resume step)
      // Priority 2: file question answers (resume file-question)
      // Priority 3: applicationAnswers with file URLs
      let finalResumeUrl = resumeUrl || null;
      
      if (!finalResumeUrl) {
        // Look for resume in file question uploads (questionFileUrls)
        for (const [questionId, fileUrl] of Object.entries(questionFileUrls)) {
          const question = applicationQuestions.find(q => q.id === questionId);
          if (question?.type === "file") {
            const questionText = (question.question || questionId).toLowerCase();
            const isResumeQuestion = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
            // If it's a resume question OR it's the only file question, use it
            if (isResumeQuestion || applicationQuestions.filter(q => q.type === "file").length === 1) {
              finalResumeUrl = fileUrl;
              console.log("[CandidateApplicationWizard] Detected resume from questionFileUrls:", fileUrl);
              break;
            }
          }
        }
      }
      
      // Priority 3: Check answers object for resume file URLs
      if (!finalResumeUrl) {
        for (const [questionId, answer] of Object.entries(answers)) {
          const question = applicationQuestions.find(q => q.id === questionId);
          if (question?.type === "file" && typeof answer === "string" && answer.startsWith("http")) {
            const questionText = (question.question || questionId).toLowerCase();
            const isResumeQuestion = ['resume', 'cv', 'curriculum'].some(kw => questionText.includes(kw));
            if (isResumeQuestion) {
              finalResumeUrl = answer;
              console.log("[CandidateApplicationWizard] Detected resume from answers:", answer);
              break;
            }
          }
        }
      }
      
      console.log("[CandidateApplicationWizard] Final resume URL for submission:", finalResumeUrl || "NULL");

      // Determine if autopilot mode
      const isAutoMode = job.processing_mode === "auto";

      // Build the phases list to determine next phase (for autopilot)
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

      // Update the existing draft application or create new if somehow no draft exists
      // DO NOT set ai_score or ai_analysis here - backend will do that
      let finalAppId = createdApplicationId;
      
      if (createdApplicationId) {
        // Update the existing draft application - NO frontend scoring
        await updateApplication.mutateAsync({
          id: createdApplicationId,
          cover_letter: coverLetter || null,
          resume_url: finalResumeUrl,
          notes,
          phase: "application",
          status: "pending",
        });
      } else {
        // Fallback: create new application if no draft exists - NO frontend scoring
        const createdApp = await createApplication.mutateAsync({
          job_id: job.id,
          cover_letter: coverLetter || null,
          resume_url: finalResumeUrl,
          notes,
          phase: "application",
          status: "pending",
        });
        finalAppId = createdApp.id;
        setCreatedApplicationId(createdApp.id);
      }

      queryClient.invalidateQueries({ queryKey: ["applications"] });

      // SINGLE SOURCE OF TRUTH: Trigger backend analysis
      // Backend will calculate ai_score and decide pass/fail
      if (finalAppId) {
        console.log("[CandidateApplicationWizard] Triggering backend analysis for:", finalAppId);
        
        if (isAutoMode) {
          // In autopilot mode, show evaluating state and trigger backend with autopilot decision
          setEvaluationState("evaluating");
          
          try {
            const { data: analysisResult } = await supabase.functions.invoke("trigger-ava-analysis", {
              body: { 
                applicationId: finalAppId,
                autopilotDecision: true,
              },
            });
            
            console.log("[CandidateApplicationWizard] Backend analysis result:", analysisResult);
            
            // Backend returns decision: "rejected" | "advanced" | "needs_employer_approval"
            if (analysisResult?.decision === "rejected") {
              setEvaluationState("failed");
            } else if (analysisResult?.decision === "advanced" || analysisResult?.decision === "needs_employer_approval") {
              // Passed - set next phase info for autopilot
              if (allPhases.length > 1) {
                setNextPhaseInfo({
                  id: allPhases[1].id,
                  title: allPhases[1].title,
                });
              }
              setEvaluationState("passed");
            } else {
              // Fallback: check application status from database
              const { data: updatedApp } = await supabase
                .from("applications")
                .select("status")
                .eq("id", finalAppId!)
                .single();
              
              if (updatedApp?.status === "rejected") {
                setEvaluationState("failed");
              } else {
                if (allPhases.length > 1) {
                  setNextPhaseInfo({
                    id: allPhases[1].id,
                    title: allPhases[1].title,
                  });
                }
                setEvaluationState("passed");
              }
            }
          } catch (err) {
            console.error("[CandidateApplicationWizard] Backend analysis failed:", err);
            // On error, still show as passed (manual review will catch issues)
            setEvaluationState("passed");
          }
        } else {
          // Manual mode - trigger analysis in background and navigate
          supabase.functions.invoke("trigger-ava-analysis", {
            body: { applicationId: finalAppId },
          }).catch(err => console.error("[CandidateApplicationWizard] Background analysis failed:", err));
          
          toast.success("Application submitted successfully!");
          handleClose();
          navigate("/applications");
        }
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
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress Header */}
        <div className="border-b border-border p-6 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between mb-4 pr-10 sm:pr-8">
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
                    ) : question.type === "date" ? (
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
                    ) : question.type === "file" ? (
                      <div className="space-y-2">
                        {/* Hidden file input */}
                        <input
                          ref={(el) => { questionFileInputRefs.current[question.id] = el; }}
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
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
                                PDF, DOC, or images (PNG, JPG) • max 10MB
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
                                  {formatFileSize(questionFiles[question.id].size)}
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
                {/* Always show resume upload when job requires it - not conditional on file questions */}
                {requiresResume && (
                  <div className="space-y-3">
                    <Label className="text-base">
                      Resume
                      {requiresResume && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {/* Profile Resume Indicator - show when resumeUrl is set but no file was uploaded */}
                    {!resumeFile && resumeUrl && (
                      <div className="border border-border rounded-xl p-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">Resume from Profile</p>
                            <p className="text-sm text-muted-foreground">
                              {resumeConversionStatus === "converting" ? (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Preparing for analysis...
                                </span>
                              ) : resumeConversionStatus === "ready" ? (
                                <span className="text-green-500">Ready for analysis</span>
                              ) : resumeConversionStatus === "failed" ? (
                                <span className="text-amber-500">Analysis prep failed - will still be submitted</span>
                              ) : (
                                "Using your saved resume"
                              )}
                            </p>
                          </div>
                          {resumeConversionStatus === "converting" ? (
                            <Loader2 className="h-5 w-5 text-primary animate-spin" />
                          ) : resumeConversionStatus === "ready" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResumeUrl("");
                              setResumeImageUrls([]);
                              setResumeConversionStatus("idle");
                            }}
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Drag & Drop Zone - only show when no resume at all */}
                    {!resumeFile && !resumeUrl && (
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
                            Supports PDF only (max 10MB)
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Uploaded File Display */}
                    {resumeFile && (
                      <div className="border border-border rounded-xl p-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <File className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{resumeFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(resumeFile.size)}
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