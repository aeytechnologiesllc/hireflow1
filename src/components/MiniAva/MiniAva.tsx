import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useEffect, useCallback } from 'react';
import type { PersonalityState } from './useAvaPersonality';
import type { AvaExpression } from './useAvaReactions';

// Import all Ava images
import avaNeutral from '@/assets/ava-neutral.png';
import avaThinking from '@/assets/ava-thinking.png';
import avaCelebrating from '@/assets/ava-celebrating.png';
import avaProud from '@/assets/ava-proud.png';
import avaEncouraging from '@/assets/ava-encouraging.png';
import avaEmpathetic from '@/assets/ava-empathetic.png';
import avaWaving from '@/assets/ava-waving.png';
import avaListening from '@/assets/ava-listening.png';
import avaSpeaking from '@/assets/ava-speaking.png';
import avaOrb from '@/assets/ava-orb.png';

interface MiniAvaProps {
  personalityState: PersonalityState;
  expression: AvaExpression;
  eyeTarget: { x: number; y: number };
  isHovered?: boolean;
  size?: number;
  isListening?: boolean;
  isSpeaking?: boolean;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
}

export default function MiniAva({ 
  personalityState, 
  expression, 
  isHovered = false,
  size = 48,
  isListening = false,
  isSpeaking = false,
}: MiniAvaProps) {
  // Animation states
  const [headTilt, setHeadTilt] = useState(0);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [isWaking, setIsWaking] = useState(false);
  const [prevState, setPrevState] = useState<PersonalityState>(personalityState);

  // Detect wake-up for stretch animation
  useEffect(() => {
    if (prevState === 'sleeping' && personalityState !== 'sleeping') {
      setIsWaking(true);
      setTimeout(() => setIsWaking(false), 800);
    }
    setPrevState(personalityState);
  }, [personalityState, prevState]);

  // Random head tilt
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const tiltInterval = setInterval(() => {
      if (Math.random() > 0.75) {
        const tilt = (Math.random() - 0.5) * 12;
        setHeadTilt(tilt);
        setTimeout(() => setHeadTilt(0), 1000);
      }
    }, 6000 + Math.random() * 4000);
    
    return () => clearInterval(tiltInterval);
  }, [personalityState]);

  // Sparkle generation
  const generateSparkle = useCallback(() => {
    const newSparkle: Sparkle = {
      id: Date.now() + Math.random(),
      x: Math.random() * size * 1.2 - size * 0.1,
      y: Math.random() * size * 1.2 - size * 0.1,
      size: 4 + Math.random() * 5,
      delay: Math.random() * 0.3,
    };
    setSparkles(prev => [...prev.slice(-4), newSparkle]);
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => s.id !== newSparkle.id));
    }, 1500);
  }, [size]);

  // Periodic sparkles when active or celebrating
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    if (personalityState !== 'active' && !isHovered && expression !== 'celebrating') return;
    
    const sparkleInterval = setInterval(() => {
      if (Math.random() > 0.5 || expression === 'celebrating') {
        generateSparkle();
      }
    }, expression === 'celebrating' ? 400 : 2500);
    
    // Initial sparkle on hover
    if (isHovered) {
      generateSparkle();
    }
    
    return () => clearInterval(sparkleInterval);
  }, [personalityState, isHovered, expression, generateSparkle]);

  // Select the correct Ava image based on state and expression
  const avaImage = useMemo(() => {
    // Sleeping mode uses orb
    if (personalityState === 'sleeping') {
      return avaOrb;
    }

    // Voice states take priority
    if (isSpeaking) {
      return avaSpeaking;
    }
    if (isListening) {
      return avaListening;
    }

    // Expression-based selection
    switch (expression) {
      case 'celebrating':
        return avaCelebrating;
      case 'happy':
        return avaProud;
      case 'excited':
        return avaEncouraging;
      case 'concerned':
        return avaEmpathetic;
      case 'thinking':
        return avaThinking;
      case 'waving':
        return avaWaving;
      case 'poked':
        return avaSpeaking;
      default:
        break;
    }

    // Personality state fallbacks
    switch (personalityState) {
      case 'drowsy':
        return avaThinking;
      case 'curious':
        return avaListening;
      default:
        return avaNeutral;
    }
  }, [personalityState, expression, isListening, isSpeaking]);

  // Sleeping indicator
  const showZzz = personalityState === 'sleeping';

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={
        isWaking
          ? { scale: [0.8, 1.2, 0.95, 1.08, 1], rotate: [0, -5, 5, -2, 0] }
          : expression === 'celebrating' 
          ? { rotate: [0, -6, 6, -6, 6, 0], scale: [1, 1.12, 1.08, 1.12, 1] }
          : expression === 'poked'
          ? { scale: [1, 0.88, 1.18, 1], y: [0, 3, -6, 0] }
          : expression === 'waving'
          ? { rotate: [0, -10, 10, -10, 0] }
          : { scale: 1, rotate: headTilt }
      }
      transition={{ 
        duration: isWaking ? 0.8 : expression === 'celebrating' ? 0.7 : 0.35,
        ease: 'easeOut'
      }}
    >
      {/* Breathing animation wrapper */}
      <motion.div
        animate={{
          scale: personalityState === 'sleeping' ? [1, 1.03, 1] : [1, 1.04, 1],
        }}
        transition={{
          duration: personalityState === 'sleeping' ? 4 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Floating animation wrapper */}
        <motion.div
          animate={{
            y: personalityState === 'sleeping' ? 0 : [0, -3, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* The actual Ava image */}
          <motion.img
            src={avaImage}
            alt="Ava"
            className="w-full h-full object-contain drop-shadow-lg rounded-full"
            style={{
              filter: personalityState === 'sleeping' 
                ? 'brightness(0.6) saturate(0.5)' 
                : personalityState === 'drowsy'
                ? 'brightness(0.85) saturate(0.8)'
                : 'none',
            }}
            animate={{
              opacity: 1,
            }}
            transition={{ duration: 0.3 }}
            draggable={false}
          />
        </motion.div>
      </motion.div>

      {/* Sparkles */}
      <AnimatePresence>
        {sparkles.map((sparkle) => (
          <motion.div
            key={sparkle.id}
            className="absolute pointer-events-none"
            style={{
              left: sparkle.x,
              top: sparkle.y,
              width: sparkle.size,
              height: sparkle.size,
            }}
            initial={{ opacity: 0, scale: 0, rotate: 0 }}
            animate={{ 
              opacity: [0, 1, 1, 0],
              scale: [0, 1.3, 1, 0],
              rotate: [0, 180],
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ 
              duration: 1.2,
              delay: sparkle.delay,
              ease: 'easeOut',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              <path
                d="M12 2L13.5 9.5L21 12L13.5 14.5L12 22L10.5 14.5L3 12L10.5 9.5L12 2Z"
                fill="hsl(45, 95%, 65%)"
              />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Sleeping zzz */}
      <AnimatePresence>
        {showZzz && (
          <motion.div
            className="absolute -top-2 -right-1 pointer-events-none"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <motion.span
              className="text-xs font-bold text-muted-foreground"
              animate={{ 
                opacity: [0.4, 1, 0.4],
                y: [0, -3, 0],
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              zzz
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle glow behind when hovered or celebrating */}
      <AnimatePresence>
        {(isHovered || expression === 'celebrating') && (
          <motion.div
            className="absolute inset-0 -z-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, hsla(45, 80%, 70%, 0.4) 0%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.3 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
