#!/usr/bin/env node
/**
 * "Confirm your email" (src/lib/emailCheck.ts; docs/LAUNCH-PLAN.md, Phase 2,
 * task 4): how the screen reads every answer, and its words.
 *
 * Run with: node scripts/email_check_screen.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(path.join(ROOT, "src/lib/emailCheck.ts"));
const server = await import(path.join(ROOT, "supabase/functions/_shared/businessEmailCode.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("\nThe database's refusal\n");
check("the HINT is enough", E.isEmailNotVerifiedError({ hint: "email_not_verified", message: "x" }));
check("so is the message alone (the Ava publish path keeps only the message)", E.isEmailNotVerifiedError(new Error("Confirm your email to put this job live: press Publish in the job editor and we'll send a code to your sign-in address.")));
check("the database's own wording (its latest version) is what the page looks for", readFileSync(path.join(ROOT, "supabase/migrations/20261025130000_business_email_check_hardening.sql"), "utf8").includes("Confirm your email to put this job live:"));
check("another refusal is not this one", !E.isEmailNotVerifiedError({ hint: "business_suspended", message: "Your business is paused" }) && !E.isEmailNotVerifiedError(null) && !E.isEmailNotVerifiedError("Confirm"));
check("the page and the function name the same kind", E.BUSINESS_EMAIL_CODE_TYPE === server.BUSINESS_EMAIL_CODE_TYPE);

console.log("\nSending the code\n");
check("sent", E.sendCodeOutcome(200, { success: true }).kind === "sent");
check("already confirmed counts as done", E.sendCodeOutcome(200, { error: "x", code: "already_verified" }).kind === "already");
const wait = E.sendCodeOutcome(429, { error: "A code is on its way. You can ask for another in 42 seconds.", code: "too_soon", retryAfter: 42 });
check("too soon: wait, with the function's words and the seconds", wait.kind === "wait" && wait.seconds === 42 && /42 seconds/.test(wait.message));
check("signed out says so", E.sendCodeOutcome(401, { error: "Your sign-in has ended. Sign in again to get a code." }).kind === "signed_out");
check("no answer at all: try again, never a blank", E.sendCodeOutcome(null, null).kind === "failed" && /Try again/.test(E.sendCodeOutcome(null, null).message));
check("a 502 keeps the function's own words", E.sendCodeOutcome(502, { error: "We couldn't send a code just now. Try again in a minute." }).message.startsWith("We couldn't send"));
// Every refusal the function can give reads as something on the page.
for (const reason of ["not_signed_in", "already_verified", "too_soon", "too_many", "made_up"]) {
  const r = server.readIssuedCode({ ok: false, reason, retry_after: 30 });
  const page = E.sendCodeOutcome(r.status, { error: r.error, code: r.code, retryAfter: r.retryAfter });
  check(`the function's "${reason}" reads on the page`, ["already", "wait", "signed_out", "failed"].includes(page.kind) && (page.kind === "already" || page.message.length > 0), JSON.stringify(page));
}

console.log("\nChecking the code\n");
check("confirmed", E.verifyOutcome({ ok: true }).kind === "confirmed" && E.verifyOutcome({ ok: true, already: true }).kind === "confirmed");
check("wrong, with the tries left", E.verifyOutcome({ ok: false, reason: "wrong_code", tries_left: 3 }).message === "That code isn't right. 3 tries left.");
check("…one try left reads right", E.verifyOutcome({ ok: false, reason: "wrong_code", tries_left: 1 }).message === "That code isn't right. 1 try left.");
check("expired: send a new one", E.verifyOutcome({ ok: false, reason: "expired" }).kind === "expired" && /Send a new one/.test(E.verifyOutcome({ ok: false, reason: "expired" }).message));
check("no code yet: send one first", /Send a code first/.test(E.verifyOutcome({ ok: false, reason: "no_code" }).message));
check("five wrong tries: 'used up', not 'expired'", /used up/.test(E.verifyOutcome({ ok: false, reason: "used_up" }).message) && E.verifyOutcome({ ok: false, reason: "used_up" }).kind === "expired");
check("the address changed since the code was sent: says so", /sign-in email changed/.test(E.verifyOutcome({ ok: false, reason: "address_changed" }).message));
check("anything else: try again", E.verifyOutcome(null).kind === "failed" && E.verifyOutcome({ ok: false, reason: "no_profile" }).kind === "failed");
check("six digits from whatever was pasted", E.cleanCode(" 04 29-17x9") === "042917" && E.cleanCode("") === "");

console.log("\nThe words\n");
const W = E.EMAIL_CHECK_WORDS;
check("names the address when it is known", W.intro("dana@clinic.test").includes("dana@clinic.test") && /only do it once/.test(W.intro(null)));
check("says how long the code lasts", /15 minutes/.test(W.sent("x@y.test")));
check("the button says what happens next", W.confirm === "Confirm and publish");
check("a long wait to resend is said in minutes, not thousands of seconds", W.resendIn(3412) === "Send a new code in 57 min" && W.resendIn(42) === "Send a new code in 42s");
check("…and a day-long wait is 'tomorrow'", W.resendIn(86400) === "Send a new code tomorrow");
check("a wrong address is never a dead end: Help is offered", /Help/.test(W.wrongAddress));
const dialog = readFileSync(path.join(ROOT, "src/components/business/EmailCheckDialog.tsx"), "utf8");
check("pasting '042 917' is not cut short by a 6-character limit before the digits are kept", !/maxLength=\{6\}/.test(dialog) && /cleanCode\(e\.target\.value\)/.test(dialog));
check("the screen links to Help for a wrong address", /<Link to="\/help"/.test(dialog) && /W\.wrongAddress/.test(dialog));
check("a team member is told who can do it", /account owner needs to confirm their email/.test(E.OWNER_MUST_CONFIRM_EMAIL));
check("no player, Zulu or sweepstakes wording", !/player|zulu|sweepstake/i.test(JSON.stringify({ W: Object.values(W).map((v) => (typeof v === "function" ? v("a@b.test", 5) : v)), o: E.OWNER_MUST_CONFIRM_EMAIL })));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
