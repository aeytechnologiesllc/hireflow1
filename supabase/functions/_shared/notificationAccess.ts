/**
 * notificationAccess.ts — who may make send-notification-email send what, to
 * whom (docs/NOTIFICATION-EMAILS.md).
 *
 * Until 2026-10-07 the function sent whatever it was asked: the kind of
 * email, the recipient's user id and every word in it came from the request,
 * and the request needed nothing but the site's public key. Anyone could have
 * the hiring address send any user a "You've got the job", a decline, an
 * interview time or a document request, signed with any company's name.
 *
 * Now every request is somebody's, and each kind of email belongs to the
 * people who can already do the thing it reports. The rules mirror the
 * database's own write policies for that thing (applications, interviews,
 * document_packages, document_requests, messages), so an email can be sent by
 * exactly the people who could have caused it:
 *
 *   - the hiring team's own alerts that the system raises (a reschedule
 *     request, voice minutes, "ready for interview", a signed document, a
 *     reminder, "please redo a step") are sent by the system only: another
 *     edge function or a script holding the service key. No browser can;
 *   - a decision, a phase move, an interview email, a document email: the
 *     job's owner, or an active team member of that owner who holds the
 *     matching permission and (when limited to some jobs) is on that job, to
 *     someone who applied to that job;
 *   - "new application" and "phase completed": an applicant, to the owner of
 *     a job they applied to;
 *   - "application received": an applicant, to themself;
 *   - "new message": either of the two, to the other.
 *
 * And the words that matter are looked up, never taken from the request: who
 * signs it (the job owner's own business name), the applicant's name, the
 * sender's name, and for anything an applicant triggers, the job's title.
 * What is left of the request's own text (a date, a document's name, a
 * message preview) is cut to one short plain line.
 *
 * No imports: plain Node loads this file for
 * scripts/notification_access.test.mjs, and the function for every send.
 */

/* ── Who is asking ──────────────────────────────────────────────────────── */

export type NotificationCaller =
  /** Another edge function or a script, holding the service key. */
  | { kind: "service" }
  /** A signed-in person. */
  | { kind: "user"; id: string }
  /** Nobody: the public key alone, or a sign-in that is not real. */
  | { kind: "anonymous" };

/**
 * Pure: could this bearer token be a service key in another form than the
 * one this function holds (a newer "sb_secret_" key, or the older signed
 * service_role token)? Only says whether it is worth asking the auth service
 * to confirm; it proves nothing by itself.
 */
export function looksLikeServiceKey(token: string | null | undefined): boolean {
  if (!token) return false;
  if (token.startsWith("sb_secret_")) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

/** Pure: two strings compared without stopping at the first difference. */
export function sameSecret(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── The rules ──────────────────────────────────────────────────────────── */

/** A team member's permission, as public.team_members names it. */
export type StaffPermission = "can_manage_pipeline" | "can_schedule_interviews" | "can_send_documents" | "can_message_candidates";

export type NotificationRule =
  /** Raised by the system: the service key only. */
  | { who: "service" }
  /** The hiring team to someone who applied to their job. */
  | { who: "staff"; permission: StaffPermission }
  /** An applicant to the owner of a job they applied to. */
  | { who: "applicant" }
  /** An applicant to themself. */
  | { who: "self" }
  /** Either of the two to the other. */
  | { who: "message" }
  /** Decided by its own gate (_shared/continueOnComputerEmail.ts). */
  | { who: "own-gate" };

/**
 * Every kind of email the function can send, and whose it is. A kind that is
 * not here is refused, and scripts/notification_access.test.mjs fails until
 * a new kind in the function is given a rule.
 */
export const NOTIFICATION_RULES: Readonly<Record<string, NotificationRule>> = {
  // The system's own.
  document_signed: { who: "service" },
  reschedule_requested: { who: "service" },
  voice_minutes_low: { who: "service" },
  voice_minutes_exhausted: { who: "service" },
  interview_ready: { who: "service" },
  interview_reminder: { who: "service" },
  // A time has just become agreed (candidate-interview-response): the
  // applicant's confirmation and the hiring team's notice.
  interview_confirmed: { who: "service" },
  interview_time_picked: { who: "service" },
  steps_reopened: { who: "service" },
  // The hiring team, to someone who applied to their job.
  status_rejected: { who: "staff", permission: "can_manage_pipeline" },
  status_hired: { who: "staff", permission: "can_manage_pipeline" },
  phase_advanced: { who: "staff", permission: "can_manage_pipeline" },
  interview_scheduled: { who: "staff", permission: "can_schedule_interviews" },
  interview_pick_time: { who: "staff", permission: "can_schedule_interviews" },
  interview_cancelled: { who: "staff", permission: "can_schedule_interviews" },
  interview_rescheduled: { who: "staff", permission: "can_schedule_interviews" },
  document_sent: { who: "staff", permission: "can_send_documents" },
  document_requested: { who: "staff", permission: "can_send_documents" },
  // An applicant's own moments.
  application_received: { who: "self" },
  new_application: { who: "applicant" },
  phase_completed: { who: "applicant" },
  // Both ways.
  new_message: { who: "message" },
  // Its own gate.
  continue_on_computer: { who: "own-gate" },
};

/** The request's own text a kind may keep, each cut to one short plain line. */
/** The kinds of interview an invitation may name: fixed phrases, never text from the request. */
const INTERVIEW_KINDS: readonly string[] = ["video call", "phone call", "meeting in person"];

const KEPT_TEXT: Readonly<Record<string, readonly string[]>> = {
  phase_advanced: ["phase_name"],
  phase_completed: ["phase_name"],
  interview_scheduled: ["interview_date", "interview_time"],
  interview_cancelled: ["original_date"],
  interview_rescheduled: ["new_date", "new_time"],
  document_sent: ["document_name"],
  document_requested: ["document_name"],
};

/* ── What the decision reads ────────────────────────────────────────────── */

/** One application, with its job's title and owner. */
export interface NotificationApplication {
  id: string;
  job_id: string | null;
  job_title: string | null;
  employer_id: string | null;
}

/** One active team membership. */
export interface NotificationMembership {
  employer_id: string;
  /** Empty or null: every job of that employer. */
  assigned_job_ids?: readonly string[] | null;
  can_manage_pipeline?: boolean | null;
  can_schedule_interviews?: boolean | null;
  can_send_documents?: boolean | null;
  can_message_candidates?: boolean | null;
}

export interface NotificationProfile {
  full_name?: string | null;
  company_name?: string | null;
  email?: string | null;
}

export interface NotificationLimitResult {
  allowed: boolean;
  hits: number;
  retryAfter: number;
}

/** What the function looks up for a decision. Each may throw; the decision then sends nothing. */
export interface NotificationLookups {
  /** Every application of one applicant, newest first. */
  applicationsOf: (candidateId: string) => Promise<NotificationApplication[]>;
  /** One person's ACTIVE team memberships. */
  membershipsOf: (userId: string) => Promise<NotificationMembership[]>;
  profileOf: (userId: string) => Promise<NotificationProfile | null>;
  checkLimit: (bucket: string, identifier: string, limit: number, windowSecs: number) => Promise<NotificationLimitResult>;
}

export interface NotificationRefusal {
  status: 400 | 401 | 403 | 429 | 503;
  code: "unknown_type" | "not_signed_in" | "not_allowed" | "too_many" | "try_later";
  message: string;
  retryAfter?: number;
}

export type NotificationDecision =
  | { ok: false; refusal: NotificationRefusal }
  | {
      ok: true;
      recipientUserId: string;
      /** Which side the recipient is on, for the kinds that read differently. */
      recipientRole: "candidate" | "employer";
      /** What the email may say: looked up, or cut to a short plain line. */
      data: Record<string, unknown>;
    };

/* ── Small readers ──────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One short plain line: no control characters, no line breaks, no runs of space. */
export function plainLine(value: unknown, max = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  // deno-lint-ignore no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max).trim() : undefined;
}

const NOT_ALLOWED: NotificationRefusal = { status: 403, code: "not_allowed", message: "You can't send this notification." };
const NOT_SIGNED_IN: NotificationRefusal = { status: 401, code: "not_signed_in", message: "Please sign in again." };
const TRY_LATER: NotificationRefusal = { status: 503, code: "try_later", message: "We couldn't send it just now. Please try again in a few minutes." };

/** How many emails one person may set off in an hour. */
export const NOTIFICATION_LIMITS = {
  /** An applicant: a handful per step is ordinary; this is a nuisance ceiling. */
  applicant: { bucket: "email-applicant", limit: 30, windowSecs: 3600 },
  /** The hiring team: high, because passing on a hundred applicants in one
   *  sitting is ordinary work and a decline that is silently not sent is
   *  worse than a busy hour. It only stops a runaway loop. */
  staff: { bucket: "email-staff", limit: 1500, windowSecs: 3600 },
} as const;

/** The applications that make `callerId` the hiring team for this applicant, newest first. */
export function staffLinks(
  callerId: string,
  memberships: readonly NotificationMembership[],
  applications: readonly NotificationApplication[],
  permission: StaffPermission,
): NotificationApplication[] {
  return applications.filter((app) => {
    if (!app.employer_id) return false;
    // The job's owner needs no permission.
    if (app.employer_id === callerId) return true;
    return memberships.some((tm) => {
      if (tm.employer_id !== app.employer_id) return false;
      if (tm[permission] !== true) return false;
      const assigned = Array.isArray(tm.assigned_job_ids) ? tm.assigned_job_ids : [];
      return assigned.length === 0 || (!!app.job_id && assigned.includes(app.job_id));
    });
  });
}

/**
 * The job the email names. An applicant never chooses it: the title they sent
 * is kept only when it IS the title of a job that links them, else the newest
 * such job's. The hiring team may name their own job as they like (they could
 * rename it anyway), so theirs is kept as a plain line.
 */
function jobTitleFor(asked: unknown, links: readonly NotificationApplication[], trustAsked: boolean): string | undefined {
  const wanted = plainLine(asked, 200);
  const titles = links.map((l) => plainLine(l.job_title, 200)).filter((t): t is string => !!t);
  if (wanted && (trustAsked || titles.includes(wanted))) return wanted;
  return titles[0];
}

function withDefined(entries: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) if (value !== undefined && value !== null && value !== "") out[key] = value;
  return out;
}

async function overLimit(
  callerId: string,
  rule: { bucket: string; limit: number; windowSecs: number },
  lookups: NotificationLookups,
): Promise<NotificationRefusal | null> {
  try {
    const result = await lookups.checkLimit(rule.bucket, `user:${callerId}`, rule.limit, rule.windowSecs);
    // The limiter is a ceiling on nuisance, not the lock on the door: when it
    // cannot be asked (no count comes back) the email still goes.
    if (result && result.hits > 0 && result.allowed === false) {
      const retryAfter = Math.max(1, Math.min(rule.windowSecs, Math.round(Number(result.retryAfter) || rule.windowSecs)));
      return { status: 429, code: "too_many", message: "Too many notifications. Please try again later.", retryAfter };
    }
  } catch {
    // As above.
  }
  return null;
}

/* ── The decision ───────────────────────────────────────────────────────── */

/**
 * Decides one request from a signed-in person or from nobody. (A service
 * caller is not decided here: the function sends what the system asks, as it
 * always has. continue_on_computer is not decided here either: it has its own
 * gate.) Returns who the email goes to and what it may say, or the refusal.
 */
export async function decideNotification(
  request: { type: unknown; recipient_user_id?: unknown; data?: unknown },
  caller: NotificationCaller,
  lookups: NotificationLookups,
): Promise<NotificationDecision> {
  const type = typeof request.type === "string" ? request.type : "";
  const rule = NOTIFICATION_RULES[type];
  if (!rule) return { ok: false, refusal: { status: 400, code: "unknown_type", message: "Unknown notification." } };
  if (caller.kind !== "user") return { ok: false, refusal: caller.kind === "anonymous" ? NOT_SIGNED_IN : NOT_ALLOWED };
  // The system's own alerts, and the kind with its own gate, are nobody's to ask for here.
  if (rule.who === "service" || rule.who === "own-gate") return { ok: false, refusal: NOT_ALLOWED };

  const asked = request.data && typeof request.data === "object" && !Array.isArray(request.data) ? (request.data as Record<string, unknown>) : {};
  const named = typeof request.recipient_user_id === "string" && UUID.test(request.recipient_user_id) ? request.recipient_user_id : null;
  const callerId = caller.id;

  try {
    /* An applicant, to themself. */
    if (rule.who === "self") {
      if (named && named !== callerId) return { ok: false, refusal: NOT_ALLOWED };
      const mine = (await lookups.applicationsOf(callerId)).filter((a) => a.employer_id);
      if (mine.length === 0) return { ok: false, refusal: NOT_ALLOWED };
      const limited = await overLimit(callerId, NOTIFICATION_LIMITS.applicant, lookups);
      if (limited) return { ok: false, refusal: limited };
      const jobTitle = jobTitleFor(asked.job_title, mine, false);
      const about = mine.find((a) => plainLine(a.job_title, 200) === jobTitle) ?? mine[0];
      const team = await lookups.profileOf(about.employer_id!).catch(() => null);
      return {
        ok: true,
        recipientUserId: callerId,
        recipientRole: "candidate",
        data: withDefined({ job_title: jobTitle, company_name: plainLine(team?.company_name, 120) }),
      };
    }

    if (!named) return { ok: false, refusal: NOT_ALLOWED };

    /* An applicant, to the owner of a job they applied to. */
    const applicantLinks = async () => (await lookups.applicationsOf(callerId)).filter((a) => a.employer_id === named);
    /* The hiring team, to someone who applied to their job. */
    const teamLinks = async (permission: StaffPermission) => {
      const theirs = (await lookups.applicationsOf(named)).filter((a) => a.employer_id);
      const owned = staffLinks(callerId, [], theirs, permission);
      if (owned.length > 0) return owned;
      // Not the owner of any of them: a team member, perhaps.
      if (!theirs.some((a) => a.employer_id !== callerId)) return [];
      return staffLinks(callerId, await lookups.membershipsOf(callerId), theirs, permission);
    };

    if (rule.who === "applicant") {
      const links = await applicantLinks();
      if (links.length === 0) return { ok: false, refusal: NOT_ALLOWED };
      const limited = await overLimit(callerId, NOTIFICATION_LIMITS.applicant, lookups);
      if (limited) return { ok: false, refusal: limited };
      const me = await lookups.profileOf(callerId).catch(() => null);
      const kept: Record<string, unknown> = {};
      for (const key of KEPT_TEXT[type] ?? []) kept[key] = plainLine(asked[key]);
      return {
        ok: true,
        recipientUserId: named,
        recipientRole: "employer",
        data: withDefined({
          ...kept,
          candidate_name: plainLine(me?.full_name, 120) ?? plainLine(me?.email, 120) ?? "A candidate",
          job_title: jobTitleFor(asked.job_title, links, false),
        }),
      };
    }

    if (rule.who === "staff") {
      const links = await teamLinks(rule.permission);
      if (links.length === 0) return { ok: false, refusal: NOT_ALLOWED };
      const limited = await overLimit(callerId, NOTIFICATION_LIMITS.staff, lookups);
      if (limited) return { ok: false, refusal: limited };
      const team = await lookups.profileOf(links[0].employer_id!).catch(() => null);
      const kept: Record<string, unknown> = {};
      for (const key of KEPT_TEXT[type] ?? []) kept[key] = plainLine(asked[key]);
      if (type === "interview_pick_time") {
        const times = (Array.isArray(asked.proposed_times_list) ? asked.proposed_times_list : [])
          .map((t) => plainLine(t, 120))
          .filter((t): t is string => !!t)
          .slice(0, 12);
        kept.proposed_times_list = times.length > 0 ? times : undefined;
        kept.window_count = times.length > 0 ? String(times.length) : undefined;
        // A new time, set after they could not make an earlier one: a mark, never text.
        kept.again = asked.again === "1" || asked.again === true ? "1" : undefined;
        // What kind of interview and how long, so the invitation can say what
        // it is: one of three fixed phrases, and a short length ("30 minutes").
        kept.interview_kind = INTERVIEW_KINDS.includes(asked.interview_kind as string) ? asked.interview_kind : undefined;
        kept.interview_length = /^\d{1,3} (minutes|hour|hours)( \d{1,2} minutes)?$/.test(String(asked.interview_length ?? "")) ? asked.interview_length : undefined;
      }
      return {
        ok: true,
        recipientUserId: named,
        recipientRole: "candidate",
        data: withDefined({
          ...kept,
          job_title: jobTitleFor(asked.job_title, links, true),
          // Who signs it: the job owner's own business name, whatever the request said.
          company_name: plainLine(team?.company_name, 120),
        }),
      };
    }

    /* A message: the hiring team to an applicant, or an applicant to the job's owner. */
    const toApplicant = await teamLinks("can_message_candidates");
    if (toApplicant.length > 0) {
      const limited = await overLimit(callerId, NOTIFICATION_LIMITS.staff, lookups);
      if (limited) return { ok: false, refusal: limited };
      return {
        ok: true,
        recipientUserId: named,
        recipientRole: "candidate",
        data: withDefined({
          message_preview: plainLine(asked.message_preview, 100),
          job_title: jobTitleFor(asked.job_title, toApplicant, true),
          sender_id: callerId,
          recipient_role: "candidate",
        }),
      };
    }
    const toOwner = await applicantLinks();
    if (toOwner.length === 0) return { ok: false, refusal: NOT_ALLOWED };
    const limited = await overLimit(callerId, NOTIFICATION_LIMITS.applicant, lookups);
    if (limited) return { ok: false, refusal: limited };
    const me = await lookups.profileOf(callerId).catch(() => null);
    const wantedTitle = plainLine(asked.job_title, 200);
    return {
      ok: true,
      recipientUserId: named,
      recipientRole: "employer",
      data: withDefined({
        message_preview: plainLine(asked.message_preview, 100),
        // Only a job that really links them; a message need not name one.
        job_title: wantedTitle && toOwner.some((a) => plainLine(a.job_title, 200) === wantedTitle) ? wantedTitle : undefined,
        sender_name: plainLine(me?.full_name, 120) ?? "A candidate",
        sender_id: callerId,
        recipient_role: "employer",
      }),
    };
  } catch {
    // A lookup failed: we cannot tell whose this is, so nothing is sent.
    return { ok: false, refusal: TRY_LATER };
  }
}
