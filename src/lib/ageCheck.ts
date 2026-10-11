/**
 * "Are you 18 or older?": the first question on every application
 * (2026-10-11).
 *
 * The owner asked for date of birth, so he would know how old an applicant
 * is. He chose this instead once he saw the Philippine law: RA 10911 (the
 * Anti-Age Discrimination in Employment Act), Section 5(a), makes it
 * unlawful to "require the declaration of age or birth date during the
 * application process" (a fine of ₱50,000 to ₱500,000, or jail). Most of
 * his applicants are in the Philippines. So the application asks only
 * whether they are old enough to be hired; the exact date comes after the
 * hire, from the ID the business asks for ("Ask for ID or papers").
 *
 * It is built in, never stored in a job's own questions: every job on every
 * business starts with it, and no job's list changes. Its answer is saved
 * with the others in notes.applicationAnswers (questionId AGE_QUESTION_ID),
 * so "At a glance" and the application's record show it like any question.
 * The database refuses to send on an application that answered "No"
 * (applications_refuse_under_18), so everyone Ava ever scores answered
 * "Yes": the answer tells her nothing and nothing scores it. Never ask for
 * a birth date or an age here.
 */

export const AGE_QUESTION_ID = "age_18_plus";

export const AGE_QUESTION = {
  id: AGE_QUESTION_ID,
  question: "Are you 18 or older?",
  type: "select",
  required: true,
  options: ["Yes", "No"],
  /** The short name on the applicant's page ("At a glance"). */
  label: "18 or older",
  /** A "No" can only be there if the form was gone around; say so plainly. */
  flag_options: ["No"],
  flag_label: "Under 18",
} as const;

/** What an applicant who answers "No" reads, in place of the rest of the form. */
export const UNDER_AGE_MESSAGE =
  "Thanks for your interest. This job is open to people 18 and over, so we can't take your application.";

/** The job's own questions with the age question first (once, whatever the job holds). */
export function withAgeQuestion<Q extends { id?: unknown }>(questions: readonly Q[] | null | undefined): Array<Q | typeof AGE_QUESTION> {
  const own = Array.isArray(questions) ? questions.filter((q) => q?.id !== AGE_QUESTION_ID) : [];
  return [AGE_QUESTION, ...own];
}

/** True only for an answer of "No". */
export function isUnderAgeAnswer(answer: unknown): boolean {
  return typeof answer === "string" && answer.trim().toLowerCase() === "no";
}

/** The age answer stored in notes.applicationAnswers: "Yes", "No", or null
 *  when there is none (everyone who applied before 2026-10-11). */
export function storedAgeAnswer(applicationAnswers: unknown): "Yes" | "No" | null {
  if (!Array.isArray(applicationAnswers)) return null;
  for (const entry of applicationAnswers) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { questionId?: unknown; answer?: unknown };
    if (row.questionId !== AGE_QUESTION_ID || typeof row.answer !== "string") continue;
    const answer = row.answer.trim().toLowerCase();
    if (answer === "yes") return "Yes";
    if (answer === "no") return "No";
  }
  return null;
}

