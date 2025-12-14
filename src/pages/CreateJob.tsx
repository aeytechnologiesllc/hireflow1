import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCreateJob } from "@/hooks/useJobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Send
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";


const WIZARD_STEPS = [
  { id: "basic", title: "Basic Info", icon: FileText },
  { id: "details", title: "Job Details", icon: Users },
  { id: "compensation", title: "Compensation", icon: DollarSign },
  { id: "review", title: "Review & Publish", icon: Eye },
];

export default function CreateJob() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const createJob = useCreateJob();
  
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
    salary_min: "",
    salary_max: "",
    salary_currency: "USD",
    skills_required: "",
    benefits: "",
    application_deadline: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const handleChange = (field: string, value: string) => {
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


  const handleSubmit = async (status: "draft" | "published") => {
    if (!formData.title || !formData.description) {
      toast.error("Please fill in the title and description");
      return;
    }

    setIsSubmitting(true);
    try {
      await createJob.mutateAsync({
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        location: formData.location || null,
        job_type: formData.job_type,
        experience_level: formData.experience_level || null,
        department: formData.department || null,
        salary_min: formData.salary_min ? parseInt(formData.salary_min) : null,
        salary_max: formData.salary_max ? parseInt(formData.salary_max) : null,
        salary_currency: formData.salary_currency,
        skills_required: formData.skills_required ? formData.skills_required.split(",").map((s) => s.trim()).filter(Boolean) : null,
        benefits: formData.benefits ? formData.benefits.split(",").map((s) => s.trim()).filter(Boolean) : null,
        application_deadline: formData.application_deadline ? new Date(formData.application_deadline).toISOString() : null,
        status,
      });

      toast.success(status === "published" ? "Job published successfully!" : "Job saved as draft");
      navigate("/jobs");
    } catch (error) {
      console.error("Error creating job:", error);
      toast.error("Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
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
        return !!formData.title && !!formData.description;
      default:
        return true;
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Create New Job</h2>
            <p className="text-muted-foreground mt-1">AI-powered job posting wizard</p>
          </div>
        </div>
        
        {/* AI Generate All Button */}
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
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between px-4">
        {WIZARD_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(index)}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : isCompleted 
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : isCompleted
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary"
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span className="font-medium hidden md:block">{step.title}</span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <div className={`w-12 h-1 mx-2 rounded-full ${
                  isCompleted ? "bg-primary" : "bg-border"
                }`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="max-w-4xl">
        {/* Main Content */}
        <div>
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
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="salary_currency">Currency</Label>
                        <Select value={formData.salary_currency} onValueChange={(v) => handleChange("salary_currency", v)}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="CAD">CAD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                    </div>

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

                    <div className="space-y-2">
                      <Label htmlFor="deadline">Application Deadline</Label>
                      <Input
                        id="deadline"
                        type="date"
                        className="bg-background"
                        value={formData.application_deadline}
                        onChange={(e) => handleChange("application_deadline", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Step 4: Review */}
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

                    {(formData.salary_min || formData.salary_max) && (
                      <div>
                        <h4 className="font-semibold mb-2">Salary Range</h4>
                        <p className="text-muted-foreground">
                          {formData.salary_currency} {formData.salary_min && parseInt(formData.salary_min).toLocaleString()}
                          {formData.salary_min && formData.salary_max && " - "}
                          {formData.salary_max && parseInt(formData.salary_max).toLocaleString()}
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
      </div>
    </div>
  );
}
