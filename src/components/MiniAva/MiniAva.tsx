import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useEffect, useCallback } from 'react';
import type { PersonalityState } from './useAvaPersonality';
import type { AvaExpression } from './useAvaReactions';

interface MiniAvaProps {
  personalityState: PersonalityState;
  expression: AvaExpression;
  eyeTarget: { x: number; y: number };
  isHovered?: boolean;
  size?: number;
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
  eyeTarget, 
  isHovered = false,
  size = 48 
}: MiniAvaProps) {
  // Idle animation states
  const [isBlinking, setIsBlinking] = useState(false);
  const [headTilt, setHeadTilt] = useState(0);
  const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });
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

  // Random blink effect
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }
    }, 3000 + Math.random() * 3000);
    
    return () => clearInterval(blinkInterval);
  }, [personalityState]);

  // Random look around
  useEffect(() => {
    if (personalityState === 'sleeping' || personalityState === 'drowsy') return;
    
    const lookInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        const randomX = (Math.random() - 0.5) * 4;
        const randomY = (Math.random() - 0.5) * 3;
        setLookOffset({ x: randomX, y: randomY });
        setTimeout(() => setLookOffset({ x: 0, y: 0 }), 800);
      }
    }, 5000 + Math.random() * 5000);
    
    return () => clearInterval(lookInterval);
  }, [personalityState]);

  // Random head tilt
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const tiltInterval = setInterval(() => {
      if (Math.random() > 0.75) {
        const tilt = (Math.random() - 0.5) * 10;
        setHeadTilt(tilt);
        setTimeout(() => setHeadTilt(0), 1000);
      }
    }, 8000 + Math.random() * 4000);
    
    return () => clearInterval(tiltInterval);
  }, [personalityState]);

  // Sparkle generation
  const generateSparkle = useCallback(() => {
    const newSparkle: Sparkle = {
      id: Date.now() + Math.random(),
      x: Math.random() * 60 - 10,
      y: Math.random() * 60 - 10,
      size: 3 + Math.random() * 4,
      delay: Math.random() * 0.3,
    };
    setSparkles(prev => [...prev.slice(-4), newSparkle]);
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => s.id !== newSparkle.id));
    }, 1500);
  }, []);

  // Periodic sparkles when active
  useEffect(() => {
    if (personalityState !== 'active' && !isHovered) return;
    
    const sparkleInterval = setInterval(() => {
      if (Math.random() > 0.5) {
        generateSparkle();
      }
    }, 2500);
    
    // Initial sparkle
    if (isHovered) {
      generateSparkle();
    }
    
    return () => clearInterval(sparkleInterval);
  }, [personalityState, isHovered, generateSparkle]);

  // Calculate pupil offset based on cursor position
  const pupilOffset = useMemo(() => {
    if (personalityState === 'sleeping') {
      return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    }

    const maxOffset = 3;
    const centerX = size / 2;
    const centerY = size / 2;
    
    const dx = eyeTarget.x - centerX;
    const dy = eyeTarget.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedDistance = Math.min(distance / 200, 1);
    
    const angle = Math.atan2(dy, dx);
    const offsetX = Math.cos(angle) * maxOffset * normalizedDistance + lookOffset.x;
    const offsetY = Math.sin(angle) * maxOffset * normalizedDistance + lookOffset.y;

    return {
      left: { x: offsetX, y: offsetY },
      right: { x: offsetX, y: offsetY },
    };
  }, [eyeTarget, size, personalityState, lookOffset]);

  // Eyelid height based on state
  const eyelidHeight = useMemo(() => {
    if (isBlinking) return 14;
    switch (personalityState) {
      case 'sleeping': return 14;
      case 'drowsy': return 6;
      case 'curious': return 2;
      default: return 0;
    }
  }, [personalityState, isBlinking]);

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
        return 'M 18 34 Q 24 41 30 34'; // Big smile
      case 'excited':
        return 'M 18 33 Q 24 42 30 33'; // Open smile
      case 'concerned':
        return 'M 19 36 Q 24 33 29 36'; // Slight frown
      case 'thinking':
        return 'M 20 35 Q 24 36 28 35'; // Neutral with slight curve
      case 'poked':
        return 'M 21 34 Q 24 38 27 34'; // Surprised O
      default:
        return 'M 20 34 Q 24 38 28 34'; // Slight smile
    }
  }, [expression]);

  // Sleeping "zzz" animation
  const showZzz = personalityState === 'sleeping';

  // Eye style based on expression (^_^ style for very happy)
  const happyEyes = expression === 'celebrating' || expression === 'excited';

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={
        isWaking
          ? { scale: [0.85, 1.15, 0.95, 1.05, 1], rotate: [0, -3, 3, -1, 0] }
          : expression === 'celebrating' 
          ? { rotate: [0, -5, 5, -5, 5, 0], scale: [1, 1.1, 1] }
          : expression === 'poked'
          ? { scale: [1, 0.9, 1.15, 1], y: [0, 2, -5, 0] }
          : expression === 'waving'
          ? { rotate: [0, -8, 8, -8, 0] }
          : { scale: 1, rotate: headTilt }
      }
      transition={{ 
        duration: isWaking ? 0.8 : expression === 'celebrating' ? 0.6 : 0.3,
        ease: 'easeOut'
      }}
    >
      {/* Breathing animation wrapper */}
      <motion.div
        animate={{
          scale: personalityState === 'sleeping' ? [1, 1.02, 1] : [1, 1.03, 1],
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
            y: personalityState === 'sleeping' ? 0 : [0, -2, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
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
            {/* Gradient definitions */}
            <defs>
              {/* Main face gradient - lavender to teal */}
              <radialGradient id="orbGradient" cx="30%" cy="20%" r="80%">
                <stop offset="0%" stopColor="hsl(270, 70%, 80%)" /> {/* Soft lavender */}
                <stop offset="50%" stopColor="hsl(260, 60%, 75%)" /> {/* Purple-lavender */}
                <stop offset="100%" stopColor="hsl(175, 60%, 70%)" /> {/* Soft teal */}
              </radialGradient>
              
              {/* Highlight gradient */}
              <radialGradient id="highlightGradient" cx="30%" cy="25%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              
              {/* Outer glow gradient */}
              <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(270, 60%, 75%)" stopOpacity="0.4" />
                <stop offset="60%" stopColor="hsl(175, 50%, 65%)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="hsl(175, 50%, 65%)" stopOpacity="0" />
              </radialGradient>

              {/* Eye gradient */}
              <radialGradient id="irisGradient" cx="40%" cy="30%" r="60%">
                <stop offset="0%" stopColor="hsl(185, 85%, 60%)" /> {/* Bright cyan */}
                <stop offset="100%" stopColor="hsl(185, 75%, 45%)" /> {/* Deeper cyan */}
              </radialGradient>

              {/* Eyelid gradient matching face */}
              <linearGradient id="eyelidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="hsl(265, 65%, 77%)" />
                <stop offset="100%" stopColor="hsl(270, 70%, 80%)" />
              </linearGradient>
            </defs>

            {/* Outer glow */}
            <motion.circle
              cx="24"
              cy="24"
              r="23"
              fill="url(#glowGradient)"
              animate={{
                opacity: personalityState === 'sleeping' ? 0.3 : isHovered ? 1 : 0.7,
                scale: isHovered ? 1.3 : 1.1,
              }}
              transition={{ duration: 0.4 }}
            />

            {/* Main face orb */}
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="url(#orbGradient)"
            />
            
            {/* Highlight */}
            <ellipse
              cx="18"
              cy="16"
              rx="10"
              ry="8"
              fill="url(#highlightGradient)"
            />

            {/* Always-visible blush - left */}
            <motion.ellipse
              cx="10"
              cy="28"
              rx="4"
              ry="2.5"
              fill="hsl(350, 80%, 75%)"
              animate={{
                opacity: expression === 'happy' || expression === 'celebrating' ? 0.6 : 0.35,
              }}
              transition={{ duration: 0.3 }}
            />
            
            {/* Always-visible blush - right */}
            <motion.ellipse
              cx="38"
              cy="28"
              rx="4"
              ry="2.5"
              fill="hsl(350, 80%, 75%)"
              animate={{
                opacity: expression === 'happy' || expression === 'celebrating' ? 0.6 : 0.35,
              }}
              transition={{ duration: 0.3 }}
            />

            {/* Left eye white */}
            <ellipse
              cx="17"
              cy="22"
              rx="6"
              ry="7"
              fill="white"
            />
            
            {/* Right eye white */}
            <ellipse
              cx="31"
              cy="22"
              rx="6"
              ry="7"
              fill="white"
            />

            {/* Left pupil group */}
            <motion.g
              animate={{ 
                x: pupilOffset.left.x, 
                y: pupilOffset.left.y 
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {happyEyes ? (
                // ^_^ style happy eye
                <path
                  d="M 13 22 Q 17 18 21 22"
                  stroke="hsl(185, 75%, 45%)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : (
                <>
                  <circle cx="17" cy="22" r="4" fill="url(#irisGradient)" />
                  <circle cx="17" cy="22" r="2" fill="hsl(220, 30%, 15%)" />
                  <circle cx="15.5" cy="20" r="1.5" fill="white" />
                  <circle cx="18.5" cy="23" r="0.7" fill="white" opacity="0.6" />
                </>
              )}
            </motion.g>

            {/* Right pupil group */}
            <motion.g
              animate={{ 
                x: pupilOffset.right.x, 
                y: pupilOffset.right.y 
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {happyEyes ? (
                // ^_^ style happy eye
                <path
                  d="M 27 22 Q 31 18 35 22"
                  stroke="hsl(185, 75%, 45%)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : (
                <>
                  <circle cx="31" cy="22" r="4" fill="url(#irisGradient)" />
                  <circle cx="31" cy="22" r="2" fill="hsl(220, 30%, 15%)" />
                  <circle cx="29.5" cy="20" r="1.5" fill="white" />
                  <circle cx="32.5" cy="23" r="0.7" fill="white" opacity="0.6" />
                </>
              )}
            </motion.g>

            {/* Left eyelid */}
            <motion.ellipse
              cx="17"
              cy="15"
              rx="7"
              ry={eyelidHeight}
              fill="url(#eyelidGradient)"
              animate={{ ry: eyelidHeight }}
              transition={{ duration: isBlinking ? 0.08 : 0.4, ease: 'easeInOut' }}
            />

            {/* Right eyelid */}
            <motion.ellipse
              cx="31"
              cy="15"
              rx="7"
              ry={eyelidHeight}
              fill="url(#eyelidGradient)"
              animate={{ ry: eyelidHeight }}
              transition={{ duration: isBlinking ? 0.08 : 0.4, ease: 'easeInOut' }}
            />

            {/* Eyebrows - subtle, friendly arcs */}
            <motion.path
              d="M 12 14 Q 17 12 22 14"
              stroke="hsl(270, 40%, 55%)"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              animate={{ y: eyebrowOffset.left }}
              transition={{ duration: 0.2 }}
            />
            <motion.path
              d="M 26 14 Q 31 12 36 14"
              stroke="hsl(270, 40%, 55%)"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              animate={{ y: eyebrowOffset.right }}
              transition={{ duration: 0.2 }}
            />

            {/* Mouth */}
            <motion.path
              d={mouthShape}
              stroke="hsl(340, 60%, 55%)"
              strokeWidth="2"
              strokeLinecap="round"
              fill={expression === 'excited' ? 'hsl(340, 50%, 65%)' : 'none'}
              initial={false}
              animate={{ d: mouthShape }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </svg>
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
              scale: [0, 1.2, 1, 0],
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
                fill="hsl(185, 80%, 70%)"
              />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Sleeping ZZZ */}
      <AnimatePresence>
        {showZzz && (
          <>
            <motion.div
              className="absolute -top-2 -right-2 font-bold text-xs"
              style={{ color: 'hsl(270, 60%, 70%)' }}
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
            <motion.div
              className="absolute -top-4 right-1 font-bold text-sm"
              style={{ color: 'hsl(270, 60%, 70%)' }}
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
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
