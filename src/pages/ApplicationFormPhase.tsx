import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Card, CardContent } from "@/components/ui/card";
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
  Upload,
  X,
  File as FileIcon,
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
import { resolveResumeUrl } from "@/utils/resumeSignedUrl";
import { GlyphLetter } from "@/components/candidate/glyphs";
import { buildCandidateJourney, DECISION_STAGE_ID } from "@/lib/candidateJourney";
import { parseApplicationNotes } from "@/lib/applicationNotes";

// A slim brass rule across the top of a card — the letterhead mark
// (Founder's Law: "the dialogues feel empty and boring").
const BRASS_RULE = (
  <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--brass-line)" }} aria-hidden="true" />
);

// Considered field styling — filled var(--ground), var(--line) borders, a
// gold focus ring instead of the app-wide jade one.
const FIELD_CLASS = "border-[var(--line)] bg-[var(--ground)] focus-visible:ring-[var(--brass-line)]";

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
    toast.warning("Copy is turned off here — just type your own words.", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Prevent paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    recordViolation('paste_attempt', 'Paste attempted');
    toast.warning("Paste is turned off here — type your answer directly.", {
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
    toast.warning("Right-click is turned off here.", {
      icon: <ShieldAlert className="h-4 w-4" />,
    });
  }, [recordViolation]);

  // Anti-cheating: Block keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      recordViolation('keyboard_shortcut', `Blocked ${e.key.toUpperCase()} shortcut`);
      toast.warning("That shortcut is turned off here.", {
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

  // Where the candidate is in the whole journey — derived from the job's real
  // workflow_steps via the shared candidateJourney builder, so this screen
  // agrees with every other candidate screen. This screen IS the
  // application stage, so it's always step 1.
  const journeyStep = useMemo(() => {
    const workflowSteps = (application?.jobs?.workflow_steps || []) as Array<{ id: string; type: string; title?: string }>;
    const quizQuestions = application?.jobs?.quiz_questions;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    const steps = buildCandidateJourney(workflowSteps, { hasQuiz });
    return { index: 0, total: steps.length, title: steps[0].title };
  }, [application?.jobs?.workflow_steps, application?.jobs?.quiz_questions]);

  const journeyProgressPct = Math.round(((journeyStep.index + 1) / Math.max(journeyStep.total, 1)) * 100);

  // Parse notes to check if already submitted. This runs during RENDER, so a
  // bare JSON.parse here throws inside the render pass on any malformed row and
  // blanks the whole screen with the candidate's part-finished application in
  // it. Reading notes must never be able to take a screen down.
  const notes = parseApplicationNotes(application?.notes);
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
  // notes is now typed rather than `any`, which surfaced that this assumed
  // applicationAnswers is an array without checking. A malformed row could put
  // anything here, so ask.
  const hasApplicationAnswers = Array.isArray(notes.applicationAnswers) && notes.applicationAnswers.length > 0;
  
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
        toast.warning("Looks like you switched tabs", {
          description: "That's been noted — stay on this page if you can.",
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
      toast.error("That file type won't work — please upload a PDF or image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("That file's too big — anything under 10 MB works.");
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
              imageUrls.push(imagePath);
            }
          }
        }
      } else {
        imageUrls.push(fileName);
      }
      
      // Update application with resume URL and image URLs in notes
      const currentNotes = await getLatestStoredNotes();
      const updatedNotes = {
        ...currentNotes,
        resumeImageUrls: imageUrls,
      };
      
      await updateApplication.mutateAsync({
        id: id!,
        resume_url: fileName,
        notes: JSON.stringify(updatedNotes),
      });

      toast.success("Resume uploaded — you're all set.");
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast.error("That upload didn't go through — please try again.");
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
        toast.error("That won't work for a resume — please upload a PDF or image.");
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
        toast.error("That file type won't work — try a PDF, Word doc, or image.");
        return;
      }
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("That file's too big — anything under 10 MB works.");
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
              imageUrls.push(imagePath);
            }
          }
        }
      } else if (isImage) {
        // For images, the uploaded file IS the image for AI analysis
        imageUrls = [fileName];
      }

      // Store image URLs for this question in notes
      const currentNotes = await getLatestStoredNotes();
      const fileUploads = currentNotes.fileUploads || {};
      fileUploads[questionId] = {
        url: fileName,  // CRITICAL: Must be "url" not "fileUrl" - backend expects this schema
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

      setQuestionFileUrls(prev => ({ ...prev, [questionId]: fileName }));
      setAnswers(prev => ({ ...prev, [questionId]: fileName }));
      toast.success("File uploaded.");
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("That upload didn't go through — please try again.");
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
        errors[q.id] = "This one's needed to continue";
      }
      if (normalizeQuestionType(q.type) === "email" && answers[q.id] && !isValidEmail(answers[q.id])) {
        errors[q.id] = "That doesn't look like a valid email — mind double-checking?";
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
      errors.resume = "Add your resume to continue — PDF or image, under 10 MB";
    }

    setValidationErrors(errors);
    return errors;
  };

  const handleSubmit = async () => {
    if (!application) {
      toast.error("Still loading your application — give it a second, then try again.");
      return;
    }

    if (hasUploadsInProgress) {
      toast.error("Hang tight — your files are still uploading.");
      return;
    }

    const errors = validateForm();
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstError = errors[errorFields[0]];
      toast.error(`One quick thing: ${firstError}`);
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
        toast.info("Getting your resume ready...");
        
        try {
          if (isImageResumeUrl(profile.resume_url)) {
            finalResumeImageUrls = [profile.resume_url];
          } else if (isPdfResumeUrl(profile.resume_url)) {
            const response = await fetch((await resolveResumeUrl(profile.resume_url)) || profile.resume_url);
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
                finalResumeImageUrls.push(imagePath);
              }
            }
          } else {
            throw new Error("Unsupported profile resume format");
          }
          
          finalResumeUrl = profile.resume_url;
        } catch (conversionError) {
          console.error("[ApplicationFormPhase] Profile resume conversion failed:", conversionError);
          toast.error("We couldn't read that resume — please upload a PDF or image.");
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

      // Get workflow steps to find the next stage in the real journey
      const workflowSteps = application.jobs?.workflow_steps || [];
      const quizQuestions = application.jobs?.quiz_questions;
      const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;

      const typedSteps = workflowSteps as Array<{ id: string; type: string; title?: string }>;
      const allPhases = buildCandidateJourney(typedSteps, { hasQuiz: hasQuizQuestions });

      // Find current step index (application phase)
      const currentIndex = allPhases.findIndex((p) => p.type === "application" || p.id === stepId);

      // Determine next phase
      let nextPhase: { id: string; type: string; title?: string } | null = null;
      if (currentIndex >= 0 && currentIndex < allPhases.length - 1) {
        nextPhase = allPhases[currentIndex + 1];
      }

      // Not for voice_interview (needs employer approval to start) or the
      // closing decision stage (nothing to click into, just wait).
      if (nextPhase && nextPhase.type !== "voice_interview" && nextPhase.id !== DECISION_STAGE_ID) {
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
          toast.warning("Application submitted.", {
            description: "We're still finishing up — check back shortly for your result.",
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
          // The CLIENT MUST NEVER DECIDE A REJECTION — only a server-confirmed
          // status:"rejected" row may show the rejected screen. Ava can return
          // "recommend_decline" (status stays "reviewing" for a human) and
          // that is NOT a rejection; comparing the score to the passing score
          // here would manufacture one that no human made.
          const { data: freshApp } = await supabase
            .from("applications")
            .select("status")
            .eq("id", id!)
            .single();

          if (freshApp?.status === "rejected") {
            setEvaluationState("failed");
          } else {
            // Neutral, honest outcome — submitted, hiring team reviewing.
            // No guess about pass/fail the server hasn't confirmed.
            setEvaluationState(null);
            toast.success("Application submitted!", {
              description: "The hiring team has what they need. Everyone hears back.",
            });
            queryClient.invalidateQueries({ queryKey: ["applications"] });
            navigate(`/applications/${id}`);
            return;
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
          toast.warning("Application submitted.", {
            description: "Your review is still being prepared — the hiring team will follow up soon.",
          });
        } else {
          toast.success("Application submitted!", {
            description: "The hiring team has what they need. Everyone hears back.",
          });
        }

        await queryClient.invalidateQueries({ queryKey: ["application", id] });
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        navigate(`/applications/${id}`);
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      toast.error("That didn't go through — please try again.");
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
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="relative overflow-hidden bg-card border-border max-w-md">
          {BRASS_RULE}
          <CardContent className="p-8 text-center">
            <GlyphLetter size={44} className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-display mb-2 text-xl text-foreground">We couldn't find this application</h2>
            <p className="text-muted-foreground">
              It may have been removed, or you might not have access to it.
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
      className="ck-page mx-auto max-w-3xl space-y-6"
      onContextMenu={handleContextMenu}
    >
      {/* Journey header — where am I, what's happening now, what's next */}
      <header className="ck-reveal space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/applications/${id}`)}
            aria-label="Back to application overview"
            className="shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {application.jobs?.title || "This role"}
          </p>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
            Complete your application
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journeyStep.index + 1}</span> of{" "}
            <span className="ck-num">{journeyStep.total}</span> — {journeyStep.title}
          </span>

          <Progress value={journeyProgressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            Take your time — you can't break anything here.
          </p>
        </div>

        {violations.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              {violations.length} thing{violations.length === 1 ? "" : "s"} flagged during this session
            </span>
          </div>
        )}
      </header>

      {/* Form — the letterhead moment: brass rule up top, considered fields below */}
      <Card className="relative overflow-hidden bg-card border-border">
        {BRASS_RULE}
        <CardContent className="space-y-8 p-4 pt-6 sm:p-8">
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
            const fieldId = `application-question-${question.id}`;
            const labelTargetId =
              questionType === "phone"
                ? `${fieldId}-phone`
                : questionType === "select" || questionType === "file"
                  ? undefined
                  : fieldId;
            const usePlainInput = questionType === "text";
            const useNumericInput = questionType === "number";
            // A "select" question with no options to choose from can't render
            // a radio group over nothing — same "type checked before options"
            // trap as the quiz's getQuestionType. Fall through to a plain
            // text input instead of rendering an empty, unanswerable field.
            const hasSelectOptions = Array.isArray(question.options) && question.options.length > 0;
            const useFallbackInput =
              ![
                "text",
                "number",
                "textarea",
                "email",
                "phone",
                "date",
                "select",
                "file",
              ].includes(questionType) || (questionType === "select" && !hasSelectOptions);
            const criteriaContext = getQuestionCriteriaContext(question, application?.jobs ?? null);
            const isCriteriaExpanded = expandedCriteriaQuestionId === question.id;

            return (
            <div key={question.id} className="space-y-2" data-field={question.id}>
              <Label htmlFor={labelTargetId} className="text-foreground">
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
                  id={fieldId}
                  type="text"
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  className={cn(FIELD_CLASS, validationErrors[question.id] && "border-destructive")}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}

              {useNumericInput && (
                <Input
                  id={fieldId}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={answers[question.id] || ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: e.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                  placeholder="Your answer"
                  className={cn(FIELD_CLASS, validationErrors[question.id] && "border-destructive")}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}

              {useFallbackInput && (
                <Input
                  id={fieldId}
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  className={cn(FIELD_CLASS, validationErrors[question.id] && "border-destructive")}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}

              {questionType === "textarea" && (
                <Textarea
                  id={fieldId}
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                  rows={4}
                  className={cn(FIELD_CLASS, validationErrors[question.id] && "border-destructive")}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onCut={handleCut}
                />
              )}

              {questionType === "email" && (
                <Input
                  id={fieldId}
                  type="email"
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="email@example.com"
                  className={cn(FIELD_CLASS, validationErrors[question.id] && "border-destructive")}
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
                    id={`${fieldId}-phone`}
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswers(prev => ({
                      ...prev,
                      [question.id]: formatPhoneNumber(e.target.value)
                    }))}
                    placeholder="123-456-7890"
                    className={cn(FIELD_CLASS, "flex-1", validationErrors[question.id] && "border-destructive")}
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
                      id={fieldId}
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        FIELD_CLASS,
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
              
              {questionType === "select" && hasSelectOptions && (
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
                      Uploading — hang tight...
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
                              className="h-8 w-8"
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
                              className="h-8 w-8"
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
                              className="h-8 w-8"
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
                              className="h-8 w-8"
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
                    Uploading your resume — hang tight...
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
                            className="h-8 w-8"
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
                            className="h-8 w-8"
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
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              void resolveResumeUrl(profile.resume_url).then((s) => { if (s) window.open(s, '_blank'); });
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
                            className="h-8 w-8"
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
                      PDF or image, up to 10 MB
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
            <Label className="text-foreground">
              Cover letter <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyDown}
              placeholder="Anything you'd like the hiring team to know..."
              rows={6}
              className={FIELD_CLASS}
            />
          </div>

          {/* Continue — the one primary action on this screen */}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Everything here is saved to your application when you continue.
            </p>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || hasUploadsInProgress}
              className="w-full gap-2 sm:w-auto"
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
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
