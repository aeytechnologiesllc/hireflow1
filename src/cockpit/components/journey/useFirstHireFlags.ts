import { useCallback, useEffect, useState } from "react";

/**
 * Whether "Your first hire" was ever shown to this person, and whether they
 * put away the "You're set up" line (SetUpNote.tsx). Both live in this browser
 * only (localStorage) and nothing here decides what the dashboard shows: the
 * stage rules do that, from real data. A business that never saw the guide
 * never gets the line.
 */

const key = (userId: string, what: "seen" | "away") => `hf-first-hire:${userId}:${what}`;

function read(k: string): boolean {
  try {
    return window.localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
}

function write(k: string) {
  try {
    window.localStorage.setItem(k, "1");
  } catch {
    // Private mode, storage blocked: it just won't be remembered after a reload.
  }
}

export function useFirstHireFlags(userId: string | null | undefined) {
  const [seen, setSeen] = useState(false);
  const [away, setAway] = useState(true);
  useEffect(() => {
    if (!userId) return;
    setSeen(read(key(userId, "seen")));
    setAway(read(key(userId, "away")));
  }, [userId]);
  const markSeen = useCallback(() => {
    if (!userId) return;
    write(key(userId, "seen"));
    setSeen(true);
  }, [userId]);
  const putAway = useCallback(() => {
    if (!userId) return;
    write(key(userId, "away"));
    setAway(true);
  }, [userId]);
  return { seen, away, markSeen, putAway };
}
