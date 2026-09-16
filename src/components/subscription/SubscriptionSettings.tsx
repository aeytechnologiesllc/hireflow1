import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Crown,
  Loader2,
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
import JobBillingSection from "@/components/billing/JobBillingSection";

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
    createBillingPortal,
    syncSubscription,
    refetch,
    subscriptionBypass,
  } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);

  const handleManageBilling = async () => {
    setLoading("billing");
    try {
      const { url } = await createBillingPortal.mutateAsync();
      if (url) {
        window.open(url, "_blank");
      } else {
        toast({
          variant: "warning",
          title: "Billing portal unavailable",
          description: "We couldn't open your billing portal right now. Please try again in a moment.",
        });
      }
    } catch (error) {
      console.error("Billing portal error:", error);
      const message = error instanceof Error ? error.message : "We couldn't open your billing portal right now.";
      toast({
        variant: "warning",
        title: "Unable to open billing portal",
        description: message,
      });
    } finally {
      setLoading(null);
    }
  };

  const handleRefreshSubscription = async () => {
    setLoading("refresh");
    try {
      await syncSubscription.mutateAsync();
      await refetch();
      toast({
        title: "Subscription refreshed",
        description: "Your billing status was updated successfully.",
      });
    } catch (error) {
      console.error("Refresh error:", error);
      const message = error instanceof Error ? error.message : "We couldn't refresh your subscription right now.";
      toast({
        variant: "warning",
        title: "Unable to refresh subscription",
        description: message,
      });
    } finally {
      setLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const trialTime = getTrialTimeRemaining();
  const planName = subscriptionBypass
    ? "Internal Test"
    : subscription?.plan_type === "enterprise"
      ? "Enterprise"
      : subscription?.plan_type === "business"
        ? "Business"
        : subscription?.plan_type === "growth"
          ? "Growth"
          : "Trial";

  return (
    <div className="space-y-6">
      {/* Owner-decided pricing (2026-08-27): no subscription — pay per job.
          Replaces the old Growth/Business plan-picker section, which sold
          a subscription the product no longer has. Shows honest
          early-access copy of its own while billing is off. */}
      <JobBillingSection />

      {/* Current Plan */}
      <div className="p-6 rounded-xl border border-border bg-card/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30">
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
                        ? "bg-secondary text-secondary-foreground border-border"
                        : "bg-destructive/20 text-destructive border-destructive/30"
                  }
                >
                  {subscriptionBypass ? "Test access" : subscription?.status}
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
            {!subscriptionBypass && (
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
            )}
            {isPaid && !subscriptionBypass && (
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
        <span className={`text-xl font-bold ${isLow ? "text-[var(--brass)]" : isNearLimit ? "text-[var(--brass)]" : "text-foreground"}`}>
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
          className={`h-1.5 mt-2 ${isNearLimit ? "[&>div]:bg-[var(--brass)]" : "[&>div]:bg-primary"}`}
        />
      )}
    </div>
  );
}
