/**
 * The plain offer letter (src/cockpit/lib/offerLetter.ts; docs/OFFER-LETTER.md).
 *
 * The letter is written by a rule from what the owner typed. This checks the
 * words, that nothing can be sent half-filled, that it can always be saved
 * (the old screens could not save a curly apostrophe), and that every
 * character in it is one the signed PDF can print.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "offer-letter-"));
const outfile = resolve(dir, "offerLetter.mjs");
await build({ entryPoints: [resolve(root, "src/cockpit/lib/offerLetter.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const lib = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}
const eq = (name, got, want) => check(name, got === want, `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

const base = {
  applicantName: "Ana Maria Reyes",
  roleTitle: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  companyName: "Zulu Support Team",
  signerName: "Zack",
  pay: "USD 500 a month",
  hours: "40 hours a week, 5 days a week",
  shift: "3:00 AM to 11:00 AM Philippine time",
  startDate: "2026-10-19",
  replyBy: "2026-10-16",
  extra: "",
  today: "2026-10-09",
};

// --- dates -------------------------------------------------------------------
eq("a long date names the weekday and the month", lib.longDate("2026-10-19"), "Monday, October 19, 2026");
eq("a date that is not a real day is no date", lib.longDate("2026-02-30"), "");
eq("days are added across a month end", lib.addDays("2026-10-29", 5), "2026-11-03");
eq("the local day of a moment", lib.dayOf(new Date(2026, 9, 9, 23, 30)), "2026-10-09");
check("the offer ends at the end of the reply-by day, his time", (() => { const d = lib.offerExpiry("2026-10-16"); return d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 16 && d.getHours() === 23 && d.getMinutes() === 59; })());
eq("no reply-by day, no expiry", lib.offerExpiry("soon"), null);

// --- pay from the job ----------------------------------------------------------
eq("the job's pay, in words", lib.payFromJob({ salary_min: 500, salary_max: 500, salary_currency: "USD", salary_period: "MONTH" }), "USD 500 a month");
eq("thousands are grouped", lib.payFromJob({ salary_min: 28000, salary_max: null, salary_currency: "php", salary_period: "month" }), "PHP 28,000 a month");
eq("a range is not an offer: he types the figure", lib.payFromJob({ salary_min: 400, salary_max: 600, salary_currency: "USD", salary_period: "MONTH" }), "");
eq("no pay on the job, nothing filled in", lib.payFromJob({ salary_min: null, salary_max: null }), "");
eq("a period it does not know is not guessed", lib.payFromJob({ salary_min: 500, salary_max: 500, salary_currency: "USD", salary_period: "FORTNIGHT" }), "");
eq("no job, no pay", lib.payFromJob(null), "");

// --- the letter ----------------------------------------------------------------
const letter = lib.offerLetterText(base);
const want = [
  "Zulu Support Team\nFriday, October 9, 2026",
  "Dear Ana,",
  "We would like to offer you the role of Chat Support Team Leader (Zulu Royal & Zulu Rush) with Zulu Support Team. Thank you for the time you gave to the application and the interview.",
  "THE OFFER\nRole: Chat Support Team Leader (Zulu Royal & Zulu Rush)\nPay: USD 500 a month\nHours: 40 hours a week, 5 days a week\nShift: 3:00 AM to 11:00 AM Philippine time\nStart date: Monday, October 19, 2026",
  "To accept, sign this letter on or before Friday, October 16, 2026. After that day the offer ends.",
  "If anything here is different from what we talked about, message me before you sign.",
  "Zack\nZulu Support Team",
].join("\n\n");
eq("the whole letter, word for word", letter, want);
check("no hours typed, no hours line", !lib.offerLetterText({ ...base, hours: "" }).includes("Hours:"));
check("no shift typed, no shift line", !lib.offerLetterText({ ...base, shift: "  " }).includes("Shift:"));
check("his extra lines go in as he typed them, between the offer and how to accept", (() => {
  const text = lib.offerLetterText({ ...base, extra: "You will work with us as an independent contractor.\n\n\n\nYour first 30 days are a trial." });
  const at = text.indexOf("You will work with us as an independent contractor.\n\nYour first 30 days are a trial.");
  return at > text.indexOf("Start date:") && at < text.indexOf("To accept");
})());
for (const word of ["at-will", "at will", "salary", "benefits", "confidential", "terminate", "employee", "contractor", "law", "legal", "binding"]) {
  check(`the letter promises nothing he did not type: no "${word}"`, !letter.toLowerCase().includes(word));
}
check("no placeholder is ever printed", !/\[|\]|undefined|null|NaN/.test(letter) && !/\[|\]|undefined|null|NaN/.test(lib.offerLetterText({ ...base, hours: "", shift: "", extra: "" })));
eq("the document is named for the person", lib.offerLetterName(base), "Offer letter - Ana Maria Reyes");
eq("with no name yet it is still named", lib.offerLetterName({ ...base, applicantName: " " }), "Offer letter");

// --- nothing half-filled goes out ------------------------------------------------
eq("a full letter has nothing stopping it", lib.offerProblems(base).length, 0);
const stops = (change) => lib.offerProblems({ ...base, ...change }).map((p) => p.field).join(",");
eq("no pay stops it (the old screens let this through)", stops({ pay: "" }), "pay");
eq("no start date stops it (the old screens let this through)", stops({ startDate: "" }), "startDate");
eq("a start date in the past stops it", stops({ startDate: "2026-10-01", replyBy: "2026-10-09" }), "startDate");
eq("no reply-by day stops it", stops({ replyBy: "" }), "replyBy");
eq("an offer that has already ended stops it", stops({ replyBy: "2026-10-08" }), "replyBy");
eq("signing after the start date stops it", stops({ replyBy: "2026-10-20" }), "replyBy");
eq("signing on the start date itself is fine", stops({ replyBy: "2026-10-19" }), "");
eq("nobody chosen stops it", stops({ applicantName: "" }), "applicantName");
eq("no role stops it", stops({ roleTitle: "" }), "roleTitle");
eq("no company stops it", stops({ companyName: "" }), "companyName");
eq("no name to sign with stops it", stops({ signerName: "" }), "signerName");
eq("hours and shift are his to leave out", stops({ hours: "", shift: "" }), "");
check("every problem is a sentence he can act on", lib.offerProblems({ ...base, pay: "", startDate: "", replyBy: "", applicantName: "" }).every((p) => /^[A-Z].*\.$/.test(p.text) && p.text.length < 120));

// --- characters the signed PDF can print -------------------------------------------
eq("typographic quotes and dashes become plain ones", lib.letterSafe("We\u2019re \u201Cpleased\u201D \u2014 truly\u2026"), "We're \"pleased\" - truly...");
eq("Western European letters stay", lib.letterSafe("Tom\u00E1s Nu\u00F1ez"), "Tom\u00E1s Nu\u00F1ez");
eq("an accent the font lacks comes off its letter", lib.letterSafe("Ond\u0159ej Nov\u00E1k"), "Ondrej Nov\u00E1k");
eq("odd spaces are spaces, invisible characters go", lib.letterSafe("a\u00A0b\u200Bc\u2028d"), "a bcd");
check("a name in another script is reported, not sent as nothing", lib.unprintable("\u0623\u062D\u0645\u062F") && stops({ applicantName: "\u0623\u062D\u0645\u062F Khan" }) === "applicantName");
check("a peso sign is reported, with what to write instead", lib.unprintable("\u20B128,000 a month") && lib.offerProblems({ ...base, pay: "\u20B128,000 a month" })[0].text.includes("PHP"));
check("plain text is never reported", !lib.unprintable("USD 500 a month - paid on the 5th (\u00A3, \u00E9 and \u00F1 are fine)"));
check("an ellipsis does not hide a lost letter beside it", lib.unprintable("\u2026\u4E2D"));
const printable = (text) => [...text].every((c) => c === "\n" || (c >= " " && c <= "~") || (c >= "\u00A1" && c <= "\u00FF"));
check("every character of a letter typed with curly quotes, long dashes and an accented name can be printed", printable(lib.offerLetterText({ ...base, applicantName: "Ond\u0159ej \u201CAndy\u201D Nov\u00E1k", extra: "You\u2019ll lead six agents \u2014 from day one\u2026", pay: "USD\u00A0500 a month" })));

// --- it can always be saved ---------------------------------------------------------
const body = lib.offerDocumentBody({ ...base, extra: "You\u2019ll lead six agents \u2014 from day one." }, "ana@example.com");
const stored = lib.encodeDocumentBody(body);
check("the stored body is the shape the signing engine reads", stored.startsWith("data:application/json;base64,"));
const back = JSON.parse(atob(stored.split(",")[1]));
eq("the reader gets back exactly the letter", back.content, body.content);
eq("both signatures are asked for", back.signatureFields.map((f) => f.id).join(","), "recipient,employer");
eq("the pay and the start date are kept beside the letter", `${back.metadata.salary} | ${back.metadata.startDate}`, "USD 500 a month | Monday, October 19, 2026");
check("a body with a curly apostrophe, a long dash and a peso sign still saves (the old screens threw here)", (() => {
  try {
    const url = lib.encodeDocumentBody({ content: "We\u2019re pleased \u2014 \u20B128,000", name: "\u0141ukasz" });
    const read = JSON.parse(atob(url.split(",")[1]));
    return read.content === "We\u2019re pleased \u2014 \u20B128,000" && read.name === "\u0141ukasz";
  } catch {
    return false;
  }
})());
check("the old way really does throw on that text, so this guard means something", (() => { try { btoa(JSON.stringify({ content: "We\u2019re" })); return false; } catch { return true; } })());

// --- the words on the buttons ---------------------------------------------------------
eq("the first press names the person", lib.offerWords(base, false, false).arm, "Send to Ana");
eq("the second press says what it does", lib.offerWords(base, false, true).note, "This emails Ana the letter to sign, and moves them to Offer.");
eq("before that, nothing is sent", lib.offerWords(base, false, false).note, "Nothing is sent until you confirm.");

console.log(`offer letter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
