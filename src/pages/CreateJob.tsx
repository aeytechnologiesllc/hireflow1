import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Users,
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
import AvaWorkflowGenerationOverlay from "@/components/AvaWorkflowGenerationOverlay";

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
  correct_answer: string;
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
  { id: "details", title: "Job Details", icon: Users },
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

export default function CreateJob() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const { role } = useAuth();
  const { data: profile } = useProfile();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const { data: existingJob, isLoading: isLoadingJob } = useJob(id);
  
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
    salary_type: "range" as "fixed" | "range",
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
      setWorkflowSteps(pendingWorkflowData.workflow_steps);
      setWorkflowGenerated(true);
      toast.success("Hiring workflow generated!");
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
        { id: "details", title: "Job Details", icon: Users },
        { id: "compensation", title: "Compensation", icon: DollarSign },
        { id: "workflow", title: "Workflow (View Only)", icon: Sparkles },
        { id: "review", title: "Review & Update", icon: Eye },
      ];
    }
    return WIZARD_STEPS;
  };

  const wizardSteps = getWizardSteps();

  return (
    <div className="space-y-6">
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
            <p className="text-muted-foreground mt-1">
              {isEditMode ? "Update your job posting" : "AI-powered job posting wizard"}
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
      <div className="flex items-center justify-between px-4 overflow-x-auto">
        {wizardSteps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          
          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <button
                onClick={() => setCurrentStep(index)}
                className={`flex items-center gap-2 p-2 rounded-xl transition-all ${
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
                <div className={`w-8 h-1 mx-1 rounded-full ${
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

                  <div className="grid grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-2 gap-4">
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
                    <Textarea
                      id="description"
                      placeholder="Describe the role, team, and what makes this opportunity exciting..."
                      className="bg-background min-h-[150px]"
                      value={formData.description}
                      onChange={(e) => handleChange("description", e.target.value)}
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
                    <Textarea
                      id="responsibilities"
                      placeholder="List the key responsibilities and day-to-day tasks..."
                      className="bg-background min-h-[120px]"
                      value={formData.responsibilities}
                      onChange={(e) => handleChange("responsibilities", e.target.value)}
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
                    <Textarea
                      id="requirements"
                      placeholder="List the required skills, experience, and qualifications..."
                      className="bg-background min-h-[120px]"
                      value={formData.requirements}
                      onChange={(e) => handleChange("requirements", e.target.value)}
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
                  <CardTitle className="text-lg">Compensation & Benefits</CardTitle>
                  <CardDescription>Salary range and perks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Salary Type Selection */}
                  <div className="space-y-3">
                    <Label>Salary Type</Label>
                    <RadioGroup
                      value={formData.salary_type}
                      onValueChange={(v) => {
                        // Preserve values when switching modes
                        if (v === "fixed" && !formData.salary_fixed && formData.salary_min) {
                          // Copy min salary to fixed when switching to fixed
                          setFormData(prev => ({ ...prev, salary_type: v as "fixed" | "range", salary_fixed: prev.salary_min }));
                        } else if (v === "range" && !formData.salary_min && formData.salary_fixed) {
                          // Copy fixed salary to min when switching to range
                          setFormData(prev => ({ ...prev, salary_type: v as "fixed" | "range", salary_min: prev.salary_fixed }));
                        } else {
                          handleChange("salary_type", v);
                        }
                      }}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fixed" id="salary-fixed" />
                        <Label htmlFor="salary-fixed" className="cursor-pointer font-normal">Fixed Salary</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="range" id="salary-range" />
                        <Label htmlFor="salary-range" className="cursor-pointer font-normal">Salary Range</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Currency and Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="salary_currency">Currency</Label>
                      <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={currencyOpen}
                            className="w-full justify-between bg-background"
                          >
                            {formData.salary_currency 
                              ? CURRENCIES.find(c => c.value === formData.salary_currency)?.label || formData.salary_currency
                              : "Select currency"}
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
                      <Label htmlFor="salary_period">Pay Period</Label>
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

                  {/* Salary Amount(s) */}
                  {formData.salary_type === "fixed" ? (
                    <div className="space-y-2">
                      <Label htmlFor="salary_fixed">Salary Amount</Label>
                      <Input
                        id="salary_fixed"
                        type="text"
                        inputMode="numeric"
                        placeholder="75,000"
                        className="bg-background"
                        value={formData.salary_fixed ? parseInt(formData.salary_fixed).toLocaleString() : ""}
                        onChange={(e) => handleChange("salary_fixed", e.target.value.replace(/\D/g, ""))}
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.salary_currency} {formData.salary_period}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="salary_min">Minimum Salary</Label>
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
                        <Label htmlFor="salary_max">Maximum Salary</Label>
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
                      <p className="col-span-2 text-xs text-muted-foreground">
                        {formData.salary_currency} {formData.salary_period}
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="benefits">Benefits</Label>
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
                    <Input
                      id="benefits"
                      placeholder="Health insurance, 401k, Remote work, Unlimited PTO..."
                      className="bg-background"
                      value={formData.benefits}
                      onChange={(e) => handleChange("benefits", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Separate benefits with commas</p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Application Deadline</Label>
                    <Popover>
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
                          onSelect={(date) => handleChange("application_deadline", date || null)}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
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
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        AI Hiring Workflow
                      </CardTitle>
                      <CardDescription>
                        Select screening difficulty and generate a complete hiring workflow
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <Label>Screening Difficulty</Label>
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
                                  "p-4 rounded-xl border-2 transition-all text-left",
                                  isSelected
                                    ? `${option.borderColor} ${option.bgColor} shadow-lg ${option.shadowColor}`
                                    : "border-border bg-card hover:border-muted-foreground/30"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <Icon className={cn("h-5 w-5", option.color)} />
                                  <div>
                                    <div className="font-semibold">{option.label}</div>
                                    <div className="text-xs text-muted-foreground">{option.description}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <Separator />

                      {/* Processing Mode Selection */}
                      <div className="space-y-4">
                        <Label>Processing Mode</Label>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Auto-Pilot Button - Featured with purple gradient */}
                          <motion.button
                            onClick={() => setProcessingMode("auto")}
                            className={cn(
                              "relative p-4 rounded-xl transition-all text-left overflow-hidden",
                              processingMode === "auto"
                                ? "bg-gradient-to-br from-fuchsia-950/80 via-purple-900/60 to-fuchsia-950/80"
                                : "bg-card border border-border hover:border-purple-500/30"
                            )}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            animate={processingMode === "auto" ? {
                              boxShadow: [
                                "0 0 20px -5px rgba(168, 85, 247, 0.3), inset 0 1px 0 0 rgba(255,255,255,0.1)",
                                "0 0 35px -5px rgba(168, 85, 247, 0.5), inset 0 1px 0 0 rgba(255,255,255,0.1)",
                                "0 0 20px -5px rgba(168, 85, 247, 0.3), inset 0 1px 0 0 rgba(255,255,255,0.1)"
                              ]
                            } : {}}
                            transition={processingMode === "auto" ? {
                              duration: 2,
                              repeat: Infinity,
                              ease: "easeInOut"
                            } : {}}
                          >
                            {/* Pulsing border glow */}
                            {processingMode === "auto" && (
                              <motion.div
                                className="absolute inset-0 rounded-xl border-2 border-purple-500/70 pointer-events-none"
                                animate={{ 
                                  opacity: [0.6, 1, 0.6],
                                }}
                                transition={{ 
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "easeInOut"
                                }}
                              />
                            )}
                            <div className="relative flex items-center gap-3">
                              <div className={cn(
                                "p-2.5 rounded-lg",
                                processingMode === "auto" 
                                  ? "bg-gradient-to-br from-fuchsia-500 to-purple-600" 
                                  : "bg-muted"
                              )}>
                                <Zap className={cn(
                                  "h-5 w-5",
                                  processingMode === "auto" ? "text-white" : "text-muted-foreground"
                                )} />
                              </div>
                              <div>
                                <div className={cn(
                                  "font-semibold flex items-center gap-2",
                                  processingMode === "auto" && "text-white"
                                )}>
                                  Auto-Pilot
                                  {processingMode === "auto" && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/30 text-primary-foreground border border-primary/50">
                                      ✓
                                    </Badge>
                                  )}
                                </div>
                                <div className={cn(
                                  "text-xs",
                                  processingMode === "auto" ? "text-purple-200/80" : "text-muted-foreground"
                                )}>
                                  AVA auto-screens candidates
                                </div>
                              </div>
                            </div>
                          </motion.button>

                          {/* Manual Review Button - Green highlight */}
                          <motion.button
                            onClick={() => setProcessingMode("manual")}
                            className={cn(
                              "relative p-4 rounded-xl transition-all text-left overflow-hidden",
                              processingMode === "manual"
                                ? "bg-gradient-to-br from-emerald-950/80 via-green-900/60 to-emerald-950/80"
                                : "bg-card/50 border border-border hover:border-emerald-500/30"
                            )}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            animate={processingMode === "manual" ? {
                              boxShadow: [
                                "0 0 15px -5px rgba(16, 185, 129, 0.2), inset 0 1px 0 0 rgba(255,255,255,0.1)",
                                "0 0 25px -5px rgba(16, 185, 129, 0.4), inset 0 1px 0 0 rgba(255,255,255,0.1)",
                                "0 0 15px -5px rgba(16, 185, 129, 0.2), inset 0 1px 0 0 rgba(255,255,255,0.1)"
                              ]
                            } : {}}
                            transition={processingMode === "manual" ? {
                              duration: 2.5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            } : {}}
                          >
                            {/* Pulsing border glow for manual */}
                            {processingMode === "manual" && (
                              <motion.div
                                className="absolute inset-0 rounded-xl border-2 border-emerald-500/60 pointer-events-none"
                                animate={{ 
                                  opacity: [0.5, 0.8, 0.5],
                                }}
                                transition={{ 
                                  duration: 2.5,
                                  repeat: Infinity,
                                  ease: "easeInOut"
                                }}
                              />
                            )}
                            <div className="relative flex items-center gap-3">
                              <div className={cn(
                                "p-2.5 rounded-lg",
                                processingMode === "manual" 
                                  ? "bg-emerald-600" 
                                  : "bg-muted/50"
                              )}>
                                <Hand className={cn(
                                  "h-5 w-5",
                                  processingMode === "manual" ? "text-white" : "text-muted-foreground"
                                )} />
                              </div>
                              <div>
                                <div className={cn(
                                  "font-semibold flex items-center gap-2",
                                  processingMode === "manual" && "text-white"
                                )}>
                                  Manual Review
                                  {processingMode === "manual" && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/30 text-emerald-200 border border-emerald-400/50">
                                      ✓
                                    </Badge>
                                  )}
                                </div>
                                <div className={cn(
                                  "text-xs",
                                  processingMode === "manual" ? "text-emerald-200/80" : "text-muted-foreground"
                                )}>
                                  You review each phase progression
                                </div>
                              </div>
                            </div>
                          </motion.button>
                        </div>

                        {/* Passing Score - Only visible in Auto mode */}
                        <AnimatePresence>
                          {processingMode === "auto" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <Label>Passing Score</Label>
                                    <p className="text-xs text-muted-foreground">
                                      Minimum Ava score to auto-advance candidates
                                    </p>
                                  </div>
                                  <motion.div 
                                    key={passingScore}
                                    initial={{ scale: 1.3, color: "hsl(var(--primary))" }}
                                    animate={{ scale: 1 }}
                                    className="text-2xl font-bold text-primary"
                                  >
                                    {passingScore}%
                                  </motion.div>
                                </div>
                                <Slider
                                  value={[passingScore]}
                                  onValueChange={([value]) => setPassingScore(value)}
                                  min={30}
                                  max={95}
                                  step={5}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Lenient (30%)</span>
                                  <span>Strict (95%)</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Generate with AVA Button - Pink/Purple gradient */}
                      <div className="flex justify-end">
                        <motion.div
                          className="relative"
                          animate={{
                            boxShadow: [
                              "0 0 20px -5px rgba(217, 70, 239, 0.4)",
                              "0 0 35px -5px rgba(217, 70, 239, 0.6)",
                              "0 0 20px -5px rgba(217, 70, 239, 0.4)"
                            ]
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          style={{ borderRadius: "0.5rem" }}
                        >
                          <Button
                            onClick={generateWorkflow}
                            disabled={isGeneratingWorkflow}
                            className={cn(
                              "gap-2 px-6 relative overflow-hidden",
                              "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
                              "hover:from-purple-400 hover:via-fuchsia-400 hover:to-pink-400",
                              "text-white font-semibold",
                              "border-0"
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
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Generated Workflow - Only show in create mode */}
              {!isEditMode && workflowGenerated && (
                <>
                  {/* Application Questions */}
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
                      <div className="space-y-2">
                        {applicationQuestions.map((q, index) => {
                          const QuestionIcon = QUESTION_TYPE_ICONS[q.type] || HelpCircle;
                          return (
                            <div
                              key={q.id}
                              className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 group border border-border/50"
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

                  {/* Quiz Questions */}
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Timed Quiz Questions</CardTitle>
                          <CardDescription>
                            {quizQuestions.length} questions • Candidates answer under time pressure
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full space-y-2">
                        {quizQuestions.map((q, index) => (
                          <AccordionItem key={q.id} value={q.id} className="border border-border/50 rounded-lg px-4 bg-secondary/30">
                            <AccordionTrigger className="hover:no-underline py-4">
                              <div className="flex items-center gap-4 text-left">
                                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold text-amber-400">{q.time_limit_seconds}s</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium">
                                    {index + 1}. {q.question.length > 60 ? `${q.question.substring(0, 60)}...` : q.question}
                                  </span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {q.category}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pb-4 space-y-3">
                                <div className="text-sm text-muted-foreground">{q.question}</div>
                                {q.options && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {q.options.map((opt, i) => (
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
                                )}
                                <div className="flex items-center justify-end pt-2">
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

                  {/* Workflow Steps */}
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Additional Workflow Steps</CardTitle>
                          <CardDescription>
                            {workflowSteps.length} additional evaluation steps
                          </CardDescription>
                        </div>
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
                    <CardContent>
                      {workflowSteps.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No additional steps added yet.</p>
                          <p className="text-xs mt-1">Click "Add Step" to add workflow steps like Chat Simulation, Typing Test, etc.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {workflowSteps.map((step) => {
                            const stepInfo = STEP_TYPE_INFO[step.type as keyof typeof STEP_TYPE_INFO];
                            const Icon = stepInfo?.icon || FileText;
                            const isVoiceInterview = step.type === 'voice_interview';
                            return (
                              <div
                                key={step.id}
                                className={cn(
                                  "p-4 rounded-lg border",
                                  isVoiceInterview 
                                    ? "border-violet-500/50 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]" 
                                    : "border-border bg-secondary/30"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "h-10 w-10 rounded-lg flex items-center justify-center",
                                      isVoiceInterview 
                                        ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30" 
                                        : "bg-primary/10"
                                    )}>
                                      <Icon className={cn("h-5 w-5", isVoiceInterview ? "text-white" : "text-primary")} />
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
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
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
                    <div className="grid grid-cols-3 gap-4 text-center">
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
                disabled={isSubmitting || !formData.title || !formData.description}
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

      {/* Edit Question Dialog */}
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
            <Button variant="outline" onClick={() => {
              setShowDualInterviewConfirm(false);
              setPendingInterviewType(null);
            }}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={replaceWithNewInterview}>
              Replace Existing
            </Button>
            <Button onClick={confirmDualInterviewAdd}>
              Add Both Interviews
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
