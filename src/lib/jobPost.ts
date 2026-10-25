/**
 * A job as words someone pastes (docs/SHORT-JOB-LINKS.md, "Per business").
 *
 * The owner, 2026-10-11: "give them options to copy job full post so they can
 * simply paste on job posts and won't have to change anything". So the full
 * post is the whole job, from the job's own fields, in plain text that pastes
 * cleanly anywhere (Facebook groups, OnlineJobs.ph, Indeed, LinkedIn): no
 * markdown, simple headings in capitals, "•" bullets, and the job's own apply
 * link at the end. Nothing in it is a placeholder to fill in.
 *
 * Pure: no React, no Supabase (scripts/full_job_post.test.mjs).
 */

const PER: Record<string, string> = { HOUR: " an hour", DAY: " a day", WEEK: " a week", MONTH: " a month", YEAR: " a year" };

export interface PayFields {
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}

/** 20000 → "20,000"; 18.5 → "18.50". */
function amount(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

/**
 * "USD 500 a month", "PHP 20,000 to 25,000 a month", "From USD 18 an hour",
 * or null when the job names no pay. No currency is guessed: a job whose pay
 * names none shows the figure alone (it used to read "USD", so a peso salary
 * showed as dollars; the Phase 7 product audit).
 */
export function payWords(job: PayFields): string | null {
  const min = job.salary_min != null ? Number(job.salary_min) : null;
  const max = job.salary_max != null ? Number(job.salary_max) : null;
  if (!min && !max) return null;
  const curr = String(job.salary_currency || "").trim().toUpperCase();
  const money = (n: number) => (curr ? `${curr} ${amount(n)}` : amount(n));
  const per = PER[(job.salary_period || "").toUpperCase()] ?? "";
  if (min && max && min === max) return `${money(min)}${per}`;
  if (min && max) return `${money(min)} to ${amount(max)}${per}`;
  if (min) return `From ${money(min)}${per}`;
  return `Up to ${money(max as number)}${per}`;
}

/** "full-time" → "Full-time"; "part_time" → "Part-time". */
export function jobTypeWords(type: string | null | undefined): string | null {
  const raw = String(type ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Markdown and stray symbols out: a pasted post shows them as they are. */
function plain(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A field written as lines (bullets, dashes, numbers, or none) as "•" bullets. */
export function bulletLines(text: string | null | undefined): string[] {
  return plain(String(text ?? ""))
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[•·▪◦‣*\-–—]|\d{1,2}[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `• ${line}`);
}

export interface FullPostJob extends PayFields {
  title: string;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: readonly string[] | string | null;
  job_type?: string | null;
  location?: string | null;
  is_remote?: boolean | null;
  application_deadline?: string | null;
}

export interface FullPostOptions {
  /** The business's name (employer_public_branding.company_name). */
  company?: string | null;
  /** The job's own apply link (jobShareUrl). */
  applyUrl: string;
  /** The line before the link (the Share Kit's own, true to the job's steps). */
  applyLead: string;
}

/** "Saturday, October 31, 2026" for an apply-by date, or null. */
function deadlineWords(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The whole job as one post, ready to paste. */
export function buildFullJobPost(job: FullPostJob, options: FullPostOptions): string {
  const where = (job.location ?? "").trim() || (job.is_remote !== false ? "Remote" : "");
  const meta = [(options.company ?? "").trim(), where, jobTypeWords(job.job_type), payWords(job)].filter(Boolean).join(" · ");
  const benefits = Array.isArray(job.benefits) ? job.benefits.map((b) => `• ${String(b).trim()}`).filter((b) => b !== "• ") : bulletLines(typeof job.benefits === "string" ? job.benefits : "");
  const responsibilities = bulletLines(job.responsibilities);
  const requirements = bulletLines(job.requirements);
  const description = plain(String(job.description ?? ""));
  const deadline = deadlineWords(job.application_deadline);

  const blocks: string[] = [[`We're hiring: ${job.title.trim()}`, meta].filter(Boolean).join("\n")];
  if (description) blocks.push(description);
  if (responsibilities.length) blocks.push(["WHAT YOU'LL DO", ...responsibilities].join("\n"));
  if (requirements.length) blocks.push(["WHAT WE'RE LOOKING FOR", ...requirements].join("\n"));
  if (benefits.length) blocks.push(["WHAT YOU GET", ...benefits].join("\n"));
  blocks.push(["HOW TO APPLY", ...(deadline ? [`Apply by ${deadline}.`] : []), options.applyLead, options.applyUrl].join("\n"));
  return blocks.join("\n\n");
}
