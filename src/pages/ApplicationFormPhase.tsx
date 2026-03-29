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
  File as FileIcon,
  Send,
  CalendarIcon,
  ShieldAlert,
  Eye
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { EvaluationScreen } from "@/components/EvaluationScreen";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import CountryCodeSelect from "@/components/CountryCodeSelect";
import { convertPdfFileToImages, base64ToBlob } from "@/utils/pdfToImage";
import { isImageResumeUrl, isPdfResumeUrl, isSupportedResumeFile, isSupportedResumeUrl } from "@/utils/resumeFiles";

interface AntiCheatViolation {
  type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'cut_attempt' | 'right_click' | 'keyboard_shortcut';
  timestamp: string;
  details?: string;
}

interface ApplicationQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "select" | "email" | "phone" | "file" | "date" | "number" | string;
  required: boolean;
  options?: string[];
  placeholder?: string;
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

interface QuestionCriteriaContext {
  title: string;
  items: string[];
}

const normalizeQuestionType = (value: string | null | undefined) => {
  const normalized = (value || "text").toLowerCase().trim();

  switch (normalized) {
    case "long_text":
    case "multi_line":
      return "textarea";
    case "file_upload":
    case "upload":
      return "file";
    case "dropdown":
      return "select";
    case "short_text":
      return "text";
    default:
      return normalized;
  }
};

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

// Helper to detect resume-related file questions
const isResumeQuestion = (question: { id: string; question: string; type: string }) => {
  if (normalizeQuestionType(question.type) !== "file") return false;
  const text = (question.question + " " + question.id).toLowerCase();
  return text.includes("resume") || text.includes("cv") || text.includes("curriculum");
};

const parseCriteriaItems = (value?: string | null) => {
  if (!value) return [];

  const normalized = value
    .replace(/\r/g, "\n")
    .replace(/•/g, "\n")
    .replace(/\s*-\s+/g, "\n")
    .trim();

  const segments = normalized.includes("\n")
    ? normalized.split("\n")
    : normalized.split(",");

  return segments
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[*-]\s*/, "").trim());
};

const getQuestionCriteriaContext = (
  question: ApplicationQuestion,
  job: ApplicationDetails["jobs"],
): QuestionCriteriaContext | null => {
  if (!job) return null;

  const questionText = question.question.toLowerCase();
  const placeholderItems = parseCriteriaItems(question.placeholder);

  const asksAboutNonNegotiables =
    questionText.includes("non-negotiable") ||
    questionText.includes("deal-breaker") ||
    questionText.includes("deal breaker") ||
    questionText.includes("conflicts with");

  if (asksAboutNonNegotiables) {
    if (placeholderItems.length > 0) {
      return {
        title: "Non-negotiables for this role",
        items: placeholderItems,
      };
    }
  }

  const asksAboutMustHaves =
    questionText.includes("must-have") ||
    questionText.includes("must have") ||
    questionText.includes("direct experience") ||
    questionText.includes("requirements");

  if (asksAboutMustHaves) {
    if (placeholderItems.length > 0) {
      return {
        title: "Must-have requirements for this role",
        items: placeholderItems,
      };
    }
  }

  return null;
};

export default function ApplicationFormPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
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
  const [expandedCriteriaQuestionId, setExpandedCriteriaQuestionId] = useState<string | null>(null);

  // Evaluation screen state
  const [evaluationState, setEvaluationState] = useState<"evaluating" | "passed" | "failed" | null>(null);
  const [nextPhaseInfo, setNextPhaseInfo] = useState<{ id: string; title: string } | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  
  // Anti-cheating state
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const formContainerRef = useRef<HTMLDivElement>(null);

  // Anti-cheating: Record violation
  const recordViolation = useCallback((type: AntiCheatViolation['type'], details?: string) => {
    const violation: AntiCheatViolation = {
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setViolations(prev => [...prev, violation]);
  }, []);

  // Anti-cheating: Prevent copy
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('copy_attempt', 'Copy attempted');
    toast.warning("Copying is disabled during the application", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Prevent paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('paste_attempt', 'Paste attempted');
    toast.warning("Pasting is disabled during the application", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Prevent cut
  const handleCut = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('cut_attempt', 'Cut attempted');
  }, [recordViolation]);

  // Anti-cheating: Prevent right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    recordViolation('right_click', 'Right-click attempted');
    toast.warning("Right-click is disabled during the application", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Block keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      recordViolation('keyboard_shortcut', `Blocked ${e.key.toUpperCase()} shortcut`);
      toast.warning("Keyboard shortcuts are disabled during the application", {
        icon: <ShieldAlert className="h-4 w-4" />,
      });
    }
  }, [recordViolation]);

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
    enabled: !!id && !!user && !authLoading,
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
  const hasUploadsInProgress = isUploading || Object.values(uploadingQuestions).some(Boolean);

  // Parse notes to check if already submitted
  const notes = application?.notes ? JSON.parse(application.notes) : {};
  const getLatestStoredNotes = useCallback(async () => {
    const fallbackNotes = notes || {};

    if (!id) return fallbackNotes;

    const timeoutMs = 3500;
    const notesLookup = supabase
      .from("applications")
      .select("notes")
      .eq("id", id)
      .single();

    const result = await Promise.race([
      notesLookup,
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error("Timed out loading the latest application notes") }), timeoutMs)
      ),
    ]);

    if (result.error || !result.data?.notes) {
      if (result.error) {
        console.warn("[ApplicationFormPhase] Falling back to in-memory notes:", result.error.message);
      }
      return fallbackNotes;
    }

    try {
      return typeof result.data.notes === "string"
        ? JSON.parse(result.data.notes)
        : (result.data.notes as Record<string, any>);
    } catch {
      return fallbackNotes;
    }
  }, [id, notes]);
  const hasApplicationAnswers = !!(notes.applicationAnswers && notes.applicationAnswers.length > 0);
  
  // If application was reconsidered (status reset to pending), allow re-submission
  const isReconsidered = application?.status === "pending" && 
                         application?.phase === stepId && 
                         !application?.ai_analysis;
  const alreadySubmitted = hasApplicationAnswers && !isReconsidered;

  // Anti-cheating: Tab visibility detection
  useEffect(() => {
    if (alreadySubmitted) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('tab_switch', 'User switched to another tab or window');
        toast.warning("Tab switch detected!", {
          description: "This activity has been recorded.",
          icon: <ShieldAlert className="h-4 w-4" />,
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [alreadySubmitted, recordViolation]);

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
      if ((normalizeQuestionType(q.type) === "email" || questionLower.includes("email")) && profile.email) {
        prefilled[q.id] = profile.email;
      }
      
      // Phone
      if ((normalizeQuestionType(q.type) === "phone" || questionLower.includes("phone")) && profile.phone) {
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
      if (normalizeQuestionType(q.type) === "file" && questionLower.includes("resume") && profile.resume_url && !questionFileUrls[q.id]) {
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
    if (!isSupportedResumeFile(file)) {
      toast.error("Please upload a PDF or image file");
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

      const imageUrls: string[] = [];
      const isPdf = file.type === "application/pdf";

      if (isPdf) {
        const imageBase64s = await convertPdfFileToImages(file, 3);
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
            }
          }
        }
      } else {
        imageUrls.push(urlData.publicUrl);
      }
      
      // Update application with resume URL and image URLs in notes
      const currentNotes = await getLatestStoredNotes();
      const updatedNotes = {
        ...currentNotes,
        resumeImageUrls: imageUrls,
      };
      
      await updateApplication.mutateAsync({
        id: id!,
        resume_url: urlData.publicUrl,
        notes: JSON.stringify(updatedNotes),
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

  // Question file upload handlers - supports PDFs, docs, and images
  const handleQuestionFileSelect = async (file: File, questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    const isResumeUpload = !!question && isResumeQuestion(question);

    if (isResumeUpload) {
      if (!isSupportedResumeFile(file)) {
        toast.error("Resume uploads must be a PDF or image file");
        return;
      }
    } else {
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
        const imageBase64s = await convertPdfFileToImages(file, 3);
        
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
      }

      // Store image URLs for this question in notes
      const currentNotes = await getLatestStoredNotes();
      const fileUploads = currentNotes.fileUploads || {};
      fileUploads[questionId] = {
        url: urlData.publicUrl,  // CRITICAL: Must be "url" not "fileUrl" - backend expects this schema
        imageUrls: imageUrls,
        isResume: isResumeUpload,
      };

      const updatedNotes = {
        ...currentNotes,
        fileUploads,
        // If this is a resume question, also store in resumeImageUrls
        ...(isResumeUpload && imageUrls.length > 0 ? { resumeImageUrls: imageUrls } : {}),
      };
      
      await updateApplication.mutateAsync({
        id: id!,
        notes: JSON.stringify(updatedNotes),
      });

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

    // IMPORTANT: Only validate questions that are VISIBLE to the user
    // The UI filters out resume-type file questions when requiresResume is true,
    // so we must use the same filter here to avoid validating hidden fields
    const visibleQuestions = questions.filter((question) => {
      if (requiresResume && isResumeQuestion(question)) {
        return false;
      }
      return true;
    });

    // Validate required questions (only visible ones)
    visibleQuestions.forEach(q => {
      if (q.required && !answers[q.id]?.trim()) {
        errors[q.id] = "This field is required";
      }
      if (normalizeQuestionType(q.type) === "email" && answers[q.id] && !isValidEmail(answers[q.id])) {
        errors[q.id] = "Please enter a valid email address";
      }
    });

    // Validate resume if required and not already uploaded
    // FIXED: Only accept application.resume_url if it looks like an actual resume (PDF in resumes bucket)
    // This prevents non-resume uploads (like "proof of internet speed") from bypassing resume validation
    const hasValidApplicationResume = isSupportedResumeUrl(application?.resume_url);
    
    // Check if there's a resume-specific file question that has been answered
    const resumeFileQuestion = questions.find(q => 
      normalizeQuestionType(q.type) === "file" && 
      (q.question.toLowerCase().includes("resume") || 
       q.question.toLowerCase().includes("cv") || 
       q.question.toLowerCase().includes("curriculum") ||
       q.id.toLowerCase().includes("resume"))
    );
    const hasResumeFromFileQuestion = resumeFileQuestion && !!answers[resumeFileQuestion.id];
    
    if (requiresResume && !resumeFile && !hasValidApplicationResume && !usingProfileResume && !hasResumeFromFileQuestion) {
      errors.resume = "Please upload your resume";
    }

    setValidationErrors(errors);
    return errors;
  };

  const handleSubmit = async () => {
    if (!application) {
      toast.error("Application not loaded yet. Please refresh and try again.");
      return;
    }

    if (hasUploadsInProgress) {
      toast.error("Please wait for all uploads to finish before submitting.");
      return;
    }

    const errors = validateForm();
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstError = errors[errorFields[0]];
      toast.error(`Please fix: ${firstError}`);
      // Scroll to first error field using the fresh errors object
      setTimeout(() => {
        const firstErrorKey = errorFields[0];
        const errorElement = document.querySelector(`[data-field="${firstErrorKey}"]`) || 
                            document.querySelector('.border-destructive');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = errorElement.querySelector('input, textarea, select');
          if (input) (input as HTMLElement).focus();
        }
      }, 100);
      return;
    }

    setIsSubmitting(true);
    setEvaluationState("evaluating");

    try {
      // CRITICAL FIX: If using profile resume, we MUST convert it to images before submission
      // This ensures the backend has resumeImageUrls available for AI analysis
      const latestNotes = await getLatestStoredNotes();
      let finalResumeUrl = application.resume_url;
      let finalResumeImageUrls: string[] = latestNotes.resumeImageUrls || [];
      
      if (usingProfileResume && profile?.resume_url && !latestNotes.resumeImageUrls?.length) {
        toast.info("Preparing your resume for analysis...");
        
        try {
          if (isImageResumeUrl(profile.resume_url)) {
            finalResumeImageUrls = [profile.resume_url];
          } else if (isPdfResumeUrl(profile.resume_url)) {
            const response = await fetch(profile.resume_url);
            if (!response.ok) throw new Error("Failed to fetch profile resume");
            const blob = await response.blob();
            const file = new File([blob], "profile-resume.pdf", { type: "application/pdf" });
            
            const imageBase64s = await convertPdfFileToImages(file, 3);
            
            if (imageBase64s.length === 0) {
              throw new Error("Could not extract pages from resume PDF");
            }
            
            for (let i = 0; i < imageBase64s.length; i++) {
              const imageBlob = base64ToBlob(imageBase64s[i], "image/png");
              const imagePath = `${user?.id}/${Date.now()}_profile_page${i + 1}.png`;
              
              const { error: uploadError } = await supabase.storage
                .from("resumes")
                .upload(imagePath, imageBlob, { upsert: true });
              
              if (!uploadError) {
                const { data: imageUrlData } = supabase.storage
                  .from("resumes")
                  .getPublicUrl(imagePath);
                finalResumeImageUrls.push(imageUrlData.publicUrl);
              }
            }
          } else {
            throw new Error("Unsupported profile resume format");
          }
          
          finalResumeUrl = profile.resume_url;
        } catch (conversionError) {
          console.error("[ApplicationFormPhase] Profile resume conversion failed:", conversionError);
          toast.error("Could not process your resume. Please upload a PDF or image.");
          setIsSubmitting(false);
          setEvaluationState(null);
          return;
        }
      }
      
      // Format answers for storage
      const applicationAnswers = questions.map(q => ({
        questionId: q.id,
        question: q.question,
        answer: normalizeQuestionType(q.type) === "phone" && phoneCountryCodes[q.id]
          ? `${phoneCountryCodes[q.id]} ${answers[q.id] || ""}`
          : answers[q.id] || "",
        type: normalizeQuestionType(q.type),
      }));

      // Update notes with application answers AND resume image URLs
      const updatedNotes = {
        ...latestNotes,
        applicationAnswers,
        ...(finalResumeImageUrls.length > 0 ? { resumeImageUrls: finalResumeImageUrls } : {}),
      };

      // Update application with resume URL if using profile resume
      await updateApplication.mutateAsync({
        id: id!,
        notes: JSON.stringify(updatedNotes),
        cover_letter: coverLetter || application.cover_letter,
        status: "pending",
        ...(finalResumeUrl && !application.resume_url ? { resume_url: finalResumeUrl } : {}),
      });

      // Get workflow steps to find next phase - build full phases list
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = application.jobs?.quiz_questions;
      const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
      

      // Extract voice_interview step (goes AFTER review)
      const typedSteps = workflowSteps as Array<{ id: string; type: string; title?: string }>;
      const voiceInterviewStep = typedSteps.find((step) => step.type === 'voice_interview');

      const allPhases: { id: string; type: string; title?: string }[] = [
        { id: "application", type: "application", title: "Application" },
      ];

      // Add quiz phase if quiz_questions exist
      if (hasQuizQuestions) {
        allPhases.push({ id: "quiz", type: "quiz", title: "Quiz" });
      }

      // Add workflow steps EXCEPT voice_interview (which goes after Review)
      typedSteps.filter((step) => step.type !== 'voice_interview').forEach((step) => {
        allPhases.push({ id: step.id, type: step.type, title: step.title || step.type });
      });

      // Add Review phase
      allPhases.push({ id: "review", type: "review", title: "Review" });

      // Add voice_interview AFTER Review if it exists
      if (voiceInterviewStep) {
        allPhases.push({
          id: voiceInterviewStep.id,
          type: "voice_interview",
          title: voiceInterviewStep.title || "Ava Interview"
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
        const { data: autopilotResult, error: autopilotError } = await invokeTriggerAvaAnalysis({
          applicationId: id!,
          autopilotDecision: true,
          currentPhaseId: "application",
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
        
        const score = autopilotResult?.score || 0;
        setAiScore(score);
        
        if (autopilotResult?.decision === "advanced") {
          setEvaluationState("passed");
          setNextPhaseInfo({ 
            id: autopilotResult.nextPhaseId, 
            title: autopilotResult.nextPhaseTitle || autopilotResult.nextPhaseId 
          });
        } else if (autopilotResult?.decision === "rejected") {
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

        const { error: analysisError } = await invokeTriggerAvaAnalysis({
          applicationId: id!,
        }).catch(err => {
          console.error("[ApplicationFormPhase] AVA analysis trigger failed:", err);
          return { data: null, error: err };
        });

        if (analysisError) {
          toast.warning("Application submitted. Ava analysis is still processing...", {
            description: "The employer can refresh the recommendation shortly if needed.",
          });
        } else {
          toast.success("Application submitted successfully!", {
            description: "Ava prepared the employer review using your submitted materials.",
          });
        }

        await queryClient.invalidateQueries({ queryKey: ["application", id] });
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

  if (authLoading || isLoading) {
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
    <div 
      ref={formContainerRef}
      className="space-y-6 max-w-3xl mx-auto"
      onContextMenu={handleContextMenu}
    >
      {/* Anti-cheat indicator */}
      {violations.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 px-3 py-2 rounded-lg border border-warning/20">
          <ShieldAlert className="h-4 w-4" />
          <span>{violations.length} violation(s) recorded</span>
        </div>
      )}

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
          {/* Application Questions - filter out resume questions when requiresResume is true */}
          {questions
            .filter((question) => {
              // Skip resume-type file questions when job already requires resume via dedicated section
              if (requiresResume && isResumeQuestion(question)) {
                return false;
              }
              return true;
            })
            .map((question) => {
            const questionType = normalizeQuestionType(question.type);
            const usePlainInput = questionType === "text" || questionType === "number";
            const useFallbackInput = ![
              "text",
              "number",
              "textarea",
              "email",
              "phone",
              "date",
              "select",
              "file",
            ].includes(questionType);
            const criteriaContext = getQuestionCriteriaContext(question, application?.jobs ?? null);
            const isCriteriaExpanded = expandedCriteriaQuestionId === question.id;

            return (
            <div key={question.id} className="space-y-2" data-field={question.id}>
              <Label className="text-foreground">
                {question.question}
                {question.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {criteriaContext && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start px-0 text-sm font-medium text-primary hover:bg-transparent hover:text-primary/90"
                    onClick={() =>
                      setExpandedCriteriaQuestionId((current) =>
                        current === question.id ? null : question.id,
                      )
                    }
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    {isCriteriaExpanded ? "Hide quick view" : `View ${criteriaContext.title.toLowerCase()}`}
                  </Button>

                  {isCriteriaExpanded && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
                      <p className="text-sm font-medium text-foreground break-words">
                        {criteriaContext.title}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {criteriaContext.items.map((item, index) => (
                          <li
                            key={`${question.id}-criteria-${index}`}
                            className="flex items-start gap-2 break-words"
                          >
                            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {usePlainInput && (
                <Input
                  type={questionType === "number" ? "number" : "text"}
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}
              
              {useFallbackInput && (
                <Input
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}

              {questionType === "textarea" && (
                <Textarea
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  rows={4}
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}
              
              {questionType === "email" && (
                <Input
                  type="email"
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="email@example.com"
                  className={validationErrors[question.id] ? "border-destructive" : ""}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}
              
              {questionType === "phone" && (
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
                    onCopy={handleCopy}
                    onPaste={handlePaste}
                    onCut={handleCut}
                  />
                </div>
              )}

              {questionType === "date" && (
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
              
              {questionType === "select" && question.options && (
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
              
              {questionType === "file" && (
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
                      <FileIcon className="h-5 w-5 text-primary" />
                      <span className="text-sm truncate max-w-[200px]">{questionFiles[question.id].name}</span>
                      <CheckCircle className="h-4 w-4 text-success" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                const file = questionFiles[question.id];
                                if (file) {
                                  const url = URL.createObjectURL(file);
                                  window.open(url, '_blank');
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Preview file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
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
                          </TooltipTrigger>
                          <TooltipContent>Remove file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ) : questionFileUrls[question.id] ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileIcon className="h-5 w-5 text-primary" />
                      <span className="text-sm truncate max-w-[200px]">
                        {decodeURIComponent(questionFileUrls[question.id]?.split('/').pop() || 'File uploaded')}
                      </span>
                      <CheckCircle className="h-4 w-4 text-success" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(questionFileUrls[question.id], '_blank');
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Preview file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
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
                          </TooltipTrigger>
                          <TooltipContent>Remove file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
          )})}

          {/* Resume Upload - FIXED: Always show when resume required, even if there are file questions */}
          {/* Other file questions (like internet speed screenshots) are separate from resume */}
          {requiresResume && (
            <div className="space-y-2" data-field="resume">
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
                ) : resumeFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileIcon className="h-5 w-5 text-primary" />
                    <span className="text-sm truncate max-w-[200px]">{resumeFile.name}</span>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = URL.createObjectURL(resumeFile);
                              window.open(url, '_blank');
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview resume</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResumeFile(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove resume</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ) : usingProfileResume && profile?.resume_url ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileIcon className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">Using resume from your profile</span>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(profile.resume_url, '_blank');
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview resume</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUsingProfileResume(false);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Upload different resume</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
                      PDF or image, max 10MB
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
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
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyDown}
              placeholder="Write a brief cover letter..."
              rows={6}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || hasUploadsInProgress}
              className="gap-2"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : hasUploadsInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading files...
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
