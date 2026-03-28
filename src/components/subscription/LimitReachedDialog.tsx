import { useState } from "react";
import EmbeddedCheckoutDialog from "./EmbeddedCheckoutDialog";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Crown, Sparkles, Check, Loader2, AlertTriangle } from "lucide-react";

interface LimitReachedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: "jobs" | "applicants" | "documents" | "teamMembers" | "aiAnalyses";
  currentCount?: number;
  limit?: number;
}

const limitLabels: Record<string, { title: string; description: string; icon: string }> = {
  jobs: {
    title: "Job Posting Limit Reached",
    description: "You've reached your limit for active job postings. Upgrade to create more jobs and reach more candidates.",
    icon: "💼",
  },
  applicants: {
    title: "Applicant Limit Reached",
    description: "You've received the maximum number of applicants for your plan. Upgrade to continue receiving applications.",
    icon: "👥",
  },
  documents: {
    title: "Document Limit Reached",
    description: "You've reached your document sending limit. Upgrade to send more contracts and offer letters.",
    icon: "📄",
  },
  teamMembers: {
    title: "Team Member Limit Reached",
    description: "You've reached your team member limit. Upgrade to add more team members to your workspace.",
    icon: "👤",
  },
  aiAnalyses: {
    title: "AI Analysis Limit Reached",
    description: "You've used all your AI analyses for this period. Upgrade to get more AI-powered insights.",
    icon: "🤖",
  },
};

export function LimitReachedDialog({
  open,
  onOpenChange,
  limitType,
  currentCount,
  limit,
}: LimitReachedDialogProps) {
  const { createCheckoutSession } = useSubscription();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

  const limitInfo = limitLabels[limitType];

  const handleUpgrade = async (planType: "growth" | "business") => {
    setLoading(planType);
    try {
      const { clientSecret } = await createCheckoutSession.mutateAsync({
        planType,
        countryCode: pricing.countryCode,
        interval: billingInterval,
      });
      if (clientSecret) {
        setCheckoutClientSecret(clientSecret);
      }
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        onClose={() => setCheckoutClientSecret(null)}
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <span>{limitInfo.title}</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            {limitInfo.description}
            {currentCount !== undefined && limit !== undefined && limit > 0 && (
              <span className="block mt-2 text-sm font-medium text-foreground">
                Current usage: {currentCount}/{limit}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-muted w-fit mx-auto mt-2">
          <button
            onClick={() => setBillingInterval("monthly")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              billingInterval === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval("yearly")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              billingInterval === "yearly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly (2 free)
          </button>
        </div>

        <div className="space-y-4 pt-2">
          {/* Growth Plan */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-xl border border-border bg-card transition-all hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-foreground">Growth Plan</h4>
                <p className="text-sm text-muted-foreground">
                  {billingInterval === "monthly"
                    ? pricing.growth.monthlyFormatted
                    : pricing.growth.yearlyMonthly}
                  /month
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpgrade("growth")}
                disabled={loading !== null}
              >
                {loading === "growth" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Select"
                )}
              </Button>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {["3 Job Slots", "50 Applicants", "Document Workflows"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Business Plan */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="p-4 rounded-xl border-2 border-primary bg-primary/5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  Business Plan
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </h4>
                <p className="text-sm text-muted-foreground">
                  {billingInterval === "monthly"
                    ? pricing.business.monthlyFormatted
                    : pricing.business.yearlyMonthly}
                  /month
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleUpgrade("business")}
                disabled={loading !== null}
                className="gap-1"
              >
                {loading === "business" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Upgrade
                  </>
                )}
              </Button>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
            {[
              "Unlimited Jobs",
              "Unlimited Applicants",
              "AVA Voice Assistant",
              "Voice Interviews",
              "30 Voice Minutes/mo",
              "Team Portal",
              "Advanced Analytics",
            ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
