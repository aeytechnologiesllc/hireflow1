import { useState, useEffect, useCallback, useRef } from 'react';

export type PersonalityState = 'active' | 'curious' | 'drowsy' | 'sleeping';

interface UseAvaPersonalityReturn {
  state: PersonalityState;
  wake: () => void;
  forceState: (state: PersonalityState) => void;
}

const STATE_TIMINGS = {
  active: 3000,    // 3s until curious
  curious: 3000,   // 3s until drowsy
  drowsy: 4000,    // 4s until sleeping (total 10s to sleep)
};

export function useAvaPersonality(): UseAvaPersonalityReturn {
  const [state, setState] = useState<PersonalityState>('active');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNextState = useCallback((currentState: PersonalityState) => {
    clearTimer();

    if (currentState === 'sleeping') return;

    const timing = STATE_TIMINGS[currentState];
    const nextState: Record<PersonalityState, PersonalityState> = {
      active: 'curious',
      curious: 'drowsy',
      drowsy: 'sleeping',
      sleeping: 'sleeping',
    };

    timerRef.current = setTimeout(() => {
      setState(nextState[currentState]);
    }, timing);
  }, [clearTimer]);

  const wake = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState('active');
  }, []);

  const forceState = useCallback((newState: PersonalityState) => {
    setState(newState);
  }, []);

  // Schedule transitions when state changes
  useEffect(() => {
    scheduleNextState(state);
    return clearTimer;
  }, [state, scheduleNextState, clearTimer]);

  // Track mouse movement to wake Ava
  useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      // Only wake if sleeping and there's actual activity
      if (state === 'sleeping') {
        wake();
      } else if (state !== 'active') {
        // Reset to active on any activity
        wake();
      } else {
        // Refresh the timer for active state
        lastActivityRef.current = now;
        scheduleNextState('active');
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [state, wake, scheduleNextState]);

  return { state, wake, forceState };
}
