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
      if (Math.random() > 0.7) {
        const tilt = (Math.random() - 0.5) * 10;
        setHeadTilt(tilt);
        setTimeout(() => setHeadTilt(0), 1200);
      }
    }, 4000 + Math.random() * 3000);
    
    return () => clearInterval(tiltInterval);
  }, [personalityState]);

  // Blinking animation
  useEffect(() => {
    if (personalityState === 'sleeping') return;
    
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    const scheduleNextBlink = () => {
      const delay = 2500 + Math.random() * 4000;
      return setTimeout(() => {
        blink();
        scheduleNextBlink();
      }, delay);
    };

    const timeoutId = scheduleNextBlink();
    return () => clearTimeout(timeoutId);
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
    
    if (isHovered) {
      generateSparkle();
    }
    
    return () => clearInterval(sparkleInterval);
  }, [personalityState, isHovered, expression, generateSparkle]);

  // Determine current visual state
  const visualState = useMemo(() => {
    if (personalityState === 'sleeping') return 'sleeping';
    if (isBlinking) return 'blinking';
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
  }, [personalityState, expression, isListening, isSpeaking, isBlinking]);

  // Render eyes based on visual state
  const renderEyes = () => {
    const leftX = 35;
    const rightX = 65;
    const baseY = 42;

    switch (visualState) {
      case 'sleeping':
        return (
          <>
            <path d={`M ${leftX - 6} ${baseY + 2} Q ${leftX} ${baseY + 6} ${leftX + 6} ${baseY + 2}`} 
                  stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d={`M ${rightX - 6} ${baseY + 2} Q ${rightX} ${baseY + 6} ${rightX + 6} ${baseY + 2}`} 
                  stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case 'blinking':
        return (
          <>
            <line x1={leftX - 5} y1={baseY} x2={leftX + 5} y2={baseY} stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" />
            <line x1={rightX - 5} y1={baseY} x2={rightX + 5} y2={baseY} stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case 'drowsy':
        return (
          <>
            <ellipse cx={leftX} cy={baseY + 1} rx="5" ry="3" fill="#5D4E37" />
            <ellipse cx={rightX} cy={baseY + 1} rx="5" ry="3" fill="#5D4E37" />
            <circle cx={leftX + 1.5} cy={baseY} r="1.2" fill="white" opacity="0.7" />
            <circle cx={rightX + 1.5} cy={baseY} r="1.2" fill="white" opacity="0.7" />
          </>
        );
      case 'celebrating':
      case 'excited':
        return (
          <>
            <text x={leftX} y={baseY + 5} textAnchor="middle" fontSize="12" fill="#F59E0B">★</text>
            <text x={rightX} y={baseY + 5} textAnchor="middle" fontSize="12" fill="#F59E0B">★</text>
          </>
        );
      case 'happy':
      case 'waving':
        return (
          <>
            <path d={`M ${leftX - 5} ${baseY + 2} Q ${leftX} ${baseY - 3} ${leftX + 5} ${baseY + 2}`} 
                  stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d={`M ${rightX - 5} ${baseY + 2} Q ${rightX} ${baseY - 3} ${rightX + 5} ${baseY + 2}`} 
                  stroke="#5D4E37" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case 'poked':
        return (
          <>
            <circle cx={leftX} cy={baseY} r="7" fill="#5D4E37" />
            <circle cx={rightX} cy={baseY} r="7" fill="#5D4E37" />
            <circle cx={leftX + 2} cy={baseY - 2} r="2.5" fill="white" />
            <circle cx={rightX + 2} cy={baseY - 2} r="2.5" fill="white" />
          </>
        );
      case 'thinking':
      case 'curious':
        return (
          <>
            <circle cx={leftX} cy={baseY - 1} r="5" fill="#5D4E37" />
            <circle cx={rightX + 2} cy={baseY - 2} r="5" fill="#5D4E37" />
            <circle cx={leftX + 2} cy={baseY - 3} r="1.8" fill="white" />
            <circle cx={rightX + 4} cy={baseY - 4} r="1.8" fill="white" />
          </>
        );
      case 'concerned':
        return (
          <>
            <ellipse cx={leftX} cy={baseY} rx="5" ry="6" fill="#5D4E37" />
            <ellipse cx={rightX} cy={baseY} rx="5" ry="6" fill="#5D4E37" />
            <circle cx={leftX + 1.5} cy={baseY - 2} r="2" fill="white" opacity="0.9" />
            <circle cx={rightX + 1.5} cy={baseY - 2} r="2" fill="white" opacity="0.9" />
            {/* Worried eyebrows */}
            <line x1={leftX - 5} y1={baseY - 10} x2={leftX + 3} y2={baseY - 8} stroke="#5D4E37" strokeWidth="2" strokeLinecap="round" />
            <line x1={rightX + 5} y1={baseY - 10} x2={rightX - 3} y2={baseY - 8} stroke="#5D4E37" strokeWidth="2" strokeLinecap="round" />
          </>
        );
      case 'listening':
        return (
          <>
            <circle cx={leftX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={rightX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={leftX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
            <circle cx={rightX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
          </>
        );
      case 'speaking':
        return (
          <>
            <circle cx={leftX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={rightX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={leftX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
            <circle cx={rightX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
          </>
        );
      default: // neutral
        return (
          <>
            <circle cx={leftX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={rightX} cy={baseY} r="5" fill="#5D4E37" />
            <circle cx={leftX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
            <circle cx={rightX + 1.5} cy={baseY - 1.5} r="2" fill="white" />
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
                     stroke="#A0522D" strokeWidth="2" strokeLinecap="round" />;
      case 'celebrating':
      case 'excited':
      case 'happy':
      case 'waving':
        return (
          <path d={`M ${centerX - 8} ${mouthY - 2} Q ${centerX} ${mouthY + 8} ${centerX + 8} ${mouthY - 2}`}
                stroke="#A0522D" strokeWidth="2" strokeLinecap="round" fill="#FFB5A7" fillOpacity="0.4" />
        );
      case 'poked':
        return <ellipse cx={centerX} cy={mouthY + 2} rx="5" ry="6" fill="#A0522D" fillOpacity="0.6" />;
      case 'thinking':
        return <circle cx={centerX + 4} cy={mouthY} r="3" fill="#A0522D" fillOpacity="0.5" />;
      case 'concerned':
        return (
          <path d={`M ${centerX - 5} ${mouthY + 3} Q ${centerX} ${mouthY - 2} ${centerX + 5} ${mouthY + 3}`}
                stroke="#A0522D" strokeWidth="2" strokeLinecap="round" fill="none" />
        );
      case 'drowsy':
        return (
          <path d={`M ${centerX - 4} ${mouthY} Q ${centerX} ${mouthY + 3} ${centerX + 4} ${mouthY}`}
                stroke="#A0522D" strokeWidth="2" strokeLinecap="round" fill="none" />
        );
      case 'listening':
        return <circle cx={centerX} cy={mouthY} r="3" fill="#A0522D" fillOpacity="0.4" />;
      case 'speaking':
        return (
          <motion.ellipse 
            cx={centerX} cy={mouthY + 1} rx="5" ry="4" 
            fill="#A0522D" fillOpacity="0.5"
            animate={{ ry: [3, 5, 2, 4, 3] }}
            transition={{ duration: 0.35, repeat: Infinity }}
          />
        );
      default: // neutral, curious
        return (
          <path d={`M ${centerX - 6} ${mouthY} Q ${centerX} ${mouthY + 5} ${centerX + 6} ${mouthY}`}
                stroke="#A0522D" strokeWidth="2" strokeLinecap="round" fill="none" />
        );
    }
  };

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
          ? { rotate: [0, -8, 8, -8, 0] }
          : { scale: 1, rotate: headTilt }
      }
      transition={{ 
        duration: isWaking ? 0.8 : expression === 'celebrating' ? 0.7 : 0.35,
        ease: 'easeOut'
      }}
    >
      {/* Glow effect */}
      <AnimatePresence>
        {(isHovered || expression === 'celebrating') && (
          <motion.div
            className="absolute inset-0 -z-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, hsla(25, 80%, 70%, 0.5) 0%, transparent 70%)',
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
          scale: personalityState === 'sleeping' ? [1, 1.03, 1] : [1, 1.04, 1],
        }}
        transition={{
          duration: personalityState === 'sleeping' ? 4 : 3,
          repeat: Infinity,
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
            className="drop-shadow-lg"
          >
            <defs>
              {/* Warm peach face gradient */}
              <radialGradient id="faceGradient" cx="40%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFE8D6" />
                <stop offset="50%" stopColor="#FFDCC4" />
                <stop offset="100%" stopColor="#F5C9A8" />
              </radialGradient>
              
              {/* Soft purple hair tuft gradient */}
              <radialGradient id="hairGradient" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#D4B8E8" />
                <stop offset="100%" stopColor="#B794D4" />
              </radialGradient>
              
              {/* Blush gradient */}
              <radialGradient id="blushGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFB5A7" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#FFB5A7" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Face blob - slightly squished circle for friendliness */}
            <motion.ellipse
              cx="50"
              cy="52"
              rx="36"
              ry="38"
              fill="url(#faceGradient)"
              stroke="#E8C4A8"
              strokeWidth="1"
              animate={
                expression === 'poked' 
                  ? { rx: [36, 38, 34, 36], ry: [38, 36, 40, 38] } 
                  : expression === 'celebrating'
                  ? { ry: [38, 36, 38] }
                  : {}
              }
              transition={{ duration: 0.3 }}
            />

            {/* Hair tuft at top */}
            <ellipse cx="50" cy="16" rx="10" ry="7" fill="url(#hairGradient)" />
            <ellipse cx="44" cy="18" rx="5" ry="4" fill="url(#hairGradient)" />
            <ellipse cx="56" cy="18" rx="5" ry="4" fill="url(#hairGradient)" />

            {/* Blush cheeks - always visible */}
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
                fill="hsl(45, 95%, 65%)"
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
              style={{ color: '#B794D4' }}
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
