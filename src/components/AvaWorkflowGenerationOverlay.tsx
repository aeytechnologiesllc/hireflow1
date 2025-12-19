import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, Brain, Layers, Wand2, CheckCircle, PenTool, ClipboardCheck, GitBranch } from "lucide-react";
import avaOrb from "@/assets/ava-orb.png";

interface AvaWorkflowGenerationOverlayProps {
  isVisible: boolean;
  jobTitle: string;
  difficulty: string;
  minDuration?: number;
  onComplete?: () => void;
}

const GENERATION_STEPS = [
  { 
    icon: FileText, 
    label: "Analyzing job requirements...",
    sublabel: "Understanding the role",
    duration: 3000
  },
  { 
    icon: Brain, 
    label: "Writing application questions...",
    sublabel: "Tailoring questions to the role",
    duration: 4000
  },
  { 
    icon: Sparkles, 
    label: "Creating screening quiz...",
    sublabel: "Building knowledge assessments",
    duration: 4500
  },
  { 
    icon: Layers, 
    label: "Building workflow phases...",
    sublabel: "Designing the candidate journey",
    duration: 3500
  },
  { 
    icon: Wand2, 
    label: "Optimizing for best candidates...",
    sublabel: "Final polish",
    duration: 2500
  },
];

// Role-specific application questions
const APPLICATION_QUESTIONS = [
  "Tell us about your experience with team leadership and how you motivate others...",
  "Describe a challenging project you successfully completed and what you learned...",
  "How do you approach prioritizing competing deadlines and multiple stakeholders?",
  "What motivates you to excel in your work and pursue continuous improvement?",
  "Share an example of when you had to adapt quickly to unexpected changes...",
  "How do you handle constructive feedback and use it to grow professionally?",
];

// Quiz questions with multiple choice feel
const QUIZ_QUESTIONS = [
  "A customer expresses frustration about a delayed order. What's your first response?",
  "Your team disagrees on the best approach for a project. How do you facilitate consensus?",
  "You notice a colleague struggling with their workload. What action do you take?",
  "A deadline is approaching but the quality isn't where it should be. What do you prioritize?",
  "You receive conflicting instructions from two managers. How do you resolve this?",
];

// Workflow phase labels
const WORKFLOW_PHASES = [
  "Application Review → Initial Screening",
  "Phone Interview → Skills Assessment",
  "Technical Evaluation → Culture Fit",
  "Reference Check → Final Decision",
  "Offer Preparation → Onboarding",
];

type ContentType = "application" | "quiz" | "workflow";

export default function AvaWorkflowGenerationOverlay({ 
  isVisible, 
  jobTitle, 
  difficulty,
  minDuration = 17500,
  onComplete
}: AvaWorkflowGenerationOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  
  // Multiple typing panels state
  const [activePanel, setActivePanel] = useState<ContentType>("application");
  const [applicationText, setApplicationText] = useState("");
  const [quizText, setQuizText] = useState("");
  const [workflowText, setWorkflowText] = useState("");
  const [applicationIndex, setApplicationIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [completedItems, setCompletedItems] = useState({ application: 0, quiz: 0, workflow: 0 });
  
  const startTimeRef = useRef<number>(0);

  // Reset state when visibility changes
  useEffect(() => {
    if (isVisible) {
      startTimeRef.current = Date.now();
      setCurrentStep(0);
      setProgress(0);
      setActivePanel("application");
      setApplicationText("");
      setQuizText("");
      setWorkflowText("");
      setApplicationIndex(0);
      setQuizIndex(0);
      setWorkflowIndex(0);
      setCompletedItems({ application: 0, quiz: 0, workflow: 0 });
    }
  }, [isVisible]);

  // Progress through steps with smooth timing
  useEffect(() => {
    if (!isVisible) return;
    
    const totalDuration = GENERATION_STEPS.reduce((acc, step) => acc + step.duration, 0);
    let elapsed = 0;
    
    const progressInterval = setInterval(() => {
      elapsed += 100;
      const newProgress = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(newProgress);
      
      // Determine current step based on elapsed time
      let stepTime = 0;
      for (let i = 0; i < GENERATION_STEPS.length; i++) {
        stepTime += GENERATION_STEPS[i].duration;
        if (elapsed < stepTime) {
          setCurrentStep(i);
          break;
        }
      }
      
      if (elapsed >= totalDuration) {
        setCurrentStep(GENERATION_STEPS.length - 1);
        clearInterval(progressInterval);
      }
    }, 100);

    return () => clearInterval(progressInterval);
  }, [isVisible]);

  // Cycle through content panels
  useEffect(() => {
    if (!isVisible) return;
    
    const panelCycle: ContentType[] = ["application", "quiz", "workflow"];
    let panelIndex = 0;
    
    const cyclePanels = setInterval(() => {
      panelIndex = (panelIndex + 1) % panelCycle.length;
      setActivePanel(panelCycle[panelIndex]);
    }, 5000);

    return () => clearInterval(cyclePanels);
  }, [isVisible]);

  // Application questions typing
  useEffect(() => {
    if (!isVisible) return;
    
    const question = APPLICATION_QUESTIONS[applicationIndex % APPLICATION_QUESTIONS.length];
    let charIndex = 0;
    setApplicationText("");
    
    const typeInterval = setInterval(() => {
      if (charIndex <= question.length) {
        setApplicationText(question.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setCompletedItems(prev => ({ ...prev, application: prev.application + 1 }));
        setTimeout(() => {
          setApplicationIndex(prev => prev + 1);
        }, 800);
      }
    }, 35);

    return () => clearInterval(typeInterval);
  }, [isVisible, applicationIndex]);

  // Quiz questions typing
  useEffect(() => {
    if (!isVisible) return;
    
    const question = QUIZ_QUESTIONS[quizIndex % QUIZ_QUESTIONS.length];
    let charIndex = 0;
    setQuizText("");
    
    const typeInterval = setInterval(() => {
      if (charIndex <= question.length) {
        setQuizText(question.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setCompletedItems(prev => ({ ...prev, quiz: prev.quiz + 1 }));
        setTimeout(() => {
          setQuizIndex(prev => prev + 1);
        }, 800);
      }
    }, 40);

    return () => clearInterval(typeInterval);
  }, [isVisible, quizIndex]);

  // Workflow phases typing
  useEffect(() => {
    if (!isVisible) return;
    
    const phase = WORKFLOW_PHASES[workflowIndex % WORKFLOW_PHASES.length];
    let charIndex = 0;
    setWorkflowText("");
    
    const typeInterval = setInterval(() => {
      if (charIndex <= phase.length) {
        setWorkflowText(phase.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setCompletedItems(prev => ({ ...prev, workflow: prev.workflow + 1 }));
        setTimeout(() => {
          setWorkflowIndex(prev => prev + 1);
        }, 1000);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, [isVisible, workflowIndex]);

  if (!isVisible) return null;

  const getPanelConfig = () => {
    switch (activePanel) {
      case "application":
        return {
          icon: PenTool,
          label: `Writing application question ${completedItems.application + 1}...`,
          text: applicationText,
          color: "text-purple-400",
          bgColor: "from-purple-500/30 to-fuchsia-500/30"
        };
      case "quiz":
        return {
          icon: ClipboardCheck,
          label: `Crafting quiz question ${completedItems.quiz + 1}...`,
          text: quizText,
          color: "text-fuchsia-400",
          bgColor: "from-fuchsia-500/30 to-pink-500/30"
        };
      case "workflow":
        return {
          icon: GitBranch,
          label: `Building phase ${completedItems.workflow + 1}...`,
          text: workflowText,
          color: "text-violet-400",
          bgColor: "from-violet-500/30 to-purple-500/30"
        };
    }
  };

  const panelConfig = getPanelConfig();
  const PanelIcon = panelConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[hsl(220,18%,5%)]/95 backdrop-blur-xl" />
      
      {/* Animated orbs - purple/fuchsia tones to match theme */}
      <motion.div 
        animate={{ 
          x: [0, 50, 0], 
          y: [0, -30, 0],
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-purple-600/25 blur-[150px] rounded-full" 
      />
      <motion.div 
        animate={{ 
          x: [0, -40, 0], 
          y: [0, 40, 0],
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.3, 0.15]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-fuchsia-600/25 blur-[130px] rounded-full" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/15 blur-[180px] rounded-full" 
      />

      {/* Floating particles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/30 rounded-full"
          initial={{ 
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000), 
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            y: [null, Math.random() * -200 - 100],
            opacity: [0, 1, 0]
          }}
          transition={{ 
            duration: Math.random() * 3 + 2, 
            repeat: Infinity, 
            delay: Math.random() * 2 
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 max-w-2xl w-full mx-4">
        {/* AVA orb */}
        <motion.div
          animate={{ 
            y: [0, -15, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="flex justify-center mb-6"
        >
          <div className="relative">
            {/* Glow ring - purple tones */}
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/40 via-fuchsia-500/40 to-violet-400/40 blur-xl"
              style={{ width: 120, height: 120, margin: -20 }}
            />
            <img
              src={avaOrb}
              alt="AVA"
              className="w-20 h-20 object-contain relative z-10"
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            AVA is creating your workflow
          </h2>
          <p className="text-gray-400">
            Building a custom hiring process for <span className="text-purple-400 font-medium">{jobTitle}</span>
          </p>
        </motion.div>

        {/* Two-column layout for steps and typing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Progress steps */}
          <div className="space-y-2">
            {GENERATION_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i === currentStep;
              const isComplete = i < currentStep;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ 
                    opacity: isActive || isComplete ? 1 : 0.4, 
                    x: 0 
                  }}
                  transition={{ duration: 0.3, delay: i * 0.1 }}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
                    isActive ? "bg-white/5 border border-white/10" : ""
                  }`}
                >
                  <div className="relative">
                    {isComplete ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center"
                      >
                        <CheckCircle className="h-4 w-4 text-purple-400" />
                      </motion.div>
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-7 h-7 rounded-full bg-gradient-to-r from-purple-500/30 to-fuchsia-500/30 flex items-center justify-center"
                      >
                        <StepIcon className="h-4 w-4 text-purple-300" />
                      </motion.div>
                    ) : (
                      <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center">
                        <StepIcon className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${isActive || isComplete ? "text-white" : "text-gray-500"}`}>
                      {step.label}
                    </p>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[10px] text-gray-400 truncate"
                      >
                        {step.sublabel}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Live typing panels */}
          <div className="space-y-3">
            {/* Active typing panel */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="bg-[hsl(220,15%,10%)]/90 border border-white/10 rounded-xl p-4 min-h-[120px]"
              >
                <div className="flex items-center gap-2 mb-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`w-6 h-6 rounded-lg bg-gradient-to-r ${panelConfig.bgColor} flex items-center justify-center`}
                  >
                    <PanelIcon className={`h-3.5 w-3.5 ${panelConfig.color}`} />
                  </motion.div>
                  <span className={`text-xs font-medium ${panelConfig.color}`}>
                    {panelConfig.label}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {panelConfig.text}
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className={`inline-block w-0.5 h-4 ${panelConfig.color.replace('text-', 'bg-')} ml-0.5 align-middle`}
                  />
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Mini progress indicators */}
            <div className="grid grid-cols-3 gap-2">
              <div className={`px-3 py-2 rounded-lg text-center transition-all ${
                activePanel === "application" ? "bg-purple-500/20 border border-purple-500/30" : "bg-white/5"
              }`}>
                <p className="text-[10px] text-gray-400 mb-0.5">Questions</p>
                <p className="text-sm font-bold text-purple-400">{completedItems.application}</p>
              </div>
              <div className={`px-3 py-2 rounded-lg text-center transition-all ${
                activePanel === "quiz" ? "bg-fuchsia-500/20 border border-fuchsia-500/30" : "bg-white/5"
              }`}>
                <p className="text-[10px] text-gray-400 mb-0.5">Quiz Items</p>
                <p className="text-sm font-bold text-fuchsia-400">{completedItems.quiz}</p>
              </div>
              <div className={`px-3 py-2 rounded-lg text-center transition-all ${
                activePanel === "workflow" ? "bg-violet-500/20 border border-violet-500/30" : "bg-white/5"
              }`}>
                <p className="text-[10px] text-gray-400 mb-0.5">Phases</p>
                <p className="text-sm font-bold text-violet-400">{completedItems.workflow}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span className="flex items-center gap-1.5">
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-purple-400"
              />
              AVA is working...
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-[hsl(220,15%,15%)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-violet-400"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
