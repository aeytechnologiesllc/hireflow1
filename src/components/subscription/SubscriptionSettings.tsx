import { useState } from "react";
import EmbeddedCheckoutDialog from "./EmbeddedCheckoutDialog";
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
  Mic,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import VoiceCreditsSection from "./VoiceCreditsSection";

export default function SubscriptionSettings() {
  const {
    subscription,
    usage,
    limits,
    voiceCredits,
    isLoading,
    isPaid,
    isTrialing,
    getTrialTimeRemaining,
    createCheckoutSession,
    createBillingPortal,
    syncSubscription,
    refetch,
  } = useSubscription();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

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

  const handleRefreshSubscription = async () => {
    setLoading("refresh");
    try {
      await syncSubscription.mutateAsync();
      await refetch();
    } catch (error) {
      console.error("Refresh error:", error);
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
  const planName = subscription?.plan_type === "enterprise" ? "Enterprise" : subscription?.plan_type === "business" ? "Business" : subscription?.plan_type === "growth" ? "Growth" : "Trial";

  return (
    <div className="space-y-6">
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        onClose={() => setCheckoutClientSecret(null)}
      />
      {/* Premium Upgrade Section - FIRST */}
      {(!isPaid || subscription?.plan_type === "growth") && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative p-6 rounded-xl border border-primary/30 bg-card/50 overflow-hidden"
        >
          {/* Animated gradient orbs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/15 rounded-full blur-[80px]" />
          
          <div className="relative z-10">
            <div className="text-center mb-6">
              <motion.h3 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-bold text-foreground flex items-center justify-center gap-2"
              >
                <Sparkles className="h-6 w-6 text-primary" />
                {isTrialing ? "Choose Your Plan" : "Upgrade Your Plan"}
              </motion.h3>
              <p className="text-muted-foreground mt-2">Unlock the full power of HireFlow</p>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3 p-1 rounded-full bg-muted/50 border border-border w-fit mx-auto mb-6">
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
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                  2 months free
                </span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Growth Plan */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.02 }}
                className={`p-5 rounded-xl border transition-all ${
                  subscription?.plan_type === "growth" 
                    ? "border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]" 
                    : "border-border bg-card/50 hover:border-primary/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-foreground">Growth</h4>
                    {subscription?.plan_type === "growth" && (
                      <Badge className="bg-primary/20 text-primary border-primary/30">Current</Badge>
                    )}
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-bold text-foreground">
                      {billingInterval === "monthly" ? pricing.growth.monthlyFormatted : pricing.growth.yearlyMonthly}
                    </span>
                    <span className="text-muted-foreground ml-1 text-sm">
                      {billingInterval === "monthly" ? "/mo" : "/mo"}
                    </span>
                  </div>
                  {billingInterval === "yearly" && (
                    <p className="text-xs text-muted-foreground">Billed {pricing.growth.yearlyFormatted}/year</p>
                  )}
                  <ul className="space-y-2 text-sm">
                    {["3 Job Slots", "50 Applicants", "Ava Screening", "Document Workflows"].map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {subscription?.plan_type !== "growth" && subscription?.plan_type !== "business" && subscription?.plan_type !== "enterprise" && (
                    <Button
                      className="w-full bg-card border border-primary/50 text-foreground hover:bg-card/80"
                      onClick={() => handleUpgrade("growth")}
                      disabled={loading !== null}
                    >
                      {loading === "growth" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
                    </Button>
                  )}
                </div>
              </motion.div>

              {/* Business Plan - Now with Voice Features */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.02 }}
                className={`p-5 rounded-xl border relative ${
                  subscription?.plan_type === "business" || subscription?.plan_type === "enterprise"
                    ? "border-purple-500/50 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                    : "border-purple-500/30 bg-gradient-to-b from-purple-500/10 to-transparent shadow-[0_0_25px_rgba(168,85,247,0.2)]"
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                    <Mic className="h-3 w-3" /> AVA Voice
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-foreground">Business</h4>
                    {(subscription?.plan_type === "business" || subscription?.plan_type === "enterprise") && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Current</Badge>
                    )}
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-bold text-foreground">
                      {billingInterval === "monthly" ? pricing.business.monthlyFormatted : pricing.business.yearlyMonthly}
                    </span>
                    <span className="text-muted-foreground ml-1 text-sm">/mo</span>
                  </div>
                  {billingInterval === "yearly" && (
                    <p className="text-xs text-muted-foreground">Billed {pricing.business.yearlyFormatted}/year</p>
                  )}
                  <ul className="space-y-2 text-sm">
                    {["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics", "AVA Voice Assistant", "Voice Interviews", "30 Voice Minutes/mo"].map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-purple-400 flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {subscription?.plan_type !== "business" && subscription?.plan_type !== "enterprise" && (
                    <Button
                      className="w-full gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-white"
                      onClick={() => handleUpgrade("business")}
                      disabled={loading !== null}
                    >
                      {loading === "business" ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <><Mic className="h-4 w-4" />{subscription?.plan_type === "growth" ? "Upgrade" : "Subscribe"}</>
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Current Plan */}
      <div className="p-6 rounded-xl border border-border bg-card/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-teal-500/20 border border-primary/30">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{planName} Plan</h3>
                <Badge 
                  className={
                    isPaid 
                      ? "bg-primary/20 text-primary border-primary/30" 
                      : isTrialing 
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                        : "bg-destructive/20 text-destructive border-destructive/30"
                  }
                >
                  {subscription?.status}
                </Badge>
              </div>
              {isTrialing && trialTime && (
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {trialTime.days}d {trialTime.hours}h remaining in trial
                  </p>
                </div>
              )}
              {isPaid && subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground mt-1">
                  Renews on {format(new Date(subscription.current_period_end), "MMM d, yyyy")}
                </p>
              )}
              {/* Trial Includes Summary */}
              {isTrialing && (
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Your trial includes:</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">1 Active Job</Badge>
                    <Badge variant="secondary" className="text-xs">15 Applicants</Badge>
                    <Badge variant="secondary" className="text-xs">10 Documents</Badge>
                    <Badge variant="secondary" className="text-xs">15 Voice Minutes</Badge>
                    <Badge variant="secondary" className="text-xs">15 AI Analyses</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              className="text-muted-foreground hover:bg-muted"
              onClick={handleRefreshSubscription} 
              disabled={loading === "refresh"}
            >
              {loading === "refresh" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            {isPaid && (
              <Button 
                variant="outline" 
                className="border-border text-muted-foreground hover:bg-muted"
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
      </div>
      {/* Voice Credits Section - For Business users */}
      <VoiceCreditsSection />

      {/* Usage Stats */}
      <div className="p-6 rounded-xl border border-border bg-card/50">
        <h3 className="text-lg font-semibold text-foreground mb-4">Plan Usage</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            label="Document Workflows"
            current={usage.documents_sent}
            limit={limits.documents}
          />
          <UsageStat
            icon={BarChart3}
            label="AI Analyses"
            current={usage.ai_analyses_used}
            limit={limits.aiAnalyses}
          />
          <UsageStat
            icon={Mic}
            label="Voice Minutes"
            current={voiceCredits?.totalMinutesAvailable ?? 0}
            limit={-1}
            isAvailable
          />
        </div>
      </div>
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  current,
  limit,
  isAvailable = false,
}: {
  icon: typeof Briefcase;
  label: string;
  current: number;
  limit: number;
  isAvailable?: boolean;
}) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isLow = isAvailable && current <= 5 && current > 0;

  return (
    <div className="p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold ${isLow ? "text-amber-400" : isNearLimit ? "text-amber-400" : "text-foreground"}`}>
          {current}
        </span>
        {isAvailable ? (
          <span className="text-sm text-muted-foreground">available</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            / {isUnlimited ? "∞" : limit}
          </span>
        )}
      </div>
      {!isUnlimited && !isAvailable && (
        <Progress
          value={percentage}
          className={`h-1.5 mt-2 ${isNearLimit ? "[&>div]:bg-amber-400" : "[&>div]:bg-primary"}`}
        />
      )}
    </div>
  );
}
