import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
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
  Keyboard,
  Video,
  MessageSquare,
  Upload,
  Bot
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
  { value: "easy", label: "Easy", description: "Quick screening (8-10 quiz questions)", icon: Zap, color: "text-green-500" },
  { value: "medium", label: "Medium", description: "Balanced evaluation (12-15 quiz questions)", icon: Target, color: "text-blue-500" },
  { value: "hard", label: "Hard", description: "Intensive screening (18-25 quiz questions)", icon: Flame, color: "text-orange-500" },
  { value: "intense", label: "Intense", description: "Maximum rigor (25-30 quiz questions)", icon: Gauge, color: "text-red-500" },
];

const STEP_TYPE_INFO = {
  typing_test: { icon: Keyboard, label: "Typing Test", description: "Test typing speed and accuracy" },
  video_message: { icon: Video, label: "Video Message", description: "Record a video introduction" },
  chat_simulation: { icon: MessageSquare, label: "Chat Simulation", description: "Customer support roleplay" },
  sales_simulation: { icon: Bot, label: "Sales Simulation", description: "Sales pitch roleplay" },
  portfolio_upload: { icon: Upload, label: "Portfolio Upload", description: "Submit work samples" },
};

export default function CreateJob() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const { role } = useAuth();
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
  const [applicationQuestions, setApplicationQuestions] = useState<ApplicationQuestion[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [workflowGenerated, setWorkflowGenerated] = useState(false);
  
  // Edit dialogs
  const [editingQuestion, setEditingQuestion] = useState<ApplicationQuestion | null>(null);
  const [editingQuizQuestion, setEditingQuizQuestion] = useState<QuizQuestion | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

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
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-workflow", {
        body: {
          title: formData.title,
          description: formData.description,
          company: formData.department,
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
      };

      if (isEditMode && id) {
        await updateJob.mutateAsync({ id, ...jobData });
        toast.success(status === "published" ? "Job updated and published!" : "Job updated");
      } else {
        await createJob.mutateAsync(jobData);
        toast.success(status === "published" ? "Job published successfully!" : "Job saved as draft");
      }
      
      navigate("/jobs");
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
                      <Select value={formData.salary_currency} onValueChange={(v) => handleChange("salary_currency", v)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="CAD">CAD ($)</SelectItem>
                          <SelectItem value="AUD">AUD ($)</SelectItem>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                        </SelectContent>
                      </Select>
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
                            return (
                              <button
                                key={option.value}
                                onClick={() => {
                                  setWorkflowDifficulty(option.value);
                                  setWorkflowGenerated(false);
                                }}
                                className={cn(
                                  "p-4 rounded-xl border-2 transition-all text-left",
                                  workflowDifficulty === option.value
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
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

                      <Button
                        onClick={generateWorkflow}
                        disabled={isGeneratingWorkflow}
                        className="w-full gap-2"
                        size="lg"
                      >
                        {isGeneratingWorkflow ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Generating Workflow...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-5 w-5" />
                            {workflowGenerated ? "Regenerate Workflow" : "Generate Hiring Workflow"}
                          </>
                        )}
                      </Button>
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
                        {applicationQuestions.map((q, index) => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 group"
                          >
                            <div className="flex items-center gap-3">
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
                              <div>
                                <div className="font-medium text-sm">{q.question}</div>
                                <div className="text-xs text-muted-foreground">
                                  Type: {q.type} {q.required && "• Required"}
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
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quiz Questions */}
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-lg">Timed Quiz Questions</CardTitle>
                      <CardDescription>
                        {quizQuestions.length} questions • Candidates answer under time pressure
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full">
                        {quizQuestions.map((q, index) => (
                          <AccordionItem key={q.id} value={q.id}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-3 text-left">
                                <Badge variant="outline" className="text-xs">
                                  {q.time_limit_seconds}s
                                </Badge>
                                <span className="text-sm font-medium">
                                  {index + 1}. {q.question.substring(0, 60)}...
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="p-3 space-y-3">
                                <div className="text-sm">{q.question}</div>
                                {q.options && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {q.options.map((opt, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          "p-2 rounded text-sm",
                                          opt === q.correct_answer
                                            ? "bg-green-500/20 border border-green-500/50"
                                            : "bg-secondary"
                                        )}
                                      >
                                        {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  <Badge variant="secondary">{q.category}</Badge>
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
                  {workflowSteps.length > 0 && (
                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-lg">Additional Workflow Steps</CardTitle>
                        <CardDescription>
                          {workflowSteps.length} additional evaluation steps
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {workflowSteps.map((step) => {
                            const stepInfo = STEP_TYPE_INFO[step.type as keyof typeof STEP_TYPE_INFO];
                            const Icon = stepInfo?.icon || FileText;
                            return (
                              <div
                                key={step.id}
                                className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/30"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Icon className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <div className="font-medium">{step.title}</div>
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
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
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
    </div>
  );
}
