// Global event system for triggering Ava reactions from anywhere in the app

type AvaReaction = 
  | 'celebrate' 
  | 'concerned' 
  | 'excited' 
  | 'approving' 
  | 'thinking' 
  | 'wave' 
  | 'poke'
  | 'sleep'
  | 'wake';

type AvaEventCallback = (reaction: AvaReaction) => void;

const listeners: Set<AvaEventCallback> = new Set();

export function subscribeToAvaEvents(callback: AvaEventCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function triggerAvaReaction(reaction: AvaReaction): void {
  listeners.forEach(callback => callback(reaction));
}

// Convenience functions for common reactions
export const avaReactions = {
  celebrate: () => triggerAvaReaction('celebrate'),
  concerned: () => triggerAvaReaction('concerned'),
  excited: () => triggerAvaReaction('excited'),
  approving: () => triggerAvaReaction('approving'),
  thinking: () => triggerAvaReaction('thinking'),
  wave: () => triggerAvaReaction('wave'),
  poke: () => triggerAvaReaction('poke'),
};
