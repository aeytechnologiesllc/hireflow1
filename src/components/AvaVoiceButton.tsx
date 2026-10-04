import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Clock } from "lucide-react";
import { AvaSeal } from "@/components/ava/AvaSeal";
import { Button } from "@/components/ui/button";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { dispatchAvaFormCommand } from "@/utils/avaFormEvents";
import { pulsingGlow } from "@/lib/animations";

const FIRST_USE_KEY = 'ava_has_used_assistant';

/** Shape of the tool-call result payloads Ava's voice tools return — see
 *  handleToolCall below for exactly which tool sets which fields. */
interface ToolCallResult {
  success?: boolean;
  action?: string;
  route?: string;
  completed?: boolean;
  pageName?: string;
  step?: number;
  totalSteps?: number;
  field?: string;
  value?: unknown;
  target?: 'workflow' | 'full_job' | 'description';
  section?: string;
  meet_link?: string;
  formatted_date?: string;
}

export default function AvaVoiceButton() {
  const { getVoiceAccessState, getVoiceMinutesRemaining } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
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

  const handleToolCall = useCallback((toolName: string, result: ToolCallResult) => {
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
    if (voiceAccessState === 'exhausted') {
      toast.message("Ava's voice minutes are used up for this account.");
      return;
    }

    if (isConnected) {
      disconnect();
    } else {
      connect();
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
        return cn(baseStyles, "border-[var(--brass)]/50");
      default:
        return baseStyles;
    }
  };

  const getButtonContent = () => {
    if (voiceAccessState === 'exhausted') {
      return (
        <div className="flex items-center justify-center">
          <Clock className="h-4 w-4 text-[var(--brass)]" />
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
              className="w-1 bg-[var(--jade-bright)] rounded-full"
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

  // Determine glow animation based on state
  const getGlowAnimation = () => {
    if (voiceAccessState === 'exhausted') {
      // Brass glow for exhausted
      return {
        animate: {
          boxShadow: [
            "0 0 20px 2px var(--hf-gold-soft)",
            "0 0 35px 4px var(--hf-gold-border)",
            "0 0 20px 2px var(--hf-gold-soft)"
          ]
        },
        transition: pulsingGlow.transition
      };
    }
    // Jade glow for active states
    return pulsingGlow;
  };

  return (
    <>
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
              border: "2px solid hsl(var(--primary))",
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
              border: "2px solid var(--jade)",
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

    </>
  );
}
