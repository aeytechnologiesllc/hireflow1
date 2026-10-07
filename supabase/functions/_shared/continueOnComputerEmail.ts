/**
 * continueOnComputerEmail.ts — "Email me the link", the server half
 * (docs/COMPUTER-ONLY-TESTS.md).
 *
 * The owner, 2026-10-06, about applicants who reach "Continue on your
 * computer" on a phone and stop there: "make it a little bit easy if there
 * is a way." So that screen offers to email them the link to carry on.
 *
 * It is the one email an applicant asks for themself, and the one type of
 * send-notification-email that trusts nothing in the request:
 *   - it goes to whoever is signed in (the caller's own account), never to a
 *     user id or an address named in the body;
 *   - the application must be theirs and still open, and its job's name and
 *     the team's name are looked up, not taken from the page;
 *   - it is rate limited on the server, per person and for everyone at once,
 *     and when the limiter cannot be asked nothing is sent (the other limits
 *     in _shared/rateLimit.ts fail open because they guard a test in
 *     progress; this guards a convenience, and the mail quota every other
 *     email depends on).
 *
 * No imports: plain Node loads this file for
 * scripts/continue_link_email.test.mjs, and the function for the send.
 */

/** The notification type, as the page sends it and the function reads it. */
export const CONTINUE_ON_COMPUTER_TYPE = "continue_on_computer";

/* ── The email ──────────────────────────────────────────────────────────── */

export interface ContinueOnComputerEmailInput {
  /** The applicant's first name, when their profile has one. */
  firstName?: string | null;
  jobTitle?: string | null;
  /** The site as an applicant reads it: "hireflownow.com". */
  siteHost?: string | null;
}

export interface ContinueOnComputerEmailWords {
  subject: string;
  title: string;
  /** Plain sentences, one paragraph each. The function escapes them. */
  lines: string[];
  button: string;
}

function tidy(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * The words of the email: who asked for it, what the next part needs, the two
 * ways to open it (the button, or the address typed by hand), and that
 * nothing is lost. Candidate copy: plain words, and never what does the
 * checking behind the tests.
 */
export function continueOnComputerEmail(input: ContinueOnComputerEmailInput = {}): ContinueOnComputerEmailWords {
  const first = tidy(input.firstName).split(" ")[0] ?? "";
  const job = tidy(input.jobTitle);
  const host = tidy(input.siteHost).replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "hireflownow.com";
  return {
    subject: "Continue your application on your computer",
    title: "Continue on your computer",
    lines: [
      `Hi${first ? ` ${first}` : ""}, here is the link you asked for.`,
      `The next part of your application${job ? ` for the ${job} role` : ""} is done on the computer you'd use for this job.`,
      `Open this email on that computer and press the button below. Or go to ${host}/applications there and sign in with this email address. Either way you'll be taken straight to where you left off.`,
      "Everything you've done so far is saved.",
    ],
    button: "Continue my application",
  };
}

/* ── Who may ask ────────────────────────────────────────────────────────── */

export type ContinueLinkRefusalCode = "not_signed_in" | "not_found" | "closed" | "too_soon" | "try_later";

export interface ContinueLinkRefusal {
  status: 401 | 404 | 409 | 429 | 503;
  code: ContinueLinkRefusalCode;
  /** Plain words; the page has its own (src/lib/continueLinkEmail.ts). */
  message: string;
  /** For too_soon: how long until another may be sent. */
  retryAfter?: number;
}

/** The parts of an application row the decision reads. */
export interface ContinueLinkApplication {
  id?: string | null;
  candidate_id?: string | null;
  status?: string | null;
}

/**
 * Pure: may this caller have the link to this application emailed to them?
 * Null when they may. Someone else's application and one that does not exist
 * read the same, so an id says nothing about whether it is real.
 */
export function continueLinkApplicationRefusal(
  callerId: string | null | undefined,
  application: ContinueLinkApplication | null | undefined,
): ContinueLinkRefusal | null {
  if (!callerId) return { status: 401, code: "not_signed_in", message: "Please sign in again." };
  if (!application || !application.candidate_id || application.candidate_id !== callerId) {
    return { status: 404, code: "not_found", message: "We couldn't find that application." };
  }
  if (application.status === "rejected" || application.status === "hired") {
    return { status: 409, code: "closed", message: "This application is closed, so there is nothing to continue." };
  }
  return null;
}

/* ── How often ──────────────────────────────────────────────────────────── */

export interface ContinueLinkLimit {
  bucket: string;
  limit: number;
  windowSecs: number;
}

/**
 * One every three minutes and four an hour for one person (a second press,
 * an impatient third); and a ceiling for everyone together, so that whatever
 * else happens this button cannot spend the month's mail.
 */
export const CONTINUE_LINK_LIMITS: { person: ContinueLinkLimit; personHour: ContinueLinkLimit; everyone: ContinueLinkLimit } = {
  person: { bucket: "email-continue-link", limit: 1, windowSecs: 180 },
  personHour: { bucket: "email-continue-link-hour", limit: 4, windowSecs: 3600 },
  everyone: { bucket: "email-continue-link-all", limit: 150, windowSecs: 3600 },
};

/** What the limiter answers (the shape of _shared/rateLimit.ts checkRateLimit). */
export interface ContinueLinkLimitResult {
  allowed: boolean;
  /** 0 means the limiter could not be asked: checkRateLimit fails open with no count. */
  hits: number;
  retryAfter: number;
}

export type ContinueLinkLimitCheck = (bucket: string, identifier: string, limit: number, windowSecs: number) => Promise<ContinueLinkLimitResult>;

/**
 * Asks the limiter, the person's own limits first. Null when another email
 * may go. A limiter that cannot be asked is a refusal ("try_later"), never a
 * pass.
 */
export async function continueLinkLimitRefusal(callerId: string, check: ContinueLinkLimitCheck): Promise<ContinueLinkRefusal | null> {
  const asks: Array<[ContinueLinkLimit, string]> = [
    [CONTINUE_LINK_LIMITS.person, `user:${callerId}`],
    [CONTINUE_LINK_LIMITS.personHour, `user:${callerId}`],
    [CONTINUE_LINK_LIMITS.everyone, "everyone"],
  ];
  for (const [rule, identifier] of asks) {
    let result: ContinueLinkLimitResult;
    try {
      result = await check(rule.bucket, identifier, rule.limit, rule.windowSecs);
    } catch {
      return { status: 503, code: "try_later", message: "We couldn't send it just now. Please try again in a few minutes." };
    }
    if (!result || !(result.hits > 0)) {
      return { status: 503, code: "try_later", message: "We couldn't send it just now. Please try again in a few minutes." };
    }
    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.min(rule.windowSecs, Math.round(Number(result.retryAfter) || rule.windowSecs)));
      // The ceiling for everyone is not the person's doing: no "you just asked".
      return rule === CONTINUE_LINK_LIMITS.everyone
        ? { status: 503, code: "try_later", message: "We couldn't send it just now. Please try again in a few minutes." }
        : { status: 429, code: "too_soon", message: "We sent it a moment ago. Please check your inbox.", retryAfter };
    }
  }
  return null;
}

/* ── The whole decision ─────────────────────────────────────────────────── */

/** What the function needs from its database client, and nothing more. */
export interface ContinueLinkLookups {
  /** The signed-in user's id for this request, or null. */
  callerId: () => Promise<string | null>;
  /** The application with its job's title and employer, or null. */
  application: (applicationId: string) => Promise<(ContinueLinkApplication & { job_title?: string | null; employer_id?: string | null }) | null>;
  /** The applicant's own name. */
  fullName: (userId: string) => Promise<string | null>;
  /** The hiring team's name, as their other emails sign it. */
  companyName: (employerId: string) => Promise<string | null>;
  checkLimit: ContinueLinkLimitCheck;
}

export type ContinueLinkDecision =
  | { ok: false; refusal: ContinueLinkRefusal }
  | {
      ok: true;
      /** Always the caller. */
      recipientUserId: string;
      /** Looked up here; nothing from the request's own `data` survives. */
      data: { candidate_name?: string; job_title?: string; company_name?: string };
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decides one "Email me the link" request from start to finish: who is
 * asking, whether the application is theirs and open, whether another email
 * may go yet, and what the email may say. The request contributes exactly one
 * thing, the application's id.
 */
export async function decideContinueLinkEmail(requestData: unknown, lookups: ContinueLinkLookups): Promise<ContinueLinkDecision> {
  const callerId = await lookups.callerId();
  const rawId = requestData && typeof requestData === "object" ? (requestData as { application_id?: unknown }).application_id : null;
  const applicationId = typeof rawId === "string" && UUID.test(rawId) ? rawId : null;
  const application = callerId && applicationId ? await lookups.application(applicationId) : null;

  const refused = continueLinkApplicationRefusal(callerId, application);
  if (refused) return { ok: false, refusal: refused };

  const limited = await continueLinkLimitRefusal(callerId!, lookups.checkLimit);
  if (limited) return { ok: false, refusal: limited };

  const [fullName, companyName] = await Promise.all([
    lookups.fullName(callerId!).catch(() => null),
    application!.employer_id ? lookups.companyName(application!.employer_id).catch(() => null) : Promise.resolve(null),
  ]);
  const data: { candidate_name?: string; job_title?: string; company_name?: string } = {};
  if (tidy(fullName)) data.candidate_name = tidy(fullName);
  if (tidy(application!.job_title)) data.job_title = tidy(application!.job_title);
  if (tidy(companyName)) data.company_name = tidy(companyName);
  return { ok: true, recipientUserId: callerId!, data };
}
