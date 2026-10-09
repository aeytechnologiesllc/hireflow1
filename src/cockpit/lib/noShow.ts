/**
 * noShow.ts: what happens when an applicant does not show up for an
 * interview (docs/INTERVIEWS.md, "When they do not show up").
 *
 * The owner, 2026-10-09: "what should we do when an applicant doesn't show up
 * for the interview? What do you think is a good way to do that?" Until then
 * "No-show" only put a label on the interview: the applicant was told
 * nothing and stayed at the interview stage for good.
 *
 * Now pressing it asks what happens next, and nothing is sent until one is
 * chosen:
 *  - one more chance: the interview is marked, and the applicant gets a
 *    plain message (and its email) asking which days and times work. Power
 *    and internet cuts are common where most applicants are, so this is the
 *    one suggested the first time;
 *  - pass: the interview is marked and the application is declined with the
 *    usual note (src/lib/declineNote.ts). Suggested the second time;
 *  - only mark it: for when they have already spoken another way.
 *
 * Pure: the words. The doing is pages/Interviews.tsx.
 */

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** The message a second chance sends. No blame, no reason asked for, and what to do next. */
export function secondChanceNote(name: string): string {
  const first = firstNameOf(name);
  return `${first ? `Hi ${first}, we` : "Hi, we"} missed you at your interview. If something came up, that is okay. Reply here with the days and times that work for you, and we will set a new time.`;
}

export type NoShowChoice = "chance" | "pass" | "mark";

export interface NoShowWords {
  title: string;
  body: string;
  /** Which of the two is suggested: a second no-show suggests passing. */
  suggested: "chance" | "pass";
  chance: { title: string; detail: string; button: string };
  pass: { title: string; detail: string; button: string };
  markOnly: string;
}

/** The dialog's words. `earlier` is how many times this applicant has already been marked a no-show. */
export function noShowWords(name: string, earlier: number): NoShowWords {
  const first = firstNameOf(name) || "They";
  const again = earlier > 0;
  return {
    title: `${first} did not show up`,
    body: again
      ? `This is not the first time: ${first} has missed ${earlier === 1 ? "an interview" : `${earlier} interviews`} before. Choose what happens next. Nothing is sent until you press one.`
      : "Choose what happens next. Nothing is sent until you press one.",
    suggested: again ? "pass" : "chance",
    chance: {
      title: "Give one more chance",
      detail: `${first} gets this message, and an email, and stays at the interview stage. When they answer, set a new time from their page.`,
      button: "Send it",
    },
    pass: {
      title: `Pass on ${first}`,
      detail: `${first} is declined and gets your usual note by email:`,
      button: `Pass on ${first}`,
    },
    markOnly: "Only mark it as a no-show",
  };
}

/** What is said once it is done. */
export function noShowDoneWords(name: string, choice: NoShowChoice, messageSent = true): { ok: boolean; title: string; description?: string } {
  const first = firstNameOf(name) || "They";
  if (choice === "chance") {
    return messageSent
      ? { ok: true, title: "Marked as a no-show", description: `${first} was asked which times work. Their answer will be in Messages.` }
      : { ok: false, title: "Marked as a no-show", description: `The message to ${first} could not be sent. Write to them from Messages.` };
  }
  if (choice === "pass") return { ok: true, title: "Marked as a no-show", description: `${first} was passed on and sent your note.` };
  return { ok: true, title: `Marked as a no-show: ${first}` };
}
