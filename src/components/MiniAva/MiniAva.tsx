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

// Softer, muted color palette
const COLORS = {
  face: {
    light: '#F5EDE4',
    mid: '#EDE3D8',
    dark: '#DFD4C7',
    stroke: '#D8CFC4',
  },
  hair: {
    light: '#C4B3D4',
    dark: '#A899B8',
  },
  blush: '#E8C4BC',
  eye: '#6B5B4F',
  mouth: '#9C7B70',
  sparkle: 'hsl(40, 70%, 60%)',
  zzz: '#A899B8',
};

export default function MiniAva({ 
  personalityState, 
  expression, 
  isHovered = false,
  size = 48,
  isListening = false,
  isSpeaking = false,
}: MiniAvaProps) {
  const [headTilt, setHeadTilt] = useState(0);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [isWaking, setIsWaking] = useState(false);
  const [prevState, setPrevState] = useState<PersonalityState>(personalityState);
  const [isBlinking, setIsBlinking] = useState(false);
  
  // New animation states
  const [lookDirection, setLookDirection] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPeeking, setIsPeeking] = useState(false);
  const [isYawning, setIsYawning] = useState(false);
  const [isStretching, setIsStretching] = useState(false);
  const [isStartled, setIsStartled] = useState(false);
  const [isSighing, setIsSighing] = useState(false);
  const [isDoubleBlink, setIsDoubleBlink] = useState(false);
  const [isNodding, setIsNodding] = useState(false);
  const [eyebrowRaise, setEyebrowRaise] = useState(0);
  const [hairWiggle, setHairWiggle] = useState(false);
  const [isPerkingUp, setIsPerkingUp] = useState(false);
  const [idleTime, setIdleTime] = useState(0);

  // Detect wake-up for stretch animation
  useEffect(() => {
    if (prevState === 'sleeping' && personalityState !== 'sleeping') {
      setIsWaking(true);
      setIsStretching(true);
      setTimeout(() => setIsWaking(false), 800);
      setTimeout(() => setIsStretching(false), 1200);
    }
    if (prevState === 'drowsy' && personalityState === 'active') {
      setIsPerkingUp(true);
      setTimeout(() => setIsPerkingUp(false), 500);
    }
    setPrevState(personalityState);
  }, [personalityState, prevState]);

  // Before sleeping - yawn animation
  useEffect(() => {
    if (personalityState === 'drowsy') {
      const yawnTimer = setTimeout(() => {
        if (personalityState === 'drowsy') {
          setIsYawning(true);
          setTimeout(() => setIsYawning(false), 1500);
        }
      }, 2000);
      return () => clearTimeout(yawnTimer);
    }
  }, [personalityState]);

  // Random head tilt
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const tiltInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        const tilt = (Math.random() - 0.5) * 10;
        setHeadTilt(tilt);
        setTimeout(() => setHeadTilt(0), 1200);
      }
    }, 4000 + Math.random() * 3000);
    
    return () => clearInterval(tiltInterval);
  }, [personalityState]);

  // Look around animation - eyes glance randomly
  useEffect(() => {
    if (personalityState === 'sleeping' || personalityState === 'drowsy') return;
    
    const lookInterval = setInterval(() => {
      if (Math.random() > 0.6) {
        const directions = [
          { x: -2, y: 0 },   // left
          { x: 2, y: 0 },    // right
          { x: 0, y: -1.5 }, // up
          { x: 1, y: -1 },   // up-right
          { x: -1, y: -1 },  // up-left
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        setLookDirection(dir);
        setTimeout(() => setLookDirection({ x: 0, y: 0 }), 800 + Math.random() * 400);
      }
    }, 8000 + Math.random() * 7000);
    
    return () => clearInterval(lookInterval);
  }, [personalityState]);

  // Curious lean on hover - scales up and leans forward
  useEffect(() => {
    if (isHovered && personalityState === 'active') {
      setIsPeeking(true);
    } else {
      setIsPeeking(false);
    }
  }, [isHovered, personalityState]);

  // Peek over animation - randomly when on pages
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const peekInterval = setInterval(() => {
      if (Math.random() > 0.85 && !isPeeking && personalityState === 'active') {
        setIsPeeking(true);
        setLookDirection({ x: 0, y: 2 }); // Look down
        setTimeout(() => {
          setIsPeeking(false);
          setLookDirection({ x: 0, y: 0 });
        }, 2500);
      }
    }, 20000 + Math.random() * 15000);
    
    return () => clearInterval(peekInterval);
  }, [personalityState, isPeeking]);

  // Soft sigh when idle for a while
  useEffect(() => {
    if (personalityState !== 'active') {
      setIdleTime(0);
      return;
    }
    
    const idleCounter = setInterval(() => {
      setIdleTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(idleCounter);
  }, [personalityState]);

  useEffect(() => {
    if (idleTime === 30 && personalityState === 'active') {
      setIsSighing(true);
      setTimeout(() => setIsSighing(false), 1200);
    }
  }, [idleTime, personalityState]);

  // Hair/ear wiggle after sparkles or actions
  useEffect(() => {
    if (sparkles.length > 0 && Math.random() > 0.7) {
      setHairWiggle(true);
      setTimeout(() => setHairWiggle(false), 400);
    }
  }, [sparkles.length]);

  // Blinking animation with occasional double blink
  useEffect(() => {
    if (personalityState === 'sleeping' || isYawning) return;
    
    const blink = () => {
      // 20% chance of double blink
      if (Math.random() > 0.8) {
        setIsDoubleBlink(true);
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 100);
        setTimeout(() => setIsBlinking(true), 200);
        setTimeout(() => {
          setIsBlinking(false);
          setIsDoubleBlink(false);
        }, 300);
      } else {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }
    };

    const scheduleNextBlink = () => {
      const delay = 3000 + Math.random() * 4000;
      return setTimeout(() => {
        blink();
        scheduleNextBlink();
      }, delay);
    };

    const timeoutId = scheduleNextBlink();
    return () => clearTimeout(timeoutId);
  }, [personalityState, isYawning]);

  // Eyebrow raise when thinking or curious
  useEffect(() => {
    if (expression === 'thinking' || personalityState === 'curious') {
      setEyebrowRaise(-2);
    } else {
      setEyebrowRaise(0);
    }
  }, [expression, personalityState]);

  // Gentle nod when completing actions (triggered by expression changes)
  useEffect(() => {
    if (expression === 'happy' || expression === 'celebrating') {
      setIsNodding(true);
      setTimeout(() => setIsNodding(false), 600);
      setHairWiggle(true);
      setTimeout(() => setHairWiggle(false), 400);
    }
  }, [expression]);

  // Startle animation (triggered by poked expression)
  useEffect(() => {
    if (expression === 'poked') {
      setIsStartled(true);
      setTimeout(() => setIsStartled(false), 400);
    }
  }, [expression]);

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
    
    if (isHovered) {
      generateSparkle();
    }
    
    return () => clearInterval(sparkleInterval);
  }, [personalityState, isHovered, expression, generateSparkle]);

  // Determine current visual state
  const visualState = useMemo(() => {
    if (isYawning) return 'yawning';
    if (personalityState === 'sleeping') return 'sleeping';
    if (isBlinking) return 'blinking';
    if (isStartled) return 'startled';
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    if (expression === 'celebrating') return 'celebrating';
    if (expression === 'happy') return 'happy';
    if (expression === 'excited') return 'excited';
    if (expression === 'concerned') return 'concerned';
    if (expression === 'thinking') return 'thinking';
    if (expression === 'waving') return 'waving';
    if (expression === 'poked') return 'poked';
    if (personalityState === 'drowsy') return 'drowsy';
    if (personalityState === 'curious') return 'curious';
    return 'neutral';
  }, [personalityState, expression, isListening, isSpeaking, isBlinking, isYawning, isStartled]);

  // Render eyes based on visual state with look direction
  const renderEyes = () => {
    const baseLeftX = 35;
    const baseRightX = 65;
    const baseY = 42;
    
    // Apply look direction offset
    const leftX = baseLeftX + lookDirection.x;
    const rightX = baseRightX + lookDirection.x;
    const eyeY = baseY + lookDirection.y;

    switch (visualState) {
      case 'sleeping':
        return (
          <>
            <path d={`M ${baseLeftX - 6} ${baseY + 2} Q ${baseLeftX} ${baseY + 6} ${baseLeftX + 6} ${baseY + 2}`} 
                  stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d={`M ${baseRightX - 6} ${baseY + 2} Q ${baseRightX} ${baseY + 6} ${baseRightX + 6} ${baseY + 2}`} 
                  stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case 'yawning':
        return (
          <>
            <path d={`M ${baseLeftX - 5} ${baseY + 1} Q ${baseLeftX} ${baseY + 4} ${baseLeftX + 5} ${baseY + 1}`} 
                  stroke={COLORS.eye} strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d={`M ${baseRightX - 5} ${baseY + 1} Q ${baseRightX} ${baseY + 4} ${baseRightX + 5} ${baseY + 1}`} 
                  stroke={COLORS.eye} strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        );
      case 'blinking':
        return (
          <>
            <line x1={leftX - 5} y1={eyeY} x2={leftX + 5} y2={eyeY} stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" />
            <line x1={rightX - 5} y1={eyeY} x2={rightX + 5} y2={eyeY} stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case 'drowsy':
        return (
          <>
            <ellipse cx={leftX} cy={eyeY + 1} rx="5" ry="3" fill={COLORS.eye} />
            <ellipse cx={rightX} cy={eyeY + 1} rx="5" ry="3" fill={COLORS.eye} />
            <circle cx={leftX + 1.5} cy={eyeY} r="1.2" fill="white" opacity="0.6" />
            <circle cx={rightX + 1.5} cy={eyeY} r="1.2" fill="white" opacity="0.6" />
          </>
        );
      case 'celebrating':
      case 'excited':
        return (
          <>
            <text x={leftX} y={eyeY + 5} textAnchor="middle" fontSize="12" fill="#D4A574">★</text>
            <text x={rightX} y={eyeY + 5} textAnchor="middle" fontSize="12" fill="#D4A574">★</text>
          </>
        );
      case 'happy':
      case 'waving':
        return (
          <>
            <path d={`M ${leftX - 5} ${eyeY + 2} Q ${leftX} ${eyeY - 3} ${leftX + 5} ${eyeY + 2}`} 
                  stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d={`M ${rightX - 5} ${eyeY + 2} Q ${rightX} ${eyeY - 3} ${rightX + 5} ${eyeY + 2}`} 
                  stroke={COLORS.eye} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case 'startled':
      case 'poked':
        return (
          <>
            <circle cx={leftX} cy={eyeY} r="7" fill={COLORS.eye} />
            <circle cx={rightX} cy={eyeY} r="7" fill={COLORS.eye} />
            <circle cx={leftX + 2} cy={eyeY - 2} r="2.5" fill="white" />
            <circle cx={rightX + 2} cy={eyeY - 2} r="2.5" fill="white" />
          </>
        );
      case 'thinking':
      case 'curious':
        return (
          <>
            {/* Raised eyebrows */}
            <line x1={baseLeftX - 5} y1={baseY - 10 + eyebrowRaise} x2={baseLeftX + 5} y2={baseY - 9 + eyebrowRaise} 
                  stroke={COLORS.eye} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            <line x1={baseRightX - 5} y1={baseY - 9 + eyebrowRaise} x2={baseRightX + 5} y2={baseY - 10 + eyebrowRaise} 
                  stroke={COLORS.eye} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            <circle cx={leftX} cy={eyeY - 1} r="5" fill={COLORS.eye} />
            <circle cx={rightX + 2} cy={eyeY - 2} r="5" fill={COLORS.eye} />
            <circle cx={leftX + 2} cy={eyeY - 3} r="1.8" fill="white" />
            <circle cx={rightX + 4} cy={eyeY - 4} r="1.8" fill="white" />
          </>
        );
      case 'concerned':
        return (
          <>
            <ellipse cx={leftX} cy={eyeY} rx="5" ry="6" fill={COLORS.eye} />
            <ellipse cx={rightX} cy={eyeY} rx="5" ry="6" fill={COLORS.eye} />
            <circle cx={leftX + 1.5} cy={eyeY - 2} r="2" fill="white" opacity="0.9" />
            <circle cx={rightX + 1.5} cy={eyeY - 2} r="2" fill="white" opacity="0.9" />
            {/* Worried eyebrows */}
            <line x1={baseLeftX - 5} y1={baseY - 10} x2={baseLeftX + 3} y2={baseY - 8} stroke={COLORS.eye} strokeWidth="2" strokeLinecap="round" />
            <line x1={baseRightX + 5} y1={baseY - 10} x2={baseRightX - 3} y2={baseY - 8} stroke={COLORS.eye} strokeWidth="2" strokeLinecap="round" />
          </>
        );
      case 'listening':
      case 'speaking':
      default: // neutral
        return (
          <>
            <circle cx={leftX} cy={eyeY} r="5" fill={COLORS.eye} />
            <circle cx={rightX} cy={eyeY} r="5" fill={COLORS.eye} />
            <circle cx={leftX + 1.5} cy={eyeY - 1.5} r="2" fill="white" />
            <circle cx={rightX + 1.5} cy={eyeY - 1.5} r="2" fill="white" />
          </>
        );
    }
  };

  // Render mouth based on visual state
  const renderMouth = () => {
    const centerX = 50;
    const mouthY = 58;

    switch (visualState) {
      case 'sleeping':
        return <line x1={centerX - 4} y1={mouthY} x2={centerX + 4} y2={mouthY} 
                     stroke={COLORS.mouth} strokeWidth="2" strokeLinecap="round" />;
      case 'yawning':
        return (
          <motion.ellipse 
            cx={centerX} cy={mouthY + 2} rx="6" ry="8" 
            fill={COLORS.mouth} fillOpacity="0.5"
            animate={{ ry: [6, 10, 8, 10, 6] }}
            transition={{ duration: 1.5 }}
          />
        );
      case 'celebrating':
      case 'excited':
      case 'happy':
      case 'waving':
        return (
          <path d={`M ${centerX - 8} ${mouthY - 2} Q ${centerX} ${mouthY + 8} ${centerX + 8} ${mouthY - 2}`}
                stroke={COLORS.mouth} strokeWidth="2" strokeLinecap="round" fill="#E8C4BC" fillOpacity="0.3" />
        );
      case 'startled':
      case 'poked':
        return <ellipse cx={centerX} cy={mouthY + 2} rx="5" ry="6" fill={COLORS.mouth} fillOpacity="0.5" />;
      case 'thinking':
        return <circle cx={centerX + 4} cy={mouthY} r="3" fill={COLORS.mouth} fillOpacity="0.4" />;
      case 'concerned':
        return (
          <path d={`M ${centerX - 5} ${mouthY + 3} Q ${centerX} ${mouthY - 2} ${centerX + 5} ${mouthY + 3}`}
                stroke={COLORS.mouth} strokeWidth="2" strokeLinecap="round" fill="none" />
        );
      case 'drowsy':
        return (
          <path d={`M ${centerX - 4} ${mouthY} Q ${centerX} ${mouthY + 3} ${centerX + 4} ${mouthY}`}
                stroke={COLORS.mouth} strokeWidth="2" strokeLinecap="round" fill="none" />
        );
      case 'listening':
        return <circle cx={centerX} cy={mouthY} r="3" fill={COLORS.mouth} fillOpacity="0.3" />;
      case 'speaking':
        return (
          <motion.ellipse 
            cx={centerX} cy={mouthY + 1} rx="5" ry="4" 
            fill={COLORS.mouth} fillOpacity="0.4"
            animate={{ ry: [3, 5, 2, 4, 3] }}
            transition={{ duration: 0.35, repeat: Infinity }}
          />
        );
      default: // neutral, curious
        return (
          <path d={`M ${centerX - 6} ${mouthY} Q ${centerX} ${mouthY + 5} ${centerX + 6} ${mouthY}`}
                stroke={COLORS.mouth} strokeWidth="2" strokeLinecap="round" fill="none" />
        );
    }
  };

  // Calculate animation states
  const getContainerAnimation = () => {
    if (isWaking) return { scale: [0.8, 1.2, 0.95, 1.08, 1], rotate: [0, -5, 5, -2, 0] };
    if (isStretching) return { scaleX: [1, 1.1, 0.95, 1.05, 1], rotate: [0, -3, 3, 0] };
    if (isStartled) return { y: [0, -8, 0], scale: [1, 1.1, 1] };
    if (isPerkingUp) return { y: [0, -6, 0], scale: [1, 1.08, 1] };
    if (expression === 'celebrating') return { rotate: [0, -6, 6, -6, 6, 0], scale: [1, 1.12, 1.08, 1.12, 1] };
    if (expression === 'poked') return { scale: [1, 0.88, 1.18, 1], y: [0, 3, -6, 0] };
    if (expression === 'waving') return { rotate: [0, -8, 8, -8, 0] };
    if (isNodding) return { y: [0, 2, -1, 1, 0] };
    if (isSighing) return { scaleY: [1, 0.95, 1], y: [0, 2, 0] };
    return { scale: isPeeking ? 1.15 : 1, rotate: headTilt };
  };

  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={getContainerAnimation()}
      transition={{ 
        duration: isWaking ? 0.8 : isStretching ? 1.2 : isStartled ? 0.4 : expression === 'celebrating' ? 0.7 : 0.35,
        ease: 'easeOut'
      }}
    >
      {/* Glow effect */}
      <AnimatePresence>
        {(isHovered || expression === 'celebrating') && (
          <motion.div
            className="absolute inset-0 -z-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, hsla(30, 40%, 75%, 0.4) 0%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.4 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* Breathing + floating animation wrapper */}
      <motion.div
        animate={{
          scale: isSighing 
            ? [1, 0.96, 1.02, 1] 
            : personalityState === 'sleeping' 
            ? [1, 1.03, 1] 
            : [1, 1.04, 1],
        }}
        transition={{
          duration: isSighing ? 1.2 : personalityState === 'sleeping' ? 4 : 3,
          repeat: isSighing ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <motion.div
          animate={{
            y: personalityState === 'sleeping' ? [0, 1, 0] : [0, -3, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* The SVG character */}
          <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className="drop-shadow-md"
          >
            <defs>
              {/* Soft cream/beige face gradient */}
              <radialGradient id="faceGradient" cx="40%" cy="30%" r="70%">
                <stop offset="0%" stopColor={COLORS.face.light} />
                <stop offset="50%" stopColor={COLORS.face.mid} />
                <stop offset="100%" stopColor={COLORS.face.dark} />
              </radialGradient>
              
              {/* Muted lavender hair tuft gradient */}
              <radialGradient id="hairGradient" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor={COLORS.hair.light} />
                <stop offset="100%" stopColor={COLORS.hair.dark} />
              </radialGradient>
              
              {/* Subtle blush gradient */}
              <radialGradient id="blushGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={COLORS.blush} stopOpacity="0.45" />
                <stop offset="100%" stopColor={COLORS.blush} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Face blob - slightly squished circle for friendliness */}
            <motion.ellipse
              cx="50"
              cy="52"
              rx="36"
              ry="38"
              fill="url(#faceGradient)"
              stroke={COLORS.face.stroke}
              strokeWidth="1"
              animate={
                expression === 'poked' || isStartled
                  ? { rx: [36, 38, 34, 36], ry: [38, 36, 40, 38] } 
                  : expression === 'celebrating'
                  ? { ry: [38, 36, 38] }
                  : isYawning
                  ? { ry: [38, 40, 38] }
                  : {}
              }
              transition={{ duration: 0.3 }}
            />

            {/* Hair tuft at top with wiggle */}
            <motion.g
              animate={hairWiggle ? { rotate: [0, -8, 8, -4, 0] } : {}}
              transition={{ duration: 0.4 }}
              style={{ transformOrigin: '50px 18px' }}
            >
              <ellipse cx="50" cy="16" rx="10" ry="7" fill="url(#hairGradient)" />
              <ellipse cx="44" cy="18" rx="5" ry="4" fill="url(#hairGradient)" />
              <ellipse cx="56" cy="18" rx="5" ry="4" fill="url(#hairGradient)" />
            </motion.g>

            {/* Blush cheeks - always visible but more subtle */}
            <ellipse cx="26" cy="52" rx="8" ry="5" fill="url(#blushGradient)" />
            <ellipse cx="74" cy="52" rx="8" ry="5" fill="url(#blushGradient)" />

            {/* Eyes */}
            {renderEyes()}

            {/* Mouth */}
            {renderMouth()}
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
                fill={COLORS.sparkle}
              />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Sleeping zzz */}
      <AnimatePresence>
        {personalityState === 'sleeping' && (
          <motion.div
            className="absolute -top-2 -right-1 pointer-events-none"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <motion.span
              className="text-xs font-bold"
              style={{ color: COLORS.zzz }}
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
    </motion.div>
  );
}
