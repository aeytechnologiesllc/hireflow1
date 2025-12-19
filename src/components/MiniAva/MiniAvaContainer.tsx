import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import MiniAva from './MiniAva';
import { useAvaPersonality } from './useAvaPersonality';
import { useAvaContext } from './useAvaContext';
import { useAvaReactions } from './useAvaReactions';
import { triggerAvaReaction } from '@/hooks/useAvaEvents';
import { useAvaVoice } from '@/hooks/useAvaVoice';
import { useSubscription } from '@/hooks/useSubscription';
import { Mic, MicOff, X } from 'lucide-react';
import { toast } from 'sonner';

export default function MiniAvaContainer() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscription } = useSubscription();
  
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
    connect,
    disconnect,
    error: voiceError,
  } = useAvaVoice({
    mode: 'assistant',
    onTranscript: (transcript, isFinal) => {
      if (isFinal) {
        console.log('Ava heard:', transcript);
      }
    },
    onToolCall: (toolName, args) => {
      if (toolName === 'navigate') {
        navigate(args.path);
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
      <AnimatePresence>
        {isExpanded ? (
          // Expanded voice mode
          <motion.div
            key="expanded"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
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
                    
                    {isConnected && (
                      <span className="text-xs text-muted-foreground text-center">
                        {isSpeaking ? 'Ava is speaking...' : isListening ? 'Listening...' : 'Ready'}
                      </span>
                    )}
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
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="relative cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => {
              setIsHovered(true);
              wake();
            }}
            onMouseLeave={() => {
              setIsHovered(false);
            }}
          >
            {/* Soft shadow beneath orb */}
            <div 
              className="absolute inset-0 rounded-full blur-xl opacity-30"
              style={{
                background: 'hsl(160, 84%, 39%)',
                transform: 'translateY(4px) scale(0.8)',
              }}
            />
            
            <MiniAva
              personalityState={personalityState}
              expression={expression}
              isHovered={isHovered}
              size={56}
              isListening={isListening}
              isSpeaking={isSpeaking}
            />
            
            {/* Status indicator - minimal dot */}
            <motion.div
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background"
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
