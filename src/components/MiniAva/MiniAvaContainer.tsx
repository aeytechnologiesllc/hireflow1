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
  
  // Cursor tracking
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  
  // Expanded voice mode
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Click tracking for interactions
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Track cursor for eye movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCursorPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Handle click interactions
  const handleClick = useCallback(() => {
    wake();
    
    clickCountRef.current += 1;
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    clickTimeoutRef.current = setTimeout(() => {
      const clicks = clickCountRef.current;
      clickCountRef.current = 0;
      
      if (clicks === 1) {
        // Single click - bounce and giggle
        triggerExpression('poked', 600);
      } else if (clicks === 2) {
        // Double click - toggle voice
        if (isExpanded) {
          if (isConnected) {
            disconnect();
          }
          setIsExpanded(false);
        } else {
          setIsExpanded(true);
        }
      } else if (clicks === 3) {
        // Triple click - celebrate!
        triggerAvaReaction('celebrate');
      } else if (clicks >= 5) {
        // Easter egg - party mode
        triggerExpression('celebrating', 3000);
        toast('🎉 Ava loves the attention!', { duration: 2000 });
      }
    }, 300);
  }, [wake, triggerExpression, isExpanded, isConnected, disconnect]);

  // Handle voice toggle
  const handleVoiceToggle = useCallback(async () => {
    if (isConnected) {
      disconnect();
    } else {
      try {
        await connect();
        triggerExpression('happy', 1500);
      } catch (err) {
        console.error('Failed to connect:', err);
        triggerExpression('concerned', 2000);
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

  // Determine voice access (simplified - just check if enterprise)
  const hasVoiceAccess = subscription?.plan_type === 'enterprise' || subscription?.plan_type === 'business';

  // Idle blink animation
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.7 && expression === 'neutral') {
        // Random blink would be here, but we handle via CSS/framer
      }
    }, 4000);
    
    return () => clearInterval(blinkInterval);
  }, [personalityState, expression]);

  return (
    <div 
      ref={containerRef}
      className="fixed bottom-6 right-6 z-50"
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          // Expanded voice mode
          <motion.div
            key="expanded"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-xl"
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
                eyeTarget={cursorPosition}
                size={56}
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
          // Compact floating Ava
          <motion.div
            key="compact"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="relative cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => {
              setIsHovered(true);
              setShowTooltip(true);
              wake();
            }}
            onMouseLeave={() => {
              setIsHovered(false);
              setShowTooltip(false);
            }}
          >
            {/* Glow ring - warm golden glow to match Ava's style */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsla(35, 70%, 60%, 0.35) 0%, hsla(45, 60%, 55%, 0.15) 50%, transparent 70%)',
              }}
              animate={{
                scale: isHovered ? 1.6 : 1.3,
                opacity: personalityState === 'sleeping' ? 0.25 : isHovered ? 0.9 : 0.5,
              }}
              transition={{ duration: 0.4 }}
            />
            
            <MiniAva
              personalityState={personalityState}
              expression={expression}
              eyeTarget={cursorPosition}
              isHovered={isHovered}
              size={48}
            />
            
            {/* Status indicator - warm colors */}
            <motion.div
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background"
              animate={{
                backgroundColor: personalityState === 'sleeping' 
                  ? 'hsl(35, 30%, 45%)' 
                  : 'hsl(145, 60%, 50%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
