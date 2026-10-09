import { useEffect, useMemo, useState } from "react";
import { useInterviews } from "@/hooks/useInterviews";
import { interviewsLeftToday, type InterviewRowLike } from "../lib/interviewWhen";

/**
 * How many agreed interviews are still ahead, or under way, today
 * (lib/interviewWhen.ts): the count on the menu's Interviews item.
 *
 * It reads the same list the Interviews page reads (one cached query, not a
 * second one), and checks the clock once a minute so the count drops when an
 * interview is over and a day's count is gone by the next morning.
 */
export function useInterviewsLeftToday(): number {
  const { data: rows } = useInterviews();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => interviewsLeftToday(rows as unknown as InterviewRowLike[] | undefined, now), [rows, now]);
}
