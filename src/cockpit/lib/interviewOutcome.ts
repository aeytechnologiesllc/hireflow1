/**
 * interviewOutcome.ts: the words of "How did it go?", the step that closes an
 * interview (docs/INTERVIEWS.md, "How did it go?").
 *
 * The owner finished his first interview on 2026-10-09 and the interview went
 * on saying "scheduled": nothing asked him what happened, and nothing led to
 * the decision the interview was for. Once an interview's time has passed the
 * Interviews page now asks one question, and the answer leads somewhere:
 * "We talked" marks it done and offers the next step; "They did not show up"
 * opens the no-show choices (lib/noShow.ts).
 *
 * Pure: the words only.
 */
// "@/": this file is also loaded as it is by scripts/interview_outcome.test.mjs.
import { interviewScoreWords, type InterviewScore } from "@/cockpit/lib/interviewScore";

const first = (name: string) => name.trim().split(/\s+/)[0] || "them";

export interface OutcomeAskWords {
  title: string;
  /** When it was, in his words ("Your interview was today at 4:00 pm."). Empty when the time is not known. */
  when: string;
  talked: string;
  talkedHint: string;
  noShow: string;
  noShowHint: string;
  later: string;
}

/** The question. `whenLabel` is the time as the page already writes it ("today at 4:00 pm"). */
export function outcomeAskWords(name: string, whenLabel: string | null): OutcomeAskWords {
  const who = first(name);
  return {
    title: `How did it go with ${who}?`,
    when: whenLabel ? `Your interview was ${whenLabel}.` : "",
    talked: "We talked",
    talkedHint: "Marks the interview as done.",
    noShow: `${who} did not show up`,
    noShowHint: "You choose what happens next: ask for another time, or pass.",
    later: "Not now",
  };
}

export interface OutcomeNextWords {
  title: string;
  /** His rating, or that there is none yet. */
  rating: string;
  /** True when he has scored at least one answer. */
  rated: boolean;
  guide: string;
  offer: string;
  offerHint: string;
  profile: string;
  profileHint: string;
  later: string;
}

/** After "We talked": what next. Nothing here decides for him. */
export function outcomeNextWords(name: string, score: InterviewScore | null | undefined): OutcomeNextWords {
  const who = first(name);
  const words = interviewScoreWords(score);
  const rated = !!score && score.average !== null;
  return {
    title: `What next with ${who}?`,
    rating: rated && words ? `${words.title}.` : "You have not scored the answers yet.",
    rated,
    guide: rated ? "Open the interview guide" : "Score the answers now",
    offer: "Write the offer letter",
    offerHint: `Opens the letter with ${who} already chosen.`,
    profile: `Open ${who}'s profile`,
    profileHint: "Everything they did, and Pass if it is a no.",
    later: "Decide later",
  };
}
