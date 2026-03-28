import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  normalizeCommaSeparatedText,
  normalizeGeneratedDraftText,
  normalizeTextBlock,
} from "@/lib/avaDraftFormatting";
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
  CalendarIcon,
  Sparkles,
  Zap,
  Target,
  Flame,
  Gauge,
  Clock,
  HelpCircle,
  Check,
  ChevronsUpDown,
  Hand,
  Bot,
  Keyboard,
  Video,
  MessageSquare,
  Upload,
  Mic,
  Plus,
  Trash2,
  Edit2
} from "lucide-react";
import { toast } from "sonner";
import hireflowLogo from "@/assets/hireflow-logo.png";
import PublishSignupModal from "@/components/PublishSignupModal";
import AvaWorkflowGenerationOverlay from "@/components/AvaWorkflowGenerationOverlay";
import { StaggeredBarsLoader } from "@/components/animations/StaggeredBarsLoader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { AvaGuidedSetupFields } from "@/components/AvaGuidedSetupFields";
import { generateFullJobPosting, generateJobField, generateScreeningPlan, type AvaJobFormData } from "@/lib/avaJobGeneration";
import { DEFAULT_GUIDED_JOB_SETUP, assessScreeningPlanRisk, summarizeScreeningPlan, type GuidedJobSetup } from "@/lib/hiringPlan";

interface GuestJobData {
  formData: AvaJobFormData;
  applicationQuestions: any[];
  quizQuestions: any[];
  workflowSteps: any[];
  workflowDifficulty: string;
  processingMode: string;
  passingScore: number;
  createdAt: number;
}

const parseCommaSeparatedList = (value: unknown): string[] =>
  normalizeCommaSeparatedText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// Step type info for workflow steps
const STEP_TYPE_INFO: Record<string, { icon: React.ElementType; label: string; description: string; hasConfig?: boolean }> = {
  typing_test: { icon: Keyboard, label: "Typing Test", description: "Test typing speed and accuracy" },
  video_message: { icon: Video, label: "Video Message", description: "Record a video introduction" },
  chat_simulation: { icon: MessageSquare, label: "Chat Simulation", description: "Customer support roleplay" },
  sales_simulation: { icon: Bot, label: "Sales Conversation", description: "Sales pitch roleplay" },
  portfolio_upload: { icon: Upload, label: "Portfolio Upload", description: "Submit work samples" },
  chat_interview: { icon: MessageSquare, label: "Interview with Ava", description: "Text-based AI interview" },
  voice_interview: { icon: Mic, label: "Ava Interview", description: "Premium voice interview (after Review)", hasConfig: true },
};

const WIZARD_STEPS = [
  { id: "basic", title: "Ava Setup", icon: FileText },
  { id: "details", title: "Job Draft", icon: Users },
  { id: "compensation", title: "Pay & Timeline", icon: DollarSign },
  { id: "workflow", title: "Screening Plan", icon: Sparkles },
  { id: "review", title: "Review & Publish", icon: Eye },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", description: "Quick screening (8-10 quiz questions)", icon: Zap, color: "text-green-500", borderColor: "border-green-500", bgColor: "bg-green-500/10", shadowColor: "shadow-green-500/20" },
  { value: "medium", label: "Medium", description: "Balanced evaluation (12-15 quiz questions)", icon: Target, color: "text-emerald-400", borderColor: "border-emerald-400", bgColor: "bg-emerald-400/10", shadowColor: "shadow-emerald-400/20" },
  { value: "hard", label: "Hard", description: "Intensive screening (18-25 quiz questions)", icon: Flame, color: "text-orange-500", borderColor: "border-orange-500", bgColor: "bg-orange-500/10", shadowColor: "shadow-orange-500/20" },
  { value: "intense", label: "Intense", description: "Maximum rigor (25-30 quiz questions)", icon: Gauge, color: "text-red-500", borderColor: "border-red-500", bgColor: "bg-red-500/10", shadowColor: "shadow-red-500/20" },
];

const CURRENCIES = [
  { value: "USD", label: "USD ($) - US Dollar" },
  { value: "EUR", label: "EUR (€) - Euro" },
  { value: "GBP", label: "GBP (£) - British Pound" },
  { value: "CAD", label: "CAD ($) - Canadian Dollar" },
  { value: "AUD", label: "AUD ($) - Australian Dollar" },
  { value: "INR", label: "INR (₹) - Indian Rupee" },
  { value: "PKR", label: "PKR (₨) - Pakistani Rupee" },
  { value: "AED", label: "AED (د.إ) - UAE Dirham" },
  { value: "SAR", label: "SAR (﷼) - Saudi Riyal" },
  { value: "JPY", label: "JPY (¥) - Japanese Yen" },
  { value: "CNY", label: "CNY (¥) - Chinese Yuan" },
  { value: "SGD", label: "SGD ($) - Singapore Dollar" },
  { value: "BRL", label: "BRL (R$) - Brazilian Real" },
  { value: "MXN", label: "MXN ($) - Mexican Peso" },
  { value: "ZAR", label: "ZAR (R) - South African Rand" },
];

export default function GuestJobCreator() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<AvaJobFormData>({
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
    ...DEFAULT_GUIDED_JOB_SETUP,
  });

  // Workflow state
  const [workflowDifficulty, setWorkflowDifficulty] = useState<string>("medium");
  const [processingMode, setProcessingMode] = useState<"auto" | "manual">("auto");
  const [passingScore, setPassingScore] = useState<number>(60);
  const [applicationQuestions, setApplicationQuestions] = useState<any[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [workflowApiComplete, setWorkflowApiComplete] = useState(false);
  const [pendingWorkflowData, setPendingWorkflowData] = useState<{
    application_questions: any[];
    quiz_questions: any[];
    workflow_steps: any[];
  } | null>(null);
  const [workflowGenerated, setWorkflowGenerated] = useState(false);
  const [jobContentGenerated, setJobContentGenerated] = useState(false);
  
  // Phase warning dismissed state
  const [phaseWarningDismissed, setPhaseWarningDismissed] = useState(false);

  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [generationOverlayMode, setGenerationOverlayMode] = useState<"workflow" | "full_draft">("workflow");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  // If user is already logged in, redirect to full creator
  useEffect(() => {
    if (user && !authLoading) {
      const hasGuestDraft = typeof window !== "undefined" && Boolean(window.localStorage.getItem("guestJobData"));
      if (hasGuestDraft) {
        return;
      }
      navigate("/jobs/create");
    }
  }, [user, authLoading, navigate]);

  const handleChange = (field: string, value: string | boolean | Date | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleGuidedSetupChange = <K extends keyof GuidedJobSetup>(field: K, value: GuidedJobSetup[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getBaselineBadge = (value: unknown, isListField = false) => {
    const hasValue = isListField
      ? normalizeCommaSeparatedText(value).length > 0
      : normalizeTextBlock(value).length > 0;

    if (isGenerating === "full" || (isGeneratingWorkflow && generationOverlayMode === "full_draft")) {
      return <Badge variant="outline" className="border-primary/30 text-primary">Generating baseline</Badge>;
    }

    if (hasValue && jobContentGenerated) {
      return <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">Ava baseline</Badge>;
    }

    return <Badge variant="outline" className="border-border text-muted-foreground">Baseline pending</Badge>;
  };

  const applyGeneratedJobContent = (baseFormData: AvaJobFormData, data: {
    description?: string;
    responsibilities?: string;
    requirements?: string;
    skills?: string;
    benefits?: string;
  }) => {
    const nextFormData: AvaJobFormData = {
      ...baseFormData,
      description: normalizeGeneratedDraftText("description", data.description) || baseFormData.description,
      responsibilities: normalizeGeneratedDraftText("responsibilities", data.responsibilities) || baseFormData.responsibilities,
      requirements: normalizeGeneratedDraftText("requirements", data.requirements) || baseFormData.requirements,
      skills_required: normalizeGeneratedDraftText("skills_required", data.skills) || baseFormData.skills_required,
      benefits: normalizeGeneratedDraftText("benefits", data.benefits) || baseFormData.benefits,
    };

    setFormData(nextFormData);
    setJobContentGenerated(true);
    return nextFormData;
  };

  // Delete functions
  const deleteQuestion = (id: string) => {
    setApplicationQuestions(prev => prev.filter(q => q.id !== id));
  };

  const deleteQuizQuestion = (id: string) => {
    setQuizQuestions(prev => prev.filter(q => q.id !== id));
  };

  const deleteStep = (id: string) => {
    setWorkflowSteps(prev => prev.filter(s => s.id !== id));
  };

  // Add workflow step
  const addWorkflowStep = (type: string) => {
    const stepInfo = STEP_TYPE_INFO[type as keyof typeof STEP_TYPE_INFO];
    if (!stepInfo) return;
    
    const config: Record<string, unknown> = type === 'voice_interview' 
      ? { language: 'en', language_name: 'English', language_enforcement: 'flexible' }
      : {};
    
    const newStep = {
      id: `step_${Date.now()}`,
      type,
      title: stepInfo.label,
      description: stepInfo.description,
      required: true,
      config
    };
    
    // Ordering: regular steps → chat_interview → voice_interview (always last)
    setWorkflowSteps(prev => {
      const regularSteps = prev.filter(s => s.type !== 'chat_interview' && s.type !== 'voice_interview');
      const existingChatInterview = prev.find(s => s.type === 'chat_interview');
      const existingVoiceInterview = prev.find(s => s.type === 'voice_interview');
      
      const newRegularSteps = [...regularSteps];
      let chatInterview = existingChatInterview;
      let voiceInterview = existingVoiceInterview;
      
      if (type === 'voice_interview') {
        voiceInterview = newStep;
      } else if (type === 'chat_interview') {
        chatInterview = newStep;
      } else {
        newRegularSteps.push(newStep);
      }
      
      const result: any[] = [...newRegularSteps];
      if (chatInterview) result.push(chatInterview);
      if (voiceInterview) result.push(voiceInterview);
      
      return result;
    });
    toast.success(`${stepInfo.label} added to workflow`);
  };

  const generateField = async (field: string) => {
    if (!formData.title && field !== "title") {
      toast.error("Please enter a job title first");
      return;
    }

    setIsGenerating(field);
    try {
      const data = await generateJobField(formData, field);
      const nextValue =
        field === "description" ||
        field === "responsibilities" ||
        field === "requirements" ||
        field === "skills_required" ||
        field === "benefits"
          ? normalizeGeneratedDraftText(field, data.content)
          : data.content;
      handleChange(field, nextValue);
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ')} generated!`);
    } catch (error) {
      console.error("Error generating content:", error);
      toast.error("Failed to generate content");
    } finally {
      setIsGenerating(null);
    }
  };

  const generateFullJob = async ({ suppressSuccessToast = false }: { suppressSuccessToast?: boolean } = {}) => {
    if (!formData.title) {
      toast.error("Please enter a job title first");
      return null;
    }

    setIsGenerating("full");
    try {
      const data = await generateFullJobPosting(formData);
      const nextFormData = applyGeneratedJobContent(formData, data);
      if (!suppressSuccessToast) {
        toast.success("Ava built the job draft.");
      }
      return nextFormData;
    } catch (error) {
      console.error("Error generating job:", error);
      toast.error("Failed to generate job posting");
      return null;
    } finally {
      setIsGenerating(null);
    }
  };

  const generateWorkflow = async (sourceFormData: AvaJobFormData = formData) => {
    if (!sourceFormData.title || !sourceFormData.description) {
      toast.error("Please fill in job title and description first");
      return;
    }

    setGenerationOverlayMode("workflow");
    setIsGeneratingWorkflow(true);
    setWorkflowApiComplete(false);
    
    try {
      const data = await generateScreeningPlan(sourceFormData, workflowDifficulty);

      // Store the data and mark API as complete - let overlay animation finish
      setPendingWorkflowData({
        application_questions: data.application_questions || [],
        quiz_questions: data.quiz_questions || [],
        workflow_steps: data.workflow_steps || [],
      });
      setWorkflowApiComplete(true);
    } catch (error) {
      console.error("Error generating workflow:", error);
      toast.error("Failed to generate workflow. Please try again.");
      setIsGeneratingWorkflow(false);
    }
  };

  const generateAvaBlueprint = async () => {
    setGenerationOverlayMode("full_draft");
    setIsGeneratingWorkflow(true);
    setWorkflowApiComplete(false);
    setPendingWorkflowData(null);

    const nextFormData = await generateFullJob({ suppressSuccessToast: true });
    if (!nextFormData) {
      setIsGeneratingWorkflow(false);
      setWorkflowApiComplete(false);
      return;
    }

    try {
      const data = await generateScreeningPlan(nextFormData, workflowDifficulty);

      setPendingWorkflowData({
        application_questions: data.application_questions || [],
        quiz_questions: data.quiz_questions || [],
        workflow_steps: data.workflow_steps || [],
      });
      setWorkflowApiComplete(true);
    } catch (error) {
      console.error("Error generating full Ava blueprint:", error);
      toast.error("Ava couldn't finish the full draft. Please try again.");
      setIsGeneratingWorkflow(false);
      setWorkflowApiComplete(false);
    }
  };

  const handleWorkflowComplete = () => {
    // Apply the pending workflow data
    if (pendingWorkflowData) {
      setApplicationQuestions(pendingWorkflowData.application_questions);
      setQuizQuestions(pendingWorkflowData.quiz_questions);
      setWorkflowSteps(pendingWorkflowData.workflow_steps);
      setWorkflowGenerated(true);
      setPhaseWarningDismissed(false);
      setCurrentStep(4);
      setPendingWorkflowData(null);
      toast.success("Ava built the screening plan!");
    }
    setIsGeneratingWorkflow(false);
    setWorkflowApiComplete(false);
  };

  const handlePublish = () => {
    if (!jobContentGenerated || !workflowGenerated) {
      toast.error("Generate the Ava draft and screening plan first");
      return;
    }

    // Save to localStorage
    const guestJobData: GuestJobData = {
      formData,
      applicationQuestions,
      quizQuestions,
      workflowSteps,
      workflowDifficulty,
      processingMode,
      passingScore,
      createdAt: Date.now(),
    };
    localStorage.setItem("guestJobData", JSON.stringify(guestJobData));
    setShowSignupModal(true);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!formData.title;
      case 1:
        return !!formData.description;
      case 2:
        return true;
      case 3:
        return workflowGenerated;
      case 4:
        return !!formData.title && !!formData.description && workflowGenerated && jobContentGenerated;
      default:
        return true;
    }
  };

  const screeningPlanOverview = summarizeScreeningPlan({
    applicationQuestions,
    quizQuestions,
    workflowSteps,
    requireResume: true,
  });
  const screeningPlanRisk = assessScreeningPlanRisk({
    applicationQuestions,
    quizQuestions,
    workflowSteps,
    requireResume: true,
  });
  const screeningRiskAlertStyles = {
    good: {
      alert: "border-emerald-500/30 bg-emerald-500/10",
      title: "text-emerald-200",
      text: "text-emerald-200/80",
      button: "text-emerald-100 hover:text-white hover:bg-emerald-500/20",
    },
    caution: {
      alert: "border-amber-500/30 bg-amber-500/10",
      title: "text-amber-200",
      text: "text-amber-200/80",
      button: "text-amber-100 hover:text-white hover:bg-amber-500/20",
    },
    long: {
      alert: "border-amber-500/30 bg-amber-500/10",
      title: "text-amber-200",
      text: "text-amber-200/80",
      button: "text-amber-100 hover:text-white hover:bg-amber-500/20",
    },
    very_long: {
      alert: "border-rose-500/30 bg-rose-500/10",
      title: "text-rose-200",
      text: "text-rose-200/80",
      button: "text-rose-100 hover:text-white hover:bg-rose-500/20",
    },
  } as const;
  const currentRiskStyles = screeningRiskAlertStyles[screeningPlanRisk.level];

  if (authLoading) {
    return (
      <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white flex items-center justify-center">
        <StaggeredBarsLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,18%,10%)]/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={hireflowLogo} alt="HireFlow" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-xl font-bold text-foreground">HireFlow</span>
          </Link>
          <Link to="/auth">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
              Sign In
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Create New Job</h2>
                <p className="text-muted-foreground mt-1">Start with Ava, then review the full draft before you publish.</p>
              </div>
            </div>
            
            {currentStep < 3 && (
              <Button 
                onClick={generateAvaBlueprint}
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
                    Generate Full Draft
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Progress Steps - Matches CreateJob exactly */}
          <div className="flex items-center justify-between px-4 overflow-x-auto">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              
              return (
                <div key={step.id} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    disabled={index > currentStep}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-xl transition-all",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : isCompleted 
                        ? "text-primary cursor-pointer"
                        : "text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary"
                    )}>
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="font-medium hidden lg:block text-sm">{step.title}</span>
                  </button>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={cn(
                      "w-8 h-1 mx-1 rounded-full",
                      isCompleted ? "bg-primary" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {/* Step 0: Basic Info */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Ava Setup</CardTitle>
                  <CardDescription>Share the essentials, then let Ava build the role and screening plan for you</CardDescription>
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
                            <SelectItem value="lead">Lead / Manager</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <AvaGuidedSetupFields
                      value={{
                        job_family: formData.job_family,
                        urgency: formData.urgency,
                        must_haves: formData.must_haves,
                        deal_breakers: formData.deal_breakers,
                        certifications: formData.certifications,
                        schedule_details: formData.schedule_details,
                        language_requirements: formData.language_requirements,
                        work_authorization: formData.work_authorization,
                        travel_requirement: formData.travel_requirement,
                        compensation_guidance: formData.compensation_guidance,
                        portfolio_preference: formData.portfolio_preference,
                        customer_facing: formData.customer_facing,
                      }}
                      onChange={handleGuidedSetupChange}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 1: Job Details */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Job Draft</CardTitle>
                  <CardDescription>Ava writes the first draft for you. Review it, polish it, and change anything you want.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!jobContentGenerated && (
                    <Alert className="border-primary/20 bg-primary/5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <AlertTitle>Ava will generate the baseline</AlertTitle>
                      <AlertDescription>
                        Description, responsibilities, requirements, skills, and benefits are meant to start from Ava. Generate the full draft, then edit the baseline instead of writing from scratch.
                      </AlertDescription>
                    </Alert>
                  )}
                  {jobContentGenerated && (
                    <Alert className="border-emerald-500/20 bg-emerald-500/5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <AlertTitle>Ava baseline ready</AlertTitle>
                      <AlertDescription>
                        Ava generated the first draft from your setup answers. Use this page to tighten wording, clarify expectations, and make any final changes.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="description">Description *</Label>
                          {getBaselineBadge(formData.description)}
                        </div>
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
                        className="bg-background min-h-[120px]"
                        value={formData.description}
                        onChange={(e) => handleChange("description", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="responsibilities">Responsibilities</Label>
                          {getBaselineBadge(formData.responsibilities)}
                        </div>
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
                        <div className="flex items-center gap-2">
                          <Label htmlFor="requirements">Requirements</Label>
                          {getBaselineBadge(formData.requirements)}
                        </div>
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
                        <div className="flex items-center gap-2">
                          <Label htmlFor="skills">Required Skills</Label>
                          {getBaselineBadge(formData.skills_required, true)}
                        </div>
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

            {/* Step 2: Compensation */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-lg">Pay & Timeline</CardTitle>
                    <CardDescription>Set compensation and timing, then refine the Ava-generated benefits baseline if you want.</CardDescription>
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
                            setFormData(prev => ({ ...prev, salary_type: v as "fixed" | "range", salary_fixed: prev.salary_min }));
                          } else if (v === "range" && !formData.salary_min && formData.salary_fixed) {
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
                          value={formData.salary_fixed ? Number(formData.salary_fixed).toLocaleString() : ""}
                          onChange={(e) => {
                            const rawValue = e.target.value.replace(/[^0-9]/g, "");
                            handleChange("salary_fixed", rawValue);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          {formData.salary_currency} {formData.salary_fixed && Number(formData.salary_fixed).toLocaleString()} {formData.salary_period}
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
                            value={formData.salary_min ? Number(formData.salary_min).toLocaleString() : ""}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/[^0-9]/g, "");
                              handleChange("salary_min", rawValue);
                            }}
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
                            value={formData.salary_max ? Number(formData.salary_max).toLocaleString() : ""}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/[^0-9]/g, "");
                              handleChange("salary_max", rawValue);
                            }}
                          />
                        </div>
                        <p className="col-span-2 text-xs text-muted-foreground">
                          {formData.salary_currency} {formData.salary_min && Number(formData.salary_min).toLocaleString()}{formData.salary_min && formData.salary_max && " – "}{formData.salary_max && Number(formData.salary_max).toLocaleString()} {formData.salary_period}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="benefits">Benefits</Label>
                          {getBaselineBadge(formData.benefits, true)}
                        </div>
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

            {/* Step 3: Workflow */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Ava Screening Plan
                    </CardTitle>
                    <CardDescription>
                      Set the rigor level Ava should use, then generate the full screening plan
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
                                <div className={cn(
                                  "w-10 h-10 rounded-lg flex items-center justify-center",
                                  isSelected ? option.bgColor : "bg-secondary"
                                )}>
                                  <Icon className={cn("h-5 w-5", option.color)} />
                                </div>
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

                    {/* Processing Mode */}
                    <div className="space-y-3">
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

                    {/* Generate Screening Plan Button */}
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
                          onClick={() => generateWorkflow()}
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
                              <span>Generate Screening Plan</span>
                            </>
                          )}
                        </Button>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>

                {/* Generated Workflow Display */}
                {workflowGenerated && (
                  <>
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Candidate experience snapshot</CardTitle>
                        <CardDescription>{screeningPlanOverview.summary}</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-border bg-secondary/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated time</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">~{screeningPlanOverview.estimatedMinutes} min</p>
                        </div>
                        <div className="rounded-lg border border-border bg-secondary/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Phase count</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{screeningPlanOverview.phaseCount}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-secondary/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Required materials</p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {screeningPlanOverview.requiredMaterials.length > 0
                              ? screeningPlanOverview.requiredMaterials.join(", ")
                              : "None beyond the application"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Application Questions */}
                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-lg">Application Questions</CardTitle>
                        <CardDescription>
                          {applicationQuestions.length} questions for the initial application
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {applicationQuestions.map((q) => (
                            <div
                              key={q.id}
                              className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 group border border-border/50"
                            >
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <HelpCircle className="h-5 w-5 text-primary" />
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
                          ))}
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
                      <CardContent className="space-y-4">
                        {/* Candidate friction banner */}
                        {screeningPlanRisk.level !== "good" && !phaseWarningDismissed && (
                          <Alert className={currentRiskStyles.alert}>
                            <AlertTriangle className={cn("h-4 w-4", currentRiskStyles.title)} />
                            <AlertTitle className={currentRiskStyles.title}>{screeningPlanRisk.title}</AlertTitle>
                            <AlertDescription className={currentRiskStyles.text}>
                              <p className="mb-3">{screeningPlanRisk.description}</p>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    Candidate journey: ~{screeningPlanOverview.estimatedMinutes} minutes across {screeningPlanOverview.phaseCount} phases
                                  </span>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={currentRiskStyles.button}
                                  onClick={() => setPhaseWarningDismissed(true)}
                                >
                                  Keep as is
                                </Button>
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {workflowSteps.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <p className="text-sm">No additional steps added yet.</p>
                            <p className="text-xs mt-1">Click "Add Step" to add screening steps like Chat Simulation, Typing Test, and more.</p>
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

            {/* Step 4: Review */}
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
                    <CardDescription>Ava drafted the role and screening plan. Sign up to publish it.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {workflowGenerated && (
                      <div className="space-y-4">
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45 }}
                        className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"
                      >
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                        <div>
                            <p className="text-sm font-medium text-emerald-300">Ava generated the full draft successfully</p>
                            <p className="text-xs text-emerald-300/70">Review the Ava baseline for the role, compensation details, and screening plan, then create your employer account to publish it.</p>
                        </div>
                      </motion.div>

                        <Card className="border-primary/20 bg-gradient-to-br from-primary/6 via-card to-card">
                          <CardHeader className="pb-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <CardTitle className="text-base">Candidate experience preview</CardTitle>
                                <CardDescription>{screeningPlanOverview.summary}</CardDescription>
                              </div>
                              <Badge variant="secondary" className="w-fit">
                                {screeningPlanRisk.badgeLabel}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border border-border bg-secondary/40 p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated time</p>
                              <p className="mt-1 text-lg font-semibold text-foreground">~{screeningPlanOverview.estimatedMinutes} min</p>
                            </div>
                            <div className="rounded-lg border border-border bg-secondary/40 p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Phase count</p>
                              <p className="mt-1 text-lg font-semibold text-foreground">{screeningPlanOverview.phaseCount}</p>
                            </div>
                            <div className="rounded-lg border border-border bg-secondary/40 p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Candidate effort</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{screeningPlanRisk.badgeLabel}</p>
                            </div>
                            <div className="rounded-lg border border-border bg-secondary/40 p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Required materials</p>
                              <p className="mt-1 text-sm font-medium text-foreground">
                                {screeningPlanOverview.requiredMaterials.length > 0
                                  ? screeningPlanOverview.requiredMaterials.join(", ")
                                  : "None beyond the application"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Job Summary */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold">{formData.title}</h3>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {formData.department && <Badge variant="outline">{formData.department}</Badge>}
                            {formData.location && <Badge variant="outline">{formData.location}</Badge>}
                            <Badge variant="outline" className="capitalize">{formData.job_type}</Badge>
                            {formData.experience_level && <Badge variant="outline" className="capitalize">{formData.experience_level}</Badge>}
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {formData.description && (
                        <div>
                          <Label className="text-muted-foreground">Description</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{formData.description}</p>
                        </div>
                      )}

                      {formData.responsibilities && (
                        <div>
                          <Label className="text-muted-foreground">Responsibilities</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{formData.responsibilities}</p>
                        </div>
                      )}

                      {formData.requirements && (
                        <div>
                          <Label className="text-muted-foreground">Requirements</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{formData.requirements}</p>
                        </div>
                      )}

                      {parseCommaSeparatedList(formData.skills_required).length > 0 && (
                        <div>
                          <Label className="text-muted-foreground">Required Skills</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {parseCommaSeparatedList(formData.skills_required).map((skill, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {skill.trim()}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {(formData.salary_min || formData.salary_max || formData.salary_fixed) && (
                        <div>
                          <Label className="text-muted-foreground">Compensation</Label>
                          <p className="text-sm mt-1">
                            {formData.salary_type === "fixed" 
                              ? `${formData.salary_currency} ${Number(formData.salary_fixed).toLocaleString()}`
                              : `${formData.salary_currency} ${Number(formData.salary_min).toLocaleString()} – ${Number(formData.salary_max).toLocaleString()}`
                            } {formData.salary_period}
                          </p>
                        </div>
                      )}

                      {parseCommaSeparatedList(formData.benefits).length > 0 && (
                        <div>
                          <Label className="text-muted-foreground">Benefits</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {parseCommaSeparatedList(formData.benefits).map((benefit, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {benefit.trim()}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Workflow Summary */}
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Screening Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      Difficulty: <Badge variant="outline" className="ml-1 capitalize">{workflowDifficulty}</Badge>
                      <span className="mx-2">•</span>
                      Mode: <Badge variant="outline" className="ml-1 capitalize">{processingMode}</Badge>
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
              <Button
                onClick={handlePublish}
                disabled={!canProceed()}
                className={cn(
                  "gap-2",
                  "bg-gradient-to-r from-emerald-500 to-teal-500",
                  "hover:from-emerald-400 hover:to-teal-400",
                  "text-white font-semibold shadow-lg shadow-emerald-500/25"
                )}
              >
                <Sparkles className="h-4 w-4" />
                Sign Up to Publish
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* AVA Workflow Generation Overlay */}
      <AvaWorkflowGenerationOverlay
        isVisible={isGeneratingWorkflow}
        jobTitle={formData.title || "your new role"}
        difficulty={workflowDifficulty}
        isApiComplete={workflowApiComplete}
        onComplete={handleWorkflowComplete}
        mode={generationOverlayMode}
      />

      {/* Signup Modal */}
      <PublishSignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        jobTitle={formData.title}
      />
    </div>
  );
}
