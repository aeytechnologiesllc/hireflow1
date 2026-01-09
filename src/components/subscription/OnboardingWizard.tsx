import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Briefcase,
  Users,
  FileText,
  BarChart3,
  MessageSquare,
  ChevronRight,
  Check,
  Crown,
  Zap,
  Rocket,
  Mic,
  ClipboardCheck,
  UserCircle,
  ArrowRight,
} from "lucide-react";

import { LaunchSequence } from "@/components/animations/LaunchSequence";
const HIREFLOW_FEATURES = [
  {
    icon: UserCircle,
    title: "Candidate Portal",
    description: "Applicants sign in to their own portal, submit resumes, and complete everything themselves.",
    stat: "Self-Service",
  },
  {
    icon: ClipboardCheck,
    title: "Smart Assessments",
    description: "AVA administers quizzes, typing tests, and chat simulations to evaluate real skills.",
    stat: "Automated",
  },
  {
    icon: Mic,
    title: "AVA Interviews",
    description: "Chat interviews for everyone, premium voice interviews for deeper insights.",
    stat: "24/7 Available",
  },
  {
    icon: BarChart3,
    title: "Analysis & Scoring",
    description: "AVA provides detailed reports and scores—then YOU decide who to interview.",
    stat: "Data-Driven",
  },
];

const WORKFLOW_STEPS = [
  {
    icon: Briefcase,
    title: "Post a Job",
    description: "AVA generates your hiring workflow",
  },
  {
    icon: Users,
    title: "Candidates Apply",
    description: "They get their own portal",
  },
  {
    icon: MessageSquare,
    title: "AVA Screens",
    description: "Quizzes, tests, interviews",
  },
  {
    icon: BarChart3,
    title: "You Review",
    description: "See scores & analysis",
  },
  {
    icon: Check,
    title: "Interview Winners",
    description: "Only pre-qualified candidates",
  },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const { completeOnboarding } = useSubscription();
  const pricing = usePricing();
  const isMobile = useIsMobile();

  const totalSteps = 5;

  // Swipe handlers for step navigation
  const handleSwipeLeft = useCallback(() => {
    if (step < totalSteps - 1) {
      setStep(prev => prev + 1);
    }
  }, [step, totalSteps]);

  const handleSwipeRight = useCallback(() => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  }, [step]);

  const swipeProps = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  }, { threshold: 60, velocity: 400 });

  useEffect(() => {
    if (step === 1) {
      const interval = setInterval(() => {
        setActiveFeature((prev) => (prev + 1) % HIREFLOW_FEATURES.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleComplete = async () => {
    await completeOnboarding.mutateAsync();
    setTimeout(onComplete, 2000);
  };

  const PLANS = [
    {
      name: "Growth",
      price: billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo",
      yearlyTotal: pricing.growth.yearlyFormatted,
      features: ["3 Active Jobs", "50 Applicants/month", "Chat Interviews", "Smart Documents"],
      popular: false,
      premium: false,
    },
    {
      name: "Business",
      price: billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo",
      yearlyTotal: pricing.business.yearlyFormatted,
      features: ["Unlimited Jobs", "Unlimited Applicants", "AVA Voice Assistant", "Voice Interviews", "30 Voice Minutes/mo", "Team Portal", "Advanced Analytics"],
      popular: true,
      premium: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background py-6 md:py-8">
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Animated scan line */}
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
          initial={{ top: "-10%" }}
          animate={{ top: "110%" }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Floating orbs */}
      <motion.div
        className="absolute top-[10%] right-[15%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px]"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-accent/15 blur-[100px]"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        className="absolute top-[40%] left-[30%] w-[200px] h-[200px] rounded-full bg-primary/10 blur-[80px]"
        animate={{
          x: [0, 100, 0],
          y: [0, -50, 0],
        }}
        transition={{ duration: 10, repeat: Infinity }}
      />

        {/* Main content - with swipe support on mobile */}
        <motion.div 
          className="relative z-10 w-full max-w-4xl mx-auto px-4 md:px-6 pb-24 md:pb-8 touch-pan-y"
          {...(isMobile ? swipeProps : {})}
        >
        {/* Progress indicators */}
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: totalSteps }).map((_, s) => (
            <motion.button
              key={s}
              onClick={() => s < step && setStep(s)}
              className={`relative h-2 rounded-full transition-all duration-500 ${
                s <= step ? "w-10" : "w-2"
              }`}
              style={{
                background: s <= step 
                  ? "linear-gradient(90deg, hsl(var(--primary)), hsl(180, 100%, 50%))"
                  : "hsl(var(--muted))",
              }}
              whileHover={s < step ? { scale: 1.1 } : {}}
            >
              {s === step && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, hsl(var(--primary)), hsl(180, 100%, 50%))",
                    filter: "blur(6px)",
                  }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center"
            >
              {/* Futuristic logo animation */}
              <div className="relative mb-8">
                {/* Outer rotating ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
                  style={{ width: 180, height: 180, left: -30, top: -30 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                />
                
                {/* Middle pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border border-primary/50"
                  style={{ width: 150, height: 150, left: -15, top: -15 }}
                  animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                {/* Core orb */}
                <motion.div
                  className="relative w-[120px] h-[120px] rounded-full flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(280, 85%, 65%))",
                    boxShadow: "0 0 60px hsl(var(--primary) / 0.5), inset 0 0 30px rgba(255,255,255,0.1)",
                  }}
                  animate={{
                    boxShadow: [
                      "0 0 60px hsl(var(--primary) / 0.5), inset 0 0 30px rgba(255,255,255,0.1)",
                      "0 0 100px hsl(var(--primary) / 0.7), inset 0 0 30px rgba(255,255,255,0.2)",
                      "0 0 60px hsl(var(--primary) / 0.5), inset 0 0 30px rgba(255,255,255,0.1)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Sparkles className="h-12 w-12 text-white" />
                </motion.div>

                {/* Orbiting particles */}
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute w-3 h-3 rounded-full bg-primary"
                    style={{
                      left: "50%",
                      top: "50%",
                      marginLeft: -6,
                      marginTop: -6,
                      boxShadow: "0 0 10px hsl(var(--primary))",
                    }}
                    animate={{
                      x: Math.cos((i * 90 * Math.PI) / 180) * 80,
                      y: Math.sin((i * 90 * Math.PI) / 180) * 80,
                      scale: [1, 0.5, 1],
                      opacity: [1, 0.5, 1],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      delay: i * 0.5,
                    }}
                  />
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4 mb-8"
              >
                <h1 className="text-4xl md:text-5xl font-bold text-foreground">
                  Hire <span className="text-gradient">Smarter</span>, Not Harder
                </h1>
                <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
                  AVA handles screening, scheduling, and assessments—so you can focus on finding the perfect fit.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  size="lg"
                  onClick={() => setStep(1)}
                  className="group relative px-8 py-6 text-lg bg-card border border-primary/50 text-foreground hover:bg-card/80 shadow-[0_0_30px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_50px_hsl(var(--primary)/0.5)] transition-all duration-300"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Meet AVA
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 1: What Makes Us Different */}
          {step === 1 && (
            <motion.div
              key="features"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-3xl font-bold text-foreground mb-2">What Makes Us Different</h2>
              <p className="text-muted-foreground mb-10">Stop wasting time on unqualified interviews</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10">
                {HIREFLOW_FEATURES.map((feature, idx) => {
                  const Icon = feature.icon;
                  const isActive = idx === activeFeature;
                  
                  return (
                    <motion.button
                      key={feature.title}
                      onClick={() => setActiveFeature(idx)}
                      className={`relative p-5 rounded-xl border text-left transition-all duration-500 ${
                        isActive 
                          ? "border-primary/50 bg-primary/5" 
                          : "border-border bg-card/30 hover:border-muted-foreground/30"
                      }`}
                      animate={isActive ? {
                        boxShadow: "0 0 30px hsl(var(--primary) / 0.2)",
                      } : {
                        boxShadow: "0 0 0px transparent",
                      }}
                      whileHover={{ scale: 1.02 }}
                    >
                      {isActive && (
                        <motion.div
                          className="absolute inset-0 rounded-xl border-2 border-primary/50"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          layoutId="activeFeature"
                        />
                      )}
                      
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all ${
                        isActive ? "bg-primary/20" : "bg-muted"
                      }`}>
                        <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      
                      <h3 className={`font-semibold mb-1 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {feature.title}
                      </h3>
                      
                      <p className={`text-xs leading-relaxed ${isActive ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                        {feature.description}
                      </p>

                      <div className={`mt-3 text-sm font-bold ${isActive ? "text-primary" : "text-muted-foreground/50"}`}>
                        {feature.stat}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Progress bar for auto-rotation */}
              <div className="flex gap-2 mb-8">
                {HIREFLOW_FEATURES.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      idx === activeFeature ? "w-8 bg-primary" : "w-2 bg-muted"
                    }`}
                  />
                ))}
              </div>

              <Button
                size="lg"
                onClick={() => setStep(2)}
                className="px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
              >
                See How AVA Works <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: How AVA Works - Interactive Journey Map */}
          {step === 2 && (
            <motion.div
              key="workflow"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-3xl font-bold text-foreground mb-2">How AVA Works For You</h2>
              <p className="text-muted-foreground mb-8">Watch AVA guide candidates through your hiring journey</p>

              {/* Interactive Journey Map - Responsive */}
              <div className="relative w-full max-w-4xl mb-8">
                {/* Mobile Vertical Journey */}
                {isMobile ? (
                  <div className="relative">
                    <svg
                      viewBox="0 0 320 700"
                      className="w-full h-auto"
                      style={{ overflow: 'visible' }}
                    >
                      <defs>
                        {/* Gradient for the path - vertical */}
                        <linearGradient id="journeyPathGradientMobile" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="hsl(var(--primary))" />
                          <stop offset="25%" stopColor="hsl(280, 85%, 65%)" />
                          <stop offset="50%" stopColor="hsl(200, 85%, 55%)" />
                          <stop offset="75%" stopColor="hsl(170, 80%, 45%)" />
                          <stop offset="100%" stopColor="hsl(var(--primary))" />
                        </linearGradient>
                        
                        {/* Glow filter */}
                        <filter id="pathGlowMobile" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>

                        {/* AVA orb gradient */}
                        <radialGradient id="avaOrbGradientMobile" cx="30%" cy="30%">
                          <stop offset="0%" stopColor="hsl(160, 90%, 60%)" />
                          <stop offset="50%" stopColor="hsl(160, 84%, 45%)" />
                          <stop offset="100%" stopColor="hsl(160, 80%, 35%)" />
                        </radialGradient>
                      </defs>

                      {/* Vertical S-curve path */}
                      <motion.path
                        d="M 160 50 
                           C 160 90, 240 110, 240 150 
                           C 240 190, 80 230, 80 280 
                           C 80 330, 240 370, 240 420 
                           C 240 470, 80 510, 80 560 
                           C 80 600, 160 630, 160 660"
                        fill="none"
                        stroke="url(#journeyPathGradientMobile)"
                        strokeWidth={3}
                        strokeLinecap="round"
                        filter="url(#pathGlowMobile)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 2, ease: "easeInOut" }}
                      />

                      {/* Faint background path */}
                      <path
                        d="M 160 50 
                           C 160 90, 240 110, 240 150 
                           C 240 190, 80 230, 80 280 
                           C 80 330, 240 370, 240 420 
                           C 240 470, 80 510, 80 560 
                           C 80 600, 160 630, 160 660"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1}
                        strokeOpacity={0.1}
                      />

                      {/* Step nodes on the vertical path */}
                      {[
                        { x: 160, y: 50 },
                        { x: 240, y: 150 },
                        { x: 80, y: 280 },
                        { x: 240, y: 420 },
                        { x: 80, y: 560 },
                      ].map((pos, idx) => (
                        <g key={idx}>
                          {/* Outer glow ring */}
                          <motion.circle
                            cx={pos.x}
                            cy={pos.y}
                            r={20}
                            fill="none"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ 
                              opacity: [0.2, 0.5, 0.2],
                              scale: 1 
                            }}
                            transition={{ 
                              opacity: { duration: 2, repeat: Infinity, delay: idx * 0.2 },
                              scale: { duration: 0.5, delay: 0.5 + idx * 0.3 }
                            }}
                            style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                          />
                          
                          {/* Inner glowing dot */}
                          <motion.circle
                            cx={pos.x}
                            cy={pos.y}
                            r={10}
                            fill="hsl(var(--primary))"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.5 + idx * 0.3 }}
                            style={{ 
                              filter: 'drop-shadow(0 0 8px hsl(var(--primary)))',
                            }}
                          />

                          {/* Step number */}
                          <motion.text
                            x={pos.x}
                            y={pos.y + 4}
                            textAnchor="middle"
                            fill="hsl(var(--primary-foreground))"
                            fontSize="10"
                            fontWeight="bold"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 + idx * 0.3 }}
                          >
                            {idx + 1}
                          </motion.text>
                        </g>
                      ))}

                      {/* AVA Orb traveling along vertical path */}
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        {/* Exhaust particles trailing behind */}
                        {[0, 1, 2, 3].map((particleIdx) => (
                          <motion.circle
                            key={`particle-mobile-${particleIdx}`}
                            r={2.5 - particleIdx * 0.4}
                            fill="hsl(160, 84%, 50%)"
                            initial={{ offsetDistance: "0%", opacity: 0 }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0, 0.5 - particleIdx * 0.1, 0]
                            }}
                            transition={{ 
                              duration: 5, 
                              ease: "easeInOut",
                              delay: 0.5 + particleIdx * 0.08,
                              repeat: Infinity,
                              repeatDelay: 1
                            }}
                            style={{
                              offsetPath: `path("M 160 50 C 160 90, 240 110, 240 150 C 240 190, 80 230, 80 280 C 80 330, 240 370, 240 420 C 240 470, 80 510, 80 560 C 80 600, 160 630, 160 660")`,
                            }}
                          />
                        ))}

                        {/* Wrapper group for synchronized wobble */}
                        <motion.g
                          animate={{ 
                            y: [0, -5, 0, -6, 0, -3, 0],
                            x: [-1.5, 1.5, -1, 1, -1.5, 1.5, 0]
                          }}
                          transition={{ 
                            duration: 0.4, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Orb outer glow ring */}
                          <motion.circle
                            r={16}
                            fill="none"
                            stroke="hsl(160, 84%, 45%)"
                            strokeWidth={2}
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0.2, 0.5, 0.2],
                              scale: [1, 1.1, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 5, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              opacity: { duration: 0.3, repeat: Infinity, ease: "easeInOut" },
                              scale: { duration: 0.3, repeat: Infinity, ease: "easeInOut" }
                            }}
                            style={{
                              offsetPath: `path("M 160 50 C 160 90, 240 110, 240 150 C 240 190, 80 230, 80 280 C 80 330, 240 370, 240 420 C 240 470, 80 510, 80 560 C 80 600, 160 630, 160 660")`,
                            }}
                          />
                          
                          {/* Main AVA orb */}
                          <motion.circle
                            r={11}
                            fill="url(#avaOrbGradientMobile)"
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              scale: [1, 1.08, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 5, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              scale: { duration: 0.3, repeat: Infinity, ease: "easeInOut" }
                            }}
                            style={{
                              offsetPath: `path("M 160 50 C 160 90, 240 110, 240 150 C 240 190, 80 230, 80 280 C 80 330, 240 370, 240 420 C 240 470, 80 510, 80 560 C 80 600, 160 630, 160 660")`,
                              filter: 'drop-shadow(0 0 10px hsl(160, 84%, 50%))',
                            }}
                          />

                          {/* Orb inner core */}
                          <motion.circle
                            r={5}
                            fill="white"
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0.4, 0.9, 0.4],
                              scale: [1, 1.2, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 5, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              opacity: { duration: 0.25, repeat: Infinity, ease: "easeInOut" },
                              scale: { duration: 0.25, repeat: Infinity, ease: "easeInOut" }
                            }}
                            style={{
                              offsetPath: `path("M 160 50 C 160 90, 240 110, 240 150 C 240 190, 80 230, 80 280 C 80 330, 240 370, 240 420 C 240 470, 80 510, 80 560 C 80 600, 160 630, 160 660")`,
                            }}
                          />
                        </motion.g>
                      </motion.g>
                    </svg>

                    {/* Mobile step cards positioned beside nodes */}
                    <div className="absolute inset-0 pointer-events-none">
                      {WORKFLOW_STEPS.map((workflowStep, idx) => {
                        const Icon = workflowStep.icon;
                        // Alternating left/right positions for mobile
                        const isRight = idx === 0 || idx === 2 || idx === 4;
                        const yPositions = ['5%', '19%', '37%', '57%', '77%'];
                        
                        return (
                          <motion.div
                            key={workflowStep.title}
                            className="absolute pointer-events-auto"
                            style={{
                              top: yPositions[idx],
                              ...(isRight 
                                ? { left: '58%', right: '4%' }
                                : { left: '4%', right: '58%' }
                              ),
                            }}
                            initial={{ opacity: 0, x: isRight ? 20 : -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ 
                              duration: 0.5, 
                              delay: 1 + idx * 0.15,
                              ease: "easeOut"
                            }}
                          >
                            <div className="p-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-primary/20 shadow-lg">
                              <div className="relative flex flex-col items-center text-center gap-1">
                                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                                  <Icon className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <h4 className="font-semibold text-foreground text-[11px] leading-tight">
                                  {workflowStep.title}
                                </h4>
                                <p className="text-[9px] text-muted-foreground leading-tight">
                                  {workflowStep.description}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Desktop Horizontal Journey - Original Layout */
                  <>
                    <svg
                      viewBox="0 0 900 320"
                      className="w-full h-auto"
                      style={{ overflow: 'visible' }}
                    >
                      <defs>
                        {/* Gradient for the path */}
                        <linearGradient id="journeyPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="hsl(var(--primary))" />
                          <stop offset="25%" stopColor="hsl(280, 85%, 65%)" />
                          <stop offset="50%" stopColor="hsl(200, 85%, 55%)" />
                          <stop offset="75%" stopColor="hsl(170, 80%, 45%)" />
                          <stop offset="100%" stopColor="hsl(var(--primary))" />
                        </linearGradient>
                        
                        {/* Glow filter */}
                        <filter id="pathGlow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>

                        {/* AVA orb gradient */}
                        <radialGradient id="avaOrbGradient" cx="30%" cy="30%">
                          <stop offset="0%" stopColor="hsl(160, 90%, 60%)" />
                          <stop offset="50%" stopColor="hsl(160, 84%, 45%)" />
                          <stop offset="100%" stopColor="hsl(160, 80%, 35%)" />
                        </radialGradient>
                      </defs>

                      {/* Main S-curve journey path */}
                      <motion.path
                        d="M 90 160 
                           C 150 160, 170 80, 270 80 
                           C 370 80, 390 240, 450 240 
                           C 510 240, 530 80, 630 80 
                           C 730 80, 750 160, 810 160"
                        fill="none"
                        stroke="url(#journeyPathGradient)"
                        strokeWidth={4}
                        strokeLinecap="round"
                        filter="url(#pathGlow)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 2, ease: "easeInOut" }}
                      />

                      {/* Faint background path */}
                      <path
                        d="M 90 160 
                           C 150 160, 170 80, 270 80 
                           C 370 80, 390 240, 450 240 
                           C 510 240, 530 80, 630 80 
                           C 730 80, 750 160, 810 160"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1}
                        strokeOpacity={0.1}
                      />

                      {/* Step nodes along the path */}
                      {[
                        { x: 90, y: 160 },
                        { x: 270, y: 80 },
                        { x: 450, y: 240 },
                        { x: 630, y: 80 },
                        { x: 810, y: 160 },
                      ].map((pos, idx) => (
                        <g key={idx}>
                          {/* Outer glow ring */}
                          <motion.circle
                            cx={pos.x}
                            cy={pos.y}
                            r={24}
                            fill="none"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ 
                              opacity: [0.2, 0.5, 0.2],
                              scale: 1 
                            }}
                            transition={{ 
                              opacity: { duration: 2, repeat: Infinity, delay: idx * 0.2 },
                              scale: { duration: 0.5, delay: 0.5 + idx * 0.3 }
                            }}
                            style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                          />
                          
                          {/* Inner glowing dot */}
                          <motion.circle
                            cx={pos.x}
                            cy={pos.y}
                            r={10}
                            fill="hsl(var(--primary))"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.5 + idx * 0.3 }}
                            style={{ 
                              filter: 'drop-shadow(0 0 8px hsl(var(--primary)))',
                            }}
                          />

                          {/* Step number */}
                          <motion.text
                            x={pos.x}
                            y={pos.y + 4}
                            textAnchor="middle"
                            fill="hsl(var(--primary-foreground))"
                            fontSize="11"
                            fontWeight="bold"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 + idx * 0.3 }}
                          >
                            {idx + 1}
                          </motion.text>
                        </g>
                      ))}

                      {/* AVA Orb traveling along path with rocket-style wobble */}
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        {/* Exhaust particles trailing behind */}
                        {[0, 1, 2, 3, 4].map((particleIdx) => (
                          <motion.circle
                            key={`particle-${particleIdx}`}
                            r={3 - particleIdx * 0.4}
                            fill="hsl(160, 84%, 50%)"
                            initial={{ offsetDistance: "0%", opacity: 0 }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0, 0.6 - particleIdx * 0.1, 0]
                            }}
                            transition={{ 
                              duration: 4, 
                              ease: "easeInOut",
                              delay: 0.5 + particleIdx * 0.08,
                              repeat: Infinity,
                              repeatDelay: 1
                            }}
                            style={{
                              offsetPath: `path("M 90 160 C 150 160, 170 80, 270 80 C 370 80, 390 240, 450 240 C 510 240, 530 80, 630 80 C 730 80, 750 160, 810 160")`,
                            }}
                          />
                        ))}

                        {/* Wrapper group for synchronized wobble - matches autopilot rocket */}
                        <motion.g
                          animate={{ 
                            y: [0, -6, 0, -8, 0, -4, 0],
                            x: [-2, 2, -1, 1, -2, 2, 0]
                          }}
                          transition={{ 
                            duration: 0.4, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        >
                          {/* Orb outer glow ring */}
                          <motion.circle
                            r={20}
                            fill="none"
                            stroke="hsl(160, 84%, 45%)"
                            strokeWidth={2}
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0.2, 0.5, 0.2],
                              scale: [1, 1.1, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 4, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              opacity: {
                                duration: 0.3,
                                repeat: Infinity,
                                ease: "easeInOut"
                              },
                              scale: {
                                duration: 0.3,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }
                            }}
                            style={{
                              offsetPath: `path("M 90 160 C 150 160, 170 80, 270 80 C 370 80, 390 240, 450 240 C 510 240, 530 80, 630 80 C 730 80, 750 160, 810 160")`,
                            }}
                          />
                          
                          {/* Main AVA orb with scale pulse */}
                          <motion.circle
                            r={14}
                            fill="url(#avaOrbGradient)"
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              scale: [1, 1.08, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 4, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              scale: {
                                duration: 0.3,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }
                            }}
                            style={{
                              offsetPath: `path("M 90 160 C 150 160, 170 80, 270 80 C 370 80, 390 240, 450 240 C 510 240, 530 80, 630 80 C 730 80, 750 160, 810 160")`,
                              filter: 'drop-shadow(0 0 12px hsl(160, 84%, 50%))',
                            }}
                          />

                          {/* Orb inner core with rapid pulse */}
                          <motion.circle
                            r={6}
                            fill="white"
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              opacity: [0.4, 0.9, 0.4],
                              scale: [1, 1.2, 1]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 4, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              opacity: {
                                duration: 0.25,
                                repeat: Infinity,
                                ease: "easeInOut"
                              },
                              scale: {
                                duration: 0.25,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }
                            }}
                            style={{
                              offsetPath: `path("M 90 160 C 150 160, 170 80, 270 80 C 370 80, 390 240, 450 240 C 510 240, 530 80, 630 80 C 730 80, 750 160, 810 160")`,
                            }}
                          />

                          {/* Energy burst effect */}
                          <motion.circle
                            r={10}
                            fill="none"
                            stroke="hsl(160, 84%, 60%)"
                            strokeWidth={1}
                            initial={{ offsetDistance: "0%" }}
                            animate={{ 
                              offsetDistance: "100%",
                              scale: [1, 1.6, 1],
                              opacity: [0.5, 0, 0.5]
                            }}
                            transition={{ 
                              offsetDistance: {
                                duration: 4, 
                                ease: "easeInOut",
                                delay: 0.5,
                                repeat: Infinity,
                                repeatDelay: 1
                              },
                              scale: {
                                duration: 0.6,
                                repeat: Infinity,
                                ease: "easeOut"
                              },
                              opacity: {
                                duration: 0.6,
                                repeat: Infinity,
                                ease: "easeOut"
                              }
                            }}
                            style={{
                              offsetPath: `path("M 90 160 C 150 160, 170 80, 270 80 C 370 80, 390 240, 450 240 C 510 240, 530 80, 630 80 C 730 80, 750 160, 810 160")`,
                            }}
                          />
                        </motion.g>
                      </motion.g>
                    </svg>

                    {/* Desktop step cards positioned below path nodes */}
                    <div className="absolute inset-0 pointer-events-none">
                      {WORKFLOW_STEPS.map((workflowStep, idx) => {
                        const Icon = workflowStep.icon;
                        const positions = [
                          { left: '10%', top: '65%' },
                          { left: '30%', top: '0%' },
                          { left: '50%', top: '75%' },
                          { left: '70%', top: '0%' },
                          { left: '90%', top: '55%' },
                        ];
                        const pos = positions[idx];
                        
                        return (
                          <motion.div
                            key={workflowStep.title}
                            className="absolute pointer-events-auto"
                            style={{
                              left: pos.left,
                              top: pos.top,
                              transform: 'translateX(-50%)',
                            }}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ 
                              duration: 0.5, 
                              delay: 1 + idx * 0.2,
                              ease: "easeOut"
                            }}
                          >
                            <div className="relative p-3 rounded-xl bg-card/80 backdrop-blur-md border border-primary/20 shadow-lg hover:border-primary/40 hover:shadow-primary/20 transition-all duration-300 w-[120px] md:w-[140px]">
                              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                              
                              <div className="relative flex flex-col items-center text-center gap-1">
                                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <h4 className="font-semibold text-foreground text-xs md:text-sm leading-tight">
                                  {workflowStep.title}
                                </h4>
                                <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                                  {workflowStep.description}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Key benefit callout */}
              <motion.div
                className="w-full max-w-2xl p-5 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-sm mb-8"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2 }}
              >
                <div className="flex items-start gap-4">
                  <motion.div 
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0 border border-primary/20"
                    animate={{
                      boxShadow: [
                        "0 0 20px hsl(var(--primary) / 0.2)",
                        "0 0 30px hsl(var(--primary) / 0.4)",
                        "0 0 20px hsl(var(--primary) / 0.2)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="h-6 w-6 text-primary" />
                  </motion.div>
                  <div>
                    <h4 className="font-bold text-foreground mb-1">The AVA Difference</h4>
                    <p className="text-muted-foreground text-sm">
                      Most employers waste hours interviewing candidates who aren't qualified. With AVA, candidates complete assessments, quizzes, and interviews <span className="text-primary font-medium">before you ever meet them</span>. You only spend time with the best.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.2 }}
              >
                <Button
                  size="lg"
                  onClick={() => setStep(3)}
                  className="px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30 transition-all"
                >
                  See What You Get <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 3: Pricing/Trial */}
          {step === 3 && (
            <motion.div
              key="trial"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              {/* Trial badge */}
              <motion.div
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6"
                animate={{
                  boxShadow: [
                    "0 0 20px hsl(var(--primary) / 0.2)",
                    "0 0 40px hsl(var(--primary) / 0.4)",
                    "0 0 20px hsl(var(--primary) / 0.2)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Zap className="h-5 w-5 text-primary" />
                <span className="font-semibold text-primary">7-Day Free Trial</span>
              </motion.div>

              <h2 className="text-3xl font-bold text-foreground mb-2">Try Everything Free</h2>
              <p className="text-muted-foreground mb-6">Full access. No credit card. No commitment.</p>

              {/* Billing Toggle */}
              <div className="flex items-center gap-1 p-1 rounded-full bg-muted/50 border border-border mb-8">
                <button
                  onClick={() => setBillingInterval("monthly")}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                    billingInterval === "monthly"
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingInterval("yearly")}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    billingInterval === "yearly"
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Yearly
                  <span className="text-xs bg-background/20 px-2 py-0.5 rounded-full">
                    Save 20%
                  </span>
                </button>
              </div>

              {/* Plans */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mb-6 md:mb-8">
                {PLANS.map((plan, idx) => (
                  <motion.div
                    key={plan.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.02, y: -4 }}
                    className={`relative p-4 md:p-6 rounded-2xl border transition-all ${
                      plan.popular
                        ? "border-primary/50 bg-gradient-to-b from-primary/10 to-transparent shadow-[0_0_30px_hsl(var(--primary)/0.15)]"
                        : "border-border bg-card/50 hover:border-muted-foreground/30"
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg font-medium">
                          <Crown className="h-3.5 w-3.5" /> Most Popular
                        </span>
                      </div>
                    )}
                    {plan.premium && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg font-medium">
                          <Sparkles className="h-3.5 w-3.5" /> Premium
                        </span>
                      </div>
                    )}
                    
                    <h3 className="font-bold text-lg md:text-xl text-foreground mb-3 md:mb-4">{plan.name}</h3>
                    
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl md:text-4xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    
                    {billingInterval === "yearly" && (
                      <p className="text-sm text-muted-foreground mb-3 md:mb-4">Billed {plan.yearlyTotal}/year</p>
                    )}
                    
                    <ul className="space-y-2 md:space-y-3 mt-4 md:mt-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 md:gap-3">
                          <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <Check className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary" />
                          </div>
                          <span className="text-muted-foreground text-xs md:text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-block"
              >
                <Button
                  size="lg"
                  onClick={() => setStep(4)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl px-10 py-7 text-lg h-auto font-medium shadow-lg shadow-primary/25"
                >
                  Start My Free Trial <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 4: Launch Sequence Celebration */}
          {step === 4 && (
            <motion.div
              key="celebrate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[500px] w-full"
            >
              <LaunchSequence onComplete={handleComplete} />
            </motion.div>
          )}
        </AnimatePresence>
        {isMobile && step < 4 && (
          <p className="text-center text-xs text-muted-foreground pt-4">
            Swipe left/right to navigate
          </p>
        )}
      </motion.div>
    </div>
  );
}
