/**
 * Which application questions the form fills from the applicant's profile
 * with their email address or phone number (ApplicationFormPhase.tsx).
 *
 * Only a question that asks for the address or the number itself: one of
 * that type, or one whose words are the field's name ("Email", "Your email
 * address", "Mobile number", "What's your phone number?"). It used to be any
 * question that mentioned the word, and a chat and email agent's job asks
 * about exactly that: the 2026-10-29 walk-through found "Tell us about the
 * chat or email support you've done" starting with the applicant's address
 * typed in, and "Have you handled phone support?" would have started with
 * their number.
 *
 * Pure, no imports: scripts/form_prefill.test.mjs loads it in Node.
 */

const OPENER = String.raw`^(please\s+)?((enter|provide|share|give)\s+)?((what\s+is|what's)\s+)?((your|the\s+applicant's|a)\s+)?`;
const CLOSER = String.raw`(\s*\(.{0,40}\))?\s*[?:.*]*\s*$`;

const EMAIL_FIELD = new RegExp(`${OPENER}(personal\\s+|contact\\s+|preferred\\s+)?(e-?mail|email\\s+address|e-mail\\s+address)${CLOSER}`, "i");
const PHONE_FIELD = new RegExp(
  `${OPENER}(personal\\s+|contact\\s+|preferred\\s+)?((mobile|cell(ular)?|phone|telephone|contact|whatsapp|viber)(\\s+phone)?(\\s+number|\\s+no\\.?|\\s+#)?|phone)${CLOSER}`,
  "i",
);

export function asksForEmail(question: string, type: string): boolean {
  return type === "email" || EMAIL_FIELD.test(question.trim());
}

export function asksForPhone(question: string, type: string): boolean {
  return type === "phone" || PHONE_FIELD.test(question.trim());
}
