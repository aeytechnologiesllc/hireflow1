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
 * what he typed or chose on the screen. It is stored in the same shape the
 * signing engine already reads (a JSON body with `content`), so signing,
 * countersigning, the locked PDF and the audit trail are the engine's own,
 * unchanged.
 *
 * 2026-10-10, the owner on the first real letter: "the offer letter feels
 * incomplete ... I can't put the company name there ... I don't know if I
 * should put hours because they can change ... Offer ends date, I don't know
 * if I should put it there. Basically be a guided ... so that somebody's just
 * hiring for the first time, they understand how to write this offer letter
 * ... make it more legit ... don't overcomplicate it ... we're not doing it
 * like Google or Microsoft." So the letter now has the parts a small remote
 * team's offer usually has (the role, the pay and how it is paid, a trial
 * period, how either side can end it, the usual expectations, how to accept)
 * and the screen fills each with the usual choice for a remote support role,
 * which he can change. Still no AI, and nothing he cannot see: every line is
 * on the screen beside the boxes before it is sent.
 *
 * Pure: no React, no Supabase.
 */

export type WorkerType = "contractor" | "employee";
export type WorkSchedule = "full" | "part";
export type PayPer = "month" | "week" | "hour";
export type PayEvery = "twice-monthly" | "monthly" | "biweekly" | "weekly" | "";

export interface OfferLetterFields {
  /** The applicant's name as the letter will carry it. */
  applicantName: string;
  roleTitle: string;
  /** The business they will work for, as it should read on the letter. */
  companyName: string;
  /** Who signs for the company. */
  signerName: string;
  /** "Owner". Optional. */
  signerTitle: string;
  /** "500" or "28,000". */
  payAmount: string;
  /** "USD", "PHP". */
  payCurrency: string;
  payPer: PayPer;
  /** How often they are paid. Optional. */
  payEvery: PayEvery;
  /** "Wise or bank transfer". Optional. */
  payMethod: string;
  workerType: WorkerType;
  schedule: WorkSchedule;
  /** "40 hours a week, Monday to Friday". Optional. */
  hours: string;
  /** "3:00 AM to 11:00 AM Philippine time". Optional. */
  shift: string;
  /** True for a role done from home. */
  remote: boolean;
  /** "Zack, Owner". Optional. */
  reportsTo: string;
  /** 0 for none. */
  trialDays: number;
  /** Days of notice either side gives to end it. */
  noticeDays: number;
  /** They work from their own computer and internet. */
  ownEquipment: boolean;
  /** They keep company and customer information private. */
  privateInfo: boolean;
  /** yyyy-mm-dd. */
  startDate: string;
  /** yyyy-mm-dd: the last day the offer can be signed. */
  replyBy: string;
  /** Anything else he wants in the letter. Optional. */
  extra: string;
  /** yyyy-mm-dd: the day the letter is written. */
  today: string;
}

/** The usual choices for a remote chat support role; every one can be changed on the screen. */
export const OFFER_DEFAULTS = {
  payCurrency: "USD",
  payPer: "month" as PayPer,
  payEvery: "twice-monthly" as PayEvery,
  workerType: "contractor" as WorkerType,
  schedule: "full" as WorkSchedule,
  remote: true,
  trialDays: 30,
  noticeDays: 14,
  ownEquipment: true,
  privateInfo: true,
} as const;

export const TRIAL_CHOICES = [0, 14, 30, 60, 90] as const;
export const NOTICE_CHOICES = [7, 14, 30] as const;
export const REPLY_CHOICES = [3, 5, 7] as const;
export const CURRENCIES = ["USD", "PHP", "EUR", "GBP", "CAD", "AUD"] as const;

const PER_WORDS: Record<PayPer, string> = { month: "a month", week: "a week", hour: "an hour" };
export const EVERY_WORDS: Record<Exclude<PayEvery, "">, string> = {
  "twice-monthly": "twice a month",
  monthly: "once a month",
  biweekly: "every two weeks",
  weekly: "every week",
};

/** "30 days", "2 weeks". */
export function periodWords(days: number): string {
  if (days > 0 && days % 7 === 0 && days < 28) return days === 7 ? "1 week" : `${days / 7} weeks`;
  return days === 1 ? "1 day" : `${days} days`;
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

/** An amount as the letter writes it: "500", "28,000", "4.50". Empty when it is not a positive number. */
export function payAmountWords(amount: string): string {
  const raw = (amount ?? "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "";
  const value = Number(raw);
  if (!(value > 0)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: raw.includes(".") ? 2 : 0, maximumFractionDigits: 2 });
}

/** "USD 500 a month". Empty without a usable amount. */
export function payWords(fields: Pick<OfferLetterFields, "payAmount" | "payCurrency" | "payPer">): string {
  const amount = payAmountWords(fields.payAmount);
  if (!amount) return "";
  const currency = oneLine(fields.payCurrency, 8).toUpperCase() || "USD";
  return `${currency} ${amount} ${PER_WORDS[fields.payPer] ?? PER_WORDS.month}`;
}

/** "Zack" for a name typed all in small letters; anything else as typed. */
export function nameCase(name: string): string {
  const clean = (name ?? "").trim();
  if (!clean || clean !== clean.toLowerCase()) return clean;
  return clean.replace(/(^|[\s'-])([a-z])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
}

/** The fields as the letter will carry them. */
export function cleanFields(fields: OfferLetterFields): OfferLetterFields {
  const pick = (value: number, choices: readonly number[], fallback: number): number => (choices.includes(value) ? value : fallback);
  return {
    applicantName: oneLine(fields.applicantName, OFFER_LIMITS.name),
    roleTitle: oneLine(fields.roleTitle, OFFER_LIMITS.line),
    companyName: oneLine(fields.companyName, OFFER_LIMITS.name),
    signerName: oneLine(fields.signerName, OFFER_LIMITS.name),
    signerTitle: oneLine(fields.signerTitle, OFFER_LIMITS.name),
    payAmount: payAmountWords(fields.payAmount),
    payCurrency: oneLine(fields.payCurrency, 8).toUpperCase() || OFFER_DEFAULTS.payCurrency,
    payPer: fields.payPer in PER_WORDS ? fields.payPer : OFFER_DEFAULTS.payPer,
    payEvery: fields.payEvery && fields.payEvery in EVERY_WORDS ? fields.payEvery : "",
    payMethod: oneLine(fields.payMethod, OFFER_LIMITS.line),
    workerType: fields.workerType === "employee" ? "employee" : "contractor",
    schedule: fields.schedule === "part" ? "part" : "full",
    hours: oneLine(fields.hours, OFFER_LIMITS.line),
    shift: oneLine(fields.shift, OFFER_LIMITS.line),
    remote: fields.remote !== false,
    reportsTo: oneLine(fields.reportsTo, OFFER_LIMITS.name),
    trialDays: pick(Number(fields.trialDays), TRIAL_CHOICES, 0),
    noticeDays: pick(Number(fields.noticeDays), NOTICE_CHOICES, OFFER_DEFAULTS.noticeDays),
    ownEquipment: !!fields.ownEquipment,
    privateInfo: !!fields.privateInfo,
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

/** The job's pay as the screen's three boxes, when the job states one figure a month, a week or an hour. */
export function payPartsFromJob(job: { salary_min?: number | null; salary_max?: number | null; salary_currency?: string | null; salary_period?: string | null } | null | undefined): { payAmount: string; payCurrency: string; payPer: PayPer } | null {
  if (!job || !payFromJob(job)) return null;
  const per = (job.salary_period ?? "").trim().toLowerCase();
  if (per !== "month" && per !== "week" && per !== "hour") return null;
  const amount = typeof job.salary_min === "number" && job.salary_min > 0 ? job.salary_min : (job.salary_max as number);
  return { payAmount: amount.toLocaleString("en-US"), payCurrency: (job.salary_currency ?? "USD").trim().toUpperCase() || "USD", payPer: per };
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
  if (!clean.roleTitle) problems.push({ field: "roleTitle", text: "Add the job title." });
  if (!clean.companyName) problems.push({ field: "companyName", text: "Add your company name." });
  if (!clean.signerName) problems.push({ field: "signerName", text: "Add your own name, as you will sign it." });
  if (!clean.payAmount) problems.push({ field: "payAmount", text: (fields.payAmount ?? "").trim() ? "Write the pay as a number, like 500." : "Add the pay." });
  if (!clean.startDate) problems.push({ field: "startDate", text: "Pick a start date." });
  else if (clean.today && clean.startDate < clean.today) problems.push({ field: "startDate", text: "The start date is in the past." });
  if (!clean.replyBy) problems.push({ field: "replyBy", text: "Choose how long they have to sign." });
  else if (clean.today && clean.replyBy < clean.today) problems.push({ field: "replyBy", text: "The offer would already have ended." });
  else if (clean.startDate && !(clean.today && clean.startDate < clean.today) && clean.replyBy > clean.startDate) problems.push({ field: "replyBy", text: "They must sign on or before the start date. Give them fewer days, or start later." });
  for (const field of ["roleTitle", "companyName", "signerTitle", "payMethod", "hours", "shift", "reportsTo"] as const) {
    if (unprintable(String(fields[field] ?? ""))) problems.push({ field, text: "Use plain letters there: the signed copy cannot print some of them." });
  }
  if (unprintable(fields.extra)) problems.push({ field: "extra", text: "Something in the extra lines cannot be printed on the signed copy. Use plain letters." });
  return problems;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full.trim();

/** How the work is arranged, in a few words: "Full-time, independent contractor". */
export function arrangementWords(fields: Pick<OfferLetterFields, "schedule" | "workerType">): string {
  return `${fields.schedule === "part" ? "Part-time" : "Full-time"}, ${fields.workerType === "employee" ? "employee" : "independent contractor"}`;
}

/** The usual terms, as the screen's one-line summary. */
export function termsSummary(fields: OfferLetterFields): string {
  const f = cleanFields(fields);
  return [
    f.workerType === "employee" ? "Employee" : "Independent contractor",
    f.trialDays ? `${periodWords(f.trialDays)} trial` : "No trial period",
    `${f.noticeDays} days' notice to end`,
    f.ownEquipment ? "Own computer and internet" : "",
    f.privateInfo ? "Keeps information private" : "",
  ]
    .filter(Boolean)
    .join(" \u00B7 ");
}

/**
 * The letter. Every line comes from a box or a choice on the screen; an
 * optional box left empty leaves its line out. Nothing is in it that is not
 * on the screen beside the boxes.
 */
export function offerLetterText(fields: OfferLetterFields): string {
  const f = cleanFields(fields);
  const company = f.companyName || "our team";

  const role: string[] = [];
  if (f.roleTitle) role.push(`Position: ${f.roleTitle}`);
  if (f.startDate) role.push(`Start date: ${longDate(f.startDate)}`);
  role.push(`Type: ${arrangementWords(f)}`);
  if (f.remote) role.push("Where: Remote, working from home");
  if (f.hours) role.push(`Hours: ${f.hours}`);
  if (f.shift) role.push(`Shift: ${f.shift}`);
  if (f.reportsTo) role.push(`Reports to: ${f.reportsTo}`);

  const pay = payWords(f);
  const payLine = pay ? `${pay}${f.payEvery ? `, paid ${EVERY_WORDS[f.payEvery]}` : ""}${f.payMethod ? `, by ${f.payMethod}` : ""}.` : "";

  const good: string[] = [];
  if (f.ownEquipment) good.push("You will work from your own computer, with a stable internet connection.");
  if (f.hours || f.shift) good.push("Your hours may change as the team's needs change. We will always tell you ahead of time.");
  if (f.privateInfo) good.push("Please keep company and customer information private, during and after your time with us.");
  if (f.workerType === "contractor") good.push("As an independent contractor, you are responsible for your own taxes.");
  good.push(`${f.trialDays ? "After the trial period, either" : "Either"} of us can end this arrangement with ${f.noticeDays} days' notice.`);

  const parts: string[] = [];
  parts.push([f.companyName, f.today ? longDate(f.today) : ""].filter(Boolean).join("\n"));
  parts.push(`Dear ${f.applicantName ? firstName(f.applicantName) : "applicant"},`);
  parts.push(`We are happy to offer you the position of ${f.roleTitle || "the role we discussed"} with ${company}. Thank you for the time you put into your application, the tests and the interview. We would love to have you on the team.`);
  parts.push(["THE ROLE", ...role].join("\n"));
  if (payLine) parts.push(["PAY", payLine].join("\n"));
  if (f.trialDays) parts.push(["TRIAL PERIOD", `Your first ${periodWords(f.trialDays)} are a trial period. During this time either of us can end the arrangement at any time.`].join("\n"));
  parts.push(["GOOD TO KNOW", ...good.map((line) => `- ${line}`)].join("\n"));
  if (f.extra) parts.push(f.extra);
  parts.push(
    [
      "TO ACCEPT",
      f.replyBy ? `Sign this letter on or before ${longDate(f.replyBy)}. After that day, the offer expires.` : "Sign this letter to accept.",
      "If anything here is different from what we talked about, message me before you sign.",
    ].join("\n"),
  );
  parts.push("We are looking forward to working with you.");
  parts.push(["Sincerely,", nameCase(f.signerName), [f.signerTitle, f.companyName].filter(Boolean).join(", ")].filter(Boolean).join("\n"));
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
      salary: payWords(f),
      startDate: f.startDate ? longDate(f.startDate) : "",
      arrangement: arrangementWords(f),
      trialDays: f.trialDays,
      noticeDays: f.noticeDays,
      recipientName: f.applicantName,
      recipientEmail,
      writtenBy: "offer-letter-2",
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
