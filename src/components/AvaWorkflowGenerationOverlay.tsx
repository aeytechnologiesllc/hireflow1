import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Brain, ClipboardCheck, GitBranch, Sparkles, Zap } from "lucide-react";
import avaOrb from "@/assets/ava-orb.png";

interface AvaWorkflowGenerationOverlayProps {
  isVisible: boolean;
  jobTitle: string;
  difficulty: string;
  minDuration?: number;
  onComplete?: () => void;
  isApiComplete?: boolean; // Parent signals when API has returned
}

// Content for typing animations
const APPLICATION_QUESTIONS = [
  "Describe your experience leading cross-functional teams through challenging projects...",
  "How do you approach prioritizing multiple competing deadlines?",
  "Tell us about a time you turned a difficult situation into a success...",
  "What motivates you to excel and continuously improve?",
  "Share an example of creative problem-solving in your work...",
];

const QUIZ_QUESTIONS = [
  "A customer expresses frustration about a delayed order. What's your first response?",
  "Your team disagrees on the best approach. How do you facilitate consensus?",
  "You notice a colleague struggling. What action do you take?",
  "Quality vs deadline - how do you balance the tradeoff?",
];

const WORKFLOW_PHASES = [
  "Application Review → Initial Screening",
  "Skills Assessment → Technical Interview",
  "Culture Fit → Reference Check",
  "Final Decision → Offer",
];

// Neural network node configuration
const NEURAL_NODES = [
  { id: "analyze", label: "Analyze", icon: Brain, angle: -90, delay: 0.5 },
  { id: "questions", label: "Questions", icon: FileText, angle: -30, delay: 1.2 },
  { id: "quiz", label: "Quiz", icon: ClipboardCheck, angle: 30, delay: 1.9 },
  { id: "workflow", label: "Workflow", icon: GitBranch, angle: 90, delay: 2.6 },
  { id: "optimize", label: "Optimize", icon: Sparkles, angle: 150, delay: 3.3 },
  { id: "finalize", label: "Finalize", icon: Zap, angle: 210, delay: 4.0 },
];

type Phase = "awakening" | "creation" | "completion";

export default function AvaWorkflowGenerationOverlay({ 
  isVisible, 
  jobTitle, 
  difficulty,
  minDuration = 20000,
  onComplete,
  isApiComplete = false
}: AvaWorkflowGenerationOverlayProps) {
  const [phase, setPhase] = useState<Phase>("awakening");
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [energyPulseIndex, setEnergyPulseIndex] = useState(0);
  const [counters, setCounters] = useState({ questions: 0, quiz: 0, phases: 0 });
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [typedTexts, setTypedTexts] = useState(["", "", ""]);
  const [orbScale, setOrbScale] = useState(0);
  const [progressRing, setProgressRing] = useState(0);
  const startTimeRef = useRef<number>(0);
  const animationCompleteRef = useRef(false);

  // Particle system
  const particles = useMemo(() => 
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 4 + 3,
      delay: Math.random() * 2,
      color: Math.random() > 0.5 ? "primary" : "accent",
    }))
  , []);

  // Reset everything when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      startTimeRef.current = Date.now();
      animationCompleteRef.current = false;
      setPhase("awakening");
      setActiveNodes([]);
      setEnergyPulseIndex(0);
      setCounters({ questions: 0, quiz: 0, phases: 0 });
      setActiveCardIndex(0);
      setTypedTexts(["", "", ""]);
      setOrbScale(0);
      setProgressRing(0);
    }
  }, [isVisible]);

  // Phase 1: Awakening (0-4s) - Orb emergence
  useEffect(() => {
    if (!isVisible || phase !== "awakening") return;

    // Orb emergence animation
    const orbTimer = setTimeout(() => setOrbScale(1), 300);
    
    // Transition to creation phase
    const phaseTimer = setTimeout(() => setPhase("creation"), 4000);

    return () => {
      clearTimeout(orbTimer);
      clearTimeout(phaseTimer);
    };
  }, [isVisible, phase]);

  // Phase 2: Creation (4-16s) - Main work happens
  useEffect(() => {
    if (!isVisible || phase !== "creation") return;

    // Activate nodes sequentially
    const nodeTimers = NEURAL_NODES.map((node, i) => 
      setTimeout(() => {
        setActiveNodes(prev => [...prev, node.id]);
      }, i * 1800)
    );

    // Transition to completion phase
    const completionTimer = setTimeout(() => setPhase("completion"), 12000);

    return () => {
      nodeTimers.forEach(clearTimeout);
      clearTimeout(completionTimer);
    };
  }, [isVisible, phase]);

  // Energy pulses during creation
  useEffect(() => {
    if (!isVisible || phase !== "creation") return;

    const pulseInterval = setInterval(() => {
      setEnergyPulseIndex(prev => prev + 1);
    }, 2500);

    return () => clearInterval(pulseInterval);
  }, [isVisible, phase]);

  // Progress ring animation - tracks time but doesn't trigger completion
  useEffect(() => {
    if (!isVisible) return;

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min((elapsed / minDuration) * 100, 100);
      setProgressRing(progress);

      if (progress >= 100 && !animationCompleteRef.current) {
        animationCompleteRef.current = true;
      }
    }, 50);

    return () => clearInterval(progressInterval);
  }, [isVisible, minDuration]);

  // Only call onComplete when BOTH animation is done AND API is complete
  useEffect(() => {
    if (animationCompleteRef.current && isApiComplete && onComplete) {
      // Small delay for completion burst to show
      const timer = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isApiComplete, onComplete, progressRing]); // progressRing triggers re-check when animation completes

  // Cycle through floating cards
  useEffect(() => {
    if (!isVisible || phase === "awakening") return;

    const cardInterval = setInterval(() => {
      setActiveCardIndex(prev => (prev + 1) % 3);
    }, 4500);

    return () => clearInterval(cardInterval);
  }, [isVisible, phase]);

  // Typing animation for each card
  useEffect(() => {
    if (!isVisible || phase === "awakening") return;

    const contents = [
      APPLICATION_QUESTIONS[counters.questions % APPLICATION_QUESTIONS.length],
      QUIZ_QUESTIONS[counters.quiz % QUIZ_QUESTIONS.length],
      WORKFLOW_PHASES[counters.phases % WORKFLOW_PHASES.length],
    ];

    let charIndices = [0, 0, 0];
    setTypedTexts(["", "", ""]);

    const typeInterval = setInterval(() => {
      setTypedTexts(prev => {
        const newTexts = [...prev];
        for (let i = 0; i < 3; i++) {
          if (charIndices[i] <= contents[i].length) {
            newTexts[i] = contents[i].slice(0, charIndices[i]);
            charIndices[i]++;
          }
        }
        return newTexts;
      });
    }, 40);

    const counterInterval = setInterval(() => {
      setCounters(prev => ({
        questions: prev.questions + 1,
        quiz: prev.quiz + 1,
        phases: prev.phases + 1,
      }));
    }, 4000);

    return () => {
      clearInterval(typeInterval);
      clearInterval(counterInterval);
    };
  }, [isVisible, phase, counters.questions, counters.quiz, counters.phases]);

  if (!isVisible) return null;

  const cardConfigs = [
    { title: "Application Questions", icon: FileText, color: "from-primary/60 to-accent/60" },
    { title: "Screening Quiz", icon: ClipboardCheck, color: "from-accent/60 to-primary/60" },
    { title: "Workflow Phases", icon: GitBranch, color: "from-primary/40 to-accent/40" },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      >
        {/* Deep space backdrop */}
        <div className="absolute inset-0 bg-[hsl(220,20%,2%)]" />

        {/* Atmospheric gradient orbs */}
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.15, 0.3, 0.15],
            x: [0, 30, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[200px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.4), transparent)" }}
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.25, 0.1],
            x: [0, -40, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[180px]"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.4), transparent)" }}
        />

        {/* Particle field */}
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              background: particle.color === "primary" 
                ? "hsl(var(--primary) / 0.6)" 
                : "hsl(var(--accent) / 0.6)",
            }}
            animate={{
              y: [-20, -100 - Math.random() * 100],
              x: [0, (Math.random() - 0.5) * 50],
              opacity: [0, 0.8, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Main container */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Neural network visualization */}
          <div className="relative w-[400px] h-[400px] md:w-[500px] md:h-[500px]">
            {/* Connection lines (SVG) */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 500">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              {NEURAL_NODES.map((node, i) => {
                const isActive = activeNodes.includes(node.id);
                const x1 = 250;
                const y1 = 250;
                const radius = 180;
                const x2 = 250 + radius * Math.cos((node.angle * Math.PI) / 180);
                const y2 = 250 + radius * Math.sin((node.angle * Math.PI) / 180);
                
                return (
                  <motion.line
                    key={node.id}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="url(#lineGradient)"
                    strokeWidth={isActive ? 2 : 1}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ 
                      pathLength: isActive ? 1 : 0.3, 
                      opacity: isActive ? 1 : 0.2,
                    }}
                    transition={{ duration: 1.5, delay: node.delay }}
                  />
                );
              })}
              
              {/* Data pulse traveling along lines */}
              {activeNodes.map((nodeId) => {
                const node = NEURAL_NODES.find(n => n.id === nodeId);
                if (!node) return null;
                const radius = 180;
                const x = 250 + radius * Math.cos((node.angle * Math.PI) / 180);
                const y = 250 + radius * Math.sin((node.angle * Math.PI) / 180);
                
                return (
                  <motion.circle
                    key={`pulse-${nodeId}`}
                    r="4"
                    fill="hsl(var(--primary))"
                    initial={{ cx: 250, cy: 250, opacity: 0 }}
                    animate={{
                      cx: [250, x, 250],
                      cy: [250, y, 250],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}
            </svg>

            {/* Neural nodes */}
            {NEURAL_NODES.map((node) => {
              const isActive = activeNodes.includes(node.id);
              const radius = 180;
              const x = 50 + (radius * Math.cos((node.angle * Math.PI) / 180)) / 2.5;
              const y = 50 + (radius * Math.sin((node.angle * Math.PI) / 180)) / 2.5;
              const NodeIcon = node.icon;

              return (
                <motion.div
                  key={node.id}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: isActive ? 1 : 0.7, 
                    opacity: isActive ? 1 : 0.4,
                  }}
                  transition={{ duration: 0.6, delay: node.delay, type: "spring" }}
                >
                  {/* Node glow */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ 
                        background: "radial-gradient(circle, hsl(var(--primary) / 0.5), transparent)",
                        width: 80,
                        height: 80,
                        left: -20,
                        top: -20,
                      }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  
                  {/* Node circle */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-500 ${
                    isActive 
                      ? "bg-primary/20 border-primary/50 shadow-[0_0_20px_hsl(var(--primary)/0.5)]" 
                      : "bg-muted/10 border-border/30"
                  }`}>
                    <NodeIcon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  
                  {/* Node label */}
                  <motion.span
                    className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                    animate={{ opacity: isActive ? 1 : 0.4 }}
                  >
                    {node.label}
                  </motion.span>
                </motion.div>
              );
            })}

            {/* Central AVA orb */}
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: orbScale, opacity: 1 }}
              transition={{ duration: 1.2, type: "spring", bounce: 0.4 }}
            >
              {/* Progress ring */}
              <svg className="absolute -inset-8 w-[calc(100%+64px)] h-[calc(100%+64px)]" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="55"
                  fill="none"
                  stroke="hsl(var(--border) / 0.3)"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="60"
                  cy="60"
                  r="55"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={345}
                  strokeDashoffset={345 - (345 * progressRing) / 100}
                  transform="rotate(-90 60 60)"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Outer glow rings */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, hsl(var(--primary) / 0.4), transparent 70%)",
                  width: 160,
                  height: 160,
                  left: -40,
                  top: -40,
                }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Energy pulses */}
              <AnimatePresence>
                {Array.from({ length: energyPulseIndex }).map((_, i) => (
                  <motion.div
                    key={`energy-${i}`}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/50"
                    initial={{ width: 80, height: 80, opacity: 0.8 }}
                    animate={{ width: 300, height: 300, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, ease: "easeOut" }}
                  />
                ))}
              </AnimatePresence>

              {/* AVA orb image */}
              <motion.div
                animate={{ 
                  y: [0, -8, 0],
                  rotate: [0, 3, -3, 0],
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <div className="relative w-20 h-20">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-xl"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <img
                    src={avaOrb}
                    alt="AVA"
                    className="relative w-full h-full object-contain drop-shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Title section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="text-center mt-4 mb-8"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {phase === "awakening" && "AVA is initializing..."}
              {phase === "creation" && "Creating your workflow"}
              {phase === "completion" && "Finalizing workflow..."}
            </h2>
            <p className="text-muted-foreground">
              Building a custom hiring process for{" "}
              <span className="text-primary font-medium">{jobTitle}</span>
            </p>
          </motion.div>

          {/* Floating 3D content cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase !== "awakening" ? 1 : 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="flex flex-col md:flex-row gap-4 md:gap-6 px-4 max-w-4xl"
          >
            {cardConfigs.map((config, i) => {
              const CardIcon = config.icon;
              const isActive = activeCardIndex === i;
              
              return (
                <motion.div
                  key={config.title}
                  className="flex-1 min-w-0"
                  initial={{ opacity: 0, y: 30, rotateX: 15 }}
                  animate={{
                    opacity: 1,
                    y: isActive ? -10 : 0,
                    rotateX: isActive ? 0 : 5,
                    scale: isActive ? 1.02 : 0.98,
                  }}
                  transition={{ delay: 4.5 + i * 0.3, duration: 0.6, type: "spring" }}
                  style={{ perspective: 1000, transformStyle: "preserve-3d" }}
                >
                  <div className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
                    isActive 
                      ? "bg-card/80 border-primary/30 shadow-[0_10px_40px_hsl(var(--primary)/0.2)]" 
                      : "bg-card/40 border-border/20"
                  }`}>
                    {/* Card glow */}
                    {isActive && (
                      <motion.div
                        className={`absolute inset-0 bg-gradient-to-br ${config.color} opacity-10`}
                        animate={{ opacity: [0.05, 0.15, 0.05] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                    
                    <div className="relative p-4">
                      {/* Card header */}
                      <div className="flex items-center gap-2 mb-3">
                        <motion.div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${config.color}`}
                          animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <CardIcon className="w-4 h-4 text-foreground" />
                        </motion.div>
                        <span className="text-sm font-medium text-foreground">
                          {config.title}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {i === 0 ? counters.questions : i === 1 ? counters.quiz : counters.phases} created
                        </span>
                      </div>
                      
                      {/* Typing content */}
                      <div className="h-16 overflow-hidden">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {typedTexts[i]}
                          <motion.span
                            className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
                            animate={{ opacity: [1, 0] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                          />
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Bottom progress indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="mt-8 text-center"
          >
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-card/40 border border-border/30">
              <motion.div
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-sm text-muted-foreground">
                {Math.round(progressRing)}% complete
              </span>
            </div>
          </motion.div>
        </div>

        {/* Completion burst effect */}
        <AnimatePresence>
          {phase === "completion" && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Radial burst */}
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: "radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)",
                }}
                initial={{ width: 100, height: 100, opacity: 0 }}
                animate={{ width: 800, height: 800, opacity: [0, 0.5, 0] }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
