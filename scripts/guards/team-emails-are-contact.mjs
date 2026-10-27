/**
 * The sixteenth Phase 5 review and the fifteenth security review
 * (2026-10-26), locked (20261025690000_team_emails_are_contact.sql).
 *
 *   - team-emails-are-contact: every one of the hiring team's emails to
 *     someone who applied (a staff kind, or a message) is recorded as a
 *     "message" contact for the job's business before it is sent
 *     (business_contacts_remember_email, service role only, only for someone
 *     the record says applied to that business), and nothing is sent when it
 *     cannot be; the email names the job's own title and the interview's own
 *     offered times, never the request's. The security review's probe: "You're
 *     joining <business> as CSR. Send the 1,500 PHP onboarding fee to GCash
 *     ..." as a job title, to three people who had only applied, and their
 *     three reports left the business open.
 *   - repeat-report-worked-out-again: a report added to the reporter's open
 *     one (report_employer's merge) runs the same pause check as a new report
 *     (employer_reports_auto_pause_on_merge) and tells every admin when it
 *     says something new, at most five times a day for one person; only a new
 *     report rings "reported 3 times". The review's probes pa and pb and the
 *     security review's heard2: after a reopen, people written to again
 *     reported the new demand, and nothing ran.
 *   - interview-edit-is-contact: a browser's new time, link or notes on an
 *     interview moves that contact's last time (business_contacts_remember_edit),
 *     so a business cannot keep a heard reporter muted by editing an
 *     interview it had booked with them.
 *
 * Proved by behaviour too: launch_locks_behaviour section 25 and
 * scripts/notification_access.test.mjs (sections 3b and C).
 */

import { grantsToBrowser, latestDefinition, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL or code without comments, spaces collapsed. */
const plain = (text) => (text ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
const code = (text) => (text ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\s+/g, " ");

export default [
  {
    id: "team-emails-are-contact",
    why:
      "A business could email its applicants its own words through send-notification-email (a job title of \"CSR. Send " +
      "the 1,500 PHP onboarding fee to GCash ...\", a message preview, twelve interview \"times\") with no row behind " +
      "them, and the record of contact never saw it, so three people it emailed could not pause it (the fifteenth " +
      "security review, finding 1; the sixteenth Phase 5 review, finding 2). Each of the team's emails to an applicant " +
      "is recorded before it is sent, and its job title and times are the database's.",
    run: async (ctx) => {
      const detail = [];
      const access = code(await ctx.read("supabase/functions/_shared/notificationAccess.ts"));
      const fn = code(await ctx.read("supabase/functions/send-notification-email/index.ts"));
      // The decision names the business for the team's own emails, and only there.
      const named = access.match(/contactFor: [^,}]+/g) ?? [];
      if (named.length !== 2 || !named.includes("contactFor: type === \"status_rejected\" ? undefined : links[0].employer_id!") || !named.includes("contactFor: toApplicant[0].employer_id!"))
        detail.push(`supabase/functions/_shared/notificationAccess.ts: the hiring team's emails to an applicant (a staff kind, a message) must name the job's business as contactFor (every staff kind but a decline, which carries only what was there when they applied: guard decline-names-the-job-as-applied), and nothing else may (found ${JSON.stringify(named)})`);
      // The words: the job's own title, the interview's own times.
      if (
        !/function jobTitleFor\(asked: unknown, links: readonly NotificationApplication\[\]\): string \| undefined \{ const wanted = plainLine\(asked, 200\); const titles = links\.map\(\(l\) => plainLine\(l\.job_title, 200\)\)\.filter\(\(t\): t is string => !!t\); if \(wanted && titles\.includes\(wanted\)\) return wanted; return titles\[0\]; \}/.test(access) ||
        // (A decline names the job as it was when they applied: guard decline-names-the-job-as-applied.)
        !access.includes(": ((about && plainLine(about.job_title, 200)) ?? jobTitleFor(asked.job_title, links)),") ||
        !access.includes("job_title: jobTitleFor(asked.job_title, toApplicant),") ||
        /job_title: plainLine\(asked\.job_title/.test(access)
      )
        detail.push("supabase/functions/_shared/notificationAccess.ts: an email's job title must be the title of a job that links them (the application it names, the asked title when it is one of theirs, else the newest), never the request's own words");
      if (/asked\.proposed_times_list|asked\[["']proposed_times_list["']\]/.test(access) || !/const offer = lookups\.offeredTimes \? await lookups\.offeredTimes\(links\.map\(\(l\) => l\.id\), wantedInterview\) : null;/.test(access))
        detail.push("supabase/functions/_shared/notificationAccess.ts: an invitation's times must be its interview's own offered times (offeredTimes), never the request's list");
      // The function records it after the recipient's settings and before it sends, and sends nothing when it cannot.
      const main = fn.indexOf("if (type !== CONTINUE_ON_COMPUTER_TYPE) {");
      const settings = fn.indexOf("if (preferenceValue === false) {", main);
      const record = fn.indexOf('const { data: recorded, error: recordError } = await supabase.rpc("business_contacts_remember_email", { p_employer: contactFor, p_person: recipient_user_id });', main);
      const send = fn.indexOf("const emailResponse = await resend.emails.send(", main);
      if (!(main > 0 && settings > main && record > settings && send > record) || !/if \(contactFor\) \{ const \{ data: recorded, error: recordError \} = await supabase\.rpc\("business_contacts_remember_email"/.test(fn))
        detail.push("supabase/functions/send-notification-email/index.ts: a hiring team's email must be recorded as contact (business_contacts_remember_email, whenever the decision names a business) after the recipient's settings and before it is sent");
      // The interviews an invitation may read are those of the applications
      // that make the caller the hiring team for this applicant.
      if (!/\.from\("interviews"\) \.select\("id, application_id, status, candidate_response, employer_windows, created_at"\) \.in\("application_id", \[\.\.\.applicationIds\]\)/.test(fn))
        detail.push("supabase/functions/send-notification-email/index.ts: an invitation's interview must be one on the applications that link the caller to this applicant (.in(\"application_id\", …))");
      if (!/if \(recordError\) \{ console\.error\([^;]*\); return refuse\(503, /.test(fn.slice(record)))
        detail.push("supabase/functions/send-notification-email/index.ts: when the contact cannot be recorded, nothing may be sent (503)");
      if ((fn.match(/contactFor = /g) ?? []).length !== 1 || !/contactFor = access\.contactFor \?\? null;/.test(fn))
        detail.push("supabase/functions/send-notification-email/index.ts: only the decision (notificationAccess) may name the business an email puts in touch");
      // The record's writer: the server's only, for someone who applied.
      const remember = await latestDefinition(ctx, "business_contacts_remember_email");
      if (!remember) detail.push("no migration defines business_contacts_remember_email");
      else {
        const body = plain(remember.body);
        if (!remember.securityDefiner) detail.push(`${remember.alteredIn ?? remember.rel}: business_contacts_remember_email must run with its own rights (it writes the record, which no API role may)`);
        if (!/IF p_employer IS NULL OR p_person IS NULL OR p_employer = p_person THEN RETURN false; END IF; INSERT INTO private\.business_contacts AS c \(employer_id, person_id, kind\) SELECT p_employer, p_person, 'message' WHERE EXISTS \( SELECT 1 FROM private\.business_contacts a WHERE a\.employer_id = p_employer AND a\.person_id = p_person AND a\.kind = 'applied' \) ON CONFLICT \(employer_id, person_id, kind\) DO UPDATE SET last_at = greatest\(c\.last_at, EXCLUDED\.last_at\); RETURN FOUND;/i.test(body))
          detail.push(`${remember.rel}: business_contacts_remember_email must record a message only for someone the record says applied to that business, never for the business itself, keeping the first time (as written)`);
        const file = plain((await ctx.read(remember.rel)) ?? "");
        if (!/REVOKE ALL ON FUNCTION public\.business_contacts_remember_email\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/i.test(file))
          detail.push(`${remember.rel}: business_contacts_remember_email must be revoked from PUBLIC, anon and authenticated`);
        for (const rel of await grantsToBrowser(ctx, "business_contacts_remember_email")) detail.push(`${rel}: grants business_contacts_remember_email to a browser role`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "repeat-report-worked-out-again",
    why:
      "A second report on the same job is added to the open one, and the pause was worked out only when a report was " +
      "inserted: after a reopen, people the business wrote to again reported the new demand and nothing ran, and no admin " +
      "was told (the sixteenth Phase 5 review, probes pa and pb; the fifteenth security review, heard2).",
    run: async (ctx) => {
      const detail = [
        ...(await triggerProblems(ctx, { name: "employer_reports_auto_pause_on_merge", table: "employer_reports", timing: "AFTER", event: "UPDATE", fn: "employer_reports_auto_pause", when: "OLD.status = 'open' AND NEW.status = 'open'" })),
      ];
      const pause = await latestDefinition(ctx, "employer_reports_auto_pause");
      if (!/IF TG_OP = 'INSERT' AND applied = 3 AND new_applied AND NOT EXISTS/i.test(plain(pause?.body)))
        detail.push(`${pause?.rel ?? "supabase/migrations"}: only a new report may ring "reported 3 times" (IF TG_OP = 'INSERT' AND applied = 3 ...): a report added to an open one brings nobody new`);
      const report = await latestDefinition(ctx, "report_employer");
      const body = plain(report?.body);
      // The merge sets both columns the trigger watches, adds only new words
      // and keeps the newest (the old text is cut from the front: the
      // seventeenth Phase 5 review, probe pf), and tells every admin whenever
      // it brings words or a new reason, five times a day at most.
      if (!/UPDATE public\.employer_reports SET reason = p_reason, details = CASE WHEN clean IS NULL THEN details ELSE right\(coalesce\(details \|\| E'\\n\\n', ''\) \|\| left\(clean, 1000\), 1000\) END WHERE id = existing RETURNING reason, details INTO now_reason, now_details;/i.test(body))
        detail.push(`${report?.rel ?? "supabase/migrations"}: report_employer's merge must set the reason and the details (which works the pause out again), add only new words and keep the newest, as written`);
      if (!/IF FOUND AND \(now_reason IS DISTINCT FROM was_reason OR clean IS NOT NULL\) AND coalesce\(\(public\.check_rate_limit\('report-added', me::text, 5, 86400\) ->> 'allowed'\)::boolean, true\) THEN INSERT INTO public\.notifications \(user_id, type, title, message, link, is_read\) SELECT a\.user_id, 'system', 'A job was reported',/i.test(body))
        detail.push(`${report?.rel ?? "supabase/migrations"}: report_employer's merge must tell every admin ("A job was reported") whenever it brings words or a new reason, at most five times a day for one person`);
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "interview-edit-is-contact",
    why:
      "After a reopen a business could change the time, the meeting link or the notes of an interview already booked with " +
      "someone it had heard, and they stayed heard: the record moved only on an insert (the fifteenth security review, " +
      "LOW). A browser's new time, link or notes is contact again; the server's changes are not.",
    run: async (ctx) => {
      const detail = await triggerProblems(ctx, {
        name: "business_contacts_remember_edit",
        table: "interviews",
        timing: "AFTER",
        event: "UPDATE",
        fn: "business_contacts_remember",
        when: "current_user = 'authenticated' AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employer_windows IS DISTINCT FROM OLD.employer_windows OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link OR NEW.notes IS DISTINCT FROM OLD.notes)",
      });
      return { ok: detail.length === 0, detail };
    },
  },
];
