import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { Button } from "@/components/ui/button";
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
    description: "AI-powered job descriptions and automated workflows",
    gradient: "from-blue-500 to-cyan-400",
  },
  {
    icon: Users,
    title: "Automated Screening",
    description: "AVA handles candidate assessment 24/7",
    gradient: "from-emerald-500 to-teal-400",
  },
  {
    icon: MessageSquare,
    title: "AI Interviews",
    description: "Dynamic conversational interviews with AVA",
    gradient: "from-purple-500 to-fuchsia-400",
  },
  {
    icon: FileText,
    title: "Document Workflows",
    description: "DocuSign-style contracts and offers",
    gradient: "from-orange-500 to-amber-400",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track hiring metrics and pipeline health",
    gradient: "from-pink-500 to-rose-400",
  },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const { completeOnboarding } = useSubscription();
  const pricing = usePricing();

  useEffect(() => {
    if (step === 1) {
      const interval = setInterval(() => {
        setFeatureIndex((prev) => (prev + 1) % FEATURES.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleComplete = async () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899"],
    });

    await completeOnboarding.mutateAsync();
    setTimeout(onComplete, 1500);
  };

  const PLANS = [
    {
      name: "Growth",
      price: billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo (billed yearly)",
      yearlyTotal: pricing.growth.yearlyFormatted,
      features: ["3 Active Jobs", "50 Applicants/month", "AI Screening", "Documents"],
      popular: false,
    },
    {
      name: "Business",
      price: billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo (billed yearly)",
      yearlyTotal: pricing.business.yearlyFormatted,
      features: ["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics", "Priority Support"],
      popular: true,
    },
  ];

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
          className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500"
          animate={{
            scale: [1, 1.1, 1],
            boxShadow: [
              "0 0 0 0 rgba(168, 85, 247, 0.4)",
              "0 0 40px 20px rgba(168, 85, 247, 0.2)",
              "0 0 0 0 rgba(168, 85, 247, 0)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="h-12 w-12 text-white drop-shadow-lg" />
        </motion.div>
        {/* Floating particles */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-emerald-400"
            style={{ left: "50%", top: "50%" }}
            animate={{
              x: [0, Math.cos((i * 120 * Math.PI) / 180) * 60],
              y: [0, Math.sin((i * 120 * Math.PI) / 180) * 60],
              opacity: [0, 1, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">Welcome to HireFlow</h1>
        <p className="text-gray-400 text-lg max-w-md">
          Meet AVA, your AI hiring assistant. Let's show you around!
        </p>
      </div>

      <Button
        size="lg"
        className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25"
        onClick={() => setStep(1)}
      >
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
      <h2 className="text-2xl font-bold text-white">Powerful Features</h2>

      <div className="relative h-56 w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={featureIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <div className={`p-5 rounded-2xl bg-gradient-to-br ${FEATURES[featureIndex].gradient} mb-4 shadow-xl`}>
              {(() => {
                const Icon = FEATURES[featureIndex].icon;
                return <Icon className="h-12 w-12 text-white" />;
              })()}
            </div>
            <h3 className="text-xl font-semibold text-white">
              {FEATURES[featureIndex].title}
            </h3>
            <p className="text-gray-400 mt-2">
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
            className={`h-2 rounded-full transition-all duration-300 ${
              idx === featureIndex ? "bg-emerald-400 w-8" : "bg-gray-600 w-2 hover:bg-gray-500"
            }`}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={() => setStep(0)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white"
          onClick={() => setStep(2)}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </motion.div>,

    // Step 2: Trial Benefits with Pricing
    <motion.div
      key="trial"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center space-y-6"
    >
      <div className="flex items-center gap-2 text-emerald-400">
        <Clock className="h-6 w-6" />
        <span className="text-lg font-semibold">7-Day Free Trial</span>
      </div>

      <h2 className="text-2xl font-bold text-white">
        Try Everything, Risk Free
      </h2>
      <p className="text-gray-400 max-w-md">
        Full access to all features during your trial. No credit card required.
      </p>

      {/* Billing Toggle */}
      <div className="flex items-center gap-3 p-1 rounded-full bg-gray-800/50 border border-gray-700">
        <button
          onClick={() => setBillingInterval("monthly")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            billingInterval === "monthly"
              ? "bg-emerald-500 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingInterval("yearly")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            billingInterval === "yearly"
              ? "bg-emerald-500 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Yearly
          <span className="text-xs bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full">
            2 months free
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
        {PLANS.map((plan) => (
          <motion.div
            key={plan.name}
            whileHover={{ scale: 1.02, y: -4 }}
            className={`relative p-4 rounded-xl border transition-all ${
              plan.popular
                ? "bg-gradient-to-b from-emerald-500/10 to-transparent border-emerald-500/50"
                : "bg-gray-800/30 border-gray-700 hover:border-gray-600"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                  <Crown className="h-3 w-3" /> Popular
                </span>
              </div>
            )}
            <div className="space-y-3">
              <h3 className="font-semibold text-white">{plan.name}</h3>
              <div className="flex items-baseline justify-center">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-400 text-sm ml-1">{plan.period}</span>
              </div>
              {billingInterval === "yearly" && (
                <p className="text-xs text-gray-500">Billed {plan.yearlyTotal}/year</p>
              )}
              <ul className="space-y-2 text-sm text-left">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="text-gray-400">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={() => setStep(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white"
          onClick={() => setStep(3)}
        >
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
        className="p-6 rounded-full bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-2xl shadow-purple-500/30"
        animate={{
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 0.5 }}
      >
        <Zap className="h-16 w-16 text-white" />
      </motion.div>

      <h2 className="text-3xl font-bold text-white">You're All Set!</h2>
      <p className="text-gray-400 text-lg max-w-md">
        Your 7-day trial has started. Time to revolutionize your hiring!
      </p>

      <Button
        size="lg"
        className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25"
        onClick={handleComplete}
      >
        <Sparkles className="h-4 w-4" />
        Start Hiring
      </Button>
    </motion.div>,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsl(220, 18%, 7%)" }}>
      {/* Background gradient orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/12 rounded-full blur-[150px] pointer-events-none" />

      <div className="w-full max-w-2xl p-8 rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {[0, 1, 2, 3].map((s) => (
            <motion.div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all ${
                s <= step ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gray-700"
              }`}
              initial={false}
              animate={{ scaleX: s <= step ? 1 : 0.8 }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">{steps[step]}</AnimatePresence>
      </div>
    </div>
  );
}
