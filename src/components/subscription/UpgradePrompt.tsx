import { useState } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Crown, Sparkles, Check, Loader2 } from "lucide-react";

interface UpgradePromptProps {
  feature: string;
  requiredPlan?: "growth" | "business";
  children?: React.ReactNode;
}

export default function UpgradePrompt({ feature, requiredPlan = "growth", children }: UpgradePromptProps) {
  const { subscription, createCheckoutSession, isPaid } = useSubscription();
  const pricing = usePricing();
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

  const hasAccess = isPaid && (requiredPlan === "growth" || subscription?.plan_type === "business");

  if (hasAccess) {
    return <>{children}</>;
  }

  const handleUpgrade = async (planType: "growth" | "business") => {
    setLoading(planType);
    try {
      const { url } = await createCheckoutSession.mutateAsync({ 
        planType, 
        countryCode: pricing.countryCode,
        interval: billingInterval,
      });
      if (url) {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="p-6 rounded-xl border-2 border-dashed border-gray-700 bg-gray-800/20 cursor-pointer hover:border-emerald-500/30 transition-all"
        onClick={() => setShowDialog(true)}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
            <Lock className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{feature}</h3>
            <p className="text-sm text-gray-400 mt-1">
              Upgrade to {requiredPlan === "business" ? "Business" : "Growth"} to unlock
            </p>
          </div>
          <Button size="sm" className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white">
            <Sparkles className="h-4 w-4" />
            Upgrade Now
          </Button>
        </div>
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Crown className="h-5 w-5 text-emerald-400" />
              Upgrade to Unlock {feature}
            </DialogTitle>
          </DialogHeader>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-gray-800/50 border border-gray-700 w-fit mx-auto">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                billingInterval === "monthly"
                  ? "bg-emerald-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("yearly")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                billingInterval === "yearly"
                  ? "bg-emerald-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Yearly (2 free)
            </button>
          </div>

          <div className="space-y-4 pt-2">
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-xl border transition-all ${
                requiredPlan === "growth" 
                  ? "border-emerald-500/50 bg-emerald-500/5" 
                  : "border-gray-700 bg-gray-800/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">Growth Plan</h4>
                  <p className="text-sm text-gray-400">
                    {billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly}/month
                  </p>
                </div>
                <Button
                  size="sm"
                  className={requiredPlan === "growth" 
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                  }
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
              <ul className="mt-3 space-y-1 text-sm">
                {["3 Active Jobs", "50 Applicants/month", "Document Workflows"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-gray-400">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div 
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-xl border transition-all ${
                requiredPlan === "business" 
                  ? "border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-transparent" 
                  : "border-gray-700 bg-gray-800/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    Business Plan
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                      Best Value
                    </span>
                  </h4>
                  <p className="text-sm text-gray-400">
                    {billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly}/month
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white"
                  onClick={() => handleUpgrade("business")}
                  disabled={loading !== null}
                >
                  {loading === "business" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Select"
                  )}
                </Button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-gray-400">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
