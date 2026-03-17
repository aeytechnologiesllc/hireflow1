import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  Wand2,
  FileText,
  DollarSign,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  Eye,
  Save,
  Send,
  CalendarIcon,
  Sparkles,
  Zap,
  Target,
  Flame,
  Gauge,
  Edit2,
  Trash2,
  Plus,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Keyboard,
  Video,
  MessageSquare,
  Upload,
  Bot,
  Hand,
  User,
  Mail,
  Phone,
  FileText as FileTextIcon,
  Type,
  Clock,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { subscribeToAvaFormCommands, AvaFormCommand } from "@/utils/avaFormEvents";
import { JobPublishedDialog } from "@/components/JobPublishedDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AvaWorkflowGenerationOverlay from "@/components/AvaWorkflowGenerationOverlay";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RefreshCw } from "lucide-react";

interface ApplicationQuestion {
  id: string;
  type: string;
  question: string;
  required: boolean;
  placeholder?: string;
}

interface QuizQuestion {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correct_answer: string | null;
  correct_answers?: string[];
  fit_context?: string;
  time_limit_seconds: number;
  category: string;
}

interface WorkflowStep {
  id: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
}

const WIZARD_STEPS = [
  { id: "basic", title: "Basic Info", icon: FileText },
  { id: "details", title: "Job Details", icon: Briefcase },
  { id: "compensation", title: "Compensation", icon: DollarSign },
  { id: "workflow", title: "Workflow", icon: Sparkles },
  { id: "review", title: "Review & Publish", icon: Eye },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", description: "Quick screening (8-10 quiz questions)", icon: Zap, color: "text-green-500", borderColor: "border-green-500", bgColor: "bg-green-500/10", shadowColor: "shadow-green-500/20" },
  { value: "medium", label: "Medium", description: "Balanced evaluation (12-15 quiz questions)", icon: Target, color: "text-emerald-400", borderColor: "border-emerald-400", bgColor: "bg-emerald-400/10", shadowColor: "shadow-emerald-400/20" },
  { value: "hard", label: "Hard", description: "Intensive screening (18-25 quiz questions)", icon: Flame, color: "text-orange-500", borderColor: "border-orange-500", bgColor: "bg-orange-500/10", shadowColor: "shadow-orange-500/20" },
  { value: "intense", label: "Intense", description: "Maximum rigor (25-30 quiz questions)", icon: Gauge, color: "text-red-500", borderColor: "border-red-500", bgColor: "bg-red-500/10", shadowColor: "shadow-red-500/20" },
];

import { Mic } from "lucide-react";

const STEP_TYPE_INFO: Record<string, { icon: React.ElementType; label: string; description: string; hasConfig?: boolean }> = {
  typing_test: { icon: Keyboard, label: "Typing Test", description: "Test typing speed and accuracy" },
  video_message: { icon: Video, label: "Video Message", description: "Record a video introduction" },
  chat_simulation: { icon: MessageSquare, label: "Chat Simulation", description: "Customer support roleplay" },
  sales_simulation: { icon: Bot, label: "Sales Conversation", description: "Sales pitch roleplay" },
  portfolio_upload: { icon: Upload, label: "Portfolio Upload", description: "Submit work samples" },
  chat_interview: { icon: MessageSquare, label: "Interview with Ava", description: "Text-based AI interview" },
  voice_interview: { icon: Mic, label: "Ava Interview", description: "Premium voice interview (after Review)", hasConfig: true },
};

const QUESTION_TYPE_ICONS: Record<string, React.ElementType> = {
  text: Type,
  email: Mail,
  phone: Phone,
  file: Upload,
  textarea: FileTextIcon,
  select: HelpCircle,
  number: Target,
};

const VOICE_INTERVIEW_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Mandarin Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "pt", label: "Portuguese" },
  { value: "ur", label: "Urdu" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "it", label: "Italian" },
  { value: "ru", label: "Russian" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
];

const CURRENCIES = [
  { value: "USD", label: "USD ($) - US Dollar" },
  { value: "EUR", label: "EUR (€) - Euro" },
  { value: "GBP", label: "GBP (£) - British Pound" },
  { value: "CAD", label: "CAD ($) - Canadian Dollar" },
  { value: "AUD", label: "AUD ($) - Australian Dollar" },
  { value: "NZD", label: "NZD ($) - New Zealand Dollar" },
  { value: "CHF", label: "CHF (Fr) - Swiss Franc" },
  { value: "JPY", label: "JPY (¥) - Japanese Yen" },
  { value: "CNY", label: "CNY (¥) - Chinese Yuan" },
  { value: "HKD", label: "HKD ($) - Hong Kong Dollar" },
  { value: "SGD", label: "SGD ($) - Singapore Dollar" },
  { value: "INR", label: "INR (₹) - Indian Rupee" },
  { value: "PKR", label: "PKR (₨) - Pakistani Rupee" },
  { value: "BDT", label: "BDT (৳) - Bangladeshi Taka" },
  { value: "LKR", label: "LKR (₨) - Sri Lankan Rupee" },
  { value: "NPR", label: "NPR (₨) - Nepalese Rupee" },
  { value: "AED", label: "AED (د.إ) - UAE Dirham" },
  { value: "SAR", label: "SAR (﷼) - Saudi Riyal" },
  { value: "QAR", label: "QAR (﷼) - Qatari Riyal" },
  { value: "KWD", label: "KWD (د.ك) - Kuwaiti Dinar" },
  { value: "BHD", label: "BHD (د.ب) - Bahraini Dinar" },
  { value: "OMR", label: "OMR (﷼) - Omani Rial" },
  { value: "EGP", label: "EGP (£) - Egyptian Pound" },
  { value: "ZAR", label: "ZAR (R) - South African Rand" },
  { value: "NGN", label: "NGN (₦) - Nigerian Naira" },
  { value: "KES", label: "KES (KSh) - Kenyan Shilling" },
  { value: "GHS", label: "GHS (₵) - Ghanaian Cedi" },
  { value: "TZS", label: "TZS (TSh) - Tanzanian Shilling" },
  { value: "UGX", label: "UGX (USh) - Ugandan Shilling" },
  { value: "MAD", label: "MAD (د.م.) - Moroccan Dirham" },
  { value: "TND", label: "TND (د.ت) - Tunisian Dinar" },
  { value: "BRL", label: "BRL (R$) - Brazilian Real" },
  { value: "MXN", label: "MXN ($) - Mexican Peso" },
  { value: "ARS", label: "ARS ($) - Argentine Peso" },
  { value: "CLP", label: "CLP ($) - Chilean Peso" },
  { value: "COP", label: "COP ($) - Colombian Peso" },
  { value: "PEN", label: "PEN (S/) - Peruvian Sol" },
  { value: "VES", label: "VES (Bs) - Venezuelan Bolívar" },
  { value: "KRW", label: "KRW (₩) - South Korean Won" },
  { value: "TWD", label: "TWD ($) - Taiwan Dollar" },
  { value: "THB", label: "THB (฿) - Thai Baht" },
  { value: "VND", label: "VND (₫) - Vietnamese Dong" },
  { value: "IDR", label: "IDR (Rp) - Indonesian Rupiah" },
  { value: "MYR", label: "MYR (RM) - Malaysian Ringgit" },
  { value: "PHP", label: "PHP (₱) - Philippine Peso" },
  { value: "RUB", label: "RUB (₽) - Russian Ruble" },
  { value: "UAH", label: "UAH (₴) - Ukrainian Hryvnia" },
  { value: "PLN", label: "PLN (zł) - Polish Zloty" },
  { value: "CZK", label: "CZK (Kč) - Czech Koruna" },
  { value: "HUF", label: "HUF (Ft) - Hungarian Forint" },
  { value: "RON", label: "RON (lei) - Romanian Leu" },
  { value: "BGN", label: "BGN (лв) - Bulgarian Lev" },
  { value: "HRK", label: "HRK (kn) - Croatian Kuna" },
  { value: "SEK", label: "SEK (kr) - Swedish Krona" },
  { value: "NOK", label: "NOK (kr) - Norwegian Krone" },
  { value: "DKK", label: "DKK (kr) - Danish Krone" },
  { value: "ISK", label: "ISK (kr) - Icelandic Króna" },
  { value: "TRY", label: "TRY (₺) - Turkish Lira" },
  { value: "ILS", label: "ILS (₪) - Israeli Shekel" },
  { value: "JOD", label: "JOD (د.ا) - Jordanian Dinar" },
  { value: "LBP", label: "LBP (ل.ل) - Lebanese Pound" },
  { value: "IRR", label: "IRR (﷼) - Iranian Rial" },
  { value: "IQD", label: "IQD (ع.د) - Iraqi Dinar" },
  { value: "AFN", label: "AFN (؋) - Afghan Afghani" },
  { value: "MMK", label: "MMK (K) - Myanmar Kyat" },
  { value: "KHR", label: "KHR (៛) - Cambodian Riel" },
  { value: "LAK", label: "LAK (₭) - Lao Kip" },
  { value: "BND", label: "BND ($) - Brunei Dollar" },
  { value: "FJD", label: "FJD ($) - Fiji Dollar" },
  { value: "PGK", label: "PGK (K) - Papua New Guinean Kina" },
  { value: "XOF", label: "XOF (CFA) - West African CFA Franc" },
  { value: "XAF", label: "XAF (FCFA) - Central African CFA Franc" },
];

// Workflow phase warning threshold
const PHASE_WARNING_THRESHOLD = 4;

// Helper to estimate candidate completion time
const getEstimatedCompletionTime = (
  steps: WorkflowStep[], 
  quizCount: number
): number => {
  const timeMap: Record<string, number> = {
    typing_test: 5,
    video_message: 5,
    chat_simulation: 10,
    sales_simulation: 10,
    portfolio_upload: 5,
    chat_interview: 15,
    voice_interview: 15,
  };
  const quizTime = Math.ceil(quizCount * 0.5); // 30 sec per question
  const stepsTime = steps.reduce((acc, s) => acc + (timeMap[s.type] || 5), 0);
  return quizTime + stepsTime + 5; // +5 for application form base
};

export default function CreateJob() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditMode = !!id;
  const { role } = useAuth();
  const { data: profile } = useProfile();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const { data: existingJob, isLoading: isLoadingJob } = useJob(id);
  const { limits, usage, isWithinLimit } = useSubscription();
  const hasVoiceInterviewAccess = limits?.hasVoiceInterviews ?? false;
  const canCreateMoreJobs = isEditMode || isWithinLimit('jobs');
  
  // Phase warning dismissed state
  const [phaseWarningDismissed, setPhaseWarningDismissed] = useState(false);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    requirements: "",
    responsibilities: "",
    location: "",
    job_type: "full-time",
    experience_level: "",
    department: "",
    salary_type: "range" as "fixed" | "range" | "commission" | "base_plus_commission",
    salary_period: "yearly" as "hourly" | "monthly" | "yearly",
    salary_min: "",
    salary_max: "",
    salary_fixed: "",
    salary_currency: "USD",
    skills_required: "",
    benefits: "",
    application_deadline: null as Date | null,
  });

  // Workflow state
  const [workflowDifficulty, setWorkflowDifficulty] = useState<string>("medium");
  const [processingMode, setProcessingMode] = useState<"auto" | "manual">("auto");
  const [passingScore, setPassingScore] = useState<number>(60);
  const [requiredWpm, setRequiredWpm] = useState<number>(35);
  const [applicationQuestions, setApplicationQuestions] = useState<ApplicationQuestion[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [workflowApiComplete, setWorkflowApiComplete] = useState(false);
  const [pendingWorkflowData, setPendingWorkflowData] = useState<{
    application_questions: ApplicationQuestion[];
    quiz_questions: QuizQuestion[];
    workflow_steps: WorkflowStep[];
  } | null>(null);
  const [workflowGenerated, setWorkflowGenerated] = useState(false);
  
  // Edit dialogs
  const [editingQuestion, setEditingQuestion] = useState<ApplicationQuestion | null>(null);
  const [editingQuizQuestion, setEditingQuizQuestion] = useState<QuizQuestion | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  
  // Confirmation dialog for adding both chat_interview and voice_interview
  const [showDualInterviewConfirm, setShowDualInterviewConfirm] = useState(false);
  const [pendingInterviewType, setPendingInterviewType] = useState<string | null>(null);
  
  // Published job dialog state
  const [publishedJob, setPublishedJob] = useState<{
    id: string;
    title: string;
    location?: string | null;
    job_type?: string | null;
    job_code?: string | null;
  } | null>(null);
  const [showPublishedDialog, setShowPublishedDialog] = useState(false);

  // Load existing job data for edit mode
  useEffect(() => {
    if (isEditMode && existingJob) {
      setFormData({
        title: existingJob.title || "",
        description: existingJob.description || "",
        requirements: existingJob.requirements || "",
        responsibilities: existingJob.responsibilities || "",
        location: existingJob.location || "",
        job_type: existingJob.job_type || "full-time",
        experience_level: existingJob.experience_level || "",
        department: existingJob.department || "",
        salary_type: existingJob.salary_min === existingJob.salary_max ? "fixed" : "range",
        salary_period: "yearly",
        salary_min: existingJob.salary_min?.toString() || "",
        salary_max: existingJob.salary_max?.toString() || "",
        salary_fixed: existingJob.salary_min === existingJob.salary_max ? existingJob.salary_min?.toString() || "" : "",
        salary_currency: existingJob.salary_currency || "USD",
        skills_required: existingJob.skills_required?.join(", ") || "",
        benefits: existingJob.benefits?.join(", ") || "",
        application_deadline: existingJob.application_deadline ? new Date(existingJob.application_deadline) : null,
      });
      
      // Load workflow data
      if (existingJob.workflow_difficulty) {
        setWorkflowDifficulty(existingJob.workflow_difficulty);
      }
      if (existingJob.processing_mode) {
        setProcessingMode(existingJob.processing_mode as "auto" | "manual");
      }
      if (existingJob.passing_score) {
        setPassingScore(existingJob.passing_score);
      }
      if ((existingJob as any).required_wpm) {
        setRequiredWpm((existingJob as any).required_wpm);
      }
      if (existingJob.application_questions) {
        setApplicationQuestions(existingJob.application_questions as unknown as ApplicationQuestion[]);
        setWorkflowGenerated(true);
      }
      if (existingJob.quiz_questions) {
        setQuizQuestions(existingJob.quiz_questions as unknown as QuizQuestion[]);
      }
      if (existingJob.workflow_steps) {
        setWorkflowSteps(existingJob.workflow_steps as unknown as WorkflowStep[]);
      }
    }
  }, [isEditMode, existingJob]);

  // Load guest job data from localStorage (after guest signs up/in)
  useEffect(() => {
    const guestDataString = localStorage.getItem("guestJobData");
    if (guestDataString && !isEditMode) {
      try {
        const guestData = JSON.parse(guestDataString);
        
        // Populate form data
        setFormData({
          title: guestData.formData?.title || "",
          description: guestData.formData?.description || "",
          requirements: guestData.formData?.requirements || "",
          responsibilities: guestData.formData?.responsibilities || "",
          location: guestData.formData?.location || "",
          job_type: guestData.formData?.job_type || "full-time",
          experience_level: guestData.formData?.experience_level || "",
          department: guestData.formData?.department || "",
          salary_type: guestData.formData?.salary_type || "range",
          salary_period: guestData.formData?.salary_period || "yearly",
          salary_min: guestData.formData?.salary_min || "",
          salary_max: guestData.formData?.salary_max || "",
          salary_fixed: guestData.formData?.salary_fixed || "",
          salary_currency: guestData.formData?.salary_currency || "USD",
          skills_required: guestData.formData?.skills_required || "",
          benefits: guestData.formData?.benefits || "",
          application_deadline: null,
        });
        
        // Populate workflow data
        if (guestData.applicationQuestions) {
          setApplicationQuestions(guestData.applicationQuestions);
        }
        if (guestData.quizQuestions) {
          setQuizQuestions(guestData.quizQuestions);
        }
        if (guestData.workflowSteps) {
          setWorkflowSteps(guestData.workflowSteps);
        }
        if (guestData.workflowDifficulty) {
          setWorkflowDifficulty(guestData.workflowDifficulty);
        }
        if (guestData.processingMode) {
          setProcessingMode(guestData.processingMode);
        }
        if (guestData.passingScore) {
          setPassingScore(guestData.passingScore);
        }
        
        setWorkflowGenerated(true);
        
        // Go to review step (step 4)
        setCurrentStep(4);
        
        // Clear localStorage to prevent duplicate loads
        localStorage.removeItem("guestJobData");
        
        toast.success("Welcome! Your job is ready to publish");
      } catch (error) {
        console.error("Error loading guest job data:", error);
        localStorage.removeItem("guestJobData");
      }
    }
  }, [isEditMode]);

  // Pre-fill title from onboarding handoff
  useEffect(() => {
    if (isEditMode) return;
    const guestData = localStorage.getItem("guestJobData");
    if (guestData) return; // guest draft takes precedence
    const titleParam = searchParams.get("title");
    const source = searchParams.get("source");
    if (titleParam && source === "onboarding" && !formData.title) {
      setFormData(prev => ({ ...prev, title: titleParam }));
      // Clean up query params
      setSearchParams(prev => { prev.delete("title"); prev.delete("source"); return prev; }, { replace: true });
    }
  }, [isEditMode, searchParams]);

  // Subscribe to AVA form commands for voice-controlled job creation
  useEffect(() => {
    const unsubscribe = subscribeToAvaFormCommands((command: AvaFormCommand) => {
      console.log('CreateJob received AVA command:', command);
      
      if (command.action === 'fill_field' && command.field && command.value !== undefined) {
        // Map field names to form data keys
        const fieldMap: Record<string, string> = {
          title: 'title',
          description: 'description',
          location: 'location',
          job_type: 'job_type',
          experience_level: 'experience_level',
          department: 'department',
          salary_min: 'salary_min',
          salary_max: 'salary_max',
          requirements: 'requirements',
          responsibilities: 'responsibilities',
          skills_required: 'skills_required',
          benefits: 'benefits'
        };
        
        const formField = fieldMap[command.field];
        if (formField) {
          setFormData(prev => ({ ...prev, [formField]: command.value }));
          toast.success(`AVA filled: ${command.field.replace(/_/g, ' ')}`);
        }
      }
      
      if (command.action === 'navigate_step') {
        if (command.step === 1 && currentStep < WIZARD_STEPS.length - 1) {
          setCurrentStep(prev => prev + 1);
          toast.success('Moving to next step');
        } else if (command.step === -1 && currentStep > 0) {
          setCurrentStep(prev => prev - 1);
          toast.success('Going back');
        }
      }
      
      if (command.action === 'trigger_generate') {
        if (command.target === 'workflow') {
          generateWorkflow();
        } else if (command.target === 'full_job') {
          generateFullJob();
        }
      }
      
      if (command.action === 'submit') {
        handleSubmit('published');
      }
    });
    
    return unsubscribe;
  }, [currentStep]);

  const handleChange = (field: string, value: string | Date | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateField = async (field: string, context?: string) => {
    if (!formData.title && field !== "title") {
      toast.error("Please enter a job title first");
      return;
    }

    setIsGenerating(field);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-job-content", {
        body: { 
          field,
          title: formData.title,
          department: formData.department,
          experience_level: formData.experience_level,
          job_type: formData.job_type,
          existingContent: context || formData[field as keyof typeof formData],
          description: formData.description,
          responsibilities: formData.responsibilities,
          requirements: formData.requirements,
          skills_required: formData.skills_required,
        },
      });

      if (error) throw error;

      handleChange(field, data.content);
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} generated!`);
    } catch (error) {
      console.error("Error generating content:", error);
      toast.error("Failed to generate content");
    } finally {
      setIsGenerating(null);
    }
  };

  const generateFullJob = async () => {
    if (!formData.title) {
      toast.error("Please enter a job title first");
      return;
    }

    setIsGenerating("full");
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-job-content", {
        body: { 
          field: "full",
          title: formData.title,
          department: formData.department,
          experience_level: formData.experience_level,
          job_type: formData.job_type,
          location: formData.location,
        },
      });

      if (error) throw error;

      setFormData(prev => ({
        ...prev,
        description: data.description || prev.description,
        responsibilities: data.responsibilities || prev.responsibilities,
        requirements: data.requirements || prev.requirements,
        skills_required: data.skills || prev.skills_required,
        benefits: data.benefits || prev.benefits,
      }));
      
      toast.success("Full job posting generated!");
    } catch (error) {
      console.error("Error generating job:", error);
      toast.error("Failed to generate job posting");
    } finally {
      setIsGenerating(null);
    }
  };

  const generateWorkflow = async () => {
    if (!formData.title || !formData.description) {
      toast.error("Please fill in job title and description first");
      return;
    }

    setIsGeneratingWorkflow(true);
    setWorkflowApiComplete(false);
    setPendingWorkflowData(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-workflow", {
        body: {
          title: formData.title,
          description: formData.description,
          company: profile?.company_name || null,
          employment_type: formData.job_type,
          location: formData.location,
          difficulty: workflowDifficulty,
          require_resume: true,
        },
      });

      if (error) throw error;

      // Store the data but don't dismiss yet - wait for animation to complete
      setPendingWorkflowData({
        application_questions: data.application_questions || [],
        quiz_questions: data.quiz_questions || [],
        workflow_steps: data.workflow_steps || [],
      });
      setWorkflowApiComplete(true); // Signal to overlay that API is done
      
    } catch (error) {
      console.error("Error generating workflow:", error);
      toast.error("Failed to generate workflow. Please try again.");
      // On error, dismiss immediately
      setIsGeneratingWorkflow(false);
      setWorkflowApiComplete(false);
    }
    // NO finally block - don't dismiss until animation completes via onComplete
  };

  // Called by overlay when BOTH animation AND API are complete
  const handleWorkflowComplete = () => {
    if (pendingWorkflowData) {
      setApplicationQuestions(pendingWorkflowData.application_questions);
      setQuizQuestions(pendingWorkflowData.quiz_questions);
      
      // If user has premium voice interview access, replace chat_interview with voice_interview
      let finalWorkflowSteps = pendingWorkflowData.workflow_steps;
      if (hasVoiceInterviewAccess) {
        finalWorkflowSteps = pendingWorkflowData.workflow_steps.map(step => {
          if (step.type === 'chat_interview') {
            return {
              ...step,
              id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'voice_interview',
              title: 'Ava Interview',
              description: 'Premium AI voice interview powered by Ava',
              config: { language: 'en', language_name: 'English', language_enforcement: 'flexible' }
            };
          }
          return step;
        });
        toast.success("Hiring workflow generated with premium Ava Interview!");
      } else {
        toast.success("Hiring workflow generated!");
      }
      
      setWorkflowSteps(finalWorkflowSteps);
      setWorkflowGenerated(true);
    }
    // Now dismiss the overlay
    setIsGeneratingWorkflow(false);
    setWorkflowApiComplete(false);
    setPendingWorkflowData(null);
  };

  const handleSubmit = async (status: "draft" | "published") => {
    if (!formData.title || !formData.description) {
      toast.error("Please fill in the title and description");
      return;
    }

    // Check job limit (only when creating a new job, not editing)
    if (!isEditMode && !isWithinLimit('jobs')) {
      toast.error(`You've reached your job limit (${usage?.jobs_created ?? 0}/${limits?.jobs ?? 0}). Upgrade your plan to create more jobs.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const jobData = {
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        location: formData.location || null,
        job_type: formData.job_type,
        experience_level: formData.experience_level || null,
        department: formData.department || null,
        salary_min: formData.salary_type === "fixed" 
          ? (formData.salary_fixed ? parseInt(formData.salary_fixed) : null)
          : (formData.salary_min ? parseInt(formData.salary_min) : null),
        salary_max: formData.salary_type === "fixed"
          ? (formData.salary_fixed ? parseInt(formData.salary_fixed) : null)
          : (formData.salary_max ? parseInt(formData.salary_max) : null),
        salary_currency: formData.salary_currency,
        skills_required: formData.skills_required ? formData.skills_required.split(",").map((s) => s.trim()).filter(Boolean) : null,
        benefits: formData.benefits ? formData.benefits.split(",").map((s) => s.trim()).filter(Boolean) : null,
        application_deadline: formData.application_deadline ? formData.application_deadline.toISOString() : null,
        status,
        // Workflow data - cast to Json type as Supabase expects
        application_questions: applicationQuestions as unknown as null,
        quiz_questions: quizQuestions as unknown as null,
        workflow_steps: workflowSteps as unknown as null,
        workflow_difficulty: workflowDifficulty,
        processing_mode: processingMode,
        passing_score: passingScore,
        required_wpm: requiredWpm,
      };

      if (isEditMode && id) {
        await updateJob.mutateAsync({ id, ...jobData });
        toast.success(status === "published" ? "Job updated and published!" : "Job updated");
        navigate("/jobs");
      } else {
        const createdJob = await createJob.mutateAsync(jobData);
        
        if (status === "published" && createdJob) {
          // Show the published dialog with job details
          setPublishedJob({
            id: createdJob.id,
            title: createdJob.title,
            location: createdJob.location,
            job_type: createdJob.job_type,
            job_code: createdJob.job_code,
          });
          setShowPublishedDialog(true);
        } else {
          toast.success("Job saved as draft");
          navigate("/jobs");
        }
      }
    } catch (error) {
      console.error("Error saving job:", error);
      toast.error(isEditMode ? "Failed to update job" : "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Question management
  const deleteQuestion = (id: string) => {
    setApplicationQuestions(prev => prev.filter(q => q.id !== id));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...applicationQuestions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newQuestions.length) return;
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setApplicationQuestions(newQuestions);
  };

  const addNewQuestion = () => {
    const newQuestion: ApplicationQuestion = {
      id: `q${Date.now()}`,
      question: "New Question",
      type: "text",
      required: true,
      placeholder: "Enter your answer"
    };
    setApplicationQuestions(prev => [...prev, newQuestion]);
    setEditingQuestion(newQuestion);
  };

  // Quiz question management
  const deleteQuizQuestion = (id: string) => {
    setQuizQuestions(prev => prev.filter(q => q.id !== id));
  };

  const moveQuizQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...quizQuestions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newQuestions.length) return;
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuizQuestions(newQuestions);
  };

  const addNewQuizQuestion = () => {
    const newQuestion: QuizQuestion = {
      id: `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "multiple_choice",
      question: "",
      options: ["", "", "", ""],
      correct_answer: "",
      time_limit_seconds: 30,
      category: "General",
    };
    setEditingQuizQuestion(newQuestion);
  };

  const saveQuizQuestion = () => {
    if (!editingQuizQuestion) return;
    
    // Validate
    if (!editingQuizQuestion.question.trim()) {
      toast.error("Please enter a question");
      return;
    }
    
    const validOptions = editingQuizQuestion.options?.filter(opt => opt.trim()) || [];
    if (validOptions.length < 2) {
      toast.error("Please enter at least 2 options");
      return;
    }
    
    if (!editingQuizQuestion.correct_answer || !validOptions.includes(editingQuizQuestion.correct_answer)) {
      toast.error("Please select a correct answer");
      return;
    }
    
    // Clean up the question - only keep non-empty options
    const cleanedQuestion: QuizQuestion = {
      ...editingQuizQuestion,
      options: validOptions,
    };
    
    // Check if it's an existing question or new
    const existingIndex = quizQuestions.findIndex(q => q.id === editingQuizQuestion.id);
    if (existingIndex >= 0) {
      setQuizQuestions(prev => prev.map(q => q.id === cleanedQuestion.id ? cleanedQuestion : q));
      toast.success("Quiz question updated");
    } else {
      setQuizQuestions(prev => [...prev, cleanedQuestion]);
      toast.success("Quiz question added");
    }
    
    setEditingQuizQuestion(null);
  };

  const updateQuizQuestionOption = (index: number, value: string) => {
    if (!editingQuizQuestion) return;
    const newOptions = [...(editingQuizQuestion.options || [])];
    newOptions[index] = value;
    setEditingQuizQuestion({ ...editingQuizQuestion, options: newOptions });
  };

  const addQuizQuestionOption = () => {
    if (!editingQuizQuestion) return;
    const currentOptions = editingQuizQuestion.options || [];
    if (currentOptions.length >= 6) {
      toast.error("Maximum 6 options allowed");
      return;
    }
    setEditingQuizQuestion({
      ...editingQuizQuestion,
      options: [...currentOptions, ""],
    });
  };

  const removeQuizQuestionOption = (index: number) => {
    if (!editingQuizQuestion) return;
    const currentOptions = editingQuizQuestion.options || [];
    if (currentOptions.length <= 2) {
      toast.error("Minimum 2 options required");
      return;
    }
    const removedOption = currentOptions[index];
    const newOptions = currentOptions.filter((_, i) => i !== index);
    
    // If we removed the correct answer, clear it
    const newCorrectAnswer = editingQuizQuestion.correct_answer === removedOption 
      ? "" 
      : editingQuizQuestion.correct_answer;
    
    setEditingQuizQuestion({
      ...editingQuizQuestion,
      options: newOptions,
      correct_answer: newCorrectAnswer,
    });
  };

  // Workflow step management
  const deleteStep = (id: string) => {
    setWorkflowSteps(prev => prev.filter(s => s.id !== id));
  };

  // Helper to check if adding this interview type would create a dual-interview scenario
  const checkDualInterviewWarning = (type: string): boolean => {
    const hasChatInterview = workflowSteps.some(s => s.type === 'chat_interview');
    const hasVoiceInterview = workflowSteps.some(s => s.type === 'voice_interview');
    
    if (type === 'chat_interview' && hasVoiceInterview) return true;
    if (type === 'voice_interview' && hasChatInterview) return true;
    return false;
  };

  const addWorkflowStep = (type: string, skipConfirmation = false) => {
    const stepInfo = STEP_TYPE_INFO[type as keyof typeof STEP_TYPE_INFO];
    if (!stepInfo) return;
    
    // Check if we need to show confirmation for dual interview scenario
    if (!skipConfirmation && checkDualInterviewWarning(type)) {
      setPendingInterviewType(type);
      setShowDualInterviewConfirm(true);
      return;
    }
    
    // Default config for voice_interview
    const config: Record<string, unknown> = type === 'voice_interview' 
      ? { language: 'en', language_name: 'English', language_enforcement: 'flexible' }
      : {};
    
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      title: stepInfo.label,
      description: stepInfo.description,
      required: true,
      config
    };
    
    // Ordering: regular steps → chat_interview → voice_interview (always last)
    setWorkflowSteps(prev => {
      // Remove any existing interviews from the list first
      const regularSteps = prev.filter(s => s.type !== 'chat_interview' && s.type !== 'voice_interview');
      const existingChatInterview = prev.find(s => s.type === 'chat_interview');
      const existingVoiceInterview = prev.find(s => s.type === 'voice_interview');
      
      // Build new array with proper ordering
      const newRegularSteps = [...regularSteps];
      let chatInterview = existingChatInterview;
      let voiceInterview = existingVoiceInterview;
      
      // Determine where the new step goes
      if (type === 'voice_interview') {
        voiceInterview = newStep;
      } else if (type === 'chat_interview') {
        chatInterview = newStep;
      } else {
        // Regular step - add to regular steps
        newRegularSteps.push(newStep);
      }
      
      // Rebuild the array: regular steps, then chat_interview, then voice_interview
      const result: WorkflowStep[] = [...newRegularSteps];
      if (chatInterview) result.push(chatInterview);
      if (voiceInterview) result.push(voiceInterview);
      
      return result;
    });
    toast.success(`${stepInfo.label} added to workflow`);
  };

  const confirmDualInterviewAdd = () => {
    if (pendingInterviewType) {
      addWorkflowStep(pendingInterviewType, true);
    }
    setShowDualInterviewConfirm(false);
    setPendingInterviewType(null);
  };

  const replaceWithNewInterview = () => {
    if (pendingInterviewType) {
      const existingType = pendingInterviewType === 'voice_interview' ? 'chat_interview' : 'voice_interview';
      setWorkflowSteps(prev => prev.filter(s => s.type !== existingType));
      addWorkflowStep(pendingInterviewType, true);
    }
    setShowDualInterviewConfirm(false);
    setPendingInterviewType(null);
  };

  const updateWorkflowStepConfig = (stepId: string, configKey: string, value: unknown) => {
    setWorkflowSteps(prev => prev.map(step => {
      if (step.id === stepId) {
        return {
          ...step,
          config: {
            ...step.config,
            [configKey]: value
          }
        };
      }
      return step;
    }));
  };

  if (role !== "employer") {
    navigate("/dashboard");
    return null;
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!formData.title;
      case 1:
        return !!formData.description;
      case 2:
        return true;
      case 3:
        // In edit mode, workflow is read-only so always allow proceeding
        return isEditMode || workflowGenerated;
      case 4:
        return !!formData.title && !!formData.description;
      default:
        return true;
    }
  };

  // Get wizard steps - in edit mode, show workflow as read-only
  const getWizardSteps = () => {
    if (isEditMode) {
      return [
        { id: "basic", title: "Basic Info", icon: FileText },
        { id: "details", title: "Job Details", icon: Briefcase },
        { id: "compensation", title: "Compensation", icon: DollarSign },
        { id: "workflow", title: "Workflow (View Only)", icon: Sparkles },
        { id: "review", title: "Review & Update", icon: Eye },
      ];
    }
    return WIZARD_STEPS;
  };

  const wizardSteps = getWizardSteps();

  return (
    <div className="space-y-8 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {isEditMode ? "Edit Job" : "Create New Job"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-1.5 leading-relaxed">
              {isEditMode ? "Update your job posting" : "Ava-powered job posting wizard"}
            </p>
          </div>
        </div>
        
        {currentStep < 3 && (
          <Button 
            onClick={generateFullJob}
            disabled={!formData.title || isGenerating === "full"}
            className="gap-2"
            variant="outline"
          >
            {isGenerating === "full" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate Full Job
              </>
            )}
          </Button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-0 sm:px-4 py-2 overflow-x-auto">
        {wizardSteps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          
          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <button
                onClick={() => setCurrentStep(index)}
                className={`flex items-center gap-2 p-1.5 sm:p-2 rounded-xl transition-all ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : isCompleted 
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : isCompleted
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary"
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="font-medium hidden lg:block text-sm">{step.title}</span>
              </button>
              {index < wizardSteps.length - 1 && (
                <div className={`w-4 sm:w-8 h-0.5 mx-0 sm:mx-1 rounded-full ${
                  isCompleted ? "bg-primary" : "bg-border"
                }`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="max-w-4xl">
        <AnimatePresence mode="wait">
          {/* Step 1: Basic Info */}
          {currentStep === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                  <CardDescription>Essential details about the position</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Senior Software Engineer"
                      className="bg-background"
                      value={formData.title}
                      onChange={(e) => handleChange("title", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        placeholder="e.g., Engineering"
                        className="bg-background"
                        value={formData.department}
                        onChange={(e) => handleChange("department", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        placeholder="e.g., Remote, New York, NY"
                        className="bg-background"
                        value={formData.location}
                        onChange={(e) => handleChange("location", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="job_type">Job Type</Label>
                      <Select value={formData.job_type} onValueChange={(v) => handleChange("job_type", v)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full-time">Full-Time</SelectItem>
                          <SelectItem value="part-time">Part-Time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="internship">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="experience_level">Experience Level</Label>
                      <Select value={formData.experience_level} onValueChange={(v) => handleChange("experience_level", v)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entry">Entry Level</SelectItem>
                          <SelectItem value="mid">Mid Level</SelectItem>
                          <SelectItem value="senior">Senior Level</SelectItem>
                          <SelectItem value="lead">Lead / Principal</SelectItem>
                          <SelectItem value="executive">Executive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Job Details */}
          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Job Details</CardTitle>
                  <CardDescription>Describe the role and what you're looking for</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="description">Description *</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateField("description")}
                        disabled={isGenerating === "description"}
                        className="gap-1 text-primary"
                      >
                        {isGenerating === "description" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <RichTextarea
                      id="description"
                      placeholder="Describe the role, team, and what makes this opportunity exciting..."
                      className="min-h-[150px]"
                      style={{ minHeight: 150 }}
                      value={formData.description}
                      onChange={(val) => handleChange("description", val)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="responsibilities">Responsibilities</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateField("responsibilities")}
                        disabled={isGenerating === "responsibilities"}
                        className="gap-1 text-primary"
                      >
                        {isGenerating === "responsibilities" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <RichTextarea
                      id="responsibilities"
                      placeholder="List the key responsibilities and day-to-day tasks..."
                      className="min-h-[120px]"
                      style={{ minHeight: 120 }}
                      value={formData.responsibilities}
                      onChange={(val) => handleChange("responsibilities", val)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="requirements">Requirements</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateField("requirements")}
                        disabled={isGenerating === "requirements"}
                        className="gap-1 text-primary"
                      >
                        {isGenerating === "requirements" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <RichTextarea
                      id="requirements"
                      placeholder="List the required skills, experience, and qualifications..."
                      className="min-h-[120px]"
                      style={{ minHeight: 120 }}
                      value={formData.requirements}
                      onChange={(val) => handleChange("requirements", val)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="skills">Required Skills</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateField("skills_required")}
                        disabled={isGenerating === "skills_required"}
                        className="gap-1 text-primary"
                      >
                        {isGenerating === "skills_required" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <Input
                      id="skills"
                      placeholder="JavaScript, React, Node.js, PostgreSQL..."
                      className="bg-background"
                      value={formData.skills_required}
                      onChange={(e) => handleChange("skills_required", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Separate skills with commas</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Compensation */}
          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-xl sm:text-lg font-bold">Compensation & Benefits</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground leading-relaxed">Salary range and perks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 sm:space-y-6">
                  {/* Salary Type Selection */}
                  <div className="space-y-3">
                    <Label className="text-base sm:text-sm font-medium">Compensation Type</Label>
                    <RadioGroup
                      value={formData.salary_type}
                      onValueChange={(v) => {
                        const newType = v as "fixed" | "range" | "commission" | "base_plus_commission";
                        // Preserve values when switching modes
                        if (v === "fixed" && !formData.salary_fixed && formData.salary_min) {
                          setFormData(prev => ({ ...prev, salary_type: newType, salary_fixed: prev.salary_min }));
                        } else if (v === "range" && !formData.salary_min && formData.salary_fixed) {
                          setFormData(prev => ({ ...prev, salary_type: newType, salary_min: prev.salary_fixed }));
                        } else {
                          handleChange("salary_type", v);
                        }
                      }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value="fixed" id="salary-fixed" className="shrink-0" />
                        <Label htmlFor="salary-fixed" className="cursor-pointer font-normal text-sm leading-tight">Fixed Salary</Label>
                      </div>
                      <div className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value="range" id="salary-range" className="shrink-0" />
                        <Label htmlFor="salary-range" className="cursor-pointer font-normal text-sm leading-tight">Salary Range</Label>
                      </div>
                      <div className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value="commission" id="salary-commission" className="shrink-0" />
                        <Label htmlFor="salary-commission" className="cursor-pointer font-normal text-sm leading-tight">Commission Only</Label>
                      </div>
                      <div className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value="base_plus_commission" id="salary-base-commission" className="shrink-0" />
                        <Label htmlFor="salary-base-commission" className="cursor-pointer font-normal text-sm leading-tight">Base + Commission</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Currency and Period - only show for non-commission types */}
                  {formData.salary_type !== "commission" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="salary_currency" className="text-base sm:text-sm font-medium">Currency</Label>
                        <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={currencyOpen}
                              className="w-full justify-between bg-background"
                            >
                              <span className="truncate">
                                {formData.salary_currency 
                                  ? CURRENCIES.find(c => c.value === formData.salary_currency)?.label || formData.salary_currency
                                  : "Select currency"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0 bg-popover" align="start">
                            <Command>
                              <CommandInput placeholder="Search currency..." />
                              <CommandList>
                                <CommandEmpty>No currency found.</CommandEmpty>
                                <CommandGroup className="max-h-[300px] overflow-auto">
                                  {CURRENCIES.map((currency) => (
                                    <CommandItem
                                      key={currency.value}
                                      value={currency.value + " " + currency.label}
                                      onSelect={() => {
                                        handleChange("salary_currency", currency.value);
                                        setCurrencyOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          formData.salary_currency === currency.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {currency.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="salary_period" className="text-base sm:text-sm font-medium">Pay Period</Label>
                        <Select value={formData.salary_period} onValueChange={(v) => handleChange("salary_period", v)}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Per Hour</SelectItem>
                            <SelectItem value="monthly">Per Month</SelectItem>
                            <SelectItem value="yearly">Per Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Salary Amount(s) based on type */}
                  {formData.salary_type === "fixed" && (
                    <div className="space-y-2">
                      <Label htmlFor="salary_fixed" className="text-base sm:text-sm font-medium">Salary Amount</Label>
                      <Input
                        id="salary_fixed"
                        type="text"
                        inputMode="numeric"
                        placeholder="75,000"
                        className="bg-background"
                        value={formData.salary_fixed ? parseInt(formData.salary_fixed).toLocaleString() : ""}
                        onChange={(e) => handleChange("salary_fixed", e.target.value.replace(/\D/g, ""))}
                      />
                      <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed">
                        {formData.salary_currency} {formData.salary_period}
                      </p>
                    </div>
                  )}

                  {formData.salary_type === "range" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="salary_min" className="text-base sm:text-sm font-medium">Minimum Salary</Label>
                        <Input
                          id="salary_min"
                          type="text"
                          inputMode="numeric"
                          placeholder="50,000"
                          className="bg-background"
                          value={formData.salary_min ? parseInt(formData.salary_min).toLocaleString() : ""}
                          onChange={(e) => handleChange("salary_min", e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="salary_max" className="text-base sm:text-sm font-medium">Maximum Salary</Label>
                        <Input
                          id="salary_max"
                          type="text"
                          inputMode="numeric"
                          placeholder="80,000"
                          className="bg-background"
                          value={formData.salary_max ? parseInt(formData.salary_max).toLocaleString() : ""}
                          onChange={(e) => handleChange("salary_max", e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                      <p className="col-span-1 sm:col-span-2 text-sm sm:text-xs text-muted-foreground leading-relaxed">
                        {formData.salary_currency} {formData.salary_period}
                      </p>
                    </div>
                  )}

                  {formData.salary_type === "commission" && (
                    <div className="p-4 bg-muted/50 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Commission-only compensation. You can describe the commission structure in the job description or benefits section.
                      </p>
                    </div>
                  )}

                  {formData.salary_type === "base_plus_commission" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="salary_fixed" className="text-base sm:text-sm font-medium">Base Salary</Label>
                        <Input
                          id="salary_fixed"
                          type="text"
                          inputMode="numeric"
                          placeholder="40,000"
                          className="bg-background"
                          value={formData.salary_fixed ? parseInt(formData.salary_fixed).toLocaleString() : ""}
                          onChange={(e) => handleChange("salary_fixed", e.target.value.replace(/\D/g, ""))}
                        />
                        <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed">
                          {formData.salary_currency} {formData.salary_period} + commission
                        </p>
                      </div>
                      <div className="p-4 sm:p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed">
                          Tip: Describe your commission structure (e.g., percentage, tiers, OTE) in the job description or benefits section.
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="benefits" className="text-base sm:text-sm font-medium">Benefits</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateField("benefits")}
                        disabled={isGenerating === "benefits"}
                        className="gap-1 text-primary"
                      >
                        {isGenerating === "benefits" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <RichTextarea
                      id="benefits"
                      placeholder="Health insurance, 401k, Remote work, Unlimited PTO..."
                      className="min-h-[80px] sm:min-h-[60px]"
                      style={{ minHeight: 80 }}
                      value={formData.benefits}
                      onChange={(val) => handleChange("benefits", val)}
                    />
                    <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed">Separate benefits with commas</p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-base sm:text-sm font-medium">Application Deadline</Label>
                    <Popover open={deadlineOpen} onOpenChange={setDeadlineOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal bg-background",
                            !formData.application_deadline && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.application_deadline ? (
                            format(formData.application_deadline, "PPP")
                          ) : (
                            <span>Pick a deadline date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.application_deadline || undefined}
                          onSelect={(date) => {
                            handleChange("application_deadline", date || null);
                            setDeadlineOpen(false);
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed">
                      When should applications close for this position?
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 4: Workflow */}
          {currentStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* Edit Mode: Read-only workflow view */}
              {isEditMode ? (
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      AI Hiring Workflow (Read Only)
                    </CardTitle>
                    <CardDescription>
                      The workflow cannot be modified after job creation. You can only edit job details.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        Difficulty: <span className="font-medium text-foreground capitalize">{workflowDifficulty}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {applicationQuestions.length} application questions • {quizQuestions.length} quiz questions • {workflowSteps.length} workflow steps
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        Use "View Workflow" from the job menu to see full details
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Create Mode: Difficulty Selection and Generation */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl sm:text-lg font-bold flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        AI Hiring Workflow
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                        Select screening difficulty and generate a complete hiring workflow
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-2">
                      <div className="space-y-3">
                        <Label className="text-base sm:text-sm font-semibold mb-1">Screening Difficulty</Label>
                        <div className="grid grid-cols-2 gap-3">
                          {DIFFICULTY_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const isSelected = workflowDifficulty === option.value;
                            return (
                              <button
                                key={option.value}
                                onClick={() => {
                                  setWorkflowDifficulty(option.value);
                                  setWorkflowGenerated(false);
                                }}
                                className={cn(
                                  "p-4 rounded-xl border-2 transition-all text-left min-h-[90px] sm:min-h-[100px]",
                                  isSelected
                                    ? `${option.borderColor} ${option.bgColor} shadow-lg ${option.shadowColor} ring-2 ring-offset-2 ring-offset-background scale-[1.02] sm:scale-100`
                                    : "border-border bg-card hover:border-muted-foreground/30"
                                )}
                              >
                                <div className="flex items-start gap-2.5">
                                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", option.color)} />
                                  <div>
                                    <div className="text-base sm:text-sm font-bold tracking-tight">{option.label}</div>
                                    <div className="text-xs text-muted-foreground/90 leading-relaxed mt-1">{option.description}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <Separator className="my-1 sm:my-0" />

                      {/* Passing Score - Always visible since we default to Auto mode */}
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                          <div className="space-y-0.5">
                            <Label className="text-base sm:text-sm font-bold">Passing Score</Label>
                            <p className="text-xs text-muted-foreground/80 leading-relaxed">
                              Minimum Ava score to auto-advance candidates
                            </p>
                          </div>
                          <motion.div 
                            key={passingScore}
                            initial={{ scale: 1.3, color: "hsl(var(--primary))" }}
                            animate={{ scale: 1 }}
                            className="text-3xl sm:text-2xl font-bold text-primary tabular-nums shrink-0"
                          >
                            {passingScore}%
                          </motion.div>
                        </div>
                        <div className="pt-1">
                          <Slider
                            value={[passingScore]}
                            onValueChange={([value]) => setPassingScore(value)}
                            min={30}
                            max={95}
                            step={5}
                            className="w-full"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/70 pt-1">
                          <span>Lenient (30%)</span>
                          <span>Strict (95%)</span>
                        </div>
                      </div>

                      {/* WPM slider moved to typing test phase card below */}

                      {/* Autopilot Explainer */}
                      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">What's Autopilot vs Manual?</span>
                        </div>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <div className="flex items-start gap-2">
                            <Bot className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium text-foreground">Autopilot (Default):</span>{" "}
                              Ava automatically advances candidates who score above your passing threshold and sends respectful rejections to those who don't.
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Hand className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium text-foreground">Manual:</span>{" "}
                              You review and decide on every candidate. Ava still scores and analyzes, but you control all advancement decisions.
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground/60 text-center leading-relaxed pt-1">
                          💡 You can switch between modes anytime from the Jobs page
                        </p>
                      </div>

                      {/* Generate with AVA Button */}
                      <div className="flex justify-center sm:justify-end pt-2">
                        {workflowGenerated ? (
                          <Button
                            onClick={generateWorkflow}
                            disabled={isGeneratingWorkflow}
                            variant="outline"
                            className="gap-2 px-5"
                          >
                            {isGeneratingWorkflow ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Regenerating...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4" />
                                <span>Regenerate Workflow</span>
                              </>
                            )}
                          </Button>
                        ) : (
                          <motion.div
                            className="relative w-full sm:w-auto"
                            animate={{
                              boxShadow: [
                                "0 0 20px -5px rgba(217, 70, 239, 0.4)",
                                "0 0 35px -5px rgba(217, 70, 239, 0.6)",
                                "0 0 20px -5px rgba(217, 70, 239, 0.4)"
                              ]
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            style={{ borderRadius: "0.5rem" }}
                          >
                            <Button
                              onClick={generateWorkflow}
                              disabled={isGeneratingWorkflow}
                              className={cn(
                                "gap-2 px-6 py-4 sm:py-3 relative overflow-hidden w-full sm:w-auto",
                                "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
                                "hover:from-purple-400 hover:via-fuchsia-400 hover:to-pink-400",
                                "text-white font-semibold border-0"
                              )}
                              size="lg"
                            >
                              {isGeneratingWorkflow ? (
                                <>
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                  <span>Generating...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-5 w-5" />
                                  <span>Generate with AVA</span>
                                </>
                              )}
                            </Button>
                          </motion.div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Generated Workflow - Only show in create mode */}
              {!isEditMode && workflowGenerated && (
                <div className="space-y-6">
                  {/* Success banner */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-300">Workflow generated successfully</p>
                      <p className="text-xs text-emerald-300/60">Your hiring process is ready to review.</p>
                    </div>
                  </motion.div>

                  {/* APPLICATION section */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60">Application</span>
                    <Card className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Application Questions</CardTitle>
                        <Button variant="outline" size="sm" onClick={addNewQuestion} className="gap-1">
                          <Plus className="h-4 w-4" />
                          Add Question
                        </Button>
                      </div>
                      <CardDescription>
                        {applicationQuestions.length} questions for the initial application
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 sm:space-y-2">
                        {applicationQuestions.map((q, index) => {
                          const QuestionIcon = QUESTION_TYPE_ICONS[q.type] || HelpCircle;
                          return (
                            <div
                              key={q.id}
                              className="flex items-start sm:items-center justify-between p-4 rounded-xl bg-secondary/50 group border border-border/50 gap-3"
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                    onClick={() => moveQuestion(index, 'up')}
                                    disabled={index === 0}
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                    onClick={() => moveQuestion(index, 'down')}
                                    disabled={index === applicationQuestions.length - 1}
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <QuestionIcon className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{q.question}</div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {q.type}
                                    </Badge>
                                    {q.required && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        Required
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setEditingQuestion(q)}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => deleteQuestion(q.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  </div>

                  {/* SCREENING section */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60">Screening</span>
                    <Card className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <Clock className="h-4 w-4 text-amber-500" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Timed Quiz Questions</CardTitle>
                            <CardDescription>
                              {quizQuestions.length} questions • ~{Math.ceil(quizQuestions.reduce((acc, q) => acc + (q.time_limit_seconds || 0), 0) / 60)} min total
                            </CardDescription>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={addNewQuizQuestion}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add Question
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full space-y-3 sm:space-y-2">
                        {quizQuestions.map((q, index) => (
                          <AccordionItem key={q.id} value={q.id} className="border border-border/50 rounded-xl px-4 py-1 bg-secondary/30">
                            <AccordionTrigger className="hover:no-underline py-3">
                              <div className="flex items-center justify-between w-full pr-2 text-left">
                                <span className="text-sm font-medium">
                                  {index + 1}. {q.question.length > 55 ? `${q.question.substring(0, 55)}...` : q.question}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0 ml-3">
                                  {q.time_limit_seconds}s • {q.category}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pb-4 space-y-3">
                                <div className="text-sm text-muted-foreground">{q.question}</div>
                                {(q.type === 'personality' || q.type === 'situational') ? (
                                  <div className="space-y-2">
                                    <Badge variant="secondary" className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                                      Fit-based
                                    </Badge>
                                    {q.fit_context && (
                                      <p className="text-xs text-muted-foreground italic">{q.fit_context}</p>
                                    )}
                                    {q.options && (
                                      <div className="grid grid-cols-2 gap-2">
                                        {q.options.map((opt: string, i: number) => (
                                          <div key={i} className="p-3 rounded-lg text-sm bg-secondary/50 border border-border/50">
                                            {opt}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-xs text-muted-foreground">Preference-based — no correct answer. AVA evaluates role fit.</p>
                                  </div>
                                ) : q.type === 'multi_select' && q.correct_answers ? (
                                  <div className="space-y-2">
                                    <Badge variant="secondary" className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30">
                                      Multi-select
                                    </Badge>
                                    {q.options && (
                                      <div className="grid grid-cols-2 gap-2">
                                        {q.options.map((opt: string, i: number) => (
                                          <div
                                            key={i}
                                            className={cn(
                                              "p-3 rounded-lg text-sm flex items-center gap-2",
                                              q.correct_answers.includes(opt)
                                                ? "bg-green-500/20 border border-green-500/50 text-green-400"
                                                : "bg-secondary/50 border border-border/50"
                                            )}
                                          >
                                            {q.correct_answers.includes(opt) && (
                                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                                            )}
                                            {opt}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  q.options && (
                                    <div className="grid grid-cols-2 gap-2">
                                      {q.options.map((opt: string, i: number) => (
                                        <div
                                          key={i}
                                          className={cn(
                                            "p-3 rounded-lg text-sm flex items-center gap-2",
                                            opt === q.correct_answer
                                              ? "bg-green-500/20 border border-green-500/50 text-green-400"
                                              : "bg-secondary/50 border border-border/50"
                                          )}
                                        >
                                          {opt === q.correct_answer && (
                                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                                          )}
                                          {opt}
                                        </div>
                                      ))}
                                    </div>
                                  )
                                )}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingQuizQuestion(q)}
                                  >
                                    <Edit2 className="h-4 w-4 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => deleteQuizQuestion(q.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>

                  </div>

                  {/* ASSESSMENTS section */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60">Assessments</span>
                    <Card className="bg-card border-border">
                      <Collapsible defaultOpen={false}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                              <CardTitle className="text-lg">Additional Assessments</CardTitle>
                              <Badge variant="secondary" className="text-xs">{workflowSteps.length}</Badge>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </CollapsibleTrigger>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  size="sm" 
                                  className={cn(
                                    "gap-2 px-4",
                                    "bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500",
                                    "hover:from-violet-400 hover:via-purple-400 hover:to-fuchsia-400",
                                    "text-white font-semibold shadow-lg shadow-purple-500/25",
                                    "border-0"
                                  )}
                                >
                                  <Plus className="h-4 w-4" />
                                  Add Step
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-72 p-2 bg-card/95 backdrop-blur-md border-border/50">
                                <div className="space-y-1">
                                  {Object.entries(STEP_TYPE_INFO).map(([type, info]) => {
                                    const Icon = info.icon;
                                    const alreadyAdded = workflowSteps.some(s => s.type === type);
                                    const isVoiceInterview = type === 'voice_interview';
                                    return (
                                      <DropdownMenuItem
                                        key={type}
                                        onClick={() => addWorkflowStep(type)}
                                        disabled={alreadyAdded}
                                        className={cn(
                                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
                                          alreadyAdded 
                                            ? "opacity-50" 
                                            : isVoiceInterview
                                              ? "hover:bg-violet-500/10"
                                              : "hover:bg-primary/10"
                                        )}
                                      >
                                        <div className={cn(
                                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                          alreadyAdded 
                                            ? "bg-secondary" 
                                            : isVoiceInterview
                                              ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30"
                                              : "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
                                        )}>
                                          <Icon className={cn(
                                            "h-5 w-5", 
                                            alreadyAdded 
                                              ? "text-muted-foreground" 
                                              : isVoiceInterview 
                                                ? "text-white" 
                                                : "text-primary"
                                          )} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm flex items-center gap-2">
                                            {info.label}
                                            {isVoiceInterview && !alreadyAdded && (
                                              <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[10px] px-1.5 py-0 border-0 shadow-sm">
                                                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                                Premium
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground truncate">{info.description}</div>
                                        </div>
                                        {alreadyAdded && (
                                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-2">
                                            Added
                                          </Badge>
                                        )}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CollapsibleContent>
                          <CardContent className="space-y-4 pt-0">
                      {/* Phase warning banner */}
                      {workflowSteps.length >= PHASE_WARNING_THRESHOLD && !phaseWarningDismissed && (
                        <Alert className="border-amber-500/30 bg-amber-500/10">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <AlertTitle className="text-amber-200">You've added {workflowSteps.length} workflow steps</AlertTitle>
                          <AlertDescription className="text-amber-200/80">
                            <p className="mb-2">
                              Long application processes can lead to candidate drop-off. Consider keeping your workflow to 3-4 steps for the best completion rates.
                            </p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-4 w-4" />
                                <span>Est. candidate time: ~{getEstimatedCompletionTime(workflowSteps, quizQuestions.length)} minutes</span>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-amber-200 hover:text-amber-100 hover:bg-amber-500/20"
                                onClick={() => setPhaseWarningDismissed(true)}
                              >
                                Got it
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {workflowSteps.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No additional steps added yet.</p>
                          <p className="text-xs mt-1">Click "Add Step" to add workflow steps like Chat Simulation, Typing Test, etc.</p>
                        </div>
                      ) : (
                        <div className="space-y-4 sm:space-y-3">
                          {workflowSteps.map((step) => {
                            const stepInfo = STEP_TYPE_INFO[step.type as keyof typeof STEP_TYPE_INFO];
                            const Icon = stepInfo?.icon || FileText;
                            const isVoiceInterview = step.type === 'voice_interview';
                            return (
                              <div
                                key={step.id}
                                className={cn(
                                  "p-5 sm:p-4 rounded-xl border",
                                  isVoiceInterview 
                                    ? "border-violet-500/50 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]" 
                                    : step.type === 'typing_test'
                                      ? "border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent"
                                      : "border-border bg-secondary/30"
                                )}
                              >
                                <div className="flex items-start sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "h-10 w-10 rounded-lg flex items-center justify-center",
                                      isVoiceInterview 
                                        ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30" 
                                        : step.type === 'typing_test'
                                          ? "bg-amber-500/10"
                                          : "bg-primary/10"
                                    )}>
                                      <Icon className={cn("h-5 w-5", isVoiceInterview ? "text-white" : step.type === 'typing_test' ? "text-amber-500" : "text-primary")} />
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {step.title}
                                        {isVoiceInterview && (
                                          <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[10px] px-2 py-0.5 border-0 shadow-sm">
                                            <Sparkles className="h-3 w-3 mr-1" />
                                            Premium
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground">{step.description}</div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => deleteStep(step.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                {/* Embedded WPM slider for typing test phase */}
                                {step.type === 'typing_test' && (
                                  <div className="mt-4 pt-4 border-t border-amber-500/20 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Gauge className="h-4 w-4 text-amber-500" />
                                        <Label className="text-sm">Passing Speed</Label>
                                      </div>
                                      <motion.span 
                                        key={requiredWpm}
                                        initial={{ scale: 1.2 }}
                                        animate={{ scale: 1 }}
                                        className="text-lg font-bold text-amber-500"
                                      >
                                        {requiredWpm} WPM
                                      </motion.span>
                                    </div>
                                    <Slider
                                      value={[requiredWpm]}
                                      onValueChange={([value]) => setRequiredWpm(value)}
                                      min={20}
                                      max={80}
                                      step={5}
                                      className="w-full"
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                      <span>20</span>
                                      <span>35 (default)</span>
                                      <span>50</span>
                                      <span>80</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground/80">
                                      💡 Average office worker: ~40 WPM. Data entry: 50-60 WPM.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 5: Review */}
          {currentStep === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Review Your Job Posting</CardTitle>
                  <CardDescription>Review all details before publishing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold">{formData.title || "Untitled Position"}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.department && <Badge variant="outline">{formData.department}</Badge>}
                      {formData.location && <Badge variant="outline">{formData.location}</Badge>}
                      <Badge variant="outline">{formData.job_type}</Badge>
                      {formData.experience_level && <Badge variant="outline">{formData.experience_level}</Badge>}
                    </div>
                  </div>

                  <Separator />

                  {formData.description && (
                    <div>
                      <h4 className="font-semibold mb-2">Description</h4>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{formData.description}</p>
                    </div>
                  )}

                  {formData.responsibilities && (
                    <div>
                      <h4 className="font-semibold mb-2">Responsibilities</h4>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{formData.responsibilities}</p>
                    </div>
                  )}

                  {formData.requirements && (
                    <div>
                      <h4 className="font-semibold mb-2">Requirements</h4>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{formData.requirements}</p>
                    </div>
                  )}

                  {formData.skills_required && (
                    <div>
                      <h4 className="font-semibold mb-2">Required Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {formData.skills_required.split(",").map((skill, i) => (
                          <Badge key={i} className="bg-primary/10 text-primary">
                            {skill.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {(formData.salary_min || formData.salary_max || formData.salary_fixed) && (
                    <div>
                      <h4 className="font-semibold mb-2">Salary</h4>
                      <p className="text-muted-foreground">
                        {formData.salary_currency}{" "}
                        {formData.salary_type === "fixed" 
                          ? parseInt(formData.salary_fixed).toLocaleString()
                          : `${parseInt(formData.salary_min).toLocaleString()} - ${parseInt(formData.salary_max).toLocaleString()}`
                        }
                        {" "}/ {formData.salary_period}
                      </p>
                    </div>
                  )}

                  {formData.benefits && (
                    <div>
                      <h4 className="font-semibold mb-2">Benefits</h4>
                      <div className="flex flex-wrap gap-2">
                        {formData.benefits.split(",").map((benefit, i) => (
                          <Badge key={i} variant="outline">
                            {benefit.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Workflow Summary */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Hiring Workflow
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="text-2xl font-bold text-primary">{applicationQuestions.length}</div>
                        <div className="text-xs text-muted-foreground">Application Questions</div>
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="text-2xl font-bold text-primary">{quizQuestions.length}</div>
                        <div className="text-xs text-muted-foreground">Quiz Questions</div>
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="text-2xl font-bold text-primary">{workflowSteps.length}</div>
                        <div className="text-xs text-muted-foreground">Workflow Steps</div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Difficulty: <Badge variant="outline" className="ml-1">{workflowDifficulty}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleSubmit("draft")}
                disabled={isSubmitting}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                onClick={() => handleSubmit("published")}
                disabled={isSubmitting || !formData.title || !formData.description || !canCreateMoreJobs}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Publish Job
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Application Question Dialog */}
      <Dialog open={!!editingQuestion} onOpenChange={() => setEditingQuestion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          {editingQuestion && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Question Text</Label>
                <Input
                  value={editingQuestion.question}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, question: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editingQuestion.type}
                    onValueChange={(v) => setEditingQuestion({ ...editingQuestion, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="textarea">Long Text</SelectItem>
                      <SelectItem value="file">File Upload</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  {editingQuestion.type === "file" && (
                    <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="text-xs text-amber-400">
                          <p className="font-medium">Note: AVA will not score file uploads</p>
                          <p className="text-amber-400/70 mt-1">
                            Files uploaded here are for manual review only. Only the dedicated Resume field is analyzed and scored by AVA.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Required</Label>
                  <Select
                    value={editingQuestion.required ? "true" : "false"}
                    onValueChange={(v) => setEditingQuestion({ ...editingQuestion, required: v === "true" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Required</SelectItem>
                      <SelectItem value="false">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={editingQuestion.placeholder || ""}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, placeholder: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQuestion(null)}>Cancel</Button>
            <Button onClick={() => {
              if (editingQuestion) {
                setApplicationQuestions(prev => 
                  prev.map(q => q.id === editingQuestion.id ? editingQuestion : q)
                );
                setEditingQuestion(null);
              }
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quiz Question Dialog */}
      <Dialog open={!!editingQuizQuestion} onOpenChange={() => setEditingQuizQuestion(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              {quizQuestions.some(q => q.id === editingQuizQuestion?.id) ? "Edit" : "Add"} Quiz Question
            </DialogTitle>
          </DialogHeader>
          {editingQuizQuestion && (
            <div className="space-y-5">
              {/* Question Text */}
              <div className="space-y-2">
                <Label>Question</Label>
                <Textarea
                  value={editingQuizQuestion.question}
                  onChange={(e) => setEditingQuizQuestion({ ...editingQuizQuestion, question: e.target.value })}
                  placeholder="Enter your question here..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Category and Time Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={editingQuizQuestion.category}
                    onChange={(e) => setEditingQuizQuestion({ ...editingQuizQuestion, category: e.target.value })}
                    placeholder="e.g., Technical Skills"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    <span>Time Limit</span>
                    <span className="text-amber-500 font-bold">{editingQuizQuestion.time_limit_seconds}s</span>
                  </Label>
                  <Slider
                    value={[editingQuizQuestion.time_limit_seconds]}
                    onValueChange={([value]) => setEditingQuizQuestion({ ...editingQuizQuestion, time_limit_seconds: value })}
                    min={10}
                    max={120}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>10s</span>
                    <span>60s</span>
                    <span>120s</span>
                  </div>
                </div>
              </div>

              {/* Answer Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Answer Options (click to mark correct)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addQuizQuestionOption}
                    disabled={(editingQuizQuestion.options?.length || 0) >= 6}
                    className="gap-1 h-7"
                  >
                    <Plus className="h-3 w-3" />
                    Add Option
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {editingQuizQuestion.options?.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (option.trim()) {
                            setEditingQuizQuestion({ ...editingQuizQuestion, correct_answer: option });
                          }
                        }}
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-all border-2",
                          editingQuizQuestion.correct_answer === option && option.trim()
                            ? "bg-green-500/20 border-green-500 text-green-400"
                            : "bg-secondary/50 border-border hover:border-primary/50"
                        )}
                      >
                        {editingQuizQuestion.correct_answer === option && option.trim() ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <span className="text-xs font-medium">{String.fromCharCode(65 + index)}</span>
                        )}
                      </button>
                      <Input
                        value={option}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          const oldValue = option;
                          updateQuizQuestionOption(index, newValue);
                          // If this was the correct answer, update it
                          if (editingQuizQuestion.correct_answer === oldValue) {
                            setEditingQuizQuestion(prev => prev ? { ...prev, correct_answer: newValue, options: prev.options?.map((o, i) => i === index ? newValue : o) } : null);
                          }
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        className={cn(
                          "flex-1",
                          editingQuizQuestion.correct_answer === option && option.trim() && "border-green-500/50"
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuizQuestionOption(index)}
                        disabled={(editingQuizQuestion.options?.length || 0) <= 2}
                        className="text-destructive shrink-0 h-10 w-10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {editingQuizQuestion.correct_answer && (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Correct answer: {editingQuizQuestion.correct_answer}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQuizQuestion(null)}>Cancel</Button>
            <Button onClick={saveQuizQuestion}>
              {quizQuestions.some(q => q.id === editingQuizQuestion?.id) ? "Save Changes" : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dual Interview Confirmation Dialog */}
      <Dialog open={showDualInterviewConfirm} onOpenChange={setShowDualInterviewConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <Mic className="h-5 w-5 text-violet-500" />
              Multiple Ava Interviews
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              You're about to add <strong>{pendingInterviewType === 'voice_interview' ? 'Ava Voice Interview' : 'Chat Interview with Ava'}</strong> to your workflow.
            </p>
            <p className="text-sm text-muted-foreground">
              You already have <strong>{pendingInterviewType === 'voice_interview' ? 'a Chat Interview with Ava' : 'an Ava Voice Interview'}</strong> in your workflow.
            </p>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-400">
                <strong>Note:</strong> Having both interview types means candidates will go through:
              </p>
              <ul className="mt-2 text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Chat Interview with Ava (text-based) — runs before Voice Interview</li>
                <li>Ava Voice Interview (voice/video) — runs at the very end</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={confirmDualInterviewAdd}>
              Add Both Interviews
            </Button>
            <Button onClick={replaceWithNewInterview}>
              Replace Existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Premium AVA Generation Overlay */}
      <AvaWorkflowGenerationOverlay
        isVisible={isGeneratingWorkflow}
        jobTitle={formData.title || "your new role"}
        difficulty={workflowDifficulty}
        isApiComplete={workflowApiComplete}
        onComplete={handleWorkflowComplete}
      />

      {/* Job Published Success Dialog */}
      <JobPublishedDialog
        open={showPublishedDialog}
        onClose={() => {
          setShowPublishedDialog(false);
          navigate("/jobs");
        }}
        job={publishedJob}
      />
    </div>
  );
}
