import { useState } from "react";
import EmbeddedCheckoutDialog from "./EmbeddedCheckoutDialog";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Crown, Check, Loader2 } from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";

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
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutPlanType, setCheckoutPlanType] = useState<"growth" | "business">("growth");

  const hasAccess = isPaid && (requiredPlan === "growth" || subscription?.plan_type === "business");

  if (hasAccess) {
    return <>{children}</>;
  }

  const handleUpgrade = async (planType: "growth" | "business") => {
    setLoading(planType);
    setCheckoutPlanType(planType);
    try {
      const { clientSecret } = await createCheckoutSession.mutateAsync({ 
        planType, 
        countryCode: pricing.countryCode,
        interval: billingInterval,
      });
      if (clientSecret) {
        setCheckoutClientSecret(clientSecret);
      } else {
        toast({
          variant: "warning",
          title: "Upgrade unavailable",
          description: "We couldn't start checkout right now. Please try again in a moment.",
        });
      }
    } catch (error) {
      console.error("Checkout error:", error);
      const message = error instanceof Error ? error.message : "We couldn't start checkout right now. Please try again.";
      toast({
        variant: "warning",
        title: "Unable to open checkout",
        description: message,
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        planType={checkoutPlanType}
        onClose={() => setCheckoutClientSecret(null)}
      />
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="p-6 rounded-xl border-2 border-dashed border-border bg-muted/20 cursor-pointer hover:border-primary/30 transition-all"
        onClick={() => setShowDialog(true)}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-primary/20 border border-primary/30">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{feature}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upgrade to {requiredPlan === "business" ? "Business" : "Growth"} to unlock
            </p>
          </div>
          <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <AvaGlyph className="h-4 w-4" />
            Upgrade Now
          </Button>
        </div>
      </motion.div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Crown className="h-5 w-5 text-primary" />
              Upgrade to Unlock {feature}
            </DialogTitle>
          </DialogHeader>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-muted/50 border border-border w-fit mx-auto">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                billingInterval === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("yearly")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                billingInterval === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">Growth Plan</h4>
                  <p className="text-sm text-muted-foreground">
                    {billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly}/month
                  </p>
                </div>
                <Button
                  size="sm"
                  className={requiredPlan === "growth"
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
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
                {["3 Job Slots", "50 Applicants", "Document Workflows"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div 
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-xl border transition-all ${
                requiredPlan === "business"
                  ? "border-primary/50 bg-gradient-to-b from-primary/10 to-transparent"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    Business Plan
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      Best Value
                    </span>
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly}/month
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
                    <Check className="h-3 w-3 text-success" />
                    <span className="text-muted-foreground">{f}</span>
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
