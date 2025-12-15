import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Briefcase,
  Users,
  FileText,
  BarChart3,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Check,
  Crown,
  Zap,
  Clock,
} from "lucide-react";
import confetti from "canvas-confetti";

const FEATURES = [
  {
    icon: Briefcase,
    title: "Smart Job Posting",
    description: "AI-powered job descriptions and bias detection",
    color: "text-blue-400",
  },
  {
    icon: Users,
    title: "Automated Screening",
    description: "AVA handles candidate assessment 24/7",
    color: "text-emerald-400",
  },
  {
    icon: MessageSquare,
    title: "AI Interviews",
    description: "Dynamic conversational interviews with AVA",
    color: "text-purple-400",
  },
  {
    icon: FileText,
    title: "Document Workflows",
    description: "DocuSign-style contracts and offers",
    color: "text-orange-400",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track hiring metrics and pipeline health",
    color: "text-cyan-400",
  },
];

const PLANS = [
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    features: ["3 Active Jobs", "50 Applicants/month", "AI Screening", "Documents"],
    popular: false,
  },
  {
    name: "Business",
    price: "$99",
    period: "/month",
    features: ["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics", "Priority Support"],
    popular: true,
  },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [featureIndex, setFeatureIndex] = useState(0);
  const { completeOnboarding } = useSubscription();

  useEffect(() => {
    if (step === 1) {
      const interval = setInterval(() => {
        setFeatureIndex((prev) => (prev + 1) % FEATURES.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleComplete = async () => {
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#14b8a6", "#8b5cf6", "#f59e0b"],
    });

    await completeOnboarding.mutateAsync();
    setTimeout(onComplete, 1500);
  };

  const steps = [
    // Step 0: Welcome
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center space-y-8"
    >
      {/* AVA Orb Animation */}
      <div className="relative">
        <motion.div
          className="w-32 h-32 rounded-full bg-gradient-to-br from-primary via-primary/80 to-accent"
          animate={{
            scale: [1, 1.1, 1],
            boxShadow: [
              "0 0 0 0 rgba(20, 184, 166, 0.4)",
              "0 0 0 30px rgba(20, 184, 166, 0)",
              "0 0 0 0 rgba(20, 184, 166, 0)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="h-12 w-12 text-white" />
        </motion.div>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">Welcome to HireFlow</h1>
        <p className="text-muted-foreground text-lg max-w-md">
          Meet AVA, your AI hiring assistant. Let's show you around!
        </p>
      </div>

      <Button size="lg" className="gap-2" onClick={() => setStep(1)}>
        Get Started <ChevronRight className="h-4 w-4" />
      </Button>
    </motion.div>,

    // Step 1: Feature Carousel
    <motion.div
      key="features"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center space-y-8"
    >
      <h2 className="text-2xl font-bold text-foreground">Powerful Features</h2>

      <div className="relative h-48 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={featureIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <div className={`p-4 rounded-full bg-card mb-4 ${FEATURES[featureIndex].color}`}>
              {(() => {
                const Icon = FEATURES[featureIndex].icon;
                return <Icon className="h-10 w-10" />;
              })()}
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {FEATURES[featureIndex].title}
            </h3>
            <p className="text-muted-foreground mt-2">
              {FEATURES[featureIndex].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex gap-2">
        {FEATURES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setFeatureIndex(idx)}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === featureIndex ? "bg-primary w-6" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(0)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={() => setStep(2)}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </motion.div>,

    // Step 2: Trial Benefits
    <motion.div
      key="trial"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center space-y-6"
    >
      <div className="flex items-center gap-2 text-primary">
        <Clock className="h-6 w-6" />
        <span className="text-lg font-semibold">7-Day Free Trial</span>
      </div>

      <h2 className="text-2xl font-bold text-foreground">
        Try Everything, Risk Free
      </h2>
      <p className="text-muted-foreground max-w-md">
        Full access to all features during your trial. No credit card required.
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={`p-4 relative ${
              plan.popular ? "border-primary bg-primary/5" : ""
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center gap-1">
                  <Crown className="h-3 w-3" /> Popular
                </span>
              </div>
            )}
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">{plan.name}</h3>
              <div className="flex items-baseline justify-center">
                <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-2 text-sm text-left">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={() => setStep(3)}>
          Let's Go! <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </motion.div>,

    // Step 3: Celebration
    <motion.div
      key="celebrate"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col items-center text-center space-y-6"
    >
      <motion.div
        className="p-6 rounded-full bg-gradient-to-br from-primary to-accent"
        animate={{
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 0.5 }}
      >
        <Zap className="h-16 w-16 text-white" />
      </motion.div>

      <h2 className="text-3xl font-bold text-foreground">You're All Set!</h2>
      <p className="text-muted-foreground text-lg max-w-md">
        Your 7-day trial has started. Time to revolutionize your hiring!
      </p>

      <Button size="lg" className="gap-2" onClick={handleComplete}>
        <Sparkles className="h-4 w-4" />
        Start Hiring
      </Button>
    </motion.div>,
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8 bg-card border-border">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">{steps[step]}</AnimatePresence>
      </Card>
    </div>
  );
}
