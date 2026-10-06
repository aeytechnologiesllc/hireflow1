#!/usr/bin/env node
/**
 * The application form's phone field (src/lib/phoneNumber.ts), and its
 * wiring in src/pages/ApplicationFormPhase.tsx.
 *
 * The talent review, 2026-10-06: the field assumed a US number. The code
 * was saved only when the applicant changed the selector (which showed
 * "+1"), and the formatter kept 10 digits, so "0917 123 4567" was saved as
 * "091-712-3456" and "+63 917 123 4567" as "639-171-2345". Both live
 * applications on the team-leader job had phones stored with no code.
 *
 * src/lib/phoneNumber.ts has no imports, so Node loads it as it ships.
 *
 *   node scripts/phone_number.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = await import(pathToFileURL(path.join(ROOT, "src/lib/phoneNumber.ts")).href);

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
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

// A few real codes, including the +1 area codes the selector also lists.
const KNOWN = ["+1", "+1242", "+1684", "+63", "+44", "+39", "+91", "+234", "+971"];

/** Type each character into the field, the way onChange sees it. */
function typeInto(text, code, known = KNOWN) {
  let value = "";
  let shown = code;
  for (const ch of text) {
    const cleaned = P.cleanPhoneInput(value + ch, shown, known);
    value = cleaned.display;
    shown = cleaned.code;
  }
  return { code: shown, display: value, saved: P.phoneAnswer(shown, value) };
}

console.log("\nThe code shown before they pick one:\n");
eq("Asia/Manila → +63", P.guessDialCode({ timeZone: "Asia/Manila", languages: ["en-US"] }), "+63");
eq("en-PH → +63", P.guessDialCode({ timeZone: "UTC", languages: ["en-PH"] }), "+63");
eq("fil → +63", P.guessDialCode({ timeZone: null, languages: ["fil"] }), "+63");
eq("tl_PH (underscore) → +63", P.guessDialCode({ languages: ["tl_PH"] }), "+63");
eq("America/New_York, en-US → +1", P.guessDialCode({ timeZone: "America/New_York", languages: ["en-US", "en"] }), "+1");
eq("nothing known → +1", P.guessDialCode(null), "+1");
eq("en-GB in London → +1 (only the Philippines is guessed)", P.guessDialCode({ timeZone: "Europe/London", languages: ["en-GB"] }), "+1");

console.log("\nThe review's two numbers, typed into a +63 field:\n");
{
  const local = typeInto("0917 123 4567", "+63");
  eq("'0917 123 4567' shows as they write it", local.display, "0917 123 4567");
  eq("…and is saved with the code, without the national 0", local.saved, "+63 917 123 4567");
  const intl = typeInto("+63 917 123 4567", "+63");
  eq("'+63 917 123 4567' typed key by key is saved once, with one code", intl.saved, "+63 917 123 4567");
  const pasted = P.cleanPhoneInput("+63 917 123 4567", "+63", KNOWN);
  eq("…and pasted whole shows without the typed code", pasted.display, "917 123 4567");
  eq("'639171234567' pasted without the plus loses the copy of the code", P.phoneAnswer("+63", P.cleanPhoneInput("639171234567", "+63", KNOWN).display), "+63 917 123 4567");
  eq("'0063 917 123 4567' (00 for international)", P.phoneAnswer("+63", P.cleanPhoneInput("0063 917 123 4567", "+63", KNOWN).display), "+63 917 123 4567");
  eq("'09171234567' with no spaces", P.phoneAnswer("+63", P.cleanPhoneInput("09171234567", "+63", KNOWN).display), "+63 917 123 4567");
  eq("a Manila landline '(02) 8123 4567'", P.phoneAnswer("+63", P.cleanPhoneInput("(02) 8123 4567", "+63", KNOWN).display), "+63 281 234 567");
  eq("an Iligan landline '063 221 1234' keeps its area code 63", P.phoneAnswer("+63", P.cleanPhoneInput("063 221 1234", "+63", KNOWN).display), "+63 632 211 234");
}

console.log("\n+1 keeps its format and its ten digits:\n");
eq("typed '5551234567'", P.cleanPhoneInput("5551234567", "+1").display, "555-123-4567");
eq("saved '+1 555-123-4567'", P.phoneAnswer("+1", "555-123-4567"), "+1 555-123-4567");
eq("pasted '+1 555-123-4567' does not shift every digit", P.cleanPhoneInput("+1 555-123-4567", "+1", KNOWN).display, "555-123-4567");
eq("'1 (555) 123-4567' drops the 1", P.cleanPhoneInput("1 (555) 123-4567", "+1", KNOWN).display, "555-123-4567");
eq("an eleventh digit is not kept", P.cleanPhoneInput("555-123-45678", "+1").display, "555-123-4567");
eq("typed key by key", typeInto("5551234567", "+1").saved, "+1 555-123-4567");

console.log("\nOther countries, up to 15 digits in all:\n");
{
  const long = P.cleanPhoneInput("1234567890123456789", "+63", KNOWN);
  const digits = (P.dialDigits("+63") + long.display.replace(/\D/g, "")).length;
  eq("+63 keeps 13 digits after the code (15 in all)", digits, 15);
  eq("+971 keeps 12 after the code", P.cleanPhoneInput("1234567890123456789", "+971", KNOWN).display.replace(/\D/g, "").length, 12);
  eq("a UK mobile '07911 123456'", P.phoneAnswer("+44", P.cleanPhoneInput("07911 123456", "+44", KNOWN).display), "+44 791 112 3456");
  eq("Italy keeps its 0 ('06 1234 5678')", P.phoneAnswer("+39", P.cleanPhoneInput("06 1234 5678", "+39", KNOWN).display), "+39 061 234 5678");
}

console.log("\nA pasted number for another country moves the selector:\n");
{
  const uk = P.cleanPhoneInput("+44 7911 123456", "+63", KNOWN);
  eq("+44 pasted into a +63 field → +44", uk.code, "+44");
  eq("…with the number, not the code", uk.display, "791 112 3456");
  const us = P.cleanPhoneInput("+1 555 123 4567", "+63", KNOWN);
  eq("+1 pasted into a +63 field → +1", us.code, "+1");
  eq("…formatted as +1", us.display, "555-123-4567");
  const bahamas = P.cleanPhoneInput("+1 242 555 1234", "+63", KNOWN);
  eq("the longest known code wins (+1242)", bahamas.code, "+1242");
  // A Manila applicant whose browser guessed +1, typing the number key by key.
  const typed = typeInto("+63 917 123 4567", "+1");
  eq("'+63 917 123 4567' typed key by key into a +1 field → +63", typed.code, "+63");
  eq("…saved as the right number, not '639-171-2345'", typed.saved, "+63 917 123 4567");
  eq("the plus stays while the code is still being typed", P.cleanPhoneInput("+63 91", "+1", KNOWN).display, "+6391");
  eq("a number left part-way through its code is saved as typed, with no second code", P.phoneAnswer("+1", "+6391"), "+6391");
}

console.log("\nSwitching the country re-reads what was typed:\n");
eq("'917-123-4567' typed under +1, then +63", P.cleanPhoneInput("917-123-4567", "+63").display, "917 123 4567");
eq("'917 123 4567' typed under +63, then +1", P.cleanPhoneInput("917 123 4567", "+1").display, "917-123-4567");

console.log("\nNothing typed is nothing saved:\n");
eq("empty", P.phoneAnswer("+63", ""), "");
eq("only the national 0", P.phoneAnswer("+63", "0"), "");

console.log("\nA number saved on a profile, split for the form:\n");
{
  const spaced = P.splitStoredPhone("+63 917 123 4567", "+1", KNOWN);
  eq("'+63 917 123 4567' → +63", spaced.code, "+63");
  eq("…'917 123 4567'", spaced.display, "917 123 4567");
  const compact = P.splitStoredPhone("+639171234567", "+1", KNOWN);
  eq("'+639171234567' (no space) → +63, not a code of 13 digits", compact.code, "+63");
  eq("…'917 123 4567'", compact.display, "917 123 4567");
  const national = P.splitStoredPhone("555-123-4567", "+1", KNOWN);
  eq("'555-123-4567' keeps the fallback code", national.code, "+1");
}

console.log("\nPlaceholders say the country's own form:\n");
eq("+1", P.phonePlaceholder("+1"), "123-456-7890");
eq("+63", P.phonePlaceholder("+63"), "0917 123 4567");
eq("other", P.phonePlaceholder("+44"), "Your phone number");

console.log("\nThe form's wiring, from its source:\n");
{
  const src = await readFile(path.join(ROOT, "src/pages/ApplicationFormPhase.tsx"), "utf8");
  check("the old ten-digit formatter is gone", !/const formatPhoneNumber\b/.test(src) && !/formatPhoneNumber\(/.test(src));
  check("the default code comes from the browser", /guessDialCode\(browserLocaleHints\(\)\)/.test(src));
  check("the selector shows the same code that is saved", /value=\{dialCodeFor\(question\.id\)\}/.test(src) && /phoneAnswer\(dialCodeFor\(q\.id\), answers\[q\.id\]\)/.test(src));
  check("the field cleans with the known codes", /cleanPhoneInput\(e\.target\.value, dialCodeFor\(question\.id\), KNOWN_DIAL_CODES\)/.test(src));
  check("the draft carries the shown code too", /phoneCountryCodes: draftPhoneCodes/.test(src));
  check("the placeholder follows the code", /placeholder=\{phonePlaceholder\(dialCodeFor\(question\.id\)\)\}/.test(src));
  check("the field is still allowed a paste", /<div className="flex gap-2" data-allow-paste="">/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
