/**
 * The interview scheduling wizard's success screen used to say "Calendar
 * invite sent to <email>" / "Email sent to <email> to pick a time"
 * unconditionally — but sendNotificationEmail() (src/utils/emailNotifications.ts)
 * swallowed the send-notification-email response, which comes back
 * {success:false, skipped:true} whenever RESEND_API_KEY is unset (the live
 * state as of 2026-09). The claim was false every time it was shown.
 *
 * This guard checks that:
 *  - sendNotificationEmail returns an EmailStatus ('sent'|'skipped'|'failed')
 *    instead of swallowing the result, and only reports 'sent' when the
 *    function response says success:true.
 *  - InterviewSchedulingWizard.tsx captures that status from
 *    notifyInterviewScheduled/notifyInterviewPickTime and only shows the
 *    "sent"/"invite sent" copy when the status is 'sent' — otherwise it
 *    says plainly that no email went out (inviteEmailWords).
 *  - the wizard's lookup before the email asks for nothing the database
 *    cannot join, and a failed lookup is reported as a failed email.
 */

export default [
  {
    id: "interview-email-honesty",
    why:
      "A wizard success screen (or any other screen) that claims an email/invite " +
      "was sent without checking the actual send status goes back to lying " +
      "whenever RESEND_API_KEY is unset or the candidate has that notification type off.",
    run: async ({ read }) => {
      const detail = [];

      const statusModule = await read("src/utils/emailStatus.ts");
      if (statusModule == null) {
        return { ok: false, detail: ["src/utils/emailStatus.ts is missing"] };
      }
      if (!/export type EmailStatus\s*=\s*"sent"\s*\|\s*"skipped"\s*\|\s*"failed"/.test(statusModule)) {
        detail.push("emailStatus.ts no longer exports EmailStatus = 'sent' | 'skipped' | 'failed'");
      }
      if (!/responseData\?\.success === true \? "sent" : "skipped"/.test(statusModule)) {
        detail.push("mapEmailStatus no longer maps success:true -> 'sent' (anything else -> 'skipped')");
      }
      if (!/if \(error\) return "failed"/.test(statusModule)) {
        detail.push("mapEmailStatus no longer treats an invoke error as 'failed'");
      }

      const utils = await read("src/utils/emailNotifications.ts");
      if (utils == null) {
        return { ok: false, detail: ["src/utils/emailNotifications.ts is missing"] };
      }
      if (!/async function sendNotificationEmail[\s\S]{0,200}Promise<EmailStatus>/.test(utils)) {
        detail.push("sendNotificationEmail no longer declares Promise<EmailStatus> as its return type");
      }
      if (!/return mapEmailStatus\(responseData, error\)/.test(utils)) {
        detail.push("sendNotificationEmail no longer returns mapEmailStatus(responseData, error)");
      }
      if (!/export async function notifyInterviewScheduled[\s\S]{0,200}Promise<EmailStatus>/.test(utils)) {
        detail.push("notifyInterviewScheduled no longer returns Promise<EmailStatus>");
      }
      if (!/export async function notifyInterviewPickTime[\s\S]{0,200}Promise<EmailStatus>/.test(utils)) {
        detail.push("notifyInterviewPickTime no longer returns Promise<EmailStatus>");
      }

      const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
      if (wizard == null) {
        return { ok: false, detail: ["src/components/InterviewSchedulingWizard.tsx is missing"] };
      }
      if (!/candidateEmailStatus/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx no longer tracks candidateEmailStatus from the notify* call");
      }
      if (!/const status = await notifyInterviewScheduled/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx no longer captures the status returned by notifyInterviewScheduled");
      }
      if (!/const status = await notifyInterviewPickTime/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx no longer captures the status returned by notifyInterviewPickTime");
      }
      if (!/candidateEmailStatus === "sent"/.test(wizard)) {
        detail.push('InterviewSchedulingWizard.tsx success screen no longer gates the "sent" copy on candidateEmailStatus === "sent"');
      }
      // The line itself is written by inviteEmailWords (src/lib/interviewTimes.ts)
      // since 2026-10-07: "sent" only for status "sent", and anything else
      // says plainly that no email went out.
      if (!/inviteEmailWords\(candidateEmailStatus,/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx success screen no longer words the email line through inviteEmailWords(candidateEmailStatus, ...)");
      }
      const times = await read("src/lib/interviewTimes.ts");
      const words = times == null ? null : /export function inviteEmailWords[\s\S]*?\n}\n/.exec(times)?.[0] ?? null;
      if (words == null) {
        detail.push("src/lib/interviewTimes.ts lost inviteEmailWords");
      } else {
        const sentBranch = /if \(status === "sent"\) \{[\s\S]*?\n  \}/.exec(words)?.[0] ?? "";
        if (!/Email sent to/.test(sentBranch)) detail.push('inviteEmailWords no longer says "Email sent to" for status "sent"');
        if (/Email sent to/.test(words.replace(sentBranch, ""))) detail.push('inviteEmailWords says "Email sent to" for a status other than "sent"');
        if (!/could not be sent/.test(words)) detail.push("inviteEmailWords lost its plain line for an email that did not go out");
      }

      // The invitation's own lookup. Until 2026-10-07 it asked for the
      // employer's profile through a relationship the database does not have
      // (profiles has no foreign keys): PostgREST answered 400, the wizard
      // skipped the email without a word, and no invitation was ever sent.
      if (/\.select\([^)]*profiles\s*[:!(]/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx embeds profiles in a select again: the request is refused and the invitation is never emailed");
      }
      if (!/appLookupError \|\| !appData\?\.candidate_id[\s\S]{0,200}setCandidateEmailStatus\("failed"\)/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx no longer reports a failed lookup as a failed email");
      }
      if (/will be sent to \$\{candidateEmail\}/.test(wizard)) {
        detail.push(
          "InterviewSchedulingWizard.tsx review step still unconditionally promises " +
            "\"...will be sent to <email>\" before the send is attempted — same false claim, " +
            "one screen earlier."
        );
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
