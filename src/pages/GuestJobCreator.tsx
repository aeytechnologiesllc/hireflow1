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
  Bot
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import hireflowLogo from "@/assets/hireflow-logo.png";
import avaOrb from "@/assets/ava-orb.png";
import PublishSignupModal from "@/components/PublishSignupModal";

interface GuestJobData {
  formData: {
    title: string;
    description: string;
    requirements: string;
    responsibilities: string;
    location: string;
    job_type: string;
    experience_level: string;
    department: string;
    salary_type: string;
    salary_period: string;
    salary_min: string;
    salary_max: string;
    salary_fixed: string;
    salary_currency: string;
    skills_required: string;
    benefits: string;
    application_deadline: Date | null;
  };
  applicationQuestions: any[];
  quizQuestions: any[];
  workflowSteps: any[];
  workflowDifficulty: string;
  processingMode: string;
  passingScore: number;
  createdAt: number;
}

// Generation Step Component - matches CreateJob
const GenerationStep = ({ label, delay, isActive }: { label: string; delay: number; isActive: boolean }) => {
  const [active, setActive] = useState(false);
  
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setActive(true), delay * 1000);
      return () => clearTimeout(timer);
    } else {
      setActive(false);
    }
  }, [delay, isActive]);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: active ? 1 : 0.3, x: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.3 }}
      className="flex items-center gap-3"
    >
      {active ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center"
        >
          <Loader2 className="h-3 w-3 text-white animate-spin" />
        </motion.div>
      ) : (
        <div className="w-5 h-5 rounded-full border border-muted-foreground/30" />
      )}
      <span className={cn(
        "text-sm transition-colors",
        active ? "text-foreground" : "text-muted-foreground/50"
      )}>
        {label}
      </span>
    </motion.div>
  );
};

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
  const [applicationQuestions, setApplicationQuestions] = useState<any[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [workflowGenerated, setWorkflowGenerated] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  // If user is already logged in, redirect to full creator
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/jobs/create");
    }
  }, [user, authLoading, navigate]);

  const handleChange = (field: string, value: string | Date | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateField = async (field: string) => {
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
          existingContent: formData[field as keyof typeof formData],
        },
      });

      if (error) throw error;

      handleChange(field, data.content);
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ')} generated!`);
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
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-workflow", {
        body: {
          title: formData.title,
          description: formData.description,
          employment_type: formData.job_type,
          location: formData.location,
          difficulty: workflowDifficulty,
          require_resume: true,
        },
      });

      if (error) throw error;

      setApplicationQuestions(data.application_questions || []);
      setQuizQuestions(data.quiz_questions || []);
      setWorkflowSteps(data.workflow_steps || []);
      setWorkflowGenerated(true);
      
      toast.success("Hiring workflow generated!");
    } catch (error) {
      console.error("Error generating workflow:", error);
      toast.error("Failed to generate workflow. Please try again.");
    } finally {
      setIsGeneratingWorkflow(false);
    }
  };

  const handlePublish = () => {
    if (!workflowGenerated) {
      toast.error("Please generate a workflow first");
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
        return !!formData.title && !!formData.description && workflowGenerated;
      default:
        return true;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
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
                <p className="text-muted-foreground mt-1">AI-powered job posting wizard</p>
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
                            <SelectItem value="lead">Lead / Manager</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
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
                    <CardTitle className="text-lg">Job Details</CardTitle>
                    <CardDescription>Describe the role and requirements</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        className="bg-background min-h-[120px]"
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
                    <CardTitle className="text-lg">Compensation & Benefits</CardTitle>
                    <CardDescription>Salary range and perks</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Salary Type Selection */}
                    <div className="space-y-3">
                      <Label>Salary Type</Label>
                      <RadioGroup
                        value={formData.salary_type}
                        onValueChange={(v) => handleChange("salary_type", v)}
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
                          type="number"
                          placeholder="75000"
                          className="bg-background"
                          value={formData.salary_fixed}
                          onChange={(e) => handleChange("salary_fixed", e.target.value)}
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
                            type="number"
                            placeholder="50000"
                            className="bg-background"
                            value={formData.salary_min}
                            onChange={(e) => handleChange("salary_min", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="salary_max">Maximum Salary</Label>
                          <Input
                            id="salary_max"
                            type="number"
                            placeholder="80000"
                            className="bg-background"
                            value={formData.salary_max}
                            onChange={(e) => handleChange("salary_max", e.target.value)}
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
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setProcessingMode("auto")}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all text-left",
                            processingMode === "auto"
                              ? "border-emerald-500 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 shadow-lg shadow-emerald-500/10"
                              : "border-border bg-card hover:border-muted-foreground/30"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              processingMode === "auto" 
                                ? "bg-gradient-to-br from-emerald-500 to-teal-500" 
                                : "bg-secondary"
                            )}>
                              <Bot className={cn(
                                "h-5 w-5",
                                processingMode === "auto" ? "text-white" : "text-muted-foreground"
                              )} />
                            </div>
                            <div>
                              <div className={cn(
                                "font-semibold flex items-center gap-2",
                                processingMode === "auto" && "text-emerald-400"
                              )}>
                                Auto Processing
                                {processingMode === "auto" && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/30 text-emerald-200 border border-emerald-400/50">
                                    ✓
                                  </Badge>
                                )}
                              </div>
                              <div className={cn(
                                "text-xs",
                                processingMode === "auto" ? "text-emerald-200/80" : "text-muted-foreground"
                              )}>
                                AI auto-advances qualifying candidates
                              </div>
                            </div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setProcessingMode("manual")}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-all text-left",
                            processingMode === "manual"
                              ? "border-emerald-500 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 shadow-lg shadow-emerald-500/10"
                              : "border-border bg-card hover:border-muted-foreground/30"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              processingMode === "manual" 
                                ? "bg-gradient-to-br from-emerald-500 to-teal-500" 
                                : "bg-secondary"
                            )}>
                              <Hand className={cn(
                                "h-5 w-5",
                                processingMode === "manual" ? "text-white" : "text-muted-foreground"
                              )} />
                            </div>
                            <div>
                              <div className={cn(
                                "font-semibold flex items-center gap-2",
                                processingMode === "manual" && "text-emerald-400"
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
                                    Minimum AI score to auto-advance candidates
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

                    {/* Generate with AVA Button */}
                    <div className="flex justify-end">
                      <Button
                        onClick={generateWorkflow}
                        disabled={isGeneratingWorkflow}
                        className={cn(
                          "gap-2 px-6",
                          "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
                          "hover:from-purple-400 hover:via-fuchsia-400 hover:to-pink-400",
                          "text-white font-semibold shadow-lg shadow-fuchsia-500/25",
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
                    </div>
                  </CardContent>
                </Card>

                {/* Generated Workflow Display */}
                {workflowGenerated && (
                  <>
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
                          {applicationQuestions.map((q, index) => (
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
                        <CardTitle className="text-lg">Additional Workflow Steps</CardTitle>
                        <CardDescription>
                          {workflowSteps.length} additional evaluation steps
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {workflowSteps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border/50"
                            >
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                  <Sparkles className="h-5 w-5 text-violet-500" />
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{step.title}</div>
                                  <div className="text-xs text-muted-foreground">{step.description}</div>
                                </div>
                              </div>
                              {step.required && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
                                  Required
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
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
                    <CardDescription>Everything looks good? Sign up to publish!</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
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

                      {formData.skills_required && (
                        <div>
                          <Label className="text-muted-foreground">Required Skills</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {formData.skills_required.split(",").map((skill, i) => (
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
                              ? `${formData.salary_currency} ${formData.salary_fixed}`
                              : `${formData.salary_currency} ${formData.salary_min} - ${formData.salary_max}`
                            } {formData.salary_period}
                          </p>
                        </div>
                      )}

                      {formData.benefits && (
                        <div>
                          <Label className="text-muted-foreground">Benefits</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {formData.benefits.split(",").map((benefit, i) => (
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
                      Generated Workflow
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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

      {/* AVA Generation Overlay */}
      <AnimatePresence>
        {isGeneratingWorkflow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            {/* Ambient gradient orbs */}
            <div className="absolute inset-0 overflow-hidden">
              <motion.div
                className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-500/20 blur-[120px]"
                animate={{ 
                  scale: [1, 1.2, 1],
                  x: [0, 30, 0],
                  y: [0, -20, 0]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-[120px]"
                animate={{ 
                  scale: [1.2, 1, 1.2],
                  x: [0, -30, 0],
                  y: [0, 20, 0]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              />
              <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[150px]"
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.5, 0.3]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            {/* Content */}
            <div className="relative z-10 text-center space-y-8">
              {/* AVA Orb with pulsing animation */}
              <motion.div
                className="relative mx-auto w-32 h-32"
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* Glowing rings */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-purple-500/50"
                  animate={{ 
                    scale: [1, 1.3, 1],
                    opacity: [0.8, 0, 0.8]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-fuchsia-500/50"
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [0.6, 0, 0.6]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                />
                
                {/* Orb image */}
                <img
                  src={avaOrb}
                  alt="AVA"
                  className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]"
                />
              </motion.div>

              {/* Title with shimmer effect */}
              <div className="space-y-3">
                <motion.h2
                  className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent bg-[length:200%_auto]"
                  animate={{ 
                    backgroundPosition: ["0%", "100%", "0%"]
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                >
                  Ava is crafting your workflow
                </motion.h2>
                <p className="text-muted-foreground">
                  Analyzing job requirements and designing the perfect hiring process...
                </p>
              </div>

              {/* Generation progress indicators */}
              <div className="flex flex-col items-center gap-3">
                <GenerationStep 
                  label="Application Questions" 
                  delay={0}
                  isActive={isGeneratingWorkflow}
                />
                <GenerationStep 
                  label="Assessment Quiz" 
                  delay={1}
                  isActive={isGeneratingWorkflow}
                />
                <GenerationStep 
                  label="Workflow Phases" 
                  delay={2}
                  isActive={isGeneratingWorkflow}
                />
              </div>

              {/* Animated dots */}
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-purple-400"
                    animate={{ 
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{ 
                      duration: 1, 
                      repeat: Infinity, 
                      delay: i * 0.2 
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signup Modal */}
      <PublishSignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        jobTitle={formData.title}
      />
    </div>
  );
}
