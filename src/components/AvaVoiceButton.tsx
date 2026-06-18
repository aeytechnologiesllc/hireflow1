import { useState, useCallback, useMemo, useEffect } from "react";
import EmbeddedCheckoutDialog from "./subscription/EmbeddedCheckoutDialog";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, Clock, Sparkles, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { dispatchAvaFormCommand } from "@/utils/avaFormEvents";
import { pulsingGlow } from "@/lib/animations";

const FIRST_USE_KEY = 'ava_has_used_assistant';

export default function AvaVoiceButton() {
  const { subscription, getVoiceAccessState, getVoiceMinutesRemaining, createCheckoutSession, purchaseVoiceCredits } = useSubscription();
  const pricing = usePricing();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [purchasingPack, setPurchasingPack] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  
  // First-use detection
  const [isFirstUse, setIsFirstUse] = useState(() => {
    return !localStorage.getItem(FIRST_USE_KEY);
  });

  const voiceAccessState = getVoiceAccessState();
  const voiceMinutesRemaining = getVoiceMinutesRemaining();

  // Extract applicationId from URL if viewing an applicant
  const currentApplicationId = useMemo(() => {
    const match = location.pathname.match(/\/applicants\/([a-f0-9-]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const handleTranscript = useCallback((_text: string, _role: "user" | "assistant") => {
  }, []);

  const handleToolCall = useCallback((toolName: string, result: any) => {
    if (result?.success || result?.action) {
      if (toolName === 'open_applicant_page' && result.action === 'navigate' && result.route) {
        navigate(result.route);
        return;
      }
      
      if (toolName === 'navigate_to_page' && result.action === 'navigate' && result.route) {
        navigate(result.route);
        return;
      }
      
      if (toolName === 'walkthrough_navigate') {
        if (result.completed) {
          toast.success("Walkthrough complete!");
          return;
        }
        if (result.route) {
          toast.success(`${result.pageName} (${result.step}/${result.totalSteps})`);
          navigate(result.route);
        }
        return;
      }
      
      if (toolName === 'send_message' && result.success) {
        toast.success('Message sent!');
        queryClient.invalidateQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }
      
      if (toolName === 'create_job_interactive') {
        if (result.action === 'navigate_and_prepare' && result.route) {
          toast.success('Opening job creation wizard...');
          navigate(result.route);
          return;
        }
        
        if (result.action === 'fill_field' && result.field) {
          dispatchAvaFormCommand({
            action: 'fill_field',
            field: result.field,
            value: result.value
          });
          return;
        }
        
        if (result.action === 'navigate_step') {
          dispatchAvaFormCommand({
            action: 'navigate_step',
            step: result.step
          });
          return;
        }
        
        if (result.action === 'trigger_generate') {
          dispatchAvaFormCommand({
            action: 'trigger_generate',
            target: result.target
          });
          return;
        }
        
        if (result.action === 'submit') {
          dispatchAvaFormCommand({
            action: 'submit'
          });
          return;
        }
      }
      
      // Handle open_applicant_section tool
      if (toolName === 'open_applicant_section' && result.action === 'open_section') {
        window.dispatchEvent(new CustomEvent('ava-open-section', { 
          detail: { section: result.section } 
        }));
        return;
      }
      
      if (toolName === 'schedule_interview' && result.success) {
        queryClient.invalidateQueries({ queryKey: ["interviews"] });
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        if (currentApplicationId) {
          queryClient.invalidateQueries({ queryKey: ["application", currentApplicationId] });
        }
        if (result.meet_link) {
          toast.success(`Interview scheduled! Meet link ready.`);
        } else {
          toast.success(`Interview scheduled for ${result.formatted_date}`);
        }
        return;
      }
      
      if (toolName === 'move_applicant_to_phase' || toolName === 'reject_applicant') {
        if (currentApplicationId) {
          queryClient.invalidateQueries({ queryKey: ["application", currentApplicationId] });
        }
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      }
      if (toolName === 'get_applicant_count' || toolName === 'get_job_stats' || toolName === 'list_recent_applicants') {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      }
    }
  }, [queryClient, currentApplicationId, navigate]);

  const googleAccessToken = sessionStorage.getItem("google_access_token");
  const googleRefreshToken = sessionStorage.getItem("google_refresh_token");
  const googleCalendarConnected = !!googleAccessToken;

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    error,
    audioLevels,
    connect,
    disconnect,
  } = useAvaVoice({
    mode: "assistant",
    applicationId: currentApplicationId,
    googleCalendarConnected,
    googleRefreshToken: googleRefreshToken || undefined,
    subscriptionPlan: subscription?.plan_type,
    subscriptionStatus: subscription?.status,
    countryCode: pricing.countryCode,
    voiceMinutesRemaining: voiceMinutesRemaining,
    isFirstUse: isFirstUse,
    onTranscript: handleTranscript,
    onToolCall: handleToolCall,
  });

  useEffect(() => {
    if (isConnected && isFirstUse) {
      localStorage.setItem(FIRST_USE_KEY, 'true');
      setIsFirstUse(false);
    }
  }, [isConnected, isFirstUse]);

  const handleButtonClick = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'exhausted' || voiceAccessState === 'expired' || voiceAccessState === 'trial_exhausted') {
      setShowUpgradeDialog(true);
      return;
    }

    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const result = await createCheckoutSession.mutateAsync({
        planType: 'business',
        countryCode: pricing.countryCode,
        interval: 'monthly',
      });
      if (result?.clientSecret) {
        setCheckoutClientSecret(result.clientSecret);
        setShowUpgradeDialog(false);
      }
    } catch (err) {
      toast.error('Failed to start checkout');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handlePurchasePack = async (packSize: string = 'standard') => {
    setPurchasingPack(packSize);
    try {
      const result = await purchaseVoiceCredits.mutateAsync({ packSize });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start checkout';
      toast.error(errorMessage);
    } finally {
      setPurchasingPack(null);
      setShowUpgradeDialog(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Dark portal with green glow - base styles (smaller size)
  const getPortalStyles = () => {
    const baseStyles = "h-8 w-8 rounded-full bg-[hsl(220,15%,8%)] border border-border/30 transition-all duration-300";
    
    switch (voiceAccessState) {
      case 'exhausted':
        return cn(baseStyles, "border-amber-500/50");
      case 'locked':
      case 'expired':
        return cn(baseStyles, "opacity-60");
      default:
        return baseStyles;
    }
  };

  const getButtonContent = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'expired') {
      return (
        <div className="flex items-center justify-center">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }
    
    if (voiceAccessState === 'exhausted') {
      return (
        <div className="flex items-center justify-center">
          <Clock className="h-4 w-4 text-amber-500" />
        </div>
      );
    }
    
    if (isConnecting) {
      return (
        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      );
    }
    
    // Speaking - green animated bars
    if (isConnected && isSpeaking) {
      return (
        <div className="flex items-end justify-center gap-0.5 h-5">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="w-1 bg-emerald-400 rounded-full"
              animate={{ height: [6, 14, 10, 16, 6][i % 5] }}
              transition={{ 
                duration: 0.2, 
                repeat: Infinity, 
                repeatType: "reverse",
                delay: i * 0.08 
              }}
            />
          ))}
        </div>
      );
    }
    
    // Listening - audio reactive bars
    if (isConnected) {
      return (
        <div className="flex items-end justify-center gap-0.5 h-5">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="w-1 bg-primary rounded-full"
              animate={{ height: audioLevels[i] ? audioLevels[i] * 0.6 : 4 }}
              transition={{ duration: 0.05, ease: "linear" }}
            />
          ))}
        </div>
      );
    }
    
    // Default - empty dark portal (the glow does the work)
    return null;
  };

  const businessPrice = pricing.business.monthlyFormatted;
  const isBusinessUser = subscription?.plan_type === 'business' || subscription?.plan_type === 'enterprise';

  // Determine glow animation based on state
  const getGlowAnimation = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'expired') {
      return { animate: undefined, transition: undefined }; // No glow for locked state
    }
    if (voiceAccessState === 'exhausted') {
      // Amber glow for exhausted
      return {
        animate: {
          boxShadow: [
            "0 0 20px 2px hsla(38, 92%, 50%, 0.5)",
            "0 0 35px 4px hsla(38, 92%, 50%, 0.75)",
            "0 0 20px 2px hsla(38, 92%, 50%, 0.5)"
          ]
        },
        transition: pulsingGlow.transition
      };
    }
    // Green glow for active states
    return pulsingGlow;
  };

  return (
    <>
      <EmbeddedCheckoutDialog
        clientSecret={checkoutClientSecret}
        planType="business"
        onClose={() => setCheckoutClientSecret(null)}
      />
      {/* Header-integrated button */}
      <div className="relative">
        {/* Listening ring animation */}
        {isConnected && isListening && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ 
              scale: [1, 1.4, 1],
              opacity: [0.8, 0, 0.8]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            style={{
              border: "2px solid var(--primary)",
            }}
          />
        )}

        {/* Speaking ring animation */}
        {isConnected && isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.8, 0.3, 0.8]
            }}
            transition={{ 
              duration: 0.6, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            style={{
              border: "2px solid hsl(142.1 76.2% 36.3%)",
            }}
          />
        )}

        <motion.button
          onClick={handleButtonClick}
          disabled={isConnecting}
          className={cn(
            "relative flex items-center justify-center cursor-pointer",
            getPortalStyles()
          )}
          animate={getGlowAnimation().animate}
          transition={getGlowAnimation().transition}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {getButtonContent()}
        </motion.button>


        {/* Error indicator */}
        {error && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-[8px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
          >
            Error
          </motion.div>
        )}
      </div>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {voiceAccessState === 'exhausted' ? (
                <>
                  <Clock className="h-5 w-5 text-amber-500" />
                  Voice Minutes Exhausted
                </>
              ) : voiceAccessState === 'trial_exhausted' ? (
                <>
                  <Sparkles className="h-5 w-5 text-primary" />
                  Upgrade for More Voice Minutes
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  Unlock AVA Voice Assistant
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {voiceAccessState === 'exhausted' && isBusinessUser
                ? "Your voice minutes have run out. Purchase additional voice credit packs to continue."
                : voiceAccessState === 'exhausted'
                ? "Your voice minutes have run out. Upgrade to Business to purchase more credits."
                : voiceAccessState === 'trial_exhausted'
                ? "You've used your 5-minute trial. Upgrade to Business to continue using AVA Voice Assistant."
                : "Get access to AVA Voice Assistant with the Business plan."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Show purchase option for Business users who are exhausted */}
            {isBusinessUser && voiceAccessState === 'exhausted' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Purchase additional voice minutes to continue using AVA Voice.
                </p>
                <Button
                  variant="outline"
                  onClick={() => handlePurchasePack('standard')}
                  disabled={!!purchasingPack}
                  className="w-full flex items-center justify-between h-auto py-4"
                >
                  {purchasingPack ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{pricing.voiceCredits.minutes} min</span>
                      </div>
                      <span className="text-muted-foreground">{pricing.voiceCredits.priceFormatted}</span>
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Voice credits expire after 1 month
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <h4 className="font-semibold text-lg mb-2">Business Plan</h4>
                  <p className="text-2xl font-bold text-primary mb-3">
                    {businessPrice}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      30 Voice Minutes/month
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      AVA Voice Assistant for hiring queries
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Voice Interviews with candidates
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Buy additional voice credit packs
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {isUpgrading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    "Upgrade to Business"
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
