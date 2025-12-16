import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import avaOrbLogo from "@/assets/ava-orb.png";
import { dispatchAvaFormCommand } from "@/utils/avaFormEvents";

const FIRST_USE_KEY = 'ava_has_used_assistant';

export default function AvaVoiceButton() {
  const { subscription, getVoiceAccessState, getVoiceMinutesRemaining, createCheckoutSession } = useSubscription();
  const pricing = usePricing();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  
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

  const handleTranscript = useCallback((text: string, role: "user" | "assistant") => {
    // No longer storing messages since we removed the chat panel
    console.log(`[${role}]: ${text}`);
  }, []);

  const handleToolCall = useCallback((toolName: string, result: any) => {
    console.log("Tool call result:", toolName, result);

    // Invalidate relevant queries to sync dashboard when AVA performs actions
    if (result?.success || result?.action) {
      // Handle open_applicant_page - instant navigation, no toast
      if (toolName === 'open_applicant_page' && result.action === 'navigate' && result.route) {
        navigate(result.route);
        return;
      }
      
      // Handle navigation commands - minimal feedback
      if (toolName === 'navigate_to_page' && result.action === 'navigate' && result.route) {
        navigate(result.route);
        return;
      }
      
      // Handle walkthrough navigation - synchronized with speech
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
      
      // Handle message sent
      if (toolName === 'send_message' && result.success) {
        toast.success('Message sent!');
        queryClient.invalidateQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }
      
      // Handle interactive job creation
      if (toolName === 'create_job_interactive') {
        // Navigate to create job page if starting
        if (result.action === 'navigate_and_prepare' && result.route) {
          toast.success('Opening job creation wizard...');
          navigate(result.route);
          return;
        }
        
        // Fill a field in the form
        if (result.action === 'fill_field' && result.field) {
          dispatchAvaFormCommand({
            action: 'fill_field',
            field: result.field,
            value: result.value
          });
          return;
        }
        
        // Navigate wizard steps
        if (result.action === 'navigate_step') {
          dispatchAvaFormCommand({
            action: 'navigate_step',
            step: result.step
          });
          return;
        }
        
        // Trigger generation (workflow or content)
        if (result.action === 'trigger_generate') {
          dispatchAvaFormCommand({
            action: 'trigger_generate',
            target: result.target
          });
          return;
        }
        
        // Submit the form
        if (result.action === 'submit') {
          dispatchAvaFormCommand({
            action: 'submit'
          });
          return;
        }
      }
      
      // Handle interview scheduling
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
        // Refresh application details and applicants list
        if (currentApplicationId) {
          queryClient.invalidateQueries({ queryKey: ["application", currentApplicationId] });
        }
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      }
      if (toolName === 'get_applicant_count' || toolName === 'get_job_stats' || toolName === 'list_recent_applicants') {
        // Refresh jobs and applications data
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      }
    }
  }, [queryClient, currentApplicationId, navigate]);

  // Get Google Calendar connection state
  const googleAccessToken = localStorage.getItem("google_access_token");
  const googleRefreshToken = localStorage.getItem("google_refresh_token");
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
    // Pass user context for personalized AVA responses
    subscriptionPlan: subscription?.plan_type,
    subscriptionStatus: subscription?.status,
    countryCode: pricing.countryCode,
    voiceMinutesRemaining: voiceMinutesRemaining,
    isFirstUse: isFirstUse,
    onTranscript: handleTranscript,
    onToolCall: handleToolCall,
  });

  // Mark as used after first connection
  useEffect(() => {
    if (isConnected && isFirstUse) {
      localStorage.setItem(FIRST_USE_KEY, 'true');
      setIsFirstUse(false);
    }
  }, [isConnected, isFirstUse]);

  // Toggle button click - immediately starts/stops conversation
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
        planType: 'enterprise',
        countryCode: pricing.countryCode,
        interval: 'monthly',
      });
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      toast.error('Failed to start checkout');
    } finally {
      setIsUpgrading(false);
      setShowUpgradeDialog(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get button styling based on access state
  const getButtonStyles = () => {
    switch (voiceAccessState) {
      case 'full':
      case 'trial':
      case 'trial_exhausted': // Trial exhausted still shows premium orb, not amber
        return "bg-transparent hover:bg-transparent shadow-none";
      case 'exhausted': // Only Enterprise users with 0 minutes show amber
        return "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50";
      case 'locked':
      case 'expired':
      default:
        return "bg-muted/50 hover:bg-muted/70 border border-muted-foreground/20";
    }
  };

  const getButtonContent = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'expired') {
      return (
        <div className="relative">
          <img src={avaOrbLogo} alt="AVA" className="h-12 w-12 object-contain opacity-50 grayscale" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      );
    }
    // Enterprise users with 0 minutes show amber clock
    if (voiceAccessState === 'exhausted') {
      return (
        <div className="relative">
          <img src={avaOrbLogo} alt="AVA" className="h-12 w-12 object-contain opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
        </div>
      );
    }
    // Trial exhausted - still show premium orb (not amber)
    if (voiceAccessState === 'trial_exhausted') {
      return (
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-lg scale-125" />
          <img src={avaOrbLogo} alt="AVA" className="relative h-12 w-12 object-contain" />
        </div>
      );
    }
    if (isConnecting) {
      return (
        <div className="relative">
          <img src={avaOrbLogo} alt="AVA" className="h-12 w-12 object-contain opacity-70" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      );
    }
    // When AVA is speaking - show green animated bars
    if (isConnected && isSpeaking) {
      return (
        <div className="flex items-end justify-center gap-0.5 h-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 bg-emerald-400 rounded-full"
              animate={{ height: [12, 24, 16, 28, 12][i % 5] }}
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
    // When connected (user can speak) - show reactive audio bars throughout session
    if (isConnected) {
      return (
        <div className="flex items-end justify-center gap-0.5 h-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 bg-primary rounded-full"
              animate={{ height: audioLevels[i] }}
              transition={{ duration: 0.05, ease: "linear" }}
            />
          ))}
        </div>
      );
    }
    // Show AVA orb with glow effect (default/disconnected)
    return (
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-lg scale-125" />
        <img src={avaOrbLogo} alt="AVA" className="relative h-12 w-12 object-contain" />
      </div>
    );
  };

  const enterprisePrice = pricing.enterprise.monthlyFormatted;

  return (
    <>
      {/* Floating Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
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
              border: "3px solid hsl(var(--primary))",
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
              border: "3px solid hsl(142.1 76.2% 36.3%)",
            }}
          />
        )}

        <Button
          onClick={handleButtonClick}
          disabled={isConnecting}
          variant="ghost"
          className={cn(
            "h-16 w-16 rounded-full p-0 transition-all duration-300 relative",
            getButtonStyles(),
            isSpeaking && voiceAccessState !== 'locked' && "animate-pulse"
          )}
        >
          {getButtonContent()}
        </Button>

        {/* Trial minutes remaining badge */}
        {voiceAccessState === 'trial' && !isConnected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg"
          >
            {formatMinutes(voiceMinutesRemaining)}
          </motion.div>
        )}

        {/* Exhausted badge - only for Enterprise users */}
        {voiceAccessState === 'exhausted' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg"
          >
            0:00
          </motion.div>
        )}

        {/* No badge for trial_exhausted - shows clean premium orb */}

        {/* Error indicator */}
        {error && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap"
          >
            Error
          </motion.div>
        )}
      </motion.div>

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
              {voiceAccessState === 'exhausted'
                ? "Your voice minutes have run out. Purchase more credits or upgrade your plan."
                : voiceAccessState === 'trial_exhausted'
                ? "You've used your 5-minute trial. Upgrade to Enterprise to continue using AVA Voice Assistant."
                : "Get access to AVA Voice Assistant with the Enterprise plan."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h4 className="font-semibold text-lg mb-2">Enterprise Plan</h4>
              <p className="text-2xl font-bold text-primary mb-3">
                {enterprisePrice}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  500 Voice Minutes/month
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
                  All Business features included
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
                "Upgrade to Enterprise"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
