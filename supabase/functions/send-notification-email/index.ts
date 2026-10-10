import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
// Pinned (2026-10-07). "@2" follows the newest release, and at 12:34 UTC today
// 2.117.3 came out with a part esm.sh could not serve, so this function would
// not bundle and could not be deployed at all. 2.117.2 is the release this
// function was already running on in production (what "@2" meant until then).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { declineNoteLines } from "../_shared/declineNote.ts";
import { welcomeTodo, type WelcomeTodo } from "../_shared/welcomeTodo.ts";
import { CONTINUE_ON_COMPUTER_TYPE, continueOnComputerEmail, decideContinueLinkEmail } from "../_shared/continueOnComputerEmail.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import {
  NOTIFICATION_RULES,
  decideNotification,
  looksLikeServiceKey,
  sameSecret,
  type NotificationCaller,
} from "../_shared/notificationAccess.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Production base URL - uses APP_BASE_URL env variable with defensive protocol validation
const getAppBaseUrl = (): string => {
  let appBaseUrl = Deno.env.get("APP_BASE_URL");
  if (appBaseUrl) {
    // Remove trailing slash if present
    appBaseUrl = appBaseUrl.replace(/\/$/, '');
    // Defensive: ensure protocol is present (auto-prepend https:// if missing)
    if (!appBaseUrl.startsWith('http://') && !appBaseUrl.startsWith('https://')) {
      console.warn(`[send-notification-email] APP_BASE_URL missing protocol, auto-prepending https:// to: ${appBaseUrl}`);
      appBaseUrl = `https://${appBaseUrl}`;
    }
    return appBaseUrl;
  }
  // Fallback to production domain
  return "https://hireflownow.com";
};

type NotificationType = 
  | "new_application"
  | "phase_advanced"
  | "new_message"
  | "interview_scheduled"
  | "interview_pick_time"
  | "interview_cancelled"
  | "interview_rescheduled"
  | "interview_reminder"
  | "interview_confirmed"
  | "interview_time_picked"
  | "document_sent"
  | "document_signed"
  | "document_requested"
  | "phase_completed"
  | "status_rejected"
  | "status_hired"
  | "application_received"
  | "reschedule_requested"
  | "voice_minutes_low"
  | "voice_minutes_exhausted"
  | "interview_ready"
  | "steps_reopened"
  | "continue_on_computer";

/** Emails that go to the hiring team; everything else goes to a candidate
 *  (new_message goes either way and is decided by the recipient's role). */
const EMPLOYER_FACING: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "new_application",
  "document_signed",
  "phase_completed",
  "reschedule_requested",
  "voice_minutes_low",
  "voice_minutes_exhausted",
  "interview_ready",
  "interview_time_picked",
]);

/** Who an email reads as coming from. Candidates applied to the Zulu Support
 *  Team on its careers site, so that is who writes to them; the hiring team's
 *  own alerts come from HireFlow. Both addresses are on hireflownow.com, the
 *  domain verified in Resend.
 *
 *  An applicant's email comes from an address nobody reads, on purpose. It
 *  was hiring@ until 2026-10-09: applicants replied to it, the replies landed
 *  in the owner's own mail, and he could not answer from the hiring address.
 *  The owner: "the applicant cannot email or reply to the email we sent them
 *  ... they should only message us." So the address says it, and every
 *  applicant's email says where to write instead (NO_REPLY_NOTE below). */
const CANDIDATE_SENDER = "Zulu Support Team <no-reply@hireflownow.com>";
const TEAM_SENDER = "HireFlow <notifications@hireflownow.com>";

const isCandidateEmail = (type: NotificationType, recipientRole: RecipientRole) =>
  type === "new_message" ? recipientRole === "candidate" : !EMPLOYER_FACING.has(type);

interface NotificationRequest {
  type: NotificationType;
  /** Not read for continue_on_computer: that one goes to whoever is signed in. */
  recipient_user_id: string;
  data: {
    candidate_name?: string;
    job_title?: string;
    phase_name?: string;
    sender_name?: string;
    interview_date?: string;
    interview_time?: string;
    original_date?: string;
    new_date?: string;
    new_time?: string;
    document_name?: string;
    message_preview?: string;
    company_name?: string;
    rejection_reason?: string;
    proposed_times?: string;
    proposed_times_list?: string[];
    window_count?: string;
    /** interview_pick_time: "1" for a new time, set after they could not make an earlier one. */
    again?: string;
    /** interview_pick_time, interview_confirmed: "video call", "phone call" or "meeting in person". */
    interview_kind?: string;
    candidate_note?: string;
    minutes_remaining?: string;
    active_jobs_count?: string;
    score?: string;
    /** new_message: the sender's user id, for the employer's thread deep link. */
    sender_id?: string;
    /** new_message: skips the role lookup when the caller already knows. */
    recipient_role?: RecipientRole;
    /** steps_reopened: the steps to redo, in words ("the chat practice and the interview"). */
    retake_steps?: string;
    /** interview_reminder: which one, "day" (the day before) or "hour" (an hour before). */
    reminder?: string;
    /** interview_reminder, the day-before one: "today" or "tomorrow" on the applicant's clock. */
    day_word?: string;
    /** interview_confirmed, interview_time_picked, interview_reminder: "30 minutes". */
    interview_length?: string;
    /** interview_confirmed: how the applicant joins, in one line. Never the meeting link itself. */
    join_note?: string;
    /** interview_time_picked: the agreed time on the team's clock ("Thursday, October 8 at 9:00 AM EDT"). */
    interview_when?: string;
    /** interview_time_picked: how it became agreed. */
    interview_change?: string;
    /** reschedule_requested: when the applicant is free, in their own words. */
    availability?: string;
    /** reschedule_requested: the time they cannot make, on the team's clock. */
    cannot_make?: string;
    /** reschedule_requested: how far their clock is from the team's ("12 hours ahead of yours"). */
    clock_gap?: string;
    /** continue_on_computer: the applicant's own application. The ONLY field
     *  that type reads from a request; everything it says is looked up.
     *  status_hired, document_requested: the application the email is about,
     *  kept only when it is one the sender hires for (notificationAccess). */
    application_id?: string;
    /** status_hired, document_requested: what is waiting for them, looked up
     *  here from the application (never from the request). */
    todo?: WelcomeTodo;
    /** The recipient's first name, looked up here. */
    first_name?: string;
    /** document_sent: the document is an offer letter (looked up here), and
     *  how many whole days they have to answer it. */
    offer?: { replyInDays: number | null };
  };
}

type RecipientRole = "employer" | "candidate" | "team_member";

/**
 * Every template below interpolates attacker-influenceable text (job
 * titles, candidate/sender names, message previews, notes) straight into
 * HTML email bodies. Escape it so a hostile job title or message can't
 * inject markup into an email an employer or candidate opens.
 */
/**
 * A length as it reads before a noun: "30 minutes" -> "30-minute", "1 hour"
 * -> "1-hour", "1 hour 30 minutes" -> "90-minute". Empty when it cannot be
 * read (the sentence then simply leaves the length out).
 */
const lengthAdjective = (length: unknown): string => {
  const found = /^(?:(\d{1,2}) hours?)?\s*(?:(\d{1,3}) minutes)?$/.exec(typeof length === "string" ? length.trim() : "");
  if (!found || (!found[1] && !found[2])) return "";
  const total = Number(found[1] ?? 0) * 60 + Number(found[2] ?? 0);
  if (total <= 0) return "";
  return total % 60 === 0 ? `${total / 60}-hour` : `${total}-minute`;
};

/**
 * Where an applicant's question should go: the app's Messages, not a reply
 * to the email. On 2026-10-08 a finalist replied to "Interview confirmed"
 * with a question, and the owner had no way to answer from the hiring
 * address. A message in the app reaches the team, stays on the applicant's
 * record, and its answer is emailed back from the hiring address.
 */
const QUESTIONS_LINE = `<p style="color: #666;">Questions before then? Open Messages in your account and write to the hiring team. That is the quickest way to reach them.</p>`;

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getEmailContent = (
  type: NotificationType,
  data: NotificationRequest["data"],
  recipientRole: RecipientRole = "candidate",
) => {
  const baseUrl = getAppBaseUrl();
  const signer = data.company_name?.trim()
    ? /\bteam$/i.test(data.company_name.trim()) ? `The ${esc(data.company_name.trim())}` : `The ${esc(data.company_name.trim())} team`
    : "The hiring team";
  const defaultSignature = isCandidateEmail(type, recipientRole) ? `— ${signer}` : "— The HireFlow Team";

  // Every candidate-facing link goes through candidate sign-in with the real
  // destination as a redirect. A bare /applications link sent a signed-out
  // candidate to the EMPLOYER login page; CandidateAuth honours a safe
  // `redirect` param and routes an already-signed-in candidate straight through.
  const candidateLink = (path: string) =>
    `${baseUrl}/candidate/auth?redirect=${encodeURIComponent(path)}`;

  // On every email to an applicant, under what the email is about and above
  // the signature: replies are not read, and where to write instead. The link
  // opens Messages in their account (through sign-in when they are signed
  // out). The hiring team's own alerts do not carry it.
  const NO_REPLY_NOTE = isCandidateEmail(type, recipientRole)
    ? `<p style="margin-top: 28px; padding: 12px 14px; background: #f4f6f5; border-radius: 8px; color: #444; font-size: 14px; line-height: 1.5;">
        <strong>Have a question?</strong> Please do not reply to this email. Replies do not reach us.
        <a href="${candidateLink("/messages")}" style="color: #0f7a5a; font-weight: 600;">Message us in your account</a> and we will answer you there.
      </p>`
    : "";

  // Simple, clean template wrapper. `signature` lets a message that comes from
  // the employer (a decision on an application) sign as the employer.
  const wrapEmail = (title: string, content: string, buttonText?: string, buttonUrl?: string, signature = defaultSignature) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #111; margin-bottom: 20px;">${title}</h2>
      ${content}
      ${buttonText && buttonUrl ? `
        <p style="margin-top: 24px;">
          <a href="${buttonUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">${buttonText}</a>
        </p>
      ` : ''}
      ${NO_REPLY_NOTE}
      <p style="color: #666; font-size: 13px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        ${signature}
      </p>
    </div>
  `;

  const companyName = esc(data.company_name?.trim() || "");
  // "The Zulu Support Team", never "The Zulu Support Team team".
  const teamLabel = companyName
    ? /\bteam$/i.test(companyName) ? `The ${companyName}` : `The ${companyName} team`
    : "The hiring team";

  const templates: Record<NotificationType, { subject: string; html: string }> = {
    // EMPLOYER-FACING
    new_application: {
      subject: `New Application: ${data.candidate_name} applied for ${data.job_title}`,
      html: wrapEmail(
        "New Application Received",
        `<p><strong>${esc(data.candidate_name)}</strong> has applied for the <strong>${esc(data.job_title)}</strong> position.</p>
         <p style="color: #666;">Review their application in your dashboard.</p>`,
        "View Application",
        `${baseUrl}/applicants`
      ),
    },
    
    // CANDIDATE-FACING
    application_received: {
      subject: `Application Submitted: ${data.job_title}`,
      html: wrapEmail(
        "Application Submitted",
        `<p>Your application for <strong>${esc(data.job_title)}</strong> has been successfully submitted.</p>
         <p style="color: #666;">The hiring team will review your application and get back to you. You can track your application status in your dashboard.</p>`,
        "Track Application",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    phase_advanced: {
      subject: `Update: You've been moved to ${data.phase_name} for ${data.job_title}`,
      html: wrapEmail(
        "Application Update",
        `<p>Great news! Your application for <strong>${esc(data.job_title)}</strong> has been moved to the next phase.</p>
         <p><strong>Current Phase:</strong> ${esc(data.phase_name)}</p>
         <p style="color: #666;">Log in to continue with the next steps.</p>`,
        "Continue Application",
        candidateLink("/applications")
      ),
    },
    
    // BOTH SIDES — the copy and the link depend on who is receiving it. An
    // employer used to get "a new message from the hiring team" (they ARE the
    // hiring team) with a candidate sign-in link.
    new_message: recipientRole === "candidate"
      ? {
          subject: `New message regarding your application${data.job_title ? `: ${data.job_title}` : ''}`,
          html: wrapEmail(
            "New Message",
            `<p>You have a new message from the hiring team${data.job_title ? ` regarding <strong>${esc(data.job_title)}</strong>` : ''}.</p>
             ${data.message_preview ? `<p style="color: #666; font-style: italic; border-left: 3px solid #ddd; padding-left: 12px;">"${esc(data.message_preview)}..."</p>` : ''}`,
            "View Message",
            candidateLink("/messages")
          ),
        }
      : {
          subject: `New message from ${data.sender_name || "a candidate"}${data.job_title ? ` — ${data.job_title}` : ''}`,
          html: wrapEmail(
            `New message from ${esc(data.sender_name || "a candidate")}`,
            `<p><strong>${esc(data.sender_name || "A candidate")}</strong> sent you a message${data.job_title ? ` about <strong>${esc(data.job_title)}</strong>` : ''}.</p>
             ${data.message_preview ? `<p style="color: #666; font-style: italic; border-left: 3px solid #ddd; padding-left: 12px;">"${esc(data.message_preview)}..."</p>` : ''}`,
            "Reply",
            data.sender_id
              ? `${baseUrl}/messages?candidate=${encodeURIComponent(data.sender_id)}`
              : `${baseUrl}/messages`
          ),
        },
    
    // CANDIDATE-FACING
    interview_scheduled: {
      subject: `Interview Scheduled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Scheduled",
        `<p>Your interview for <strong>${esc(data.job_title)}</strong> has been scheduled.</p>
         <p><strong>Date:</strong> ${esc(data.interview_date)}<br><strong>Time:</strong> ${esc(data.interview_time)}</p>
         <p style="color: #666;">Check your dashboard for meeting details.</p>`,
        "View Interview Details",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING — a time is agreed: the applicant picked one of the
    // offered times, swapped to another, or confirmed the one that was set.
    // Sent by candidate-interview-response (the system), which writes the
    // date and time on the applicant's own clock with the zone named. The
    // meeting link is never in it: one link serves every interview, and the
    // application page opens it 15 minutes before the start.
    interview_confirmed: {
      subject: `Interview confirmed: ${data.job_title}`,
      html: wrapEmail(
        "Your interview is confirmed",
        `<p>Your interview for <strong>${esc(data.job_title)}</strong> is confirmed.</p>
         <p><strong>Date:</strong> ${esc(data.interview_date)}<br><strong>Time:</strong> ${esc(data.interview_time)}${data.interview_length ? `<br><strong>Length:</strong> ${esc(data.interview_length)}` : ""}</p>
         <p><strong>What to expect:</strong> this is the final step, ${data.interview_kind ? `a ${esc(data.interview_kind)}` : "an interview"} with the hiring team. It is a conversation, not another test.</p>
         ${data.join_note ? `<p>${esc(data.join_note)}</p>` : ""}
         <p style="color: #666;">Can't make it after all? Open your application and choose "Can't make it?" so the team knows.</p>
         ${QUESTIONS_LINE}`,
        "Open my application",
        candidateLink(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.application_id ?? "")
            ? `/applications/${data.application_id}`
            : "/applications"
        )
      ),
    },

    // EMPLOYER-FACING — the same moment, told to the hiring team, with the
    // time on the team's own clock.
    interview_time_picked: (() => {
      const did =
        data.interview_change === "moved" ? "moved their interview"
        : data.interview_change === "confirmed" ? "confirmed their interview"
        : "picked an interview time";
      const title =
        data.interview_change === "moved" ? "Interview moved"
        : data.interview_change === "confirmed" ? "Interview confirmed"
        : "Interview time picked";
      return {
        subject: `${data.candidate_name} ${did}: ${data.job_title}`,
        html: wrapEmail(
          title,
          `<p><strong>${esc(data.candidate_name)}</strong> ${did} for <strong>${esc(data.job_title)}</strong>.</p>
           <p><strong>When:</strong> ${esc(data.interview_when)}${data.interview_length ? `<br><strong>Length:</strong> ${esc(data.interview_length)}` : ""}</p>
           <p style="color: #666;">It is on your Interviews page, with the interview guide.</p>`,
          "Open Interviews",
          `${baseUrl}/interviews`
        ),
      };
    })(),

    // CANDIDATE-FACING
    // One time is the rule since 2026-10-07 (the owner: "I wanna just give
    // them one time for the interview, not two"): the email states it, and
    // says what to do if they cannot make it. Several times read as before.
    interview_pick_time: (() => {
      const times = data.proposed_times_list ?? [];
      const list = times.length > 0
        ? `<ul style="color: #333; padding-left: 20px; margin: 16px 0;">
             ${times.map((t) => `<li style="margin-bottom: 6px;">${esc(t)}</li>`).join("")}
           </ul>`
        : "";
      // What the interview is, said before the time: a finalist wrote in on
      // 2026-10-08 to ask what "the upcoming 30-minute video interview will
      // cover and whether this is the final interview stage".
      const kind = data.interview_kind || "interview";
      const long = lengthAdjective(data.interview_length);
      const what = long ? `${long} ${kind}` : kind;
      const article = /^(8|11|18)/.test(what) || /^interview/.test(what) ? "an" : "a";
      const finalStep = `<p>You have completed the online steps, and you have been selected for the final step: <strong>${esc(article)} ${esc(what)}</strong> with the hiring team. It is a conversation, not another test.</p>`;
      if (times.length === 1) {
        const again = data.again === "1";
        return {
          subject: again ? `A new time for your interview: ${data.job_title}` : `You're invited to an interview: ${data.job_title}`,
          html: wrapEmail(
            again ? "A New Time for Your Interview" : "You're Invited to an Interview",
            `${again ? "" : finalStep}
             <p>${again
              ? `The hiring team for <strong>${esc(data.job_title)}</strong> set a new time for your interview (the final step: ${esc(article)} ${esc(what)} with the hiring team):`
              : `The hiring team for <strong>${esc(data.job_title)}</strong> would like to interview you at this time:`}</p>
             ${list}
             <p>Open your application to book it.</p>
             <p style="color: #666;">Can't make it? Tell them there which days you are free, and from what time to what time, and they will set another time.</p>
             ${QUESTIONS_LINE}`,
            "Book This Time",
            candidateLink("/applications")
          ),
        };
      }
      return {
        subject: `Pick a time for your interview — ${data.job_title}`,
        html: wrapEmail(
          "Pick a Time for Your Interview",
          `${finalStep}
           <p>The hiring team for <strong>${esc(data.job_title)}</strong> has proposed ${esc(data.window_count) || "a few"} times for your interview. Pick whichever works best for you:</p>
           ${list}
           <p style="color: #666;">Head to your application to choose a time — it only takes a second.</p>`,
          "Pick a Time",
          candidateLink("/applications")
        ),
      };
    })(),

    // CANDIDATE-FACING
    interview_cancelled: {
      subject: `Interview Cancelled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Cancelled",
        `<p>Unfortunately, your interview for <strong>${esc(data.job_title)}</strong> has been cancelled.</p>
         ${data.original_date ? `<p style="color: #666;">Original date: ${esc(data.original_date)}</p>` : ''}
         <p style="color: #666;">Check your messages for updates from the hiring team.</p>`,
        "Check Messages",
        candidateLink("/messages")
      ),
    },
    
    // CANDIDATE-FACING
    interview_rescheduled: {
      subject: `Interview Rescheduled: ${data.job_title}`,
      html: wrapEmail(
        "Interview Rescheduled",
        `<p>Your interview for <strong>${esc(data.job_title)}</strong> has been rescheduled.</p>
         <p><strong>New Date:</strong> ${esc(data.new_date)}<br><strong>New Time:</strong> ${esc(data.new_time)}</p>
         <p style="color: #666;">Please confirm your availability.</p>`,
        "Confirm New Time",
        candidateLink("/applications")
      ),
    },
    
    // CANDIDATE-FACING
    // CANDIDATE-FACING. Sent by interview-reminders (the scheduler), the day
    // before and an hour before a time both sides agreed
    // (_shared/interviewReminders.ts). `reminder` says which; anything else
    // reads as the day-before one. The time is on the applicant's own clock.
    interview_reminder: (() => {
      const soon = data.reminder === "hour";
      // "today" or "tomorrow" on the applicant's own clock (dayWord); a day
      // not said plainly reads "coming up", never a wrong "tomorrow".
      const when = data.day_word === "today" || data.day_word === "tomorrow" ? data.day_word : "coming up";
      return {
        subject: soon ? `Your interview starts in about an hour: ${data.job_title}` : `Reminder: your interview is ${when}: ${data.job_title}`,
        html: wrapEmail(
          soon ? "Your interview starts in about an hour" : `Your interview is ${when}`,
          `<p>A reminder that your interview for <strong>${esc(data.job_title)}</strong> ${soon ? "starts in about an hour" : `is ${when}`}.</p>
           <p><strong>Date:</strong> ${esc(data.interview_date)}<br><strong>Time:</strong> ${esc(data.interview_time)}${data.interview_length ? `<br><strong>Length:</strong> ${esc(data.interview_length)}` : ""}</p>
           ${data.join_note ? `<p>${esc(data.join_note)}</p>` : ""}
           <p style="color: #666;">Can't make it after all? Open your application and choose "Can't make it?" so the team knows.</p>`,
          "Open my application",
          candidateLink(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.application_id ?? "")
              ? `/applications/${data.application_id}`
              : "/applications"
          )
        ),
      };
    })(),
    
    // CANDIDATE-FACING
    // An offer letter reads as a job offer from the business (the owner,
    // 2026-10-10: what each step sends must be clear); any other document
    // as a document to sign.
    document_sent: data.offer
      ? {
          subject: data.company_name?.trim() ? `You have a job offer from ${data.company_name.trim()}` : "You have a job offer",
          html: wrapEmail(
            "You have a job offer",
            `<p>${data.first_name ? `Hi ${esc(data.first_name)}, ` : ""}${companyName || "The hiring team"} would like you to join as <strong>${esc(data.job_title)}</strong>.</p>
             <p>Read your offer and sign it in your account.</p>
             ${data.offer.replyInDays ? `<p>Please answer within ${data.offer.replyInDays} ${data.offer.replyInDays === 1 ? "day" : "days"}.</p>` : ""}`,
            "Read and sign your offer",
            candidateLink("/my-documents"),
            `— ${teamLabel}`
          ),
        }
      : {
          subject: `Document to Sign: ${data.document_name}`,
          html: wrapEmail(
            "Document Awaiting Signature",
            `<p>The hiring team has sent you a document to review and sign.</p>
             <p><strong>Document:</strong> ${esc(data.document_name)}</p>`,
            "Review & Sign",
            candidateLink("/my-documents")
          ),
        },
    
    // EMPLOYER-FACING
    document_signed: {
      subject: `Document Signed: ${data.document_name}`,
      html: wrapEmail(
        "Document Signed",
        `<p><strong>${esc(data.candidate_name)}</strong> has signed the document <strong>${esc(data.document_name)}</strong>.</p>
         <p style="color: #666;">The document is now awaiting your countersignature.</p>`,
        "View Document",
        `${baseUrl}/documents`
      ),
    },
    
    // CANDIDATE-FACING
    document_requested: (() => {
      // What they are asked to send, as a list (looked up from the
      // application), with the team's name, so an ID request never reads
      // like it came from nowhere. Without the list: the one line the
      // request named.
      const todo = data.todo;
      const items = todo?.items ?? [];
      const from = companyName || "The hiring team";
      return {
        subject: companyName ? `Please send your documents to ${data.company_name?.trim()}` : "Please send your documents",
        html: wrapEmail(
          "Please send your documents",
          `<p>Hi${data.first_name ? ` ${esc(data.first_name)}` : ""}, ${from} asked you to:</p>
           ${items.length > 0
             ? `<ol style="padding-left: 20px;">${items.map((line) => `<li style="margin-bottom: 4px;">${esc(line)}</li>`).join("")}</ol>`
             : `<p><strong>${esc(data.document_name || "Send a document")}</strong></p>`}
           ${todo?.dueInDays ? `<p>Please do this within ${todo.dueInDays} ${todo.dueInDays === 1 ? "day" : "days"}.</p>` : ""}
           <p style="color: #666; font-size: 13px;">Only ${esc(companyName || "the hiring team")} can see what you send.${todo?.deletesIds ? " ID papers are deleted 30 days after they are approved." : ""}</p>`,
          "Send them in HireFlow",
          candidateLink("/my-documents"),
          `— ${teamLabel}`
        ),
      };
    })(),
    
    // EMPLOYER-FACING
    phase_completed: {
      subject: `Phase Completed: ${data.candidate_name} finished ${data.phase_name}`,
      html: wrapEmail(
        "Phase Completed",
        `<p><strong>${esc(data.candidate_name)}</strong> has completed the <strong>${esc(data.phase_name)}</strong> phase for <strong>${esc(data.job_title)}</strong>.</p>
         <p style="color: #666;">Review their submission and decide on next steps.</p>`,
        "Review Submission",
        `${baseUrl}/applicants`
      ),
    },
    
    // CANDIDATE-FACING — a decision, so it comes from the employer, not from
    // HireFlow. Short and warm; no "feedback report" (there is nothing to
    // download), and no mention of how the decision was reached. The words
    // are _shared/declineNote.ts, the same ones the Pass dialog shows the
    // owner before he confirms: thanks, "not this time", a door left open.
    status_rejected: {
      subject: `An update on your ${data.job_title} application`,
      html: wrapEmail(
        `An update from ${companyName || "the hiring team"}`,
        declineNoteLines(data.job_title).map((line) => `<p>${esc(line)}</p>`).join("\n         "),
        "View your applications",
        candidateLink("/applications"),
        `— ${teamLabel}`
      ),
    },
    
    // CANDIDATE-FACING — also from the employer.
    status_hired: (() => {
      // The owner, 2026-10-10: "she will actually get a nice congratulations
      // email and it will say things like documents requested, please log in
      // to your HireFlow to submit those documentation and sign stuff". One
      // email: the congratulations, then what is really waiting for them
      // (an unsigned offer letter, the documents asked for), looked up from
      // the application by the function (_shared/welcomeTodo.ts).
      const todo = data.todo;
      const items = todo?.items ?? [];
      const company = data.company_name?.trim() || "";
      return {
        subject: company ? `Welcome to ${company}${data.first_name ? `, ${data.first_name}` : ""}` : `You're hired: ${data.job_title}`,
        html: wrapEmail(
          "You're hired!",
          `<p>Congratulations${data.first_name ? `, ${esc(data.first_name)}` : ""}. You're joining ${companyName || "the team"} as <strong>${esc(data.job_title)}</strong>.</p>
           ${items.length > 0
             ? `<p>Before your first day, please:</p>
                <ol style="padding-left: 20px;">${items.map((line) => `<li style="margin-bottom: 4px;">${esc(line)}</li>`).join("")}</ol>
                ${todo?.dueInDays ? `<p>Please do this within ${todo.dueInDays} ${todo.dueInDays === 1 ? "day" : "days"}.</p>` : ""}
                ${todo?.asksForDocuments ? `<p style="color: #666; font-size: 13px;">Only ${companyName || "the hiring team"} can see what you send.${todo.deletesIds ? " ID papers are deleted 30 days after they are approved." : ""}</p>` : ""}`
             : `<p style="color: #666;">We'll follow up with your start date and next steps. Your messages are in your account.</p>`}`,
          items.length > 0 ? "Open HireFlow" : "Open your application",
          candidateLink(items.length > 0 ? "/my-documents" : "/applications"),
          `— ${teamLabel}`
        ),
      };
    })(),
    
    // EMPLOYER-FACING
    // They cannot make the time. Since 2026-10-07 they say when they are
    // free, in words, and the team sets the new time; an answer from a page
    // left open since before then still lists times of their own.
    reschedule_requested: data.availability
      ? {
          subject: `${data.candidate_name} can't make the interview time: ${data.job_title}`,
          html: wrapEmail(
            "Can't Make the Interview Time",
            `<p><strong>${esc(data.candidate_name)}</strong> can't make ${data.cannot_make ? esc(data.cannot_make) : "the interview time"} for <strong>${esc(data.job_title)}</strong>.</p>
             <p><strong>When they are free:</strong> "${esc(data.availability)}"</p>
             ${data.clock_gap ? `<p style="color: #666;">That is on their own clock, which is ${esc(data.clock_gap)}.</p>` : ""}
             <p style="color: #666;">Open Interviews to set a new time. They are asked to book it, and you are told when they do.</p>`,
            "Set a New Time",
            `${baseUrl}/interviews`
          ),
        }
      : {
          subject: `Reschedule Request: ${data.candidate_name} for ${data.job_title}`,
          html: wrapEmail(
            "Reschedule Requested",
            `<p><strong>${esc(data.candidate_name)}</strong> has requested to reschedule their interview for <strong>${esc(data.job_title)}</strong>.</p>
             ${data.candidate_note ? `<p style="color: #666;"><strong>Candidate's note:</strong> "${esc(data.candidate_note)}"</p>` : ''}
             ${data.proposed_times ? `<p><strong>Proposed times:</strong> ${esc(data.proposed_times)}</p>` : ''}
             <p style="color: #666;">Review the request and either approve a new time or decline.</p>`,
            "Review Request",
            `${baseUrl}/interviews`
          ),
        },
    
    // EMPLOYER-FACING - Voice Minutes
    voice_minutes_low: {
      subject: `Low Voice Minutes: Only ${data.minutes_remaining} minutes remaining`,
      html: wrapEmail(
        "Voice Minutes Running Low",
        `<p>Your voice minutes are running low. You have <strong>${esc(data.minutes_remaining)} minutes</strong> remaining.</p>
         ${parseInt(data.active_jobs_count || '0') > 0 ? `<p style="color: #666;">You have <strong>${esc(data.active_jobs_count)} active job${parseInt(data.active_jobs_count || '0') > 1 ? 's' : ''}</strong> that may be affected if you run out of minutes.</p>` : ''}
         <p style="color: #666;">Purchase more voice minutes to ensure uninterrupted AI voice interviews for your candidates.</p>`,
        "Purchase Voice Minutes",
        `${baseUrl}/settings?tab=subscription`
      ),
    },
    
    voice_minutes_exhausted: {
      subject: `Action Required: Voice Minutes Exhausted`,
      html: wrapEmail(
        "Voice Minutes Exhausted",
        `<p style="color: #dc2626;"><strong>Your voice minutes have been depleted.</strong></p>
         ${parseInt(data.active_jobs_count || '0') > 0 ? `<p>Candidates applying to your <strong>${esc(data.active_jobs_count)} active job${parseInt(data.active_jobs_count || '0') > 1 ? 's' : ''}</strong> cannot complete AI voice interviews until you purchase more minutes.</p>` : '<p>Candidates cannot complete AI voice interviews until you purchase more minutes.</p>'}
         <p style="color: #666;">Purchase more voice minutes immediately to restore AI voice interview functionality.</p>`,
        "Purchase Voice Minutes Now",
        `${baseUrl}/settings?tab=subscription`
      ),
    },
    
    // CANDIDATE-FACING — a step the hiring team handed back because something
    // on OUR side broke while they were taking it (2026-10-07: the AI service
    // stopped answering mid-chat). Says it was our fault, that the rest is
    // saved, and where to go. Never names the machine behind it.
    steps_reopened: (() => {
      const steps = data.retake_steps?.trim() || "one part of your application";
      const plural = /\band\b/.test(steps);
      const firstName = data.candidate_name?.trim().split(/\s+/)[0] || "";
      return {
        // "Zulu Support Team" -> "your Zulu application".
        subject: `Please redo ${plural ? "part" : "one part"} of your ${data.company_name?.trim() ? `${data.company_name.trim().split(/\s+/)[0]} ` : ""}application`,
        html: wrapEmail(
          plural ? "Please redo part of your application" : "Please redo one part of your application",
          `<p>Hi${firstName ? ` ${esc(firstName)}` : ""}, thanks for applying for <strong>${esc(data.job_title)}</strong>.</p>
           <p>While you were doing ${esc(steps)}, we had a technical problem on our side and it stopped responding. That was our fault, not yours.</p>
           <p>Everything else you did is saved. Please open <strong>hireflownow.com/applications</strong> on your computer to redo ${plural ? "those parts" : "that part"}.</p>`,
          "Continue my application",
          candidateLink("/applications")
        ),
      };
    })(),

    // CANDIDATE-FACING — "Email me the link" on the Continue on your computer
    // screen: the one email an applicant asks for themself. The handler has
    // already replaced `data` with what it looked up (the name, the job, the
    // team), so nothing here came from the page. Words:
    // _shared/continueOnComputerEmail.ts.
    continue_on_computer: (() => {
      const words = continueOnComputerEmail({
        firstName: data.candidate_name,
        jobTitle: data.job_title,
        siteHost: baseUrl.replace(/^https?:\/\//, ""),
      });
      return {
        subject: words.subject,
        html: wrapEmail(
          esc(words.title),
          words.lines.map((line) => `<p>${esc(line)}</p>`).join("\n           "),
          esc(words.button),
          candidateLink("/applications")
        ),
      };
    })(),

    // EMPLOYER-FACING - Interview Ready
    interview_ready: {
      subject: `Ready for Interview: ${data.candidate_name} scored ${data.score}% for ${data.job_title}`,
      html: wrapEmail(
        "Candidate Ready for AIVA Interview",
        `<p><strong>${esc(data.candidate_name)}</strong> has passed all automated assessments for <strong>${esc(data.job_title)}</strong> with a score of <strong>${esc(data.score)}%</strong>.</p>
         <p style="color: #666;">They are now ready for the AIVA voice interview. You'll need to manually move them to the interview phase and configure the interview settings.</p>`,
        "Review Candidate",
        `${baseUrl}/applicants`
      ),
    },
  };

  return templates[type];
};

const getPreferenceField = (type: NotificationType): string => {
  const mapping: Record<NotificationType, string> = {
    new_application: "email_new_applications",
    application_received: "email_phase_updates",
    phase_advanced: "email_phase_updates",
    new_message: "email_messages",
    interview_scheduled: "email_interview_reminders",
    interview_pick_time: "email_interview_reminders",
    interview_cancelled: "email_interview_reminders",
    interview_rescheduled: "email_interview_reminders",
    interview_reminder: "email_interview_reminders",
    interview_confirmed: "email_interview_reminders",
    interview_time_picked: "email_interview_reminders",
    document_sent: "email_document_updates",
    document_signed: "email_document_updates",
    document_requested: "email_document_updates",
    phase_completed: "email_phase_updates",
    status_rejected: "email_phase_updates",
    status_hired: "email_phase_updates",
    reschedule_requested: "email_interview_reminders",
    voice_minutes_low: "email_voice_minutes",
    voice_minutes_exhausted: "email_voice_minutes",
    interview_ready: "email_new_applications", // Uses new_applications pref since it's about new candidates
    steps_reopened: "email_phase_updates",
    continue_on_computer: "email_phase_updates",
  };
  return mapping[type];
};

/**
 * Who is asking (_shared/notificationAccess.ts). The gateway lets the site's
 * public key through, so the function works it out itself:
 *   - the service key (another edge function, a script): this function's own
 *     key, or another form of it that the database itself accepts as one;
 *   - a signed-in person, by their own sign-in;
 *   - otherwise nobody.
 *
 * Where the key is looked for matters. Another edge function calls with the
 * project's secret key, and that arrives in the `apikey` header with NO
 * Authorization header at all (seen live on 2026-10-07 with two throwaway
 * functions: Authorization none, apikey the secret key). The first version of
 * this check read only Authorization, so every email one function asked
 * another to send was answered 401 from 15:34 UTC that day until this was
 * fixed: the "they suggested other times" email, "ready for interview", and
 * the voice-minutes alerts. The function's tests had modelled the key in the
 * Authorization header and passed. So: the service key counts in either
 * header. Holding it is the proof; which header carried it is not.
 */
async function identifyCaller(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
): Promise<NotificationCaller> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const apikey = (req.headers.get("apikey") ?? "").trim();
  if (sameSecret(token, serviceKey) || sameSecret(apikey, serviceKey)) return { kind: "service" };
  for (const candidate of new Set([token, apikey])) {
    if (!candidate || !looksLikeServiceKey(candidate)) continue;
    // Proven by doing something only a service key may do: the limiter's
    // function is revoked from everyone else. (It counts one row in a bucket
    // of its own and reads nobody's data.)
    try {
      const proof = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
        method: "POST",
        headers: { apikey: candidate, Authorization: `Bearer ${candidate}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_bucket: "service-key-check", p_identifier: "send-notification-email", p_limit: 1000000, p_window_secs: 3600 }),
      });
      await proof.body?.cancel().catch(() => {});
      if (proof.ok) return { kind: "service" };
    } catch {
      // Not proven.
    }
  }
  if (!token) return { kind: "anonymous" };
  const { data: auth, error } = await supabase.auth.getUser(token);
  return !error && auth?.user?.id ? { kind: "user", id: auth.user.id } : { kind: "anonymous" };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!resend) {
      console.warn("[send-notification-email] RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "Email service not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const request: NotificationRequest = await req.json();
    const type = request.type;
    let recipient_user_id = request.recipient_user_id;
    let data: NotificationRequest["data"] = request.data && typeof request.data === "object" ? request.data : {};
    // Which side the recipient is on (only new_message reads differently).
    let recipientRole: RecipientRole = "candidate";

    const refuse = (status: number, body: Record<string, unknown>, retryAfter?: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
      });

    // A kind this function does not know used to fall through to a template
    // that was not there (a 500). It is simply not one of ours.
    if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(NOTIFICATION_RULES, type)) {
      return refuse(400, { error: "Unknown notification.", code: "unknown_type" });
    }

    // "Email me the link" (Continue on your computer): the applicant presses
    // it themself, so this one type trusts nothing the page sent but the
    // application's id. It goes to whoever is signed in, for an application
    // that is theirs and open, at most once every few minutes; the job and
    // the team are looked up. A refusal answers here and nothing is sent.
    if (type === CONTINUE_ON_COMPUTER_TYPE) {
      const decision = await decideContinueLinkEmail(data, {
        callerId: async () => {
          const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
          if (!token) return null;
          const { data: auth, error } = await supabase.auth.getUser(token);
          return error ? null : auth?.user?.id ?? null;
        },
        application: async (applicationId) => {
          const { data: row } = await supabase
            .from("applications")
            .select("id, candidate_id, status, jobs(title, employer_id)")
            .eq("id", applicationId)
            .maybeSingle();
          if (!row) return null;
          const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { title?: string | null; employer_id?: string | null } | null;
          return { id: row.id, candidate_id: row.candidate_id, status: row.status, job_title: job?.title ?? null, employer_id: job?.employer_id ?? null };
        },
        fullName: async (userId) => {
          const { data: me } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
          return me?.full_name ?? null;
        },
        companyName: async (employerId) => {
          const { data: team } = await supabase.from("profiles").select("company_name").eq("user_id", employerId).maybeSingle();
          return team?.company_name ?? null;
        },
        checkLimit: checkRateLimit,
      });
      if (!decision.ok) {
        const { refusal } = decision;
        console.log(`[send-notification-email] continue_on_computer refused: ${refusal.code}`);
        return new Response(
          JSON.stringify({ error: refusal.message, code: refusal.code, ...(refusal.retryAfter ? { retryAfter: refusal.retryAfter } : {}) }),
          {
            status: refusal.status,
            headers: { "Content-Type": "application/json", ...corsHeaders, ...(refusal.retryAfter ? { "Retry-After": String(refusal.retryAfter) } : {}) },
          },
        );
      }
      recipient_user_id = decision.recipientUserId;
      data = decision.data;
    }

    // Every other kind (2026-10-07): whose request is this? Until now the
    // kind, the recipient and every word came from the request, and the
    // request needed only the site's public key, so anyone could have the
    // hiring address send any user a "You've got the job" signed with any
    // name. The rules are _shared/notificationAccess.ts: the system's own
    // alerts are the system's; everything else belongs to the people who can
    // already do the thing it reports, and who signs it, the names in it and
    // (for an applicant) the job are looked up, not taken from the request.
    if (type !== CONTINUE_ON_COMPUTER_TYPE) {
      const caller = await identifyCaller(req, supabase, supabaseUrl, supabaseServiceKey);
      if (caller.kind === "service") {
        // The system asking (another edge function, a script with the service
        // key): sent as asked, as it always was. Only new_message reads
        // differently per side; look the role up once, and only when the
        // caller did not say. Default to the candidate copy, which is the
        // safer failure: an employer reading candidate copy is odd, a
        // candidate reading employer copy ("New message from <their own
        // name>") is wrong.
        recipientRole = data?.recipient_role ?? "candidate";
        if (type === "new_message" && !data?.recipient_role) {
          const { data: roleRows } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", recipient_user_id);
          const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
          if (roles.includes("employer")) recipientRole = "employer";
          else if (roles.includes("team_member")) recipientRole = "team_member";
          else recipientRole = "candidate";
        }
      } else {
        const access = await decideNotification({ type, recipient_user_id, data }, caller, {
          applicationsOf: async (candidateId) => {
            const { data: rows, error } = await supabase
              .from("applications")
              .select("id, job_id, created_at, jobs(title, employer_id)")
              .eq("candidate_id", candidateId)
              .order("created_at", { ascending: false })
              .limit(200);
            if (error) throw error;
            // deno-lint-ignore no-explicit-any
            return (rows ?? []).map((row: any) => {
              const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { title?: string | null; employer_id?: string | null } | null;
              return { id: row.id, job_id: row.job_id ?? null, job_title: job?.title ?? null, employer_id: job?.employer_id ?? null };
            });
          },
          membershipsOf: async (userId) => {
            const { data: rows, error } = await supabase
              .from("team_members")
              .select("employer_id, assigned_job_ids, can_manage_pipeline, can_schedule_interviews, can_send_documents, can_message_candidates")
              .eq("user_id", userId)
              .eq("status", "active");
            if (error) throw error;
            return rows ?? [];
          },
          profileOf: async (userId) => {
            const { data: row, error } = await supabase.from("profiles").select("full_name, company_name, email").eq("user_id", userId).maybeSingle();
            if (error) throw error;
            return row ?? null;
          },
          checkLimit: checkRateLimit,
        });
        if (!access.ok) {
          const refusal = access.refusal;
          console.log(`[send-notification-email] ${type} refused: ${refusal.code} (${caller.kind})`);
          return refuse(refusal.status, { error: refusal.message, code: refusal.code, ...(refusal.retryAfter ? { retryAfter: refusal.retryAfter } : {}) }, refusal.retryAfter);
        }
        recipient_user_id = access.recipientUserId;
        data = access.data as NotificationRequest["data"];
        recipientRole = access.recipientRole;
      }
    }

    console.log(`[send-notification-email] Processing ${type} notification for user ${recipient_user_id}`);
    console.log(`[send-notification-email] Data:`, JSON.stringify(data));
    console.log(`[send-notification-email] Base URL:`, getAppBaseUrl());

    // Get user's email and preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name, email_notifications_enabled, email_new_applications, email_messages, email_interview_reminders, email_document_updates, email_phase_updates, email_voice_minutes")
      .eq("user_id", recipient_user_id)
      .single();

    if (profileError || !profile) {
      console.error(`[send-notification-email] Failed to fetch profile for user ${recipient_user_id}:`, profileError);
      return new Response(
        JSON.stringify({ error: "User profile not found", details: profileError }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-notification-email] Found profile for ${profile.email}, notifications_enabled: ${profile.email_notifications_enabled}`);

    // Check if notifications are enabled
    if (!profile.email_notifications_enabled) {
      console.log(`[send-notification-email] Email notifications globally disabled for ${profile.email}`);
      return new Response(
        JSON.stringify({ message: "Email notifications disabled", email: profile.email }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check specific preference
    const preferenceField = getPreferenceField(type) as keyof typeof profile;
    const preferenceValue = profile[preferenceField];
    console.log(`[send-notification-email] Checking preference ${preferenceField} = ${preferenceValue}`);
    
    if (preferenceValue === false) {
      console.log(`[send-notification-email] ${type} notifications disabled for ${profile.email} (${preferenceField} = false)`);
      return new Response(
        JSON.stringify({ message: `${type} notifications disabled`, preference: preferenceField }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // The hire and documents emails list what is really waiting for them:
    // the application's open requests and (for the hire) an unsigned offer
    // letter. Looked up here, never taken from the request. A failed look-up
    // sends the email without the list.
    if ((type === "status_hired" || type === "document_requested") && typeof data?.application_id === "string") {
      try {
        const [requests, letters] = await Promise.all([
          supabase
            .from("document_requests")
            .select("document_type, custom_document_name, due_date")
            .eq("application_id", data.application_id)
            .eq("candidate_id", recipient_user_id)
            .in("status", ["pending", "rejected"])
            .order("created_at", { ascending: true })
            .limit(20),
          type === "status_hired"
            ? supabase
                .from("documents")
                .select("candidate_signed_at, is_voided, status")
                .eq("application_id", data.application_id)
                .eq("document_type", "offer_letter")
                .order("created_at", { ascending: false })
                .limit(1)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (requests.error) throw requests.error;
        if (letters.error) throw letters.error;
        const letter = (letters.data ?? [])[0] as { candidate_signed_at?: string | null; is_voided?: boolean | null; status?: string | null } | undefined;
        const offerUnsigned = !!letter && !letter.candidate_signed_at && !letter.is_voided && letter.status === "pending";
        data = { ...data, todo: welcomeTodo({ offerUnsigned, requests: requests.data ?? [] }) };
      } catch (lookupError) {
        console.error(`[send-notification-email] ${type}: could not read what is waiting:`, lookupError instanceof Error ? lookupError.message : lookupError);
      }
    }
    // An offer letter: said as a job offer. The newest document on that
    // application for this recipient, and only when it is an offer letter.
    if (type === "document_sent" && typeof data?.application_id === "string") {
      try {
        const { data: docs, error: docError } = await supabase
          .from("documents")
          .select("document_type, expires_at")
          .eq("application_id", data.application_id)
          .eq("recipient_id", recipient_user_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (docError) throw docError;
        const doc = (docs ?? [])[0] as { document_type?: string | null; expires_at?: string | null } | undefined;
        if (doc?.document_type === "offer_letter") {
          const ends = doc.expires_at ? new Date(doc.expires_at).getTime() : NaN;
          const left = Number.isNaN(ends) ? null : Math.floor((ends - Date.now()) / 86_400_000);
          data = { ...data, offer: { replyInDays: left !== null && left >= 1 ? left : null } };
        }
      } catch (lookupError) {
        console.error("[send-notification-email] document_sent: could not read the document:", lookupError instanceof Error ? lookupError.message : lookupError);
      }
    }
    const recipientFirst = String((profile as { full_name?: string | null }).full_name ?? "").trim().split(/\s+/)[0];
    if (recipientFirst && isCandidateEmail(type, recipientRole)) data = { ...data, first_name: recipientFirst.slice(0, 40) };

    const emailContent = getEmailContent(type, data, recipientRole);

    console.log(`[send-notification-email] Sending email to ${profile.email} with subject: ${emailContent.subject}`);

    const emailResponse = await resend.emails.send({
      from: isCandidateEmail(type, recipientRole) ? CANDIDATE_SENDER : TEAM_SENDER,
      to: [profile.email],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    // The mail client does not throw when the provider refuses a message (a
    // spent quota, an address it will not take, its own outage): it answers
    // { data: null, error }. That is not a sent email, and must never be
    // reported as one: "Email me the link" tells an applicant "Sent to …" on
    // this answer, and every other caller's "sent" means the same.
    if (emailResponse?.error) {
      console.error(`[send-notification-email] The provider refused ${type} for ${profile.email}:`, JSON.stringify(emailResponse.error));
      return new Response(
        JSON.stringify({ success: false, error: "The email provider refused the message", provider_error: emailResponse.error }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-notification-email] Email sent successfully to ${profile.email}:`, JSON.stringify(emailResponse));

    return new Response(
      JSON.stringify({ success: true, emailResponse, recipient: profile.email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[send-notification-email] Error sending notification email:", error);
    console.error("[send-notification-email] Error stack:", stack);
    // The detail is in the logs above. The answer does not carry it: this
    // function can be reached by anyone, and a stack trace is a map.
    return new Response(
      JSON.stringify({ error: "The notification could not be sent." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
