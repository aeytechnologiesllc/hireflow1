import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToAvaEvents } from '@/hooks/useAvaEvents';

export type AvaExpression = 
  | 'neutral' 
  | 'happy' 
  | 'excited' 
  | 'concerned' 
  | 'thinking' 
  | 'celebrating' 
  | 'waving'
  | 'poked';

interface UseAvaReactionsReturn {
  expression: AvaExpression;
  isAnimating: boolean;
  triggerExpression: (expr: AvaExpression, duration?: number) => void;
}

export function useAvaReactions(): UseAvaReactionsReturn {
  const [expression, setExpression] = useState<AvaExpression>('neutral');
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReactionTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const triggerExpression = useCallback((expr: AvaExpression, duration = 2000) => {
    clearReactionTimeout();
    setExpression(expr);
    setIsAnimating(true);

    timeoutRef.current = setTimeout(() => {
      setExpression('neutral');
      setIsAnimating(false);
    }, duration);
  }, [clearReactionTimeout]);

  // Listen for global Ava events
  useEffect(() => {
    const unsubscribe = subscribeToAvaEvents((reaction) => {
      switch (reaction) {
        case 'celebrate':
          triggerExpression('celebrating', 3000);
          break;
        case 'concerned':
          triggerExpression('concerned', 2500);
          break;
        case 'excited':
          triggerExpression('excited', 2000);
          break;
        case 'approving':
          triggerExpression('happy', 1500);
          break;
        case 'thinking':
          triggerExpression('thinking', 2000);
          break;
        case 'wave':
          triggerExpression('waving', 2000);
          break;
        case 'poke':
          triggerExpression('poked', 800);
          break;
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
      clearReactionTimeout();
    };
  }, [triggerExpression, clearReactionTimeout]);

  return { expression, isAnimating, triggerExpression };
}
