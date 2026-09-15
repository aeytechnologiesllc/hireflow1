/**
 * With RESEND_API_KEY unset, three moments told nobody anything in the app:
 * a submitted application (employer), a scheduled/rescheduled interview
 * (candidate), and a meaningful phase advance (candidate) — all email-only.
 * The fix is supabase/migrations/20260915122000_in_app_notifications_for_key_moments.sql:
 * three SECURITY DEFINER triggers, in the same style as
 * notify_application_status_change() / notify_new_message(), each writing a
 * public.notifications row (so trigger_push_notification fires for free)
 * with a guard against a candidate notifying themselves about their own
 * self-advance / self-picked interview time.
 *
 * It also removed two now-stale client-side artifacts: a duplicate in-app
 * notification insert in EmployerRescheduleReviewDialog.tsx (which the new
 * on_interview_reschedule_notify trigger would double up with on the exact
 * same scheduled_at change), and a toast in InterviewSchedulingWizard.tsx
 * that promised "I'll send it by email instead" — false with email off.
 *
 * Scheduling an interview (InterviewSchedulingWizard.tsx handleSchedule;
 * ava-voice-tools/index.ts) always does two writes for one action: an
 * interviews INSERT, then applications.status -> 'interview'. Each write is
 * its own AFTER trigger, so the migration also stops the pre-existing
 * notify_application_status_change() from building its own "Interview
 * scheduled" notification for status -> 'interview' — on_interview_insert_
 * notify (fired by the INSERT, same action) already covers it, and more
 * accurately (it knows exact-time vs. windows-offered, which bare status
 * can't). Without this, the candidate got two bell notifications per
 * scheduling action.
 */
export default [
  {
    id: "in-app-notifications-key-moments",
    why: "With email off, a submitted application, a scheduled/rescheduled interview, and a meaningful phase advance produce no bell for their recipient — the DB triggers, the self-notify guard, and the now-redundant client-side pieces must all stay in place together.",
    run: async ({ read }) => {
      const detail = [];

      const migrationPath =
        "supabase/migrations/20260915122000_in_app_notifications_for_key_moments.sql";
      const migration = await read(migrationPath);
      if (migration == null) {
        detail.push(`${migrationPath} is missing`);
        return { ok: false, detail };
      }

      // All three triggering functions must exist...
      for (const fn of [
        "notify_new_application_submitted",
        "notify_interview_scheduled_or_rescheduled",
        "notify_application_phase_advanced",
      ]) {
        if (!migration.includes(`FUNCTION public.${fn}`)) {
          detail.push(`${migrationPath} is missing CREATE ... FUNCTION public.${fn}`);
        }
      }

      // ...each wired to a real trigger (not just defined and forgotten).
      for (const trig of [
        "on_application_insert_submitted_notify",
        "on_application_update_submitted_notify",
        "on_interview_insert_notify",
        "on_interview_reschedule_notify",
        "on_application_phase_advanced_notify",
      ]) {
        if (!migration.includes(`CREATE TRIGGER ${trig}`)) {
          detail.push(`${migrationPath} is missing CREATE TRIGGER ${trig}`);
        }
      }

      // SECURITY DEFINER + fixed search_path on every function — the same
      // hardening notify_application_status_change() and notify_new_message()
      // already use; without it these would run with the caller's own (often
      // more restricted) privileges and could be search-path hijacked.
      const defCount = (migration.match(/SECURITY DEFINER/g) || []).length;
      if (defCount < 3) {
        detail.push(`expected 3 SECURITY DEFINER functions, found ${defCount}`);
      }
      const searchPathCount = (migration.match(/SET search_path = public/g) || []).length;
      if (searchPathCount < 3) {
        detail.push(`expected 3 functions with a fixed search_path, found ${searchPathCount}`);
      }

      // The self-notify guard: a candidate must never be told about their
      // own action (self-advancing their phase, or picking/repicking their
      // own offered interview window via the service_role edge function).
      const selfGuardCount = (migration.match(/auth\.uid\(\)\s+IS NULL\s+OR\s+auth\.uid\(\)\s*=/g) || [])
        .length;
      if (selfGuardCount < 2) {
        detail.push(
          `expected the "auth.uid() IS NULL OR auth.uid() = <candidate>" self-notify guard in both the reschedule and phase-advance functions, found it ${selfGuardCount} time(s)`,
        );
      }

      // Candidate-facing links must go through candidate sign-in, exactly
      // like notify_application_status_change() already does — otherwise a
      // signed-out candidate's bell tap bounces to the employer login page.
      const candidateAuthLinks = (migration.match(/\/candidate\/auth\?redirect=/g) || []).length;
      if (candidateAuthLinks < 2) {
        detail.push(
          `expected candidate-facing links routed through /candidate/auth?redirect=, found ${candidateAuthLinks}`,
        );
      }

      // The employer-facing new-application notification must land on the
      // real cockpit applicant route, not a dead/placeholder link.
      if (!migration.includes("'/applicants/' || NEW.id::text")) {
        detail.push("the new-application notification's employer link doesn't point at /applicants/<application id>");
      }

      // Scheduling always pairs an interviews INSERT with an applications
      // status -> 'interview' UPDATE (InterviewSchedulingWizard.tsx,
      // ava-voice-tools/index.ts). notify_application_status_change() must
      // be re-declared here to stop building its own notification for
      // status -> 'interview' — otherwise the candidate gets that one AND
      // on_interview_insert_notify's, for the same scheduling action.
      const statusFnMatch = migration.match(
        /CREATE OR REPLACE FUNCTION public\.notify_application_status_change\(\)[\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;/,
      );
      if (!statusFnMatch) {
        detail.push(
          `${migrationPath} does not re-declare notify_application_status_change() — it must stop notifying on status -> 'interview', since scheduling's interviews INSERT (on_interview_insert_notify) already does, more accurately`,
        );
      } else if (/WHEN\s+'interview'\s+THEN\s*\n\s*notification_title/.test(statusFnMatch[0])) {
        detail.push(
          "notify_application_status_change() still builds its own notification for status -> 'interview' — this duplicates (and, for windows-offered scheduling, contradicts) the notification on_interview_insert_notify already writes for the same scheduling action",
        );
      }

      // --- stale client-side pieces that must be gone ------------------------

      const wizardPath = "src/components/InterviewSchedulingWizard.tsx";
      const wizard = await read(wizardPath);
      if (wizard == null) {
        detail.push(`${wizardPath} is missing`);
      } else if (/send it by email instead/i.test(wizard)) {
        detail.push(
          `${wizardPath} still promises "I'll send it by email instead" — false when RESEND_API_KEY is unset`,
        );
      }

      const reviewDialogPath = "src/components/EmployerRescheduleReviewDialog.tsx";
      const reviewDialog = await read(reviewDialogPath);
      if (reviewDialog == null) {
        detail.push(`${reviewDialogPath} is missing`);
      } else {
        const acceptStart = reviewDialog.indexOf("const handleAcceptTime");
        const keepStart = reviewDialog.indexOf("const handleKeepOriginal");
        if (acceptStart === -1 || keepStart === -1 || keepStart < acceptStart) {
          detail.push(`${reviewDialogPath}: could not locate handleAcceptTime/handleKeepOriginal to check for a duplicate insert`);
        } else {
          const acceptBody = reviewDialog.slice(acceptStart, keepStart);
          if (acceptBody.includes('from("notifications")')) {
            detail.push(
              `${reviewDialogPath}: handleAcceptTime still inserts into "notifications" directly — this now doubles up with on_interview_reschedule_notify, which fires on the exact same scheduled_at change`,
            );
          }
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
