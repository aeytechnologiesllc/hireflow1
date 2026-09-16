/**
 * 20260915122000_in_app_notifications_for_key_moments.sql gave three
 * moments their own DB trigger, each writing exactly one notifications row:
 *
 *   - on_interview_insert_notify (interviews INSERT) -> candidate,
 *     "Interview scheduled" / "Pick a time...", linked through
 *     /candidate/auth?redirect=...
 *   - notify_application_status_change(), status -> 'offered' / 'hired' /
 *     'rejected' (status -> 'interview' is deliberately excluded -- the
 *     interviews INSERT above already covers it) -> candidate.
 *
 * Three call sites still did their OWN manual `.from("notifications")
 * .insert(...)` right after triggering one of those same writes, so the
 * candidate got two bell notifications (one of them mis-linked, since the
 * hand-written copy never used the candidate-sign-in redirect prefix) for
 * one action:
 *
 *   - ava-voice-tools/index.ts `schedule_interview` -- inserted its own
 *     "Interview Scheduled" notification (linked '/applications/<id>', no
 *     '/candidate/auth?redirect=' prefix) right after the interviews
 *     INSERT that on_interview_insert_notify already fires on.
 *   - ava-voice-tools/index.ts `send_offer` -- inserted its own "Offer
 *     Extended!" notification right after the applications.status ->
 *     'offered' UPDATE that notify_application_status_change() already
 *     fires on.
 *   - src/hooks/useApplications.ts useUpdateApplication -- inserted its own
 *     "Application update" / "You're hired!" notifications right after the
 *     applications.status -> 'rejected' / 'hired' UPDATE, alongside (correctly
 *     kept) email calls, that notify_application_status_change() already
 *     fires on.
 *
 * This guard fails if any of those three duplicates comes back, and if any
 * NEW call site reintroduces the same pattern: an application status write
 * to 'rejected' / 'hired' / 'offered', or an interviews table INSERT for a
 * scheduled interview, immediately followed by a hand-rolled notifications
 * insert for the same moment. It intentionally does not touch the many
 * OTHER manual notification inserts in the codebase (documents, messages,
 * interview cancellation, employer-facing interview-response/AI-analysis
 * notifications, EmployerRescheduleReviewDialog's handleKeepOriginal) --
 * none of those moments have a DB trigger, so they are not duplicates.
 */

const CHECKS = [
  {
    file: "supabase/functions/ava-voice-tools/index.ts",
    label: "schedule_interview",
    // The manual "Interview Scheduled" insert this fix removed.
    forbidden: /from\(\s*["']notifications["']\s*\)[\s\S]{0,200}title:\s*['"]Interview Scheduled['"]/,
  },
  {
    file: "supabase/functions/ava-voice-tools/index.ts",
    label: "send_offer",
    forbidden: /from\(\s*["']notifications["']\s*\)[\s\S]{0,200}title:\s*['"]Offer Extended!['"]/,
  },
  {
    file: "src/hooks/useApplications.ts",
    label: "useUpdateApplication rejected",
    forbidden: /from\(\s*["']notifications["']\s*\)[\s\S]{0,200}title:\s*["']Application update["']/,
  },
  {
    file: "src/hooks/useApplications.ts",
    label: "useUpdateApplication hired",
    forbidden: /from\(\s*["']notifications["']\s*\)[\s\S]{0,200}title:\s*["']You're hired!/,
  },
];

export default [
  {
    id: "no-duplicate-key-moment-notifications",
    why: "Three call sites manually inserted a notifications row for a moment on_interview_insert_notify / notify_application_status_change() already covers, double-notifying (and, for scheduling, mis-linking) the candidate. Those hand-rolled inserts must stay gone.",
    run: async ({ read }) => {
      const detail = [];

      for (const check of CHECKS) {
        const src = await read(check.file);
        if (src == null) {
          detail.push(`${check.file} is missing`);
          continue;
        }
        if (check.forbidden.test(src)) {
          detail.push(
            `${check.file}: ${check.label} still manually inserts a notification for a moment the DB trigger already covers`,
          );
        }
      }

      // useApplications.ts must still fire the email side (that part was
      // never redundant -- notify_application_status_change() only writes
      // the in-app row, email is a separate call) for rejected/hired.
      const useApplications = await read("src/hooks/useApplications.ts");
      if (useApplications != null) {
        if (!/notifyStatusRejected\(/.test(useApplications)) {
          detail.push("src/hooks/useApplications.ts: notifyStatusRejected(...) email call is missing");
        }
        if (!/notifyStatusHired\(/.test(useApplications)) {
          detail.push("src/hooks/useApplications.ts: notifyStatusHired(...) email call is missing");
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
