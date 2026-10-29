#!/usr/bin/env node
/**
 * The application form fills a question with the applicant's email address
 * or phone number only when the question asks for it (src/lib/formPrefill.ts).
 * The 2026-10-29 walk-through of a chat agent's job found "Tell us about the
 * chat or email support you've done" starting with the applicant's address
 * typed in: any question that mentioned "email" was filled with it, and any
 * that mentioned "phone" with their number.
 *
 * Run with: node scripts/form_prefill.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { asksForEmail, asksForPhone } = await import(path.join(ROOT, "src/lib/formPrefill.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ""}`);
  }
}

const EMAIL_FIELDS = ["Email", "Email address", "Your email", "Your email address", "E-mail", "What is your email?", "What's your email address?", "Contact email", "Preferred email address", "Please enter your email address", "Email *", "Email (we'll send updates here)"];
const NOT_EMAIL = [
  "Tell us about the chat or email support you've done: what kind of customers, and how many chats at once.",
  "How many emails can you answer in an hour?",
  "Describe an email you wrote to an upset customer.",
  "Have you used an email ticketing tool like Zendesk?",
  "Which do you prefer: chat or email support?",
];
const PHONE_FIELDS = ["Phone", "Phone number", "Mobile number", "Your mobile number", "Contact number", "Cell phone", "What is your phone number?", "WhatsApp number", "Viber number", "Mobile no.", "Telephone number"];
const NOT_PHONE = [
  "Have you handled phone support before?",
  "Describe a difficult phone call and how you handled it.",
  "How many phone calls a day did you take?",
  "Do you have a quiet place for phone calls?",
  "Are you comfortable with phone and chat?",
];

check("a question that asks for the email address is filled with it", EMAIL_FIELDS.every((q) => asksForEmail(q, "text")), EMAIL_FIELDS.filter((q) => !asksForEmail(q, "text")).join(" | "));
check("…and an email-type question whatever its words", asksForEmail("How should we reach you?", "email"));
check("a question that only mentions email is not (the walk-through's 'chat or email support')", NOT_EMAIL.every((q) => !asksForEmail(q, "textarea") && !asksForEmail(q, "text")), NOT_EMAIL.filter((q) => asksForEmail(q, "text")).join(" | "));
check("a question that asks for the phone number is filled with it", PHONE_FIELDS.every((q) => asksForPhone(q, "text")), PHONE_FIELDS.filter((q) => !asksForPhone(q, "text")).join(" | "));
check("…and a phone-type question whatever its words", asksForPhone("Best number to reach you", "phone"));
check("a question that only mentions phone is not ('Have you handled phone support?')", NOT_PHONE.every((q) => !asksForPhone(q, "text")), NOT_PHONE.filter((q) => asksForPhone(q, "text")).join(" | "));

const form = readFileSync(path.join(ROOT, "src/pages/ApplicationFormPhase.tsx"), "utf8");
check(
  "the form fills email and phone only through formPrefill (no bare includes('email') or includes('phone'))",
  /asksForEmail\(q\.question, normalizeQuestionType\(q\.type\)\) && profile\.email/.test(form) &&
    /asksForPhone\(q\.question, normalizeQuestionType\(q\.type\)\) && profile\.phone/.test(form) &&
    !/questionLower\.includes\("(email|phone)"\)/.test(form),
);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
