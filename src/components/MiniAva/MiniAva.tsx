import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import type { PersonalityState } from './useAvaPersonality';
import type { AvaExpression } from './useAvaReactions';

interface MiniAvaProps {
  personalityState: PersonalityState;
  expression: AvaExpression;
  eyeTarget: { x: number; y: number };
  isHovered?: boolean;
  size?: number;
}

export default function MiniAva({ 
  personalityState, 
  expression, 
  eyeTarget, 
  isHovered = false,
  size = 48 
}: MiniAvaProps) {
  // Calculate pupil offset based on cursor position
  const pupilOffset = useMemo(() => {
    if (personalityState === 'sleeping') {
      return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    }

    const maxOffset = 2.5;
    const centerX = size / 2;
    const centerY = size / 2;
    
    const dx = eyeTarget.x - centerX;
    const dy = eyeTarget.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedDistance = Math.min(distance / 200, 1);
    
    const angle = Math.atan2(dy, dx);
    const offsetX = Math.cos(angle) * maxOffset * normalizedDistance;
    const offsetY = Math.sin(angle) * maxOffset * normalizedDistance;

    return {
      left: { x: offsetX, y: offsetY },
      right: { x: offsetX, y: offsetY },
    };
  }, [eyeTarget, size, personalityState]);

  // Eyelid height based on state
  const eyelidHeight = useMemo(() => {
    switch (personalityState) {
      case 'sleeping': return '100%';
      case 'drowsy': return '40%';
      case 'curious': return '10%';
      default: return '0%';
    }
  }, [personalityState]);

  // Expression-based modifications
  const eyebrowOffset = useMemo(() => {
    switch (expression) {
      case 'concerned': return { left: -2, right: 2 };
      case 'excited':
      case 'celebrating': return { left: -3, right: -3 };
      case 'thinking': return { left: -1, right: 2 };
      default: return { left: 0, right: 0 };
    }
  }, [expression]);

  const mouthShape = useMemo(() => {
    switch (expression) {
      case 'happy':
      case 'celebrating':
      case 'waving':
        return 'M 18 32 Q 24 38 30 32'; // Big smile
      case 'excited':
        return 'M 18 31 Q 24 39 30 31'; // Open smile
      case 'concerned':
        return 'M 19 34 Q 24 31 29 34'; // Slight frown
      case 'thinking':
        return 'M 20 33 L 28 33'; // Neutral line
      case 'poked':
        return 'M 21 32 Q 24 36 27 32'; // Surprised O
      default:
        return 'M 20 32 Q 24 35 28 32'; // Slight smile
    }
  }, [expression]);

  // Sleeping "zzz" animation
  const showZzz = personalityState === 'sleeping';

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={
        expression === 'celebrating' 
          ? { rotate: [0, -5, 5, -5, 5, 0], scale: [1, 1.1, 1] }
          : expression === 'poked'
          ? { scale: [1, 0.9, 1.15, 1], y: [0, 2, -5, 0] }
          : expression === 'waving'
          ? { rotate: [0, -8, 8, -8, 0] }
          : isHovered
          ? { scale: 1.1 }
          : { scale: 1 }
      }
      transition={{ 
        duration: expression === 'celebrating' ? 0.6 : 0.3,
        ease: 'easeOut'
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        {/* Face background with gradient */}
        <defs>
          <radialGradient id="faceGradient" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="hsl(220, 15%, 18%)" />
            <stop offset="100%" stopColor="hsl(220, 15%, 10%)" />
          </radialGradient>
          <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(160, 60%, 45%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(160, 60%, 45%)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer glow */}
        <motion.circle
          cx="24"
          cy="24"
          r="23"
          fill="url(#glowGradient)"
          animate={{
            opacity: personalityState === 'sleeping' ? 0.3 : isHovered ? 1 : 0.7,
            scale: isHovered ? 1.2 : 1,
          }}
          transition={{ duration: 0.3 }}
        />

        {/* Main face circle */}
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="url(#faceGradient)"
          stroke="hsl(160, 60%, 40%)"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />

        {/* Left eye white */}
        <ellipse
          cx="17"
          cy="22"
          rx="5"
          ry="5.5"
          fill="hsl(0, 0%, 95%)"
        />
        
        {/* Right eye white */}
        <ellipse
          cx="31"
          cy="22"
          rx="5"
          ry="5.5"
          fill="hsl(0, 0%, 95%)"
        />

        {/* Left pupil */}
        <motion.g
          animate={{ 
            x: pupilOffset.left.x, 
            y: pupilOffset.left.y 
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <circle cx="17" cy="22" r="3" fill="hsl(160, 60%, 35%)" />
          <circle cx="17" cy="22" r="1.5" fill="hsl(220, 15%, 10%)" />
          <circle cx="15.5" cy="20.5" r="0.8" fill="white" opacity="0.8" />
        </motion.g>

        {/* Right pupil */}
        <motion.g
          animate={{ 
            x: pupilOffset.right.x, 
            y: pupilOffset.right.y 
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <circle cx="31" cy="22" r="3" fill="hsl(160, 60%, 35%)" />
          <circle cx="31" cy="22" r="1.5" fill="hsl(220, 15%, 10%)" />
          <circle cx="29.5" cy="20.5" r="0.8" fill="white" opacity="0.8" />
        </motion.g>

        {/* Left eyelid */}
        <motion.rect
          x="11.5"
          y="16"
          width="11"
          height="12"
          fill="url(#faceGradient)"
          animate={{ height: eyelidHeight }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          style={{ originY: 0 }}
        />

        {/* Right eyelid */}
        <motion.rect
          x="25.5"
          y="16"
          width="11"
          height="12"
          fill="url(#faceGradient)"
          animate={{ height: eyelidHeight }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          style={{ originY: 0 }}
        />

        {/* Left eyebrow */}
        <motion.path
          d="M 13 16 Q 17 14 21 16"
          stroke="hsl(220, 15%, 30%)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{ y: eyebrowOffset.left }}
          transition={{ duration: 0.2 }}
        />

        {/* Right eyebrow */}
        <motion.path
          d="M 27 16 Q 31 14 35 16"
          stroke="hsl(220, 15%, 30%)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{ y: eyebrowOffset.right }}
          transition={{ duration: 0.2 }}
        />

        {/* Mouth */}
        <motion.path
          d={mouthShape}
          stroke="hsl(160, 40%, 50%)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={false}
          animate={{ d: mouthShape }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />

        {/* Blush (shows on happy expressions) */}
        <AnimatePresence>
          {(expression === 'happy' || expression === 'celebrating' || expression === 'waving') && (
            <>
              <motion.ellipse
                cx="10"
                cy="27"
                rx="3"
                ry="2"
                fill="hsl(350, 80%, 65%)"
                opacity="0.3"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.3, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
              />
              <motion.ellipse
                cx="38"
                cy="27"
                rx="3"
                ry="2"
                fill="hsl(350, 80%, 65%)"
                opacity="0.3"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.3, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
              />
            </>
          )}
        </AnimatePresence>
      </svg>

      {/* Sleeping ZZZ */}
      <AnimatePresence>
        {showZzz && (
          <motion.div
            className="absolute -top-2 -right-2 text-primary font-bold text-xs"
            initial={{ opacity: 0, y: 5 }}
            animate={{ 
              opacity: [0, 1, 1, 0],
              y: [5, -5, -10, -15],
              x: [0, 3, 6, 9],
            }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              repeatDelay: 0.5,
            }}
          >
            z
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showZzz && (
          <motion.div
            className="absolute -top-4 right-1 text-primary font-bold text-sm"
            initial={{ opacity: 0, y: 5 }}
            animate={{ 
              opacity: [0, 1, 1, 0],
              y: [5, -5, -10, -15],
              x: [0, 3, 6, 9],
            }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 2,
              delay: 0.7,
              repeat: Infinity,
              repeatDelay: 0.5,
            }}
          >
            Z
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
