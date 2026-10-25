/**
 * counterpart.ts — who an applicant talks to in a practice chat, in the
 * job's own word (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 1).
 *
 * The prompts were written for the owner's own gaming jobs, where the people
 * writing in are "players". Any other business's applicant must never be
 * asked about players: a doctor's office has patients, a shop has customers.
 * The word is a property of the job's business, not a guess from its text
 * (a dental office's "you are a team player" once read as gaming, Pass C
 * review 2026-10-25): "player" only for the home business
 * (business_pages.home_alias, _shared/homeBusiness.ts), "customer" for every
 * other business and whenever that is unknown. ("patient" and "caller" come
 * with Phase 4.)
 *
 * Pure, no imports: ai-chat-simulation, ai-chat-interview and interview-guide
 * use it, and scripts/lead_practice_grading.test.mjs loads it in Node.
 */

/** The word for the person on the other side: "player" (the owner's gaming jobs, a game company's pack), "patient" (a medical pack), else "customer". */
export type Counterpart = "player" | "customer" | "patient";

/** "player" only for the owner's own business; "customer" otherwise, unknown included. */
export function counterpartFor(homeBusiness: boolean | null | undefined): Counterpart {
  return homeBusiness === true ? "player" : "customer";
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
