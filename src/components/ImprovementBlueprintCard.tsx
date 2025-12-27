import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, TrendingUp, Calendar, Target, Lightbulb, Lock, Sparkles } from "lucide-react";
import { useImprovementBlueprint, BLUEPRINT_PRICE_FORMATTED } from "@/hooks/useImprovementBlueprint";
import { toast } from "sonner";

interface ImprovementBlueprintCardProps {
  applicationId: string;
}

export function ImprovementBlueprintCard({ applicationId }: ImprovementBlueprintCardProps) {
  const { 
    downloadBlueprint, 
    isGenerating, 
    purchaseBlueprint, 
    isPurchasing,
    checkPurchaseStatus,
    isCheckingPurchase,
    hasPurchased,
    verifyPurchase
  } = useImprovementBlueprint();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasVerified, setHasVerified] = useState(false);

  // Check purchase status on mount
  useEffect(() => {
    if (applicationId) {
      checkPurchaseStatus(applicationId);
    }
  }, [applicationId, checkPurchaseStatus]);

  // Handle Stripe redirect verification
  useEffect(() => {
    const blueprintSuccess = searchParams.get("blueprint_success");
    const sessionId = searchParams.get("session_id");
    
    if (blueprintSuccess === "true" && sessionId && applicationId && !hasVerified) {
      setHasVerified(true);
      
      // Verify and record the purchase
      verifyPurchase(sessionId, applicationId).then((success) => {
        if (success) {
          toast.success("Payment successful! You can now download your blueprint.");
          // Clean up URL params
          const newParams = new URLSearchParams(searchParams);
          newParams.delete("blueprint_success");
          newParams.delete("session_id");
          setSearchParams(newParams, { replace: true });
        } else {
          toast.error("There was an issue verifying your payment. Please contact support.");
        }
      });
    }

    // Handle cancelled checkout
    if (searchParams.get("blueprint_cancelled") === "true") {
      toast.info("Checkout was cancelled.");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("blueprint_cancelled");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, applicationId, verifyPurchase, hasVerified, setSearchParams]);

  const handleDownload = () => {
    downloadBlueprint(applicationId);
  };

  const handlePurchase = () => {
    purchaseBlueprint(applicationId);
  };

  // Loading state while checking purchase
  if (isCheckingPurchase) {
    return (
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <CardContent className="p-6 relative">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-3 bg-primary/10 rounded-xl">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Your Personal Improvement Blueprint
                </h3>
                {!hasPurchased && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium">
                    <Sparkles className="h-3 w-3" />
                    {BLUEPRINT_PRICE_FORMATTED}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                A coaching-focused guide with actionable steps to strengthen your next application.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span>Honest feedback</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                <span>Strengths to leverage</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>Improvement strategies</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 text-violet-500" />
                <span>30-day action plan</span>
              </div>
            </div>

            {/* Action button - Purchase or Download based on status */}
            {hasPurchased ? (
              <Button 
                onClick={handleDownload} 
                disabled={isGenerating}
                size="lg"
                className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating Your Blueprint...
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Download Your Improvement Blueprint
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handlePurchase} 
                disabled={isPurchasing}
                size="lg"
                className="w-full sm:w-auto gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground border-0"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting Checkout...
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5" />
                    Unlock Your Blueprint for {BLUEPRINT_PRICE_FORMATTED}
                  </>
                )}
              </Button>
            )}

            {/* Footer text */}
            <p className="text-xs text-muted-foreground">
              {hasPurchased 
                ? "This blueprint is designed to help you grow. Every application is a learning opportunity."
                : "One-time purchase. Download anytime. Your personal roadmap to success."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
