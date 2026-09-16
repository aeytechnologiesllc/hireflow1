#!/usr/bin/env node
/**
 * Local test runner for the interview-email-honesty fix — plain assertions,
 * no framework.
 *
 * Exercises the real mapEmailStatus() from src/utils/emailStatus.ts (Node
 * 24+ strips the type annotations natively, no build step) against every
 * shape send-notification-email/index.ts actually returns:
 *   - {success:false, skipped:true, reason} (RESEND_API_KEY unset — the live state)
 *   - {message: "...disabled", ...} (globally or per-type opted out)
 *   - {success:true, emailResponse, recipient} (Resend actually accepted it)
 *   - an invoke-level error (network failure, thrown exception, 404/500 status)
 * and checks the InterviewSchedulingWizard success-copy decision
 * (`candidateEmail && status === "sent"`) only fires for the one shape that
 * is actually true.
 *
 * Run with: node scripts/email_status.test.mjs
 */
import { mapEmailStatus } from "../src/utils/emailStatus.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("mapEmailStatus over every send-notification-email response shape:\n");

// RESEND_API_KEY unset — the live state as of 2026-09.
check(
  "RESEND unset -> 'skipped', not 'sent'",
  mapEmailStatus({ success: false, skipped: true, reason: "Email service not configured" }, null) === "skipped"
);

// User turned all email notifications off.
check(
  "notifications globally disabled -> 'skipped'",
  mapEmailStatus({ message: "Email notifications disabled", email: "a@b.com" }, null) === "skipped"
);

// User turned this specific type off.
check(
  "this notification type disabled -> 'skipped'",
  mapEmailStatus({ message: "interview_scheduled notifications disabled", preference: "email_interview_reminders" }, null) === "skipped"
);

// Resend actually accepted the send.
check(
  "success:true -> 'sent'",
  mapEmailStatus({ success: true, emailResponse: { id: "abc" }, recipient: "a@b.com" }, null) === "sent"
);

// An invoke-level error (network failure, non-2xx status, thrown exception).
check(
  "invoke error -> 'failed', even if a body came back",
  mapEmailStatus({ success: false }, new Error("network down")) === "failed"
);
check(
  "invoke error takes precedence over any success-looking body",
  mapEmailStatus({ success: true }, { message: "non-2xx status code" }) === "failed"
);

// No body at all (e.g. the invoke call threw before parsing a response).
check("no response body, no error -> 'skipped', not 'sent'", mapEmailStatus(null, null) === "skipped");
check("undefined response body -> 'skipped'", mapEmailStatus(undefined, null) === "skipped");

console.log("\nWizard success-screen copy decision (candidateEmail && status === 'sent'):\n");

function showsSentCopy(candidateEmail, status) {
  return Boolean(candidateEmail && status === "sent");
}

check(
  "RESEND unset: wizard must NOT claim the email was sent",
  showsSentCopy("candidate@example.com", mapEmailStatus({ success: false, skipped: true }, null)) === false,
  "this was the bug — the old code showed \"Email sent to <email>\" unconditionally"
);
check(
  "Resend actually sent it: wizard shows the sent copy",
  showsSentCopy("candidate@example.com", mapEmailStatus({ success: true }, null)) === true
);
check(
  "send failed outright: wizard must NOT claim it was sent",
  showsSentCopy("candidate@example.com", mapEmailStatus(null, new Error("boom"))) === false
);
check(
  "no candidate email on file: never shows the sent copy even if status were 'sent'",
  showsSentCopy(undefined, "sent") === false
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
