/**
 * JOIN.com field mapping — PURE, framework-free logic (no fetch, no Deno/Node
 * globals) so it is unit-testable from vitest AND importable by the Deno edge
 * functions. All network calls live in joinClient.ts.
 *
 * Source of truth for JOIN's contract: docs.join.com (verified 2026-06-30).
 * Key facts encoded here:
 *  - Auth header is the RAW token (handled in joinClient).
 *  - Create job REQUIRES: title, description(HTML), categoryId(sub-category),
 *    language, employmentTypeId, officeId.
 *  - Salary currency is limited to EUR | CHF | USD | GBP.
 *  - A created job goes LIVE/multiposted immediately unless status:"OFFLINE".
 *  - There is no free-text location and no external applyUrl; location comes
 *    from the linked office, remote is expressed via workplaceType.
 */

// ─── Types: the slice of a HireFlow job we read ──────────────────────────────
export interface HireflowJobLike {
  id: string;
  title?: string | null;
  description?: string | null;
  responsibilities?: string | null; // newline-separated
  requirements?: string | null; // newline-separated
  job_type?: string | null; // "full-time" | "part-time" | "contract" | ...
  is_remote?: boolean | null;
  location_country_code?: string | null; // ISO-3166-1 alpha-2
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null; // HOUR | DAY | WEEK | MONTH | YEAR
  require_resume?: boolean | null;
  department?: string | null;
  experience_level?: string | null;
}

// ─── Types: JOIN reference data (from /categories, /employmentTypes, etc.) ────
export interface JoinNamed {
  id: number;
  slug?: string;
  name?: string;
}
export interface JoinCategory extends JoinNamed {
  subCategories?: JoinNamed[];
}

// ─── Types: the resolved IDs the publish function must supply ────────────────
export interface JoinResolvedRefs {
  categoryId: number; // a SUB-category id
  employmentTypeId: number;
  officeId: number;
  language?: string; // ISO 639-1, default "en"
  seniorityId?: number | null;
}

export type JoinSalaryFrequency = "PER_HOUR" | "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_YEAR";
export type JoinCurrency = "EUR" | "CHF" | "USD" | "GBP";

export interface JoinCreateJobPayload {
  title: string;
  description: string; // HTML
  categoryId: number;
  language: string;
  employmentTypeId: number;
  officeId: number;
  externalId: string;
  status: "ONLINE" | "OFFLINE";
  workplaceType: "ONSITE" | "REMOTE" | "HYBRID";
  remoteType?: "ANYWHERE" | "COUNTRY";
  seniorityId?: number;
  cv: "REQUIRED" | "OPTIONAL" | "OFF";
  salary?: {
    frequency: JoinSalaryFrequency;
    currency: JoinCurrency;
    from?: number;
    to?: number;
    isShownOnJobAd: boolean;
  };
}

const SUPPORTED_CURRENCIES: JoinCurrency[] = ["EUR", "CHF", "USD", "GBP"];

/** Map a HireFlow salary currency to a JOIN-supported one, or null if unsupported. */
export function toJoinCurrency(currency?: string | null): JoinCurrency | null {
  if (!currency) return null;
  const c = currency.trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as string[]).includes(c) ? (c as JoinCurrency) : null;
}

/** Map a HireFlow salary period to JOIN's frequency enum. Defaults to PER_YEAR. */
export function toJoinFrequency(period?: string | null): JoinSalaryFrequency {
  switch ((period ?? "").trim().toUpperCase()) {
    case "HOUR":
    case "HOURLY":
      return "PER_HOUR";
    case "DAY":
    case "DAILY":
      return "PER_DAY";
    case "WEEK":
    case "WEEKLY":
      return "PER_WEEK";
    case "MONTH":
    case "MONTHLY":
      return "PER_MONTH";
    case "YEAR":
    case "YEARLY":
    case "ANNUAL":
      return "PER_YEAR";
    default:
      return "PER_YEAR";
  }
}

function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Best-effort match of HireFlow's job_type to a JOIN employmentType id.
 * Returns the id, or null if no confident match (caller decides the fallback).
 */
export function matchEmploymentTypeId(jobType: string | null | undefined, types: JoinNamed[]): number | null {
  const jt = norm(jobType);
  if (!jt || types.length === 0) return null;
  // direct/contains match on name or slug
  for (const t of types) {
    const n = norm(t.name);
    const sl = norm(t.slug);
    if (n === jt || sl === jt || n.includes(jt) || jt.includes(n)) return t.id;
  }
  // common aliases
  const alias: Record<string, string[]> = {
    "full time": ["full time", "permanent", "fulltime"],
    "part time": ["part time", "parttime"],
    contract: ["contract", "temporary", "freelance", "fixed term"],
    internship: ["internship", "intern", "working student"],
  };
  for (const [, names] of Object.entries(alias)) {
    if (names.some((a) => jt.includes(a))) {
      const hit = types.find((t) => names.some((a) => norm(t.name).includes(a) || norm(t.slug).includes(a)));
      if (hit) return hit.id;
    }
  }
  return null;
}

/**
 * Best-effort match of a HireFlow job to a JOIN SUB-category id, using the
 * department + title as keywords. Returns the sub-category id or null.
 * (Category mapping is inherently fuzzy — the publish flow should let the
 * employer confirm/override, and fall back to a configured default.)
 */
export function matchSubCategoryId(job: HireflowJobLike, categories: JoinCategory[]): number | null {
  const hay = `${norm(job.department)} ${norm(job.title)}`;
  if (!hay.trim()) return null;
  let best: { id: number; score: number } | null = null;
  for (const cat of categories) {
    for (const sub of cat.subCategories ?? []) {
      const words = norm(sub.name).split(" ").filter(Boolean);
      let score = 0;
      for (const w of words) if (w.length >= 3 && hay.includes(w)) score += 1;
      if (score > 0 && (!best || score > best.score)) best = { id: sub.id, score };
    }
  }
  return best?.id ?? null;
}

/** Escape text for safe inclusion in HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function listToHtml(text?: string | null): string {
  const items = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•*\-–—]+/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

/** Build the HTML description JOIN expects from HireFlow's text fields. */
export function buildJoinDescriptionHtml(job: HireflowJobLike): string {
  const parts: string[] = [];
  const desc = (job.description ?? "").trim();
  if (desc) parts.push(`<p>${esc(desc).replace(/\r?\n/g, "<br/>")}</p>`);
  const resp = listToHtml(job.responsibilities);
  if (resp) parts.push(`<h3>What you'll do</h3>${resp}`);
  const req = listToHtml(job.requirements);
  if (req) parts.push(`<h3>What we're looking for</h3>${req}`);
  return parts.join("");
}

/**
 * Validate that a HireFlow job + resolved refs can produce a valid JOIN create
 * payload. Returns a list of human-readable problems (empty = OK).
 */
export function validateJobForJoin(job: HireflowJobLike, refs: Partial<JoinResolvedRefs>): string[] {
  const errors: string[] = [];
  if (!job.title || !job.title.trim()) errors.push("Job title is required.");
  if (!buildJoinDescriptionHtml(job)) errors.push("A job description (or responsibilities/requirements) is required.");
  if (!refs.categoryId) errors.push("Could not match this job to a JOIN category — pick one before publishing.");
  if (!refs.employmentTypeId) errors.push("Could not match the employment type (e.g. full-time) to JOIN.");
  if (!refs.officeId) errors.push("A JOIN office/location is required (we create one from the job's country + city).");
  return errors;
}

/**
 * Build the JOIN create-job payload. SAFE DEFAULT: status "OFFLINE" so the job
 * is created but NOT multiposted/live until we explicitly flip it ONLINE.
 */
export function mapJobToJoinPayload(
  job: HireflowJobLike,
  refs: JoinResolvedRefs,
  opts: { publishLive?: boolean } = {},
): JoinCreateJobPayload {
  const payload: JoinCreateJobPayload = {
    title: (job.title ?? "").trim(),
    description: buildJoinDescriptionHtml(job),
    categoryId: refs.categoryId,
    language: refs.language?.trim() || "en",
    employmentTypeId: refs.employmentTypeId,
    officeId: refs.officeId,
    externalId: job.id,
    status: opts.publishLive ? "ONLINE" : "OFFLINE",
    workplaceType: job.is_remote ? "REMOTE" : "ONSITE",
    cv: job.require_resume ? "REQUIRED" : "OPTIONAL",
  };

  if (refs.seniorityId) payload.seniorityId = refs.seniorityId;

  if (job.is_remote) {
    // COUNTRY-scoped remote when we know the country, else anywhere.
    payload.remoteType = job.location_country_code ? "COUNTRY" : "ANYWHERE";
  }

  const currency = toJoinCurrency(job.salary_currency);
  const hasAmount = (job.salary_min ?? 0) > 0 || (job.salary_max ?? 0) > 0;
  if (currency && hasAmount) {
    payload.salary = {
      frequency: toJoinFrequency(job.salary_period),
      currency,
      isShownOnJobAd: true,
    };
    if ((job.salary_min ?? 0) > 0) payload.salary.from = job.salary_min!;
    if ((job.salary_max ?? 0) > 0) payload.salary.to = job.salary_max!;
  }

  return payload;
}

// ─── Application import mapping ──────────────────────────────────────────────

export interface JoinApplicationLike {
  id: number | string;
  createdAt?: string;
  lastUpdatedAt?: string;
  hiringState?: string; // APPLIED | ACTIVE | REJECTED | HIRED | OFFER
  candidate?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  };
  job?: { id?: number; title?: string; externalId?: string | null };
  attachments?: Array<{ type?: string; url?: string }>;
  source?: { product?: string; isPremium?: boolean };
}

/** Map JOIN's hiringState to a HireFlow application status enum value. */
export function joinHiringStateToStatus(state?: string): string {
  switch ((state ?? "").toUpperCase()) {
    case "HIRED":
      return "hired";
    case "REJECTED":
      return "rejected";
    case "OFFER":
      return "offered";
    case "ACTIVE":
      return "reviewing";
    case "APPLIED":
    default:
      return "pending";
  }
}

/** Pull the CV/resume url out of a JOIN application's attachments, if any. */
export function joinResumeUrl(app: JoinApplicationLike): string | null {
  const cv = (app.attachments ?? []).find((a) => a.type === "CV" || a.type === "JOIN_CV");
  return cv?.url ?? null;
}

export function joinCandidateFullName(app: JoinApplicationLike): string {
  const f = app.candidate?.firstName?.trim() ?? "";
  const l = app.candidate?.lastName?.trim() ?? "";
  return `${f} ${l}`.trim() || (app.candidate?.email ?? "JOIN applicant");
}

/** Stable dedupe key for an imported JOIN application. */
export function externalApplicationId(app: JoinApplicationLike): string {
  return String(app.id);
}
