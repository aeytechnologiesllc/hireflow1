import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GUIDE_RATING_MAX, NO_RATINGS, RATING_LIMITS, readGuideRatings, type GuideRatings } from "@/lib/interviewGuide";
import { INTERVIEW_SCORES_KEY } from "./useInterviewScores";
import { isRecordNotDeployed } from "./useAssessmentSessions";

/**
 * This person's own ratings of one applicant's interview answers, the staff
 * side (src/lib/interviewGuide.ts, "Ratings";
 * supabase/migrations/*_interview_ratings.sql; docs/INTERVIEWS.md).
 *
 * The owner, 2026-10-09: "give me a button that I could rate all of these
 * answers from 1 to 10 here in the interview guide, that way I don't need a
 * separate piece of paper ... and I could probably write extra notes here as
 * well."
 *
 * It is used DURING a call, so nothing here asks him to press Save: a tap or
 * a word is on the screen at once and is sent a moment after he stops. What
 * is on the screen is the truth: it starts from what was saved, once, and
 * from then on a refetch never replaces what he is typing.
 *
 * A save goes through save_interview_ratings and nothing else, and only when
 * something on the screen changed. It is never sent on open and never tried
 * again by itself after a failure (see hireflow "write-on-open loops": a save
 * that re-arms itself is how one request became ten a second). After a
 * failure the words stay on the screen and go out with the next change, and
 * once more when the guide is closed.
 *
 * Until the migration is applied the table and the function do not exist:
 * that reads as "nothing rated yet", and a change says ratings are not
 * switched on yet.
 */

export const interviewRatingKeys = {
  one: (applicationId: string | null | undefined, uid: string | null | undefined) => ["interview-ratings", applicationId ?? null, uid ?? null] as const,
};

/** How long after the last change the ratings are sent. */
export const RATINGS_SAVE_AFTER_MS = 700;

export type RatingsSaveState = "idle" | "saving" | "saved" | "failed" | "not_allowed" | "not_deployed";

export const RATINGS_SAVE_WORDS: Record<Exclude<RatingsSaveState, "idle">, string> = {
  saving: "Saving…",
  saved: "Ratings and notes saved",
  failed: "Couldn't save just now. Your ratings are still on this screen, and go out with your next change.",
  not_allowed: "You can't rate this applicant.",
  not_deployed: "Ratings aren't switched on yet.",
};

interface StoredRatings {
  ratings: GuideRatings;
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

function failureState(error: RpcError): RatingsSaveState {
  if (isRecordNotDeployed(error)) return "not_deployed";
  if (error?.code === "42501") return "not_allowed";
  return "failed";
}

export function useInterviewRatings(applicationId: string | null | undefined, enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  const queryClient = useQueryClient();
  // The same array from one render to the next (a key built afresh each
  // render makes every callback below new on every render).
  const key = useMemo(() => interviewRatingKeys.one(applicationId, uid), [applicationId, uid]);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!applicationId && !!uid,
    staleTime: 60_000,
    retry: (count, error) => count < 2 && !isRecordNotDeployed(error as RpcError),
    queryFn: async (): Promise<StoredRatings> => {
      const { data, error } = await supabase
        .from("interview_ratings")
        .select("answers, overall_note")
        .eq("application_id", applicationId!)
        .eq("rated_by", uid!)
        .maybeSingle();
      if (error) {
        if (isRecordNotDeployed(error)) return { ratings: NO_RATINGS, deployed: false };
        throw error;
      }
      return { ratings: readGuideRatings(data?.answers, data?.overall_note), deployed: true };
    },
  });

  const [ratings, setRatings] = useState<GuideRatings>(NO_RATINGS);
  const [state, setState] = useState<RatingsSaveState>("idle");
  /** What is on the screen right now (the state above, readable from a timer). */
  const latest = useRef<GuideRatings>(NO_RATINGS);
  /** Which applicant the screen shows, and whether it has been filled from what was saved. */
  const target = useRef<string | null>(applicationId ?? null);
  const loadedFor = useRef<string | null>(null);
  /** Something on the screen has not been handed over for sending yet. */
  const dirty = useRef(false);
  /** Handed over, waiting its turn: one applicant's whole screen as it was. The newest wins. */
  const owed = useRef<{ id: string; data: GuideRatings } | null>(null);
  const sending = useRef(false);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  /** Sends what is owed, one at a time. A failure stops it: nothing here tries again by itself. */
  const pump = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (owed.current) {
        const job = owed.current;
        owed.current = null;
        const showing = () => alive.current && target.current === job.id;
        if (showing()) setState("saving");
        let data: unknown = null;
        let error: RpcError = null;
        try {
          const answer = await supabase.rpc("save_interview_ratings", {
            p_application_id: job.id,
            p_answers: job.data.answers as never,
            p_overall_note: job.data.overallNote,
          });
          data = answer.data;
          error = answer.error;
        } catch (thrown) {
          // The client hands a refusal back as `error`; a thrown one (no
          // network at all) is the same thing to the person rating.
          error = (thrown as RpcError) ?? { message: "failed" };
        }
        if (error) {
          console.error("[save_interview_ratings]", error);
          // Still on the screen, still owed: it goes out with the next change,
          // and once more when the guide is closed.
          if (target.current === job.id && !owed.current) dirty.current = true;
          if (showing()) setState(failureState(error as RpcError));
          break;
        }
        const row = data as { answers?: unknown; overall_note?: unknown } | null;
        queryClient.setQueryData<StoredRatings>(interviewRatingKeys.one(job.id, uid), {
          ratings: readGuideRatings(row?.answers ?? job.data.answers, row?.overall_note ?? job.data.overallNote),
          deployed: true,
        });
        // The profile, the list and the Interviews page show this rating too.
        void queryClient.invalidateQueries({ queryKey: INTERVIEW_SCORES_KEY });
        if (showing()) setState(owed.current || dirty.current ? "saving" : "saved");
      }
    } finally {
      sending.current = false;
    }
  }, [queryClient, uid]);

  /**
   * Hand the screen over for sending, as it is now and under the applicant it
   * belongs to. Never before what was saved earlier has been read: a screen
   * that has not been filled yet would replace their ratings with nothing.
   */
  const commit = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const id = target.current;
    if (!dirty.current || !id || loadedFor.current !== id) return;
    dirty.current = false;
    owed.current = { id, data: latest.current };
    void pump();
  }, [pump]);

  // Another applicant: what was not sent for the last one goes now, under
  // their id, and the screen is empty until this one's has been read.
  useEffect(() => {
    target.current = applicationId ?? null;
    loadedFor.current = null;
    dirty.current = false;
    latest.current = NO_RATINGS;
    setRatings(NO_RATINGS);
    setState("idle");
    return commit;
  }, [applicationId, uid, commit]);

  // Fill the screen from what was saved, once per applicant.
  useEffect(() => {
    if (!query.data || !applicationId || loadedFor.current === applicationId) return;
    loadedFor.current = applicationId;
    latest.current = query.data.ratings;
    setRatings(query.data.ratings);
  }, [query.data, applicationId]);

  const change = useCallback(
    (next: GuideRatings) => {
      // Not filled yet: the controls are not offered (see `ready`), and a
      // change that slipped through is not kept.
      if (loadedFor.current !== target.current) return;
      latest.current = next;
      dirty.current = true;
      setRatings(next);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(commit, RATINGS_SAVE_AFTER_MS);
    },
    [commit],
  );

  /** Rate an answer. Tapping the number it already has takes the rating away. */
  const setScore = useCallback(
    (ratingKey: string, score: number, question: string) => {
      const was = latest.current.answers[ratingKey];
      const whole = Math.round(score);
      const value = was?.score === whole || whole < 1 || whole > GUIDE_RATING_MAX ? null : whole;
      const answers = { ...latest.current.answers };
      if (value === null && !(was?.note ?? "").trim()) delete answers[ratingKey];
      else answers[ratingKey] = { score: value, note: was?.note ?? "", question: question.slice(0, RATING_LIMITS.question) };
      change({ ...latest.current, answers });
    },
    [change],
  );

  const setNote = useCallback(
    (ratingKey: string, note: string, question: string) => {
      const was = latest.current.answers[ratingKey];
      const text = note.slice(0, RATING_LIMITS.note);
      const answers = { ...latest.current.answers };
      if (!text.trim() && (was?.score ?? null) === null) delete answers[ratingKey];
      else answers[ratingKey] = { score: was?.score ?? null, note: text, question: question.slice(0, RATING_LIMITS.question) };
      change({ ...latest.current, answers });
    },
    [change],
  );

  const setOverallNote = useCallback(
    (note: string) => change({ ...latest.current, overallNote: note.slice(0, RATING_LIMITS.overallNote) }),
    [change],
  );

  // The tab going to the background (a phone switching apps) or the guide
  // going away: send what has not gone yet.
  useEffect(() => {
    alive.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") commit();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      commit();
      alive.current = false;
    };
  }, [commit]);

  return {
    ratings,
    /** What was saved before has been read: only then may the screen be changed. */
    ready: query.isSuccess,
    /** Reading what was saved before failed (not "nothing saved yet"). */
    loadFailed: query.isError,
    deployed: query.data?.deployed ?? true,
    state,
    setScore,
    setNote,
    setOverallNote,
    /** Send whatever has not gone yet, now: the guide is closing. */
    flush: commit,
  };
}
