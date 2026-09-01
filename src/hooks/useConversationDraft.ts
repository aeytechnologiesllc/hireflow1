import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps a timed conversation alive across a reload.
 *
 * The three conversational steps — chat simulation, chat interview, sales
 * simulation — held their entire transcript in component state and nowhere
 * else. One refresh, one phone call, one app switch on a phone, and everything
 * the candidate had typed was gone, mid-assessment, with the clock still
 * running. These are hourly workers doing this on a phone between shifts; an
 * interruption is the normal case, not the edge case.
 *
 * This is deliberately localStorage rather than a database write per turn: the
 * transcript is only meaningful once the step is submitted, and a write on
 * every keystroke-turn is a lot of load for something that just needs to
 * survive the tab. It is scoped per application and per step, revives the Date
 * that JSON flattens to a string, and clears itself the moment the step is
 * genuinely finished so a retake never starts inside the old conversation.
 *
 * Storage is best-effort: Safari private mode throws on setItem, and a
 * candidate whose browser refuses storage should still be able to do the step.
 * Every access is guarded, and a failure degrades to exactly the old behaviour.
 */
export interface DraftMessage {
  id: string;
  content: string;
  timestamp: Date;
}

export function useConversationDraft<M extends DraftMessage>(
  /** Unique per application + step. Null disables persistence entirely. */
  key: string | null,
  messages: M[],
  restore: (messages: M[]) => void,
  /** Only persist while the step is actually in progress. */
  active: boolean
) {
  const storageKey = key ? `hf.convo.${key}` : null;
  const restoredRef = useRef(false);

  const clear = useCallback(() => {
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* storage unavailable — nothing to clean up */
    }
  }, [storageKey]);

  // Restore once, before anything is written back.
  useEffect(() => {
    if (!storageKey || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      restore(
        parsed.map((m: M & { timestamp: string }) => ({
          ...m,
          // JSON has no Date; every consumer formats this, so revive it.
          timestamp: new Date(m.timestamp),
        })) as M[]
      );
    } catch {
      // A corrupt or unreadable draft must never block the step — start fresh.
      clear();
    }
  }, [storageKey, restore, clear]);

  // Persist after each turn.
  useEffect(() => {
    if (!storageKey || !active || !restoredRef.current) return;
    if (messages.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* quota or private mode — the step still works, it just will not survive a reload */
    }
  }, [storageKey, messages, active]);

  return { clear };
}
