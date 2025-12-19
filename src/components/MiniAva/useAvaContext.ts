import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export type AvaMood = 'happy' | 'focused' | 'curious' | 'listening' | 'bored' | 'thinking';

interface AvaContext {
  mood: AvaMood;
  hint?: string;
  specialBehavior?: 'wave' | 'point' | 'lean' | 'perk' | 'study';
}

export function useAvaContext(): AvaContext {
  const location = useLocation();

  return useMemo(() => {
    const path = location.pathname;

    // Dashboard - happy and welcoming
    if (path === '/dashboard') {
      return {
        mood: 'happy' as AvaMood,
        specialBehavior: 'wave' as const,
      };
    }

    // Jobs page
    if (path === '/jobs') {
      return {
        mood: 'curious' as AvaMood,
        hint: 'Create a new job posting',
        specialBehavior: 'point' as const,
      };
    }

    // Create job page
    if (path === '/jobs/create') {
      return {
        mood: 'focused' as AvaMood,
        hint: 'I can help you write this!',
      };
    }

    // Applicants page
    if (path === '/applicants' || path.startsWith('/applicants/')) {
      return {
        mood: 'focused' as AvaMood,
        specialBehavior: 'lean' as const,
      };
    }

    // Messages page
    if (path === '/messages') {
      return {
        mood: 'listening' as AvaMood,
        specialBehavior: 'perk' as const,
      };
    }

    // Analytics page
    if (path === '/analytics') {
      return {
        mood: 'thinking' as AvaMood,
        specialBehavior: 'study' as const,
      };
    }

    // Interviews page
    if (path === '/interviews') {
      return {
        mood: 'focused' as AvaMood,
      };
    }

    // Documents page
    if (path === '/documents') {
      return {
        mood: 'focused' as AvaMood,
      };
    }

    // Team page
    if (path === '/team') {
      return {
        mood: 'happy' as AvaMood,
        specialBehavior: 'wave' as const,
      };
    }

    // Default
    return {
      mood: 'happy' as AvaMood,
    };
  }, [location.pathname]);
}
