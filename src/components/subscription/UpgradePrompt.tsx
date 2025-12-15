import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const { subscription, createCheckoutSession, isPaid, limits } = useSubscription();
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  // Check if user has access
  const hasAccess = isPaid && (requiredPlan === "growth" || subscription?.plan_type === "business");

  if (hasAccess) {
    return <>{children}</>;
  }

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

  return (
    <>
      <Card
        className="p-6 border-dashed border-2 border-muted-foreground/20 bg-muted/5 cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => setShowDialog(true)}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{feature}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upgrade to {requiredPlan === "business" ? "Business" : "Growth"} to unlock
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Upgrade Now
          </Button>
        </div>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Upgrade to Unlock {feature}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <Card className={`p-4 ${requiredPlan === "growth" ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Growth Plan</h4>
                  <p className="text-sm text-muted-foreground">$49/month</p>
                </div>
                <Button
                  size="sm"
                  variant={requiredPlan === "growth" ? "default" : "outline"}
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
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">3 Active Jobs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">50 Applicants/month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Document Workflows</span>
                </li>
              </ul>
            </Card>

            <Card className={`p-4 ${requiredPlan === "business" ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    Business Plan
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      Best Value
                    </span>
                  </h4>
                  <p className="text-sm text-muted-foreground">$99/month</p>
                </div>
                <Button
                  size="sm"
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
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Unlimited Jobs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Unlimited Applicants</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Team Portal</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Advanced Analytics</span>
                </li>
              </ul>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
