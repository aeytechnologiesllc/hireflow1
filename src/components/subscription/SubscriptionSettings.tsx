import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Sparkles,
  Loader2,
  Check,
  CreditCard,
  Calendar,
  BarChart3,
  Users,
  FileText,
  Briefcase,
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
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (planType: "growth" | "business") => {
    setLoading(planType);
    try {
      const countryCode = "US";
      const { url } = await createCheckoutSession.mutateAsync({ planType, countryCode });
      if (url) {
        window.location.href = url;
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
        window.location.href = url;
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const trialTime = getTrialTimeRemaining();
  const planName = subscription?.plan_type === "business" ? "Business" : subscription?.plan_type === "growth" ? "Growth" : "Trial";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{planName} Plan</h3>
                <Badge variant={isPaid ? "default" : isTrialing ? "secondary" : "destructive"}>
                  {subscription?.status}
                </Badge>
              </div>
              {isTrialing && trialTime && (
                <p className="text-sm text-muted-foreground">
                  {trialTime.days}d {trialTime.hours}h remaining in trial
                </p>
              )}
              {isPaid && subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Renews on {format(new Date(subscription.current_period_end), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          {isPaid && (
            <Button variant="outline" onClick={handleManageBilling} disabled={loading === "billing"}>
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
      </Card>

      {/* Usage Stats */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Usage This Period</h3>
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
      </Card>

      {/* Upgrade Options */}
      {!isPaid || subscription?.plan_type === "growth" ? (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {isTrialing ? "Choose Your Plan" : "Upgrade Your Plan"}
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Growth Plan */}
            <Card className={`p-4 ${subscription?.plan_type === "growth" ? "border-primary" : ""}`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">Growth</h4>
                  {subscription?.plan_type === "growth" && (
                    <Badge>Current</Badge>
                  )}
                </div>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-foreground">$49</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">3 Active Jobs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">50 Applicants/month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">AI Screening & Interviews</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Document Workflows</span>
                  </li>
                </ul>
                {subscription?.plan_type !== "growth" && (
                  <Button
                    className="w-full"
                    variant="outline"
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
            </Card>

            {/* Business Plan */}
            <Card className="p-4 border-primary bg-primary/5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    Business
                    <Crown className="h-4 w-4 text-primary" />
                  </h4>
                  <Badge variant="secondary">Popular</Badge>
                </div>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-foreground">$99</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Unlimited Jobs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Unlimited Applicants</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Team Portal</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Advanced Analytics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Priority Support</span>
                  </li>
                </ul>
                <Button
                  className="w-full gap-2"
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
            </Card>
          </div>
        </Card>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${isNearLimit ? "text-destructive" : "text-foreground"}`}>
          {current}
        </span>
        <span className="text-muted-foreground text-sm">
          / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {!isUnlimited && <Progress value={percentage} className={isNearLimit ? "bg-destructive/20" : ""} />}
    </div>
  );
}
