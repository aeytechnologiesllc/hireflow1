/**
 * offerLetter.ts: a plain offer letter, written by a rule and not by AI
 * (docs/OFFER-LETTER.md).
 *
 * The owner, 2026-10-09, with his first interview done: "do you think we
 * should send ... the offer letter through the portal or should we leave it?"
 * He chose the portal after a test run. The test run found the signing sound
 * and the writing wrong for him: the old screens asked for an "annual salary",
 * let pay and start date through empty, had an AI write a United States
 * office-job letter ("employment at-will") for a remote role paid by the
 * month, and could not save a letter at all once the AI had typed a curly
 * apostrophe or a long dash.
 *
 * So the letter is a fixed one, in words he would say aloud, built only from
 * what he typed: who, the role, the pay, the hours, the shift, the start
 * date, and the day the offer ends. Nothing is invented and nothing is
 * promised that he did not type. It is stored in the same shape the signing
 * engine already reads (a JSON body with `content`), so signing,
 * countersigning, the locked PDF and the audit trail are the engine's own,
 * unchanged.
 *
 * Pure: no React, no Supabase.
 */

export interface OfferLetterFields {
  /** The applicant's name as the letter will carry it. */
  applicantName: string;
  roleTitle: string;
  companyName: string;
  /** Who signs for the company. */
  signerName: string;
  /** In his words: "USD 500 a month". */
  pay: string;
  /** "40 hours a week, 5 days a week". Optional. */
  hours: string;
  /** "3:00 AM to 11:00 AM Philippine time". Optional. */
  shift: string;
  /** yyyy-mm-dd. */
  startDate: string;
  /** yyyy-mm-dd: the last day the offer can be signed. */
  replyBy: string;
  /** Anything else he wants in the letter. Optional. */
  extra: string;
  /** yyyy-mm-dd: the day the letter is written. */
  today: string;
}

export const OFFER_LIMITS = { name: 120, line: 200, extra: 1500 } as const;

/** How long an offer stays open unless he says otherwise. */
export const OFFER_REPLY_DAYS = 5;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A yyyy-mm-dd day, or null. Read as a calendar day, never moved by a time zone. */
export function readDay(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** "Monday, October 19, 2026": a date nobody in any country can misread. */
export function longDate(value: string): string {
  const day = readDay(value);
  if (!day) return "";
  const weekday = DAYS[new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay()];
  return `${weekday}, ${MONTHS[day.m - 1]} ${day.d}, ${day.y}`;
}

/** The local calendar day of a moment, as yyyy-mm-dd. */
export function dayOf(moment: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

/** A day some days after another. */
export function addDays(value: string, days: number): string {
  const day = readDay(value);
  if (!day) return "";
  const date = new Date(Date.UTC(day.y, day.m - 1, day.d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** One character as the signed PDF can print it: itself, a plain stand-in, "" for something invisible, or null when it cannot be printed at all. */
function printable(char: string): string | null {
  if (char === "\n" || (char >= " " && char <= "~") || (char >= "\u00A1" && char <= "\u00FF")) return char;
  if (/[\u2018\u2019\u201A\u2032]/.test(char)) return "'";
  if (/[\u201C\u201D\u201E\u2033]/.test(char)) return '"';
  if (/[\u2010-\u2015\u2212]/.test(char)) return "-";
  if (char === "\u2026") return "...";
  if (/[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/.test(char)) return " ";
  if (/[\u200B-\u200D\u2028\u2029\uFEFF]/.test(char)) return "";
  // Most letters the font lacks are a plain letter with an accent ("e" with a
  // caron): the accent comes off. A letter with nothing to take off is lost.
  const bare = char.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
  return bare.length === 1 && bare >= " " && bare <= "~" ? bare : null;
}

/**
 * Text the signed PDF can print. The engine draws the final PDF in a font
 * that has Western European letters only, so a letter must not carry anything
 * else: typographic quotes and dashes become plain ones, an accent the font
 * lacks comes off its letter, and whatever is still unprintable is dropped
 * and reported by `unprintable()`.
 */
export function letterSafe(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("")
    .map((char) => printable(char) ?? "")
    .join("");
}

/** True when a text has letters the signed PDF cannot print (a name in another script, a currency sign). */
export function unprintable(text: string): boolean {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("")
    .some((char) => printable(char) === null);
}

const oneLine = (text: string, limit: number) => letterSafe(text).replace(/\s+/g, " ").trim().slice(0, limit);

/** The fields as the letter will carry them. */
export function cleanFields(fields: OfferLetterFields): OfferLetterFields {
  return {
    applicantName: oneLine(fields.applicantName, OFFER_LIMITS.name),
    roleTitle: oneLine(fields.roleTitle, OFFER_LIMITS.line),
    companyName: oneLine(fields.companyName, OFFER_LIMITS.name),
    signerName: oneLine(fields.signerName, OFFER_LIMITS.name),
    pay: oneLine(fields.pay, OFFER_LIMITS.line),
    hours: oneLine(fields.hours, OFFER_LIMITS.line),
    shift: oneLine(fields.shift, OFFER_LIMITS.line),
    startDate: readDay(fields.startDate) ? fields.startDate.trim() : "",
    replyBy: readDay(fields.replyBy) ? fields.replyBy.trim() : "",
    extra: letterSafe(fields.extra)
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, OFFER_LIMITS.extra),
    today: readDay(fields.today) ? fields.today.trim() : "",
  };
}

/** "USD 500 a month", from the job's own pay. Empty when the job gives none. */
export function payFromJob(job: { salary_min?: number | null; salary_max?: number | null; salary_currency?: string | null; salary_period?: string | null } | null | undefined): string {
  if (!job) return "";
  const low = typeof job.salary_min === "number" && job.salary_min > 0 ? job.salary_min : null;
  const high = typeof job.salary_max === "number" && job.salary_max > 0 ? job.salary_max : null;
  const amount = low ?? high;
  if (amount === null) return "";
  // A range is not an offer: the letter says one figure, and he sets it.
  if (low !== null && high !== null && low !== high) return "";
  const currency = (job.salary_currency ?? "USD").trim().toUpperCase() || "USD";
  const period: Record<string, string> = { HOUR: "an hour", DAY: "a day", WEEK: "a week", MONTH: "a month", YEAR: "a year" };
  const per = period[(job.salary_period ?? "").trim().toUpperCase()];
  if (!per) return "";
  return `${currency} ${amount.toLocaleString("en-US")} ${per}`;
}

export interface OfferProblem {
  field: keyof OfferLetterFields;
  text: string;
}

/** What still stops the letter from going. Empty means it can be sent. */
export function offerProblems(fields: OfferLetterFields): OfferProblem[] {
  const clean = cleanFields(fields);
  const problems: OfferProblem[] = [];
  if (!clean.applicantName) problems.push({ field: "applicantName", text: "Choose who the offer is for." });
  else if (unprintable(fields.applicantName)) problems.push({ field: "applicantName", text: "Type their name in English letters: the signed copy cannot print some of these." });
  if (!clean.roleTitle) problems.push({ field: "roleTitle", text: "Say which role." });
  if (!clean.companyName) problems.push({ field: "companyName", text: "Add your company name." });
  if (!clean.signerName) problems.push({ field: "signerName", text: "Add your own name, as you will sign it." });
  if (!clean.pay) problems.push({ field: "pay", text: "Add the pay." });
  else if (unprintable(fields.pay)) problems.push({ field: "pay", text: 'Write the currency in letters ("PHP 28,000 a month"): the signed copy cannot print that sign.' });
  if (!clean.startDate) problems.push({ field: "startDate", text: "Pick a start date." });
  else if (clean.today && clean.startDate < clean.today) problems.push({ field: "startDate", text: "The start date is in the past." });
  if (!clean.replyBy) problems.push({ field: "replyBy", text: "Pick the day the offer ends." });
  else if (clean.today && clean.replyBy < clean.today) problems.push({ field: "replyBy", text: "The offer would already have ended." });
  else if (clean.startDate && !(clean.today && clean.startDate < clean.today) && clean.replyBy > clean.startDate) problems.push({ field: "replyBy", text: "They must sign on or before the start date." });
  if (unprintable(fields.extra)) problems.push({ field: "extra", text: "Something in the extra lines cannot be printed on the signed copy. Use plain letters." });
  return problems;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full.trim();

/**
 * The letter. Every line comes from a field; a field left empty leaves its
 * line out. Nothing here is a legal term he did not type.
 */
export function offerLetterText(fields: OfferLetterFields): string {
  const f = cleanFields(fields);
  const terms: string[] = [];
  if (f.roleTitle) terms.push(`Role: ${f.roleTitle}`);
  if (f.pay) terms.push(`Pay: ${f.pay}`);
  if (f.hours) terms.push(`Hours: ${f.hours}`);
  if (f.shift) terms.push(`Shift: ${f.shift}`);
  if (f.startDate) terms.push(`Start date: ${longDate(f.startDate)}`);

  const parts: string[] = [];
  parts.push([f.companyName, f.today ? longDate(f.today) : ""].filter(Boolean).join("\n"));
  parts.push(`Dear ${f.applicantName ? firstName(f.applicantName) : "applicant"},`);
  parts.push(`We would like to offer you the role of ${f.roleTitle || "the role we discussed"}${f.companyName ? ` with ${f.companyName}` : ""}. Thank you for the time you gave to the application and the interview.`);
  parts.push(["THE OFFER", ...terms].join("\n"));
  if (f.extra) parts.push(f.extra);
  parts.push(
    f.replyBy
      ? `To accept, sign this letter on or before ${longDate(f.replyBy)}. After that day the offer ends.`
      : "To accept, sign this letter.",
  );
  parts.push("If anything here is different from what we talked about, message me before you sign.");
  parts.push([f.signerName, f.companyName].filter(Boolean).join("\n"));
  return parts.filter((part) => part.trim()).join("\n\n");
}

/** The document's name in both drawers. */
export function offerLetterName(fields: OfferLetterFields): string {
  const name = cleanFields(fields).applicantName;
  return name ? `Offer letter - ${name}` : "Offer letter";
}

/** The end of the reply-by day, as the moment the document stops being signable. Local time, so "by Friday" means his Friday. */
export function offerExpiry(replyBy: string): Date | null {
  const day = readDay(replyBy);
  return day ? new Date(day.y, day.m - 1, day.d, 23, 59, 59) : null;
}

/**
 * The stored body, in the shape the signing engine reads: base64 of a JSON
 * object with `content`. The JSON is written in plain ASCII (anything else as
 * a \u escape) because base64 in a browser refuses every character outside
 * Latin-1: that is what stopped the old screens from saving a letter with a
 * curly apostrophe in it. JSON.parse gives the reader back the exact text.
 */
export function encodeDocumentBody(body: unknown): string {
  const json = JSON.stringify(body).replace(/[\u0080-\uFFFF]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `data:application/json;base64,${btoa(json)}`;
}

/** What the engine stores for an offer letter. */
export function offerDocumentBody(fields: OfferLetterFields, recipientEmail: string) {
  const f = cleanFields(fields);
  return {
    content: offerLetterText(fields),
    signatureFields: [
      { id: "recipient", label: "Recipient Signature", required: true },
      { id: "employer", label: "Employer Signature", required: true },
    ],
    metadata: {
      companyName: f.companyName,
      jobTitle: f.roleTitle,
      salary: f.pay,
      startDate: f.startDate ? longDate(f.startDate) : "",
      recipientName: f.applicantName,
      recipientEmail,
      writtenBy: "offer-letter-1",
    },
  };
}

/** The dialog's words. */
export function offerWords(fields: OfferLetterFields, sending: boolean, armed: boolean): { arm: string; confirm: string; note: string } {
  const who = firstName(cleanFields(fields).applicantName) || "them";
  return {
    arm: `Send to ${who}`,
    confirm: sending ? "Sending..." : "Yes, send it for signing",
    note: armed ? `This emails ${who} the letter to sign, and moves them to Offer.` : "Nothing is sent until you confirm.",
  };
}
