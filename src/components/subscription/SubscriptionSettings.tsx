import { useState } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Sparkles,
  Loader2,
  Check,
  CreditCard,
  BarChart3,
  Users,
  FileText,
  Briefcase,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

export default function SubscriptionSettings() {
  const {
    subscription,
    usage,
    limits,
    isLoading,
    isPaid,
    isTrialing,
    getTrialTimeRemaining,
    createCheckoutSession,
    createBillingPortal,
  } = useSubscription();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

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

  const handleManageBilling = async () => {
    setLoading("billing");
    try {
      const { url } = await createBillingPortal.mutateAsync();
      if (url) {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Billing portal error:", error);
    } finally {
      setLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const trialTime = getTrialTimeRemaining();
  const planName = subscription?.plan_type === "business" ? "Business" : subscription?.plan_type === "growth" ? "Growth" : "Trial";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <Crown className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">{planName} Plan</h3>
                <Badge 
                  className={
                    isPaid 
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                      : isTrialing 
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                  }
                >
                  {subscription?.status}
                </Badge>
              </div>
              {isTrialing && trialTime && (
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm text-gray-400">
                    {trialTime.days}d {trialTime.hours}h remaining in trial
                  </p>
                </div>
              )}
              {isPaid && subscription?.current_period_end && (
                <p className="text-sm text-gray-400 mt-1">
                  Renews on {format(new Date(subscription.current_period_end), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          {isPaid && (
            <Button 
              variant="outline" 
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
              onClick={handleManageBilling} 
              disabled={loading === "billing"}
            >
              {loading === "billing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Manage Billing
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <h3 className="text-lg font-semibold text-white mb-4">Usage This Period</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <UsageStat
            icon={Briefcase}
            label="Jobs"
            current={usage.jobs_created}
            limit={limits.jobs}
          />
          <UsageStat
            icon={Users}
            label="Applicants"
            current={usage.applicants_received}
            limit={limits.applicants}
          />
          <UsageStat
            icon={FileText}
            label="Documents"
            current={usage.documents_sent}
            limit={limits.documents}
          />
          <UsageStat
            icon={BarChart3}
            label="AI Analyses"
            current={usage.ai_analyses_used}
            limit={limits.aiAnalyses}
          />
        </div>
      </div>

      {/* Upgrade Options */}
      {!isPaid || subscription?.plan_type === "growth" ? (
        <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
          <h3 className="text-lg font-semibold text-white mb-4">
            {isTrialing ? "Choose Your Plan" : "Upgrade Your Plan"}
          </h3>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-gray-800/50 border border-gray-700 w-fit mx-auto mb-6">
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

          <div className="grid md:grid-cols-2 gap-4">
            {/* Growth Plan */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className={`p-5 rounded-xl border transition-all ${
                subscription?.plan_type === "growth" 
                  ? "border-emerald-500/50 bg-emerald-500/5" 
                  : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white">Growth</h4>
                  {subscription?.plan_type === "growth" && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Current</Badge>
                  )}
                </div>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-white">
                    {billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly}
                  </span>
                  <span className="text-gray-400 ml-1">
                    {billingInterval === "monthly" ? "/month" : "/mo"}
                  </span>
                </div>
                {billingInterval === "yearly" && (
                  <p className="text-sm text-gray-500">Billed {pricing.growth.yearlyFormatted}/year</p>
                )}
                <ul className="space-y-2 text-sm">
                  {["3 Active Jobs", "50 Applicants/month", "AI Screening & Interviews", "Document Workflows"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-gray-400">{feature}</span>
                    </li>
                  ))}
                </ul>
                {subscription?.plan_type !== "growth" && (
                  <Button
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white"
                    onClick={() => handleUpgrade("growth")}
                    disabled={loading !== null}
                  >
                    {loading === "growth" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Subscribe"
                    )}
                  </Button>
                )}
              </div>
            </motion.div>

            {/* Business Plan */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-5 rounded-xl border border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-transparent relative"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                  <Crown className="h-3 w-3" /> Popular
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    Business
                  </h4>
                </div>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-white">
                    {billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly}
                  </span>
                  <span className="text-gray-400 ml-1">
                    {billingInterval === "monthly" ? "/month" : "/mo"}
                  </span>
                </div>
                {billingInterval === "yearly" && (
                  <p className="text-sm text-gray-500">Billed {pricing.business.yearlyFormatted}/year</p>
                )}
                <ul className="space-y-2 text-sm">
                  {["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics", "Priority Support"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-gray-400">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25"
                  onClick={() => handleUpgrade("business")}
                  disabled={loading !== null}
                >
                  {loading === "business" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {subscription?.plan_type === "growth" ? "Upgrade" : "Subscribe"}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  current,
  limit,
}: {
  icon: React.ElementType;
  label: string;
  current: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div className="space-y-2 p-3 rounded-lg bg-gray-800/30 border border-gray-700">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${isNearLimit ? "text-orange-400" : "text-white"}`}>
          {current}
        </span>
        <span className="text-gray-500 text-sm">
          / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <Progress 
          value={percentage} 
          className={`h-1 ${isNearLimit ? "bg-orange-500/20" : "bg-gray-700"}`}
        />
      )}
    </div>
  );
}
