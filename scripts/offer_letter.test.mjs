/**
 * The plain offer letter (src/cockpit/lib/offerLetter.ts; docs/OFFER-LETTER.md).
 *
 * The letter is written by a rule from what the owner typed or chose on the
 * screen (2026-10-10: the parts a small remote team's offer usually has). This checks the
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
  signerTitle: "Owner",
  payAmount: "500",
  payCurrency: "USD",
  payPer: "month",
  payEvery: "twice-monthly",
  payMethod: "Wise or bank transfer",
  workerType: "contractor",
  schedule: "full",
  hours: "40 hours a week, 5 days a week",
  shift: "3:00 AM to 11:00 AM Philippine time",
  remote: true,
  reportsTo: "",
  trialDays: 30,
  noticeDays: 14,
  ownEquipment: true,
  privateInfo: true,
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

// --- pay ---------------------------------------------------------------------------
eq("the job's pay, in words", lib.payFromJob({ salary_min: 500, salary_max: 500, salary_currency: "USD", salary_period: "MONTH" }), "USD 500 a month");
eq("thousands are grouped", lib.payFromJob({ salary_min: 28000, salary_max: null, salary_currency: "php", salary_period: "month" }), "PHP 28,000 a month");
eq("a range is not an offer: he types the figure", lib.payFromJob({ salary_min: 400, salary_max: 600, salary_currency: "USD", salary_period: "MONTH" }), "");
eq("no pay on the job, nothing filled in", lib.payFromJob({ salary_min: null, salary_max: null }), "");
eq("a period it does not know is not guessed", lib.payFromJob({ salary_min: 500, salary_max: 500, salary_currency: "USD", salary_period: "FORTNIGHT" }), "");
eq("no job, no pay", lib.payFromJob(null), "");
eq("the job's pay fills the screen's three boxes", JSON.stringify(lib.payPartsFromJob({ salary_min: 28000, salary_max: 28000, salary_currency: "php", salary_period: "MONTH" })), JSON.stringify({ payAmount: "28,000", payCurrency: "PHP", payPer: "month" }));
eq("a yearly figure is left for him to type a month", lib.payPartsFromJob({ salary_min: 6000, salary_max: 6000, salary_currency: "USD", salary_period: "YEAR" }), null);
eq("the pay in words", lib.payWords(base), "USD 500 a month");
eq("an amount typed with a comma", lib.payWords({ ...base, payAmount: "28,000", payCurrency: "php" }), "PHP 28,000 a month");
eq("an hourly rate keeps its cents", lib.payWords({ ...base, payAmount: "4.5", payPer: "hour" }), "USD 4.50 an hour");
eq("words in the amount are not a number", lib.payWords({ ...base, payAmount: "five hundred" }), "");
eq("a name typed in small letters signs with a capital", lib.nameCase("zack"), "Zack");
eq("a name typed with capitals is kept as typed", lib.nameCase("McKenzie de la Cruz"), "McKenzie de la Cruz");

// --- the letter ----------------------------------------------------------------
// 2026-10-10, the owner: "the offer letter feels incomplete ... make it more legit ... don't overcomplicate it".
const letter = lib.offerLetterText(base);
const want = [
  "Zulu Support Team\nFriday, October 9, 2026",
  "Dear Ana,",
  "We are happy to offer you the position of Chat Support Team Leader (Zulu Royal & Zulu Rush) with Zulu Support Team. Thank you for the time you put into your application, the tests and the interview. We would love to have you on the team.",
  "THE ROLE\nPosition: Chat Support Team Leader (Zulu Royal & Zulu Rush)\nStart date: Monday, October 19, 2026\nType: Full-time, independent contractor\nWhere: Remote, working from home\nHours: 40 hours a week, 5 days a week\nShift: 3:00 AM to 11:00 AM Philippine time",
  "PAY\nUSD 500 a month, paid twice a month, by Wise or bank transfer.",
  "TRIAL PERIOD\nYour first 30 days are a trial period. During this time either of us can end the arrangement at any time.",
  "GOOD TO KNOW\n- You will work from your own computer, with a stable internet connection.\n- Your hours may change as the team's needs change. We will always tell you ahead of time.\n- Please keep company and customer information private, during and after your time with us.\n- As an independent contractor, you are responsible for your own taxes.\n- After the trial period, either of us can end this arrangement with 14 days' notice.",
  "TO ACCEPT\nSign this letter on or before Friday, October 16, 2026. After that day, the offer expires.\nIf anything here is different from what we talked about, message me before you sign.",
  "We are looking forward to working with you.",
  "Sincerely,\nZack\nOwner, Zulu Support Team",
].join("\n\n");
eq("the whole letter, word for word", letter, want);
check("the company name he types is the one on the letter", lib.offerLetterText({ ...base, companyName: "AEY Technologies LLC" }).startsWith("AEY Technologies LLC\n") && lib.offerLetterText({ ...base, companyName: "AEY Technologies LLC" }).includes("with AEY Technologies LLC."));
check("no hours typed, no hours line", !lib.offerLetterText({ ...base, hours: "" }).includes("Hours:"));
check("no hours or shift, no line saying they may change", !lib.offerLetterText({ ...base, hours: "", shift: "" }).includes("hours may change"));
check("no shift typed, no shift line", !lib.offerLetterText({ ...base, shift: "  " }).includes("Shift:"));
check("no trial period chosen, no trial section, and the notice applies from the start", (() => { const t = lib.offerLetterText({ ...base, trialDays: 0 }); return !t.includes("TRIAL PERIOD") && t.includes("- Either of us can end this arrangement with 14 days' notice."); })());
check("an employee is not told about contractor taxes", (() => { const t = lib.offerLetterText({ ...base, workerType: "employee" }); return t.includes("Type: Full-time, employee") && !t.includes("contractor"); })());
check("part-time reads as part-time", lib.offerLetterText({ ...base, schedule: "part" }).includes("Type: Part-time, independent contractor"));
check("not remote, no remote line", !lib.offerLetterText({ ...base, remote: false }).includes("Where:"));
check("their own computer and keeping things private are only there when chosen", (() => { const t = lib.offerLetterText({ ...base, ownEquipment: false, privateInfo: false }); return !t.includes("own computer") && !t.includes("private"); })());
check("who they report to, when he says", lib.offerLetterText({ ...base, reportsTo: "Zack, Owner" }).includes("Reports to: Zack, Owner"));
check("how they are paid is left out when he leaves it out", lib.offerLetterText({ ...base, payEvery: "", payMethod: "" }).includes("PAY\nUSD 500 a month."));
check("no title, the sign-off is name and company", lib.offerLetterText({ ...base, signerTitle: "" }).endsWith("Sincerely,\nZack\nZulu Support Team"));
check("his extra lines go in as he typed them, after the usual terms and before how to accept", (() => {
  const text = lib.offerLetterText({ ...base, extra: "A bonus of USD 50 after the trial.\n\n\n\nMessage Kim on your first day." });
  const at = text.indexOf("A bonus of USD 50 after the trial.\n\nMessage Kim on your first day.");
  return at > text.indexOf("GOOD TO KNOW") && at < text.indexOf("TO ACCEPT");
})());
for (const word of ["at-will", "at will", "salary", "benefits", "terminate", "law", "legal", "binding", "guarantee"]) {
  check(`the letter uses plain words, not "${word}"`, !letter.toLowerCase().includes(word));
}
check("no placeholder is ever printed", !/\[|\]|undefined|null|NaN/.test(letter) && !/\[|\]|undefined|null|NaN/.test(lib.offerLetterText({ ...base, hours: "", shift: "", extra: "", payEvery: "", payMethod: "", signerTitle: "", trialDays: 0 })));
eq("the usual terms in one line", lib.termsSummary(base), "Independent contractor · 30 days trial · 14 days' notice to end · Own computer and internet · Keeps information private");
eq("a two-week trial is said in weeks", lib.periodWords(14), "2 weeks");
eq("the document is named for the person", lib.offerLetterName(base), "Offer letter - Ana Maria Reyes");
eq("with no name yet it is still named", lib.offerLetterName({ ...base, applicantName: " " }), "Offer letter");
check("a trial or notice length that is not one of the choices is not printed", (() => { const t = lib.offerLetterText({ ...base, trialDays: 45, noticeDays: 3 }); return !t.includes("45") && t.includes("14 days' notice"); })());

// --- nothing half-filled goes out ------------------------------------------------
eq("a full letter has nothing stopping it", lib.offerProblems(base).length, 0);
const stops = (change) => lib.offerProblems({ ...base, ...change }).map((p) => p.field).join(",");
eq("no pay stops it (the old screens let this through)", stops({ payAmount: "" }), "payAmount");
check("pay that is not a number says so", lib.offerProblems({ ...base, payAmount: "five hundred" })[0].text === "Write the pay as a number, like 500.");
eq("no start date stops it (the old screens let this through)", stops({ startDate: "" }), "startDate");
eq("a start date in the past stops it", stops({ startDate: "2026-10-01", replyBy: "2026-10-09" }), "startDate");
eq("no reply-by day stops it", stops({ replyBy: "" }), "replyBy");
eq("an offer that has already ended stops it", stops({ replyBy: "2026-10-08" }), "replyBy");
eq("signing after the start date stops it", stops({ replyBy: "2026-10-20" }), "replyBy");
eq("signing on the start date itself is fine", stops({ replyBy: "2026-10-19" }), "");
eq("nobody chosen stops it", stops({ applicantName: "" }), "applicantName");
eq("no job title stops it", stops({ roleTitle: "" }), "roleTitle");
eq("no company stops it", stops({ companyName: "" }), "companyName");
eq("no name to sign with stops it", stops({ signerName: "" }), "signerName");
eq("everything optional is his to leave out", stops({ hours: "", shift: "", payMethod: "", payEvery: "", reportsTo: "", signerTitle: "", extra: "" }), "");
check("every problem is a sentence he can act on", lib.offerProblems({ ...base, payAmount: "", startDate: "", replyBy: "", applicantName: "" }).every((p) => /^[A-Z].*\.$/.test(p.text) && p.text.length < 120));

// --- characters the signed PDF can print -------------------------------------------
eq("typographic quotes and dashes become plain ones", lib.letterSafe("We\u2019re \u201Cpleased\u201D \u2014 truly\u2026"), "We're \"pleased\" - truly...");
eq("Western European letters stay", lib.letterSafe("Tom\u00E1s Nu\u00F1ez"), "Tom\u00E1s Nu\u00F1ez");
eq("an accent the font lacks comes off its letter", lib.letterSafe("Ond\u0159ej Nov\u00E1k"), "Ondrej Nov\u00E1k");
eq("odd spaces are spaces, invisible characters go", lib.letterSafe("a\u00A0b\u200Bc\u2028d"), "a bcd");
check("a name in another script is reported, not sent as nothing", lib.unprintable("\u0623\u062D\u0645\u062F") && stops({ applicantName: "\u0623\u062D\u0645\u062F Khan" }) === "applicantName");
check("a peso sign typed into how they are paid is reported", lib.unprintable("\u20B1 cash") && stops({ payMethod: "\u20B1 cash" }) === "payMethod");
check("plain text is never reported", !lib.unprintable("USD 500 a month - paid on the 5th (\u00A3, \u00E9 and \u00F1 are fine)"));
check("an ellipsis does not hide a lost letter beside it", lib.unprintable("\u2026\u4E2D"));
const printable = (text) => [...text].every((c) => c === "\n" || (c >= " " && c <= "~") || (c >= "\u00A1" && c <= "\u00FF"));
check("every character of a letter typed with curly quotes, long dashes and an accented name can be printed", printable(lib.offerLetterText({ ...base, applicantName: "Ond\u0159ej \u201CAndy\u201D Nov\u00E1k", extra: "You\u2019ll lead six agents \u2014 from day one\u2026", payMethod: "Wise\u00A0transfer" })));

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
