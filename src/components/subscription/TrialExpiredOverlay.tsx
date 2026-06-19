import { useState } from "react";
import EmbeddedCheckoutDialog from "./EmbeddedCheckoutDialog";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Crown, LogOut, Loader2, Check, RefreshCw } from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import { toast } from "sonner";

export default function TrialExpiredOverlay() {
  const { isExpired, createCheckoutSession, syncSubscription, refetch } = useSubscription();
  const { signOut } = useAuth();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutPlanType, setCheckoutPlanType] = useState<"growth" | "business">("growth");

  if (!isExpired) return null;

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
        toast.error("We couldn't start checkout right now. Please try again in a moment.");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      const message = error instanceof Error ? error.message : "We couldn't start checkout right now. Please try again.";
      toast.error(message);
    } finally {
      setLoading(null);
    }
  };

  const handleRefreshAccess = async () => {
    setSyncing(true);
    try {
      const result = await syncSubscription.mutateAsync();
      if (result?.synced) {
        toast.success("Subscription synced! Refreshing...");
        await refetch();
      } else {
        toast.error(result?.message || "No active subscription found in Stripe. Please complete checkout.");
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Failed to sync subscription. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const PLANS = [
    {
      id: "growth" as const,
      name: "Growth",
      price: billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo",
      yearlyTotal: pricing.growth.yearlyFormatted,
      features: ["3 Job Slots", "50 Applicants", "Ava Screening", "Document Workflows"],
    },
    {
      id: "business" as const,
      name: "Business",
      price: billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly,
      period: billingInterval === "monthly" ? "/month" : "/mo",
      yearlyTotal: pricing.business.yearlyFormatted,
      features: ["Unlimited Jobs", "Unlimited Applicants", "AVA Voice Assistant", "Voice Interviews", "30 Voice Minutes/mo", "Team Portal", "Advanced Analytics"],
      popular: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center overflow-y-auto p-4 py-8 md:py-4 bg-background">
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        planType={checkoutPlanType}
        onClose={() => setCheckoutClientSecret(null)}
      />
      {/* Background gradient orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/12 rounded-full blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl my-auto"
      >
        <div className="p-6 md:p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm text-center">
          <div className="flex justify-center mb-6">
            <motion.div
              className="p-4 rounded-full bg-destructive/20 border border-destructive/30"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </motion.div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            Your Trial Has Ended
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
            Subscribe to continue using HireFlow and access all your data
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-secondary/50 border border-border w-fit mx-auto mb-8">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                billingInterval === "monthly"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("yearly")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                billingInterval === "yearly"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">
                Save 2 months
              </span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {PLANS.map((plan) => (
              <motion.div
                key={plan.id}
                whileHover={{ scale: 1.02, y: -4 }}
                className={`relative p-6 rounded-xl border transition-all ${
                  plan.popular
                    ? "bg-gradient-to-b from-primary/10 to-transparent border-primary/50"
                    : "bg-secondary/30 border-border hover:border-primary/40"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                      <Crown className="h-3 w-3" /> Recommended
                    </span>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground ml-1">{plan.period}</span>
                  </div>
                  {billingInterval === "yearly" && (
                    <p className="text-sm text-muted-foreground">Billed {plan.yearlyTotal}/year</p>
                  )}

                  <ul className="space-y-2 text-left">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                        : "bg-secondary hover:bg-secondary/80 text-primary border border-border hover:border-primary/50"
                    }`}
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loading !== null}
                  >
                    {loading === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {plan.popular && <AvaGlyph className="h-4 w-4 mr-2" />}
                        Subscribe to {plan.name}
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary bg-secondary"
              onClick={handleRefreshAccess}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  I already paid — Refresh access
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
