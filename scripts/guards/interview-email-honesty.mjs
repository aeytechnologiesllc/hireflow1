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
 *    falls back to a neutral, still-true line about the in-app notification.
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
      if (!/Interview scheduled — they'll see it in HireFlow/.test(wizard)) {
        detail.push("InterviewSchedulingWizard.tsx lost its neutral fallback line for when the email wasn't actually sent");
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
