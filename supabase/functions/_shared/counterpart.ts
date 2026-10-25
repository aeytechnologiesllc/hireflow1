/**
 * counterpart.ts — who an applicant talks to in a practice chat, in the
 * job's own word (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 1).
 *
 * The prompts were written for the owner's own gaming jobs, where the people
 * writing in are "players". Any other business's applicant must never be
 * asked about players: a doctor's office has patients, a shop has customers.
 * The word comes from the job's own text (its practice cases, or its title
 * and description): "player" only when that text says players, else
 * "customer". ("patient" and "caller" come with Phase 4.)
 *
 * Pure, no imports: ai-chat-simulation and ai-chat-interview use it, and
 * scripts/lead_practice_grading.test.mjs and scripts/interview_guide.test.mjs
 * load it in Node.
 */

export type Counterpart = "player" | "customer";

/** "player" when the text talks about players, else "customer". */
export function counterpartNoun(text: string | null | undefined): Counterpart {
  return /\bplayers?\b/i.test(text ?? "") ? "player" : "customer";
}

/** The text with "player" swapped for this job's word. JSON keys (playerDisrespected) are words inside a longer name, so they stay. */
export function withCounterpart(text: string, noun: string): string {
  if (noun === "player") return text;
  const cap = noun.charAt(0).toUpperCase() + noun.slice(1);
  return text
    .replace(/\bPLAYERS\b/g, `${noun.toUpperCase()}S`)
    .replace(/\bPLAYER\b/g, noun.toUpperCase())
    .replace(/\bPlayers\b/g, `${cap}s`)
    .replace(/\bPlayer\b/g, cap)
    .replace(/\bplayers\b/g, `${noun}s`)
    .replace(/\bplayer\b/g, noun);
}
