import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Crown,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PremiumOrb } from "@/components/animations/PremiumOrb";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/animations";

interface SubscriptionSuccessModalProps {
  planType: "growth" | "business" | string;
  onClose: () => void;
}

const planContent = {
  growth: {
    badge: "Growth unlocked",
    title: "Welcome to Growth",
    subtitle:
      "You are ready to publish more roles, keep hiring momentum, and move faster without hitting the starter ceiling.",
    accent:
      "Growth gives you a stronger operating lane for focused hiring teams.",
    features: [
      "Up to 3 active job slots at once",
      "50 applicants each month",
      "Ava screening for faster review",
      "Document workflows for smoother offers",
    ],
    summary: [
      { label: "Hiring lane", value: "Expanded" },
      { label: "Application flow", value: "Faster" },
    ],
  },
  business: {
    badge: "Business unlocked",
    title: "Welcome to Business",
    subtitle:
      "Your hiring engine is fully opened up with unlimited capacity, voice workflows, and a team-ready control center.",
    accent:
      "Business is built for teams that want Ava to move with them, not just support them.",
    features: [
      "Unlimited active jobs and applicants",
      "Ava Voice assistant and voice interviews",
      "30 included voice minutes each month",
      "Team portal and advanced analytics",
    ],
    summary: [
      { label: "Hiring lane", value: "Unlimited" },
      { label: "Voice workflows", value: "Enabled" },
    ],
  },
} as const;

export default function SubscriptionSuccessModal({
  planType,
  onClose,
}: SubscriptionSuccessModalProps) {
  const navigate = useNavigate();

  if (typeof document === "undefined") {
    return null;
  }

  const isBusinessPlan = planType === "business";
  const content = isBusinessPlan ? planContent.business : planContent.growth;

  const handleStartPosting = () => {
    onClose();
    navigate("/jobs");
  };

  const handleViewPlan = () => {
    onClose();
    navigate("/settings?tab=subscription");
  };

  const modal = (
    <motion.div
      className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto p-3 py-4 sm:items-center sm:p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-label="Close subscription success"
      />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 my-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-emerald-400/20 bg-slate-950/96 shadow-[0_32px_120px_-32px_rgba(16,185,129,0.45)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.12),transparent_38%)]" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/6 px-5 pb-6 pt-8 sm:px-8 lg:border-b-0 lg:border-r">
            <div className="mx-auto flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200/90">
                <Sparkles className="h-3.5 w-3.5" />
                {content.badge}
              </div>

              <div className="mb-5">
                <PremiumOrb mode="success" size={isBusinessPlan ? 104 : 96} showIcon />
              </div>

              <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {content.title}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                {content.subtitle}
              </p>

              <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
                {content.summary.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3"
                  >
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {item.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={handleStartPosting}
                  className="h-12 flex-1 bg-emerald-500 text-white shadow-[0_18px_40px_-20px_rgba(16,185,129,0.9)] transition hover:bg-emerald-400"
                >
                  Start posting jobs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleViewPlan}
                  className="h-12 flex-1 border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  View plan details
                </Button>
              </div>
            </div>
          </div>

          <div className="px-5 py-8 sm:px-8">
            <div className="mx-auto flex h-full max-w-xl flex-col">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
                <Crown className="h-3.5 w-3.5 text-emerald-300" />
                What unlocked now
              </div>

              <motion.ul
                className="mt-5 space-y-3"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {content.features.map((feature) => (
                  <motion.li
                    key={feature}
                    variants={staggerItem}
                    className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3.5"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm leading-6 text-slate-200">{feature}</span>
                  </motion.li>
                ))}
              </motion.ul>

              <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-200/80">
                  Ava note
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {content.accent}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modal, document.body);
}
