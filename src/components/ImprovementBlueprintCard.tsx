import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, TrendingUp, Calendar, Target, Lightbulb, Lock, Sparkles, Star } from "lucide-react";
import { useImprovementBlueprint, BLUEPRINT_PRICE_FORMATTED } from "@/hooks/useImprovementBlueprint";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
      <Card className="relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-background to-yellow-500/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative overflow-hidden border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-background to-yellow-500/10 hover:border-amber-500/60 transition-all duration-500 hover:shadow-lg hover:shadow-amber-500/10">
      {/* Animated gradient border effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      {/* Decorative sparkle elements */}
      <div className="absolute top-3 right-3 text-amber-500/30 animate-pulse">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-amber-500/10 via-yellow-500/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="p-6 relative">
        <div className="flex items-start gap-4">
          {/* Premium Icon with glow */}
          <div className="flex-shrink-0 p-3 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-500/10">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500/20" />
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-foreground">
                  Your Personal Improvement Blueprint
                </h3>
                {!hasPurchased && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-500/30">
                    <Sparkles className="h-3 w-3" />
                    {BLUEPRINT_PRICE_FORMATTED}
                  </span>
                )}
                {hasPurchased && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                    <Sparkles className="h-3 w-3" />
                    Unlocked
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                A coaching-focused guide with actionable steps to strengthen your next application.
              </p>
            </div>

            {/* Feature highlights with hover effects */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-amber-500/10 group-hover/item:bg-amber-500/20 transition-colors">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <span>Honest feedback</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-emerald-500/10 group-hover/item:bg-emerald-500/20 transition-colors">
                  <Target className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <span>Strengths to leverage</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-blue-500/10 group-hover/item:bg-blue-500/20 transition-colors">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <span>Improvement strategies</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-violet-500/10 group-hover/item:bg-violet-500/20 transition-colors">
                  <Calendar className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <span>30-day action plan</span>
              </div>
            </div>

            {/* Premium Action Buttons */}
            {hasPurchased ? (
              <Button 
                onClick={handleDownload} 
                disabled={isGenerating}
                size="lg"
                className={cn(
                  "relative w-full sm:w-auto gap-2 overflow-hidden",
                  "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 bg-[length:200%_100%]",
                  "hover:bg-[position:100%_0] transition-all duration-500",
                  "text-white font-semibold border-0",
                  "shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30",
                  "hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating Your Blueprint...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <Download className="h-5 w-5" />
                    Download Your Blueprint
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handlePurchase} 
                disabled={isPurchasing}
                size="lg"
                className={cn(
                  "relative w-full sm:w-auto gap-2 overflow-hidden",
                  "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 bg-[length:200%_100%]",
                  "hover:bg-[position:100%_0] transition-all duration-500",
                  "text-white font-semibold border-0",
                  "shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/40",
                  "hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                
                {isPurchasing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting Checkout...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <Sparkles className="h-4 w-4" />
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
