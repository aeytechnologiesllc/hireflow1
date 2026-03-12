import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import MiniAva from './MiniAva';
import { useAvaPersonality } from './useAvaPersonality';
import { useAvaContext } from './useAvaContext';
import { useAvaReactions } from './useAvaReactions';
import { triggerAvaReaction } from '@/hooks/useAvaEvents';
import { useAvaVoice } from '@/hooks/useAvaVoice';
import { useSubscription } from '@/hooks/useSubscription';
import { useIsMobile } from '@/hooks/use-mobile';
import { Mic, MicOff, X } from 'lucide-react';
import { toast } from 'sonner';

export default function MiniAvaContainer() {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscription } = useSubscription();
  const isMobile = useIsMobile();
  
  // Personality and reactions
  const { state: personalityState, wake } = useAvaPersonality();
  const { mood } = useAvaContext();
  const { expression, triggerExpression } = useAvaReactions();
  
  // Interaction state
  const [isHovered, setIsHovered] = useState(false);
  
  // Expanded voice mode
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Voice connection
  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    voiceNameUsed,
    connect,
    disconnect,
    error: voiceError,
  } = useAvaVoice({
    mode: 'assistant',
    currentRoute: location.pathname,
    onTranscript: (transcript, isFinal) => {
      if (isFinal) {
        console.log('Ava heard:', transcript);
      }
    },
    onToolCall: (toolName, result) => {
      console.log('Tool call received:', toolName, result);
      
      // Handle navigation actions
      if (result?.action === 'navigate' && result.route) {
        navigate(result.route);
        return;
      }
      
      // Handle walkthrough navigation
      if (toolName === 'walkthrough_navigate' && result?.route) {
        toast.success(`${result.pageName} (${result.step}/${result.totalSteps})`);
        navigate(result.route);
        return;
      }
      
      // Handle job creation navigation
      if (result?.action === 'navigate_and_prepare' && result.route) {
        navigate(result.route);
        return;
      }
      
      // Handle successful interview scheduling
      if (toolName === 'schedule_interview' && result?.success) {
        toast.success(result.message || 'Interview scheduled!');
        return;
      }
      
      // Handle message sent
      if (toolName === 'send_message' && result?.success) {
        toast.success('Message sent!');
        return;
      }
      
      // Handle shortlist
      if (toolName === 'shortlist_applicant' && result?.success) {
        toast.success(result.message || 'Added to shortlist!');
        return;
      }
      
      // Handle mark as top candidate
      if (toolName === 'mark_as_top_candidate' && result?.success) {
        toast.success(result.message || 'Marked as top candidate!');
        return;
      }
      
      // Handle notes added
      if (toolName === 'add_applicant_note' && result?.success) {
        toast.success('Note added!');
        return;
      }
      
      // Handle job status changes
      if ((toolName === 'pause_job' || toolName === 'unpause_job' || toolName === 'archive_job') && result?.success) {
        toast.success(result.message || 'Job updated!');
        return;
      }
      
      // Handle interview actions
      if ((toolName === 'reschedule_interview' || toolName === 'cancel_interview') && result?.success) {
        toast.success(result.message || 'Interview updated!');
        return;
      }
      
      // Handle bulk actions
      if (toolName === 'bulk_reject' && result?.success) {
        toast.success(result.message || `Rejected ${result.count} applicants`);
        return;
      }
    },
  });

  // Handle click - single click opens the assistant
  const handleClick = useCallback(() => {
    wake();
    triggerExpression('poked', 300);
    
    if (!isExpanded) {
      setIsExpanded(true);
    }
  }, [wake, triggerExpression, isExpanded]);

  // Handle voice toggle
  const handleVoiceToggle = useCallback(async () => {
    if (isConnected) {
      disconnect();
    } else {
      try {
        await connect();
        triggerExpression('happy', 1000);
      } catch (err) {
        console.error('Failed to connect:', err);
        triggerExpression('concerned', 1500);
      }
    }
  }, [isConnected, connect, disconnect, triggerExpression]);

  // Hard reset - forces a fresh session (useful if an older session used a different voice)
  const handleReset = useCallback(() => {
    if (isConnected) disconnect();
    toast.success('Voice session reset. Tap Start to reconnect.');
  }, [isConnected, disconnect]);

  // Close expanded mode
  const handleClose = useCallback(() => {
    if (isConnected) {
      disconnect();
    }
    setIsExpanded(false);
  }, [isConnected, disconnect]);

  // Determine voice access
  const hasVoiceAccess = subscription?.plan_type === 'enterprise' || subscription?.plan_type === 'business';

  return (
    <div 
      ref={containerRef}
      className="fixed bottom-6 right-6 z-50"
    >
      <AnimatePresence mode="popLayout">
        {isExpanded ? (
          // Expanded voice mode
          <motion.div
            key="expanded"
            layout
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-4 shadow-xl"
            style={{ minWidth: 200 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-foreground">Talk to Ava</span>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <MiniAva
                personalityState={isConnected ? 'active' : personalityState}
                expression={isSpeaking ? 'happy' : isListening ? 'thinking' : expression}
                size={56}
                isHovered={true}
                isListening={isListening}
                isSpeaking={isSpeaking}
              />
              
              <div className="flex flex-col gap-2 flex-1">
                {hasVoiceAccess ? (
                  <>
                    <button
                      onClick={handleVoiceToggle}
                      disabled={isConnecting}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isConnected
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isConnecting ? (
                        <span className="animate-pulse">Connecting...</span>
                      ) : isConnected ? (
                        <>
                          <MicOff className="h-4 w-4" />
                          End
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" />
                          Start
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleReset}
                      className="flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-all bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      type="button"
                    >
                      Reset
                    </button>

                    <div className="text-xs text-muted-foreground text-center space-y-0.5">
                      <div>
                        Voice: <span className="font-medium text-foreground">{voiceNameUsed || 'unknown'}</span>
                      </div>
                      {isConnected && (
                        <div>
                          {isSpeaking ? 'Ava is speaking...' : isListening ? 'Listening...' : 'Ready'}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Voice requires Enterprise plan
                  </div>
                )}
              </div>
            </div>
            
            {voiceError && (
              <p className="text-xs text-destructive mt-2">{voiceError}</p>
            )}
          </motion.div>
        ) : (
          // Compact floating orb
          <motion.div
            key="compact"
            layout
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative"
          >
            {/* Clickable overlay - ensures clicks always work regardless of animations */}
            <button
              onClick={handleClick}
              onMouseEnter={() => {
                setIsHovered(true);
                wake();
              }}
              onMouseLeave={() => {
                setIsHovered(false);
              }}
              className="absolute inset-0 z-10 rounded-full cursor-pointer bg-transparent border-none outline-none focus:outline-none"
              style={{ width: 56, height: 56 }}
              aria-label="Talk to Ava"
            />
            
            {/* Soft shadow beneath orb — skip on mobile for GPU savings */}
            {!isMobile && (
              <div 
                className="absolute inset-0 rounded-full blur-xl opacity-30 pointer-events-none"
                style={{
                  background: 'hsl(160, 84%, 39%)',
                  transform: 'translateY(4px) scale(0.8)',
                }}
              />
            )}
            
            <div className="pointer-events-none">
              <MiniAva
                personalityState={personalityState}
                expression={expression}
                isHovered={isHovered}
                size={56}
                isListening={isListening}
                isSpeaking={isSpeaking}
              />
            </div>
            
            {/* Status indicator - minimal dot */}
            <motion.div
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background pointer-events-none"
              animate={{
                backgroundColor: personalityState === 'sleeping' 
                  ? 'hsl(160, 20%, 25%)' 
                  : 'hsl(160, 84%, 39%)',
                boxShadow: personalityState === 'sleeping'
                  ? 'none'
                  : '0 0 6px hsl(160, 84%, 39%)',
              }}
              transition={{ duration: 0.5 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
