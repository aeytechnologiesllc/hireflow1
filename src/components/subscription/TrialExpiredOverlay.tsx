import { useState } from "react";
import EmbeddedCheckoutDialog from "./EmbeddedCheckoutDialog";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Crown, LogOut, Loader2, Check, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function TrialExpiredOverlay() {
  const { isExpired, createCheckoutSession, syncSubscription, refetch } = useSubscription();
  const { signOut } = useAuth();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

  if (!isExpired) return null;

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
      features: ["3 Active Jobs", "50 Applicants/month", "Ava Screening", "Document Workflows"],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsl(220, 18%, 7%)" }}>
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        onClose={() => setCheckoutClientSecret(null)}
      />
      {/* Background gradient orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/12 rounded-full blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl"
      >
        <div className="p-8 rounded-2xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm text-center">
          <div className="flex justify-center mb-6">
            <motion.div 
              className="p-4 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <AlertTriangle className="h-12 w-12 text-orange-400" />
            </motion.div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">
            Your Trial Has Ended
          </h1>
          <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
            Subscribe to continue using HireFlow and access all your data
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-gray-800/50 border border-gray-700 w-fit mx-auto mb-8">
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
                    ? "bg-gradient-to-b from-emerald-500/10 to-transparent border-emerald-500/50"
                    : "bg-gray-800/30 border-gray-700 hover:border-gray-600"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                      <Crown className="h-3 w-3" /> Recommended
                    </span>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-400 ml-1">{plan.period}</span>
                  </div>
                  {billingInterval === "yearly" && (
                    <p className="text-sm text-gray-500">Billed {plan.yearlyTotal}/year</p>
                  )}

                  <ul className="space-y-2 text-left">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="text-gray-400">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25"
                        : "bg-gray-800 hover:bg-gray-700 text-emerald-400 border border-gray-600 hover:border-emerald-500/50"
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
                        {plan.popular && <Sparkles className="h-4 w-4 mr-2" />}
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
              className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 bg-gray-800"
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
              className="text-gray-500 hover:text-gray-300 hover:bg-gray-800"
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
