import { useState } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Crown, LogOut, Loader2, Check } from "lucide-react";

const PLANS = [
  {
    id: "growth",
    name: "Growth",
    price: "$49",
    period: "/month",
    features: ["3 Active Jobs", "50 Applicants/month", "AI Screening", "Document Workflows"],
  },
  {
    id: "business",
    name: "Business",
    price: "$99",
    period: "/month",
    features: ["Unlimited Jobs", "Unlimited Applicants", "Team Portal", "Advanced Analytics", "Priority Support"],
    popular: true,
  },
];

export default function TrialExpiredOverlay() {
  const { isExpired, createCheckoutSession } = useSubscription();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  if (!isExpired) return null;

  const handleUpgrade = async (planType: "growth" | "business") => {
    setLoading(planType);
    try {
      // Get user's country (simplified - in production use geolocate-ip)
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
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl"
      >
        <Card className="p-8 bg-card border-border text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-destructive/20">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-2">
            Your Trial Has Ended
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
            Subscribe to continue using HireFlow and access all your data
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={`p-6 relative ${
                  plan.popular ? "border-primary bg-primary/5" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Recommended
                    </span>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>

                  <ul className="space-y-2 text-left">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleUpgrade(plan.id as "growth" | "business")}
                    disabled={loading !== null}
                  >
                    {loading === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Subscribe to ${plan.name}`
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}
