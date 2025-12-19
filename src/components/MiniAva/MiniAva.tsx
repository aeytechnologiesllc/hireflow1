import { motion } from 'framer-motion';
import { useMemo, useState, useEffect } from 'react';
import type { PersonalityState } from './useAvaPersonality';
import type { AvaExpression } from './useAvaReactions';

interface MiniAvaProps {
  personalityState: PersonalityState;
  expression: AvaExpression;
  eyeTarget?: { x: number; y: number };
  isHovered?: boolean;
  size?: number;
  isListening?: boolean;
  isSpeaking?: boolean;
}

// Premium dark color palette with emerald/teal accents
const COLORS = {
  orbBase: 'hsl(220, 10%, 12%)',
  orbHighlight: 'hsl(220, 8%, 18%)',
  glowPrimary: 'hsl(160, 84%, 39%)',
  glowSecondary: 'hsl(170, 70%, 45%)',
  glowWarning: 'hsl(38, 70%, 50%)',
  eyeGlow: 'hsl(160, 84%, 50%)',
  ring: 'hsl(160, 60%, 35%)',
  ringDim: 'hsl(160, 30%, 20%)',
};

export default function MiniAva({ 
  personalityState, 
  expression, 
  isHovered = false,
  size = 48,
  isListening = false,
  isSpeaking = false,
}: MiniAvaProps) {
  const [isDimming, setIsDimming] = useState(false);
  const [showEyes, setShowEyes] = useState(false);

  // Micro-awareness: random glow dim (blink equivalent) every 8-12 seconds
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const scheduleDim = () => {
      const delay = 8000 + Math.random() * 4000;
      return setTimeout(() => {
        setIsDimming(true);
        setTimeout(() => setIsDimming(false), 200);
        scheduleDim();
      }, delay);
    };
    
    const timeoutId = scheduleDim();
    return () => clearTimeout(timeoutId);
  }, [personalityState]);

  // Show eyes on interaction (hover)
  useEffect(() => {
    if (isHovered || isListening || isSpeaking) {
      setShowEyes(true);
    } else {
      // Fade out after interaction ends
      const timeout = setTimeout(() => setShowEyes(false), 800);
      return () => clearTimeout(timeout);
    }
  }, [isHovered, isListening, isSpeaking]);

  // Determine current state for animations
  const currentState = useMemo(() => {
    if (personalityState === 'sleeping') return 'dormant';
    if (expression === 'concerned') return 'warning';
    if (expression === 'celebrating' || expression === 'happy') return 'success';
    if (expression === 'thinking' || isListening) return 'thinking';
    if (isSpeaking) return 'active';
    if (isHovered) return 'interaction';
    if (personalityState === 'drowsy') return 'drowsy';
    return 'idle';
  }, [personalityState, expression, isHovered, isListening, isSpeaking]);

  // Calculate glow color based on state
  const getGlowColor = () => {
    switch (currentState) {
      case 'warning': return COLORS.glowWarning;
      case 'success': return COLORS.glowPrimary;
      case 'thinking': return COLORS.glowSecondary;
      case 'dormant': return 'hsl(160, 30%, 20%)';
      default: return COLORS.glowPrimary;
    }
  };

  // Calculate glow intensity
  const getGlowOpacity = () => {
    if (isDimming) return 0.15;
    switch (currentState) {
      case 'dormant': return 0.08;
      case 'drowsy': return 0.2;
      case 'warning': return 0.4;
      case 'success': return 0.7;
      case 'interaction': return 0.6;
      case 'thinking': return 0.5;
      default: return 0.35;
    }
  };

  // Ring rotation speed (0 = stopped)
  const getRingRotation = () => {
    switch (currentState) {
      case 'thinking': return 12; // Slow rotation
      case 'dormant': return 0;
      case 'drowsy': return 0;
      default: return 0;
    }
  };

  // Breathing pulse duration
  const getBreatheDuration = () => {
    switch (currentState) {
      case 'dormant': return 0; // No breathing
      case 'drowsy': return 10;
      case 'warning': return 5;
      default: return 8; // 6-10 second range
    }
  };

  const viewBoxSize = 100;
  const center = viewBoxSize / 2;
  const orbRadius = 32;
  const ringRadius = 42;

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={{
        scale: currentState === 'interaction' ? 1.08 : currentState === 'success' ? [1, 1.06, 1] : 1,
        y: currentState === 'success' ? [0, -3, 0] : 0,
      }}
      transition={{
        scale: { duration: 0.3, ease: 'easeOut' },
        y: { duration: 0.4, ease: 'easeOut' },
      }}
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Orb gradient - dark charcoal with subtle highlight */}
          <radialGradient id="orbGradient" cx="35%" cy="35%" r="60%">
            <stop offset="0%" stopColor={COLORS.orbHighlight} />
            <stop offset="100%" stopColor={COLORS.orbBase} />
          </radialGradient>

          {/* Glow gradient */}
          <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={getGlowColor()} stopOpacity={getGlowOpacity()} />
            <stop offset="70%" stopColor={getGlowColor()} stopOpacity={getGlowOpacity() * 0.3} />
            <stop offset="100%" stopColor={getGlowColor()} stopOpacity="0" />
          </radialGradient>

          {/* Ring gradient */}
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.ring} stopOpacity={currentState === 'dormant' ? 0.1 : 0.4} />
            <stop offset="50%" stopColor={COLORS.glowSecondary} stopOpacity={currentState === 'dormant' ? 0.05 : 0.2} />
            <stop offset="100%" stopColor={COLORS.ring} stopOpacity={currentState === 'dormant' ? 0.1 : 0.4} />
          </linearGradient>
        </defs>

        {/* Outer glow layer */}
        <motion.circle
          cx={center}
          cy={center}
          r={orbRadius + 15}
          fill="url(#glowGradient)"
          animate={{
            r: getBreatheDuration() > 0 ? [orbRadius + 15, orbRadius + 18, orbRadius + 15] : orbRadius + 15,
            opacity: isDimming ? 0.3 : 1,
          }}
          transition={{
            r: {
              duration: getBreatheDuration(),
              repeat: Infinity,
              ease: 'easeInOut',
            },
            opacity: { duration: 0.2 },
          }}
        />

        {/* Outer ring */}
        <motion.circle
          cx={center}
          cy={center}
          r={ringRadius}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth={1.5}
          strokeDasharray={currentState === 'thinking' ? '8 4' : '0'}
          animate={{
            rotate: getRingRotation() > 0 ? 360 : 0,
            opacity: currentState === 'dormant' ? 0.2 : currentState === 'thinking' ? 0.8 : 0.5,
          }}
          transition={{
            rotate: {
              duration: getRingRotation() > 0 ? getRingRotation() : 1,
              repeat: Infinity,
              ease: 'linear',
            },
            opacity: { duration: 0.5 },
          }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Main orb body */}
        <motion.circle
          cx={center}
          cy={center}
          r={orbRadius}
          fill="url(#orbGradient)"
          animate={{
            scale: getBreatheDuration() > 0 ? [1, 1.02, 1] : 1,
          }}
          transition={{
            scale: {
              duration: getBreatheDuration(),
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Subtle inner highlight */}
        <circle
          cx={center - 8}
          cy={center - 8}
          r={12}
          fill="white"
          opacity={0.03}
        />

        {/* Eye points - only visible during interaction */}
        {showEyes && (
          <>
            <motion.circle
              cx={center - 8}
              cy={center - 2}
              r={2.5}
              fill={COLORS.eyeGlow}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ 
                opacity: [0.7, 0.9, 0.7],
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{
                opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 0.3 },
              }}
              style={{
                filter: `drop-shadow(0 0 4px ${COLORS.eyeGlow})`,
              }}
            />
            <motion.circle
              cx={center + 8}
              cy={center - 2}
              r={2.5}
              fill={COLORS.eyeGlow}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ 
                opacity: [0.7, 0.9, 0.7],
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{
                opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.1 },
                scale: { duration: 0.3 },
              }}
              style={{
                filter: `drop-shadow(0 0 4px ${COLORS.eyeGlow})`,
              }}
            />
          </>
        )}
      </svg>

      {/* Success pulse effect - single outward glow */}
      {currentState === 'success' && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${COLORS.glowPrimary}40 0%, transparent 70%)`,
          }}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      )}
    </motion.div>
  );
}
