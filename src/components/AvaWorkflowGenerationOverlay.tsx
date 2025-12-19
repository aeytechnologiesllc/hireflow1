import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, Brain, Layers, Wand2, CheckCircle } from "lucide-react";
import avaOrb from "@/assets/ava-orb.png";

interface AvaWorkflowGenerationOverlayProps {
  isVisible: boolean;
  jobTitle: string;
  difficulty: string;
}

const GENERATION_STEPS = [
  { 
    icon: FileText, 
    label: "Analyzing job requirements...",
    sublabel: "Understanding the role",
    color: "text-emerald-300",
    duration: 2500
  },
  { 
    icon: Brain, 
    label: "Writing application questions...",
    sublabel: "Tailoring questions to the role",
    color: "text-emerald-400",
    duration: 3000
  },
  { 
    icon: Sparkles, 
    label: "Creating screening quiz...",
    sublabel: "Building knowledge assessments",
    color: "text-teal-400",
    duration: 3500
  },
  { 
    icon: Layers, 
    label: "Building workflow phases...",
    sublabel: "Designing the candidate journey",
    color: "text-emerald-500",
    duration: 2500
  },
  { 
    icon: Wand2, 
    label: "Optimizing for best candidates...",
    sublabel: "Final polish",
    color: "text-emerald-300",
    duration: 2000
  },
];

const EXAMPLE_QUESTIONS = [
  "What's your experience with...",
  "Describe a challenging project where...",
  "How would you approach...",
  "Tell us about a time when...",
  "What strategies do you use for...",
];

export default function AvaWorkflowGenerationOverlay({ 
  isVisible, 
  jobTitle, 
  difficulty 
}: AvaWorkflowGenerationOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Progress through steps
  useEffect(() => {
    if (!isVisible) return;
    
    let totalTime = 0;
    const timers: NodeJS.Timeout[] = [];
    
    GENERATION_STEPS.forEach((step, i) => {
      totalTime += step.duration;
      const timer = setTimeout(() => {
        setCurrentStep(i);
        setProgress(((i + 1) / GENERATION_STEPS.length) * 100);
      }, totalTime - step.duration);
      timers.push(timer);
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, [isVisible]);

  // Typing animation
  useEffect(() => {
    if (!isVisible) return;
    
    const question = EXAMPLE_QUESTIONS[questionIndex];
    let charIndex = 0;
    setTypedText("");
    
    const typeInterval = setInterval(() => {
      if (charIndex <= question.length) {
        setTypedText(question.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setQuestionIndex((prev) => (prev + 1) % EXAMPLE_QUESTIONS.length);
        }, 1000);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, [isVisible, questionIndex]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[hsl(220,18%,5%)]/95 backdrop-blur-xl" />
      
      {/* Animated orbs - subtle emerald/teal tones */}
      <motion.div 
        animate={{ 
          x: [0, 50, 0], 
          y: [0, -30, 0],
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-emerald-600/25 blur-[150px] rounded-full" 
      />
      <motion.div 
        animate={{ 
          x: [0, -40, 0], 
          y: [0, 40, 0],
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.3, 0.15]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-teal-600/25 blur-[130px] rounded-full" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/15 blur-[180px] rounded-full" 
      />

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/30 rounded-full"
          initial={{ 
            x: Math.random() * window.innerWidth, 
            y: Math.random() * window.innerHeight,
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
      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* AVA orb */}
        <motion.div
          animate={{ 
            y: [0, -15, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            {/* Glow ring - subtle emerald tones */}
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/40 via-teal-500/40 to-emerald-400/40 blur-xl"
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
          className="text-center mb-8"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            AVA is creating your workflow
          </h2>
          <p className="text-gray-400">
            Building a custom hiring process for <span className="text-emerald-400 font-medium">{jobTitle}</span>
          </p>
        </motion.div>

        {/* Progress steps */}
        <div className="space-y-3 mb-8">
          {GENERATION_STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const isActive = i === currentStep;
            const isComplete = i < currentStep;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                  opacity: isActive || isComplete ? 1 : 0.3, 
                  x: 0 
                }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                  isActive ? "bg-white/5 border border-white/10" : ""
                }`}
              >
                <div className={`relative ${step.color}`}>
                  {isComplete ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"
                    >
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500/30 to-teal-500/30 flex items-center justify-center"
                    >
                      <StepIcon className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
                      <StepIcon className="h-4 w-4 text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isActive || isComplete ? "text-white" : "text-gray-500"}`}>
                    {step.label}
                  </p>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-gray-400"
                    >
                      {step.sublabel}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Typing preview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="bg-[hsl(220,15%,12%)]/80 border border-[hsl(220,15%,20%)] rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
            <FileText className="h-3 w-3" />
            Generating question...
          </div>
          <p className="text-gray-300 font-mono text-sm">
            {typedText}
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5"
            />
          </p>
        </motion.div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Generating...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-[hsl(220,15%,15%)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
