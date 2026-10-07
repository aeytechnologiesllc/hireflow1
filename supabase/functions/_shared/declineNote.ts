/**
 * The note an applicant gets when the hiring team passes on them: the email
 * (send-notification-email, "status_rejected") and the preview the Pass
 * dialog shows before it is sent. One wording in two files, because the edge
 * functions cannot import from src/: this file and
 * supabase/functions/_shared/declineNote.ts are kept identical by
 * scripts/decline_note.test.mjs.
 *
 * The owner, 2026-10-06, on the Pass dialog: "just ask me for confirmation
 * and send them whatever they need … I shouldn't have to tell them why … it
 * wasn't a good fit at the moment … we don't want to depress them, we want to
 * keep them encouraged … not too long."
 *
 * So: thanks for the work they put in, a plain "not this time" with no reason
 * given and none implied about them, and a door left open. Three sentences.
 * "Apply again" is true for everyone who gets it: Remove and block sends an
 * applicant nothing (docs/APPLICANTS-LIST.md).
 */
export function declineNoteLines(jobTitle?: string | null): string[] {
  const title = typeof jobTitle === "string" ? jobTitle.trim() : "";
  const role = title ? `the ${title} role` : "the role";
  return [
    `Thank you for applying for ${role}, and for the time and effort you put into every step.`,
    "It wasn't the right fit for this role at the moment, so we won't be moving forward this time.",
    "Please don't be discouraged: you're welcome to apply again when we open new roles, and we wish you the very best.",
  ];
}

/** The same note as one paragraph (the Pass dialog's preview). */
export function declineNoteText(jobTitle?: string | null): string {
  return declineNoteLines(jobTitle).join(" ");
}
