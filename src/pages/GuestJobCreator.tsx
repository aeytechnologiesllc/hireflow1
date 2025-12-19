import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  Flame,
  Gauge,
  FileText,
  Eye,
  Loader2,
  CheckCircle,
  Wand2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import hireflowLogo from "@/assets/hireflow-logo.png";
import avaOrb from "@/assets/ava-orb.png";
import AvaWorkflowGenerationOverlay from "@/components/AvaWorkflowGenerationOverlay";
import PublishSignupModal from "@/components/PublishSignupModal";
import GuestOnboardingTooltips from "@/components/GuestOnboardingTooltips";

interface GuestJobData {
  formData: {
    title: string;
    description: string;
    location: string;
    job_type: string;
  };
  applicationQuestions: any[];
  quizQuestions: any[];
  workflowSteps: any[];
  workflowDifficulty: string;
  passingScore: number;
  createdAt: number;
}

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", description: "Quick screening (8-10 quiz questions)", icon: Zap, color: "text-green-500", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  { value: "medium", label: "Medium", description: "Balanced evaluation (12-15 quiz questions)", icon: Target, color: "text-emerald-400", bgColor: "bg-emerald-400/10", borderColor: "border-emerald-400/30" },
  { value: "hard", label: "Hard", description: "Intensive screening (18-25 quiz questions)", icon: Flame, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  { value: "intense", label: "Intense", description: "Maximum rigor (25-30 quiz questions)", icon: Gauge, color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
];

const GUEST_STEPS = [
  { id: "info", title: "Job Info", icon: FileText },
  { id: "difficulty", title: "Screening Level", icon: Target },
  { id: "generate", title: "AVA Creates", icon: Sparkles },
  { id: "review", title: "Review & Publish", icon: Eye },
];

export default function GuestJobCreator() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    job_type: "full-time",
  });
  const [workflowDifficulty, setWorkflowDifficulty] = useState("medium");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<{
    applicationQuestions: any[];
    quizQuestions: any[];
    workflowSteps: any[];
  } | null>(null);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showTooltips, setShowTooltips] = useState(true);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // If user is already logged in, redirect to full creator
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/jobs/create");
    }
  }, [user, authLoading, navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateDescription = async () => {
    if (!formData.title) {
      toast.error("Please enter a job title first");
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-job-content", {
        body: { 
          field: "description",
          title: formData.title,
          job_type: formData.job_type,
          location: formData.location,
        },
      });

      if (error) throw error;

      handleInputChange("description", data.content);
      toast.success("Description generated!");
    } catch (error) {
      console.error("Error generating description:", error);
      toast.error("Failed to generate description");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const generateWorkflow = async () => {
    if (!formData.title) {
      toast.error("Please enter a job title");
      return;
    }

    setIsGenerating(true);
    setStep(2); // Move to generation step

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-workflow", {
        body: {
          title: formData.title,
          description: formData.description || `A ${formData.job_type} position in ${formData.location || "our company"}.`,
          difficulty: workflowDifficulty,
        },
      });

      if (error) throw error;

      setGeneratedWorkflow({
        applicationQuestions: data.applicationQuestions || [],
        quizQuestions: data.quizQuestions || [],
        workflowSteps: data.workflowSteps || [],
      });

      // Move to review step after generation
      setTimeout(() => {
        setStep(3);
        setIsGenerating(false);
      }, 500);
    } catch (error) {
      console.error("Error generating workflow:", error);
      toast.error("Failed to generate workflow. Please try again.");
      setIsGenerating(false);
      setStep(1); // Go back to difficulty selection
    }
  };

  const handlePublish = () => {
    if (!generatedWorkflow) {
      toast.error("Please generate a workflow first");
      return;
    }

    // Save to localStorage
    const guestJobData: GuestJobData = {
      formData,
      applicationQuestions: generatedWorkflow.applicationQuestions,
      quizQuestions: generatedWorkflow.quizQuestions,
      workflowSteps: generatedWorkflow.workflowSteps,
      workflowDifficulty,
      passingScore: 60,
      createdAt: Date.now(),
    };
    localStorage.setItem("guestJobData", JSON.stringify(guestJobData));
    setShowSignupModal(true);
  };

  const canProceed = () => {
    if (step === 0) return formData.title.trim().length > 0;
    if (step === 1) return true;
    return true;
  };

  const handleNext = () => {
    if (step === 0 && canProceed()) {
      setStep(1);
    } else if (step === 1) {
      generateWorkflow();
    }
  };

  const handleBack = () => {
    if (step > 0 && !isGenerating) {
      setStep(prev => prev - 1);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[hsl(220,18%,7%)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220,18%,7%)] overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,18%,7%)]/90 backdrop-blur-md border-b border-[hsl(220,15%,14%)]">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={hireflowLogo} alt="HireFlow" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-xl font-bold text-white">HireFlow</span>
          </Link>
          <Link to="/auth">
            <Button variant="ghost" className="text-gray-300 hover:text-white">
              Sign In
            </Button>
          </Link>
        </div>
      </nav>

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div 
          animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.1, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-purple-500/20 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ opacity: [0.1, 0.15, 0.1], scale: [1, 1.05, 1] }}
          transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-emerald-500/20 blur-[100px] rounded-full" 
        />
      </div>

      {/* Main content */}
      <div className="relative pt-24 pb-16 min-h-screen">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mb-12">
            {GUEST_STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <motion.div 
                  animate={{ 
                    scale: step === i ? 1.1 : 1,
                    backgroundColor: step >= i ? "hsl(160, 60%, 40%)" : "hsl(220, 15%, 15%)"
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-[hsl(220,15%,20%)]"
                >
                  <s.icon className={`h-4 w-4 ${step >= i ? "text-white" : "text-gray-500"}`} />
                  <span className={`text-sm font-medium ${step >= i ? "text-white" : "text-gray-500"}`}>
                    {s.title}
                  </span>
                </motion.div>
                {i < GUEST_STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 ${step > i ? "bg-emerald-500" : "bg-[hsl(220,15%,20%)]"}`} />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <motion.div
                key="info"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-8"
              >
                <div className="flex items-center gap-4 mb-8">
                  <motion.img 
                    src={avaOrb}
                    alt="AVA"
                    className="w-12 h-12"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div>
                    <h2 className="text-2xl font-bold text-white">Tell AVA about your job</h2>
                    <p className="text-gray-400">Just the basics — AVA will handle the rest</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2 relative">
                    <Label className="text-gray-200">Job Title *</Label>
                    <Input
                      placeholder="e.g., Senior Software Engineer"
                      value={formData.title}
                      onChange={(e) => handleInputChange("title", e.target.value)}
                      className="bg-[hsl(220,15%,13%)] border-[hsl(220,15%,22%)] text-white h-12 text-lg"
                    />
                    {showTooltips && (
                      <GuestOnboardingTooltips
                        step="title"
                        onDismiss={() => setShowTooltips(false)}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-gray-200">Brief Description (optional)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={generateDescription}
                        disabled={!formData.title || isGeneratingDescription}
                        className="gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 h-8 px-3"
                      >
                        {isGeneratingDescription ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        Generate
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Describe the role in a few sentences..."
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      className="bg-[hsl(220,15%,13%)] border-[hsl(220,15%,22%)] text-white min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-200">Location</Label>
                      <Input
                        placeholder="e.g., Remote, New York"
                        value={formData.location}
                        onChange={(e) => handleInputChange("location", e.target.value)}
                        className="bg-[hsl(220,15%,13%)] border-[hsl(220,15%,22%)] text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-200">Job Type</Label>
                      <Select value={formData.job_type} onValueChange={(v) => handleInputChange("job_type", v)}>
                        <SelectTrigger className="bg-[hsl(220,15%,13%)] border-[hsl(220,15%,22%)] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full-time">Full-time</SelectItem>
                          <SelectItem value="part-time">Part-time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="internship">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mt-8">
                  <Link to="/">
                    <Button variant="ghost" className="text-gray-400 hover:text-white">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Home
                    </Button>
                  </Link>
                  <Button 
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 1: Difficulty Selection */}
            {step === 1 && (
              <motion.div
                key="difficulty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-8"
              >
                <div className="flex items-center gap-4 mb-8">
                  <motion.img 
                    src={avaOrb}
                    alt="AVA"
                    className="w-12 h-12"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                  <div>
                    <h2 className="text-2xl font-bold text-white">How thorough should AVA screen?</h2>
                    <p className="text-gray-400">Higher intensity = fewer unqualified candidates</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 relative">
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <motion.button
                      key={option.value}
                      onClick={() => setWorkflowDifficulty(option.value)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        workflowDifficulty === option.value
                          ? `${option.borderColor} ${option.bgColor}`
                          : "border-[hsl(220,15%,18%)] hover:border-[hsl(220,15%,25%)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <option.icon className={`h-6 w-6 ${option.color}`} />
                        <span className={`text-lg font-semibold ${option.color}`}>{option.label}</span>
                        {workflowDifficulty === option.value && (
                          <CheckCircle className="h-5 w-5 text-emerald-400 ml-auto" />
                        )}
                      </div>
                      <p className="text-gray-400 text-sm">{option.description}</p>
                    </motion.button>
                  ))}
                  {showTooltips && (
                    <GuestOnboardingTooltips
                      step="difficulty"
                      onDismiss={() => setShowTooltips(false)}
                    />
                  )}
                </div>

                <div className="flex justify-between mt-8">
                  <Button 
                    variant="ghost" 
                    onClick={handleBack}
                    className="text-gray-400 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button 
                    onClick={handleNext}
                    className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white px-8"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate with AVA
                    <Sparkles className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Generation (shows overlay) */}
            {step === 2 && isGenerating && (
              <AvaWorkflowGenerationOverlay
                isVisible={true}
                jobTitle={formData.title}
                difficulty={workflowDifficulty}
              />
            )}

            {/* Step 3: Review */}
            {step === 3 && generatedWorkflow && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Success banner */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-r from-emerald-500/20 to-purple-500/20 border border-emerald-500/30 rounded-2xl p-6 flex items-center gap-4"
                >
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 2, ease: "linear", repeat: 1 }}
                  >
                    <CheckCircle className="h-10 w-10 text-emerald-400" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-white">AVA created your hiring workflow!</h3>
                    <p className="text-gray-300">Review what AVA built, then publish to start receiving applications</p>
                  </div>
                </motion.div>

                {/* Job summary */}
                <div className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Job Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Title:</span>
                      <span className="text-white ml-2">{formData.title}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Location:</span>
                      <span className="text-white ml-2">{formData.location || "Not specified"}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Type:</span>
                      <span className="text-white ml-2 capitalize">{formData.job_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Screening:</span>
                      <span className="text-white ml-2 capitalize">{workflowDifficulty}</span>
                    </div>
                  </div>
                </div>

                {/* Generated content preview */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Application Questions */}
                  <div className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="h-5 w-5 text-purple-400" />
                      <h3 className="text-lg font-semibold text-white">Application Questions</h3>
                      <Badge variant="secondary" className="ml-auto">
                        {generatedWorkflow.applicationQuestions.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {generatedWorkflow.applicationQuestions.slice(0, 5).map((q: any, i: number) => (
                        <div key={i} className="text-sm text-gray-300 py-2 border-b border-[hsl(220,15%,15%)] last:border-0">
                          {q.question}
                        </div>
                      ))}
                      {generatedWorkflow.applicationQuestions.length > 5 && (
                        <div className="text-sm text-gray-500">
                          +{generatedWorkflow.applicationQuestions.length - 5} more questions
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quiz Questions */}
                  <div className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="h-5 w-5 text-emerald-400" />
                      <h3 className="text-lg font-semibold text-white">Screening Quiz</h3>
                      <Badge variant="secondary" className="ml-auto">
                        {generatedWorkflow.quizQuestions.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {generatedWorkflow.quizQuestions.slice(0, 4).map((q: any, i: number) => (
                        <div key={i} className="text-sm text-gray-300 py-2 border-b border-[hsl(220,15%,15%)] last:border-0">
                          {q.question}
                        </div>
                      ))}
                      {generatedWorkflow.quizQuestions.length > 4 && (
                        <div className="text-sm text-gray-500">
                          +{generatedWorkflow.quizQuestions.length - 4} more questions
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Workflow Steps */}
                {generatedWorkflow.workflowSteps.length > 0 && (
                  <div className="bg-[hsl(220,15%,10%)]/80 backdrop-blur-sm border border-[hsl(220,15%,18%)] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="h-5 w-5 text-fuchsia-400" />
                      <h3 className="text-lg font-semibold text-white">Workflow Phases</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {generatedWorkflow.workflowSteps.map((step: any, i: number) => (
                        <Badge key={i} variant="outline" className="border-fuchsia-500/30 text-fuchsia-300">
                          {step.title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex justify-between">
                  <Button 
                    variant="ghost" 
                    onClick={() => setStep(1)}
                    className="text-gray-400 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button 
                      onClick={handlePublish}
                      size="lg"
                      className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-10 h-12"
                    >
                      Publish Job
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                  </motion.div>
                </div>

                {showTooltips && (
                  <GuestOnboardingTooltips
                    step="publish"
                    onDismiss={() => setShowTooltips(false)}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Publish Signup Modal */}
      <PublishSignupModal 
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        jobTitle={formData.title}
      />
    </div>
  );
}
