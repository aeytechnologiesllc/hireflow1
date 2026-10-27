/**
 * The fifteenth Phase 5 review (2026-10-26), locked
 * (20261025680000_reports_heard_stay_heard.sql).
 *
 *   - reopen-holds: an admin's reopen holds. The record of contact is
 *     permanent (guard contact-counts-as-made), the reopen closes the open
 *     reports, and report_employer lets the same person report again once
 *     their report is closed: the review's probes p1 and p5 paused a business
 *     again with the same three people after every reopen, Block and Delete
 *     their information included, for good. employer_reports_auto_pause now
 *     leaves out a person an admin already heard (report_already_heard: a
 *     report of theirs on this business closed by an admin, closed_by set,
 *     and no contact from the business in the record after that close), from
 *     both counts and from "this report makes three"; the reopen still closes
 *     the open reports (admin_set_business_status) and Close on the Admin
 *     page still says who closed it (admin_close_report); the record keeps
 *     each contact's last time (private.business_contacts.last_at).
 *   - bell-card-is-contact: a card the job's owner or an active teammate
 *     writes into its applicant's bell from a browser is a message in the
 *     record (probe p3); the server's own cards are not. Held with the rest
 *     of the record by contact-counts-as-made; this one holds that the
 *     notifications trigger is the browser's only.
 *   - interview-stays-on-its-application: nobody but the server moves an
 *     interview onto another application (probe p2: the record, written
 *     AFTER INSERT, never saw the moved one).
 *
 * Proved by behaviour too: launch_locks_behaviour section 24 (the review's
 * probes p1, p2, p3 and p5, and its weakenings M1 to M6).
 */

import { grantsToBrowser, latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL without comments, spaces collapsed. */
const plain = (sql) => (sql ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");

export default [
  {
    id: "reopen-holds",
    why:
      "After an admin reopened a paused business, the same three people could report it again and pause it again, " +
      "after every reopen and after the business blocked them and deleted their information (the fifteenth Phase 5 " +
      "review, probes p1 and p5). A person an admin already heard counts again only once the business is in touch with " +
      "them after that close (report_already_heard), and the reopen still closes the open reports.",
    run: async (ctx) => {
      const detail = [];
      const pause = await latestDefinition(ctx, "employer_reports_auto_pause");
      const pauseBody = plain(pause?.body);
      if (!/AND r\.status = 'open' AND EXISTS \( SELECT 1 FROM private\.business_contacts c WHERE c\.employer_id = NEW\.employer_id AND c\.person_id = r\.reporter_id \) AND NOT public\.report_already_heard\(NEW\.employer_id, r\.reporter_id\) \) people;/i.test(pauseBody))
        detail.push(`${pause?.rel ?? "supabase/migrations"}: employer_reports_auto_pause must count only open reports from people who applied and whom an admin has not already heard (AND NOT public.report_already_heard(NEW.employer_id, r.reporter_id))`);
      if (!/WHERE c\.employer_id = NEW\.employer_id AND c\.person_id = NEW\.reporter_id \) AND NOT public\.report_already_heard\(NEW\.employer_id, NEW\.reporter_id\) INTO new_applied;/i.test(pauseBody))
        detail.push(`${pause?.rel ?? "supabase/migrations"}: a report from someone already heard must not make "reported 3 times" ring again (new_applied ... AND NOT public.report_already_heard(NEW.employer_id, NEW.reporter_id))`);
      // The admins' bell says what the record knows (the fourteenth security
      // review): an interview moved or a card written before these fixes was
      // contact the record never saw.
      if (!/It stays open because it has no recorded contact with them\./.test(pauseBody) || /had not been in touch/i.test(pauseBody))
        detail.push(`${pause?.rel ?? "supabase/migrations"}: "reported 3 times" must say the business has no recorded contact with them, never that it "had not been in touch"`);

      const heard = await latestDefinition(ctx, "report_already_heard");
      if (!heard) detail.push("no migration defines report_already_heard");
      else {
        const body = plain(heard.body);
        if (!/^ ?SELECT EXISTS \( SELECT 1 FROM public\.employer_reports done WHERE done\.employer_id = p_employer AND done\.reporter_id = p_person AND done\.status = 'closed' AND done\.closed_by IS NOT NULL AND NOT EXISTS \( SELECT 1 FROM private\.business_contacts since WHERE since\.employer_id = p_employer AND since\.person_id = p_person AND since\.kind IN \('message', 'document_request', 'document', 'interview'\) AND since\.last_at > done\.closed_at \) \); ?$/i.test(body))
          detail.push(`${heard.rel}: report_already_heard must be a report of theirs on this business an admin closed (closed_by), with no contact in the record (message, request, document, interview) after that close, as written`);
        if (!heard.securityDefiner) detail.push(`${heard.alteredIn ?? heard.rel}: report_already_heard must run with its own rights (it reads the record, which no API role may)`);
        const file = plain((await ctx.read(heard.rel)) ?? "");
        if (!/REVOKE ALL ON FUNCTION public\.report_already_heard\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/i.test(file))
          detail.push(`${heard.rel}: report_already_heard must be revoked from PUBLIC, anon and authenticated`);
        for (const rel of await grantsToBrowser(ctx, "report_already_heard")) detail.push(`${rel}: grants report_already_heard to a browser role`);
      }

      // The reopen closes the open reports, saying who closed them; so does Close.
      const reopen = plain((await latestDefinition(ctx, "admin_set_business_status"))?.body);
      const reopening = reopen.search(/ELSIF was = 'suspended' AND p_status <> 'suspended' THEN/i);
      const closing = reopen.search(/UPDATE public\.employer_reports SET status = 'closed', closed_at = now\(\), closed_by = auth\.uid\(\) WHERE employer_id = p_employer AND status = 'open';/i);
      const after = reopen.slice(reopening + 1).search(/\b(ELSE|ELSIF)\b/i) + reopening + 1;
      if (reopening < 0 || closing < reopening || closing > after)
        detail.push("admin_set_business_status: reopening a paused business must close its open reports, by the admin (closed_at, closed_by): one more report must not pause it again straight away");
      const close = plain((await latestDefinition(ctx, "admin_close_report"))?.body);
      if (!/UPDATE public\.employer_reports SET status = 'closed', closed_at = now\(\), closed_by = auth\.uid\(\) WHERE id = p_report_id AND status = 'open';/i.test(close))
        detail.push("admin_close_report: Close on the Admin page must close the report saying who closed it and when (closed_at, closed_by)");

      // The record's last time: made once, required, never dropped.
      const texts = await migrationTexts(ctx);
      const TABLE = String.raw`"?private"?\s*\.\s*"?business_contacts"?`;
      if (!texts.some(({ sql }) => new RegExp(String.raw`\bALTER\s+TABLE\s+${TABLE}\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?last_at\s+timestamptz\b`, "i").test(sql)))
        detail.push("supabase/migrations: private.business_contacts must keep each contact's last time (last_at timestamptz)");
      if (!texts.some(({ sql }) => new RegExp(String.raw`\bALTER\s+TABLE\s+${TABLE}\s+ALTER\s+COLUMN\s+last_at\s+SET\s+NOT\s+NULL\b`, "i").test(sql)))
        detail.push("supabase/migrations: private.business_contacts.last_at must be required (SET NOT NULL)");
      for (const { rel, sql } of texts) {
        if (new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${TABLE}\s[^;]*\b(DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?last_at"?|ALTER\s+COLUMN\s+"?last_at"?\s+(?:DROP\s+NOT\s+NULL|DROP\s+DEFAULT|TYPE))\b`, "i").test(sql))
          detail.push(`${rel}: drops or loosens private.business_contacts.last_at`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "bell-card-is-contact",
    why:
      "A business could write \"Training fee due ... Send 1,500 PHP to GCash ...\" into its applicants' bells, pushed to " +
      "their phones, and their three reports left it open (the fifteenth Phase 5 review, probe p3). A browser's own card " +
      "from the job's owner or team to its applicant is a message in the record; the server's cards are not.",
    run: async (ctx) => {
      const detail = [...(await triggerProblems(ctx, { name: "business_contacts_remember", table: "notifications", timing: "AFTER", event: "INSERT", fn: "business_contacts_remember", when: "current_user = 'authenticated'" }))];
      const remember = await latestDefinition(ctx, "business_contacts_remember");
      if (!/ELSIF TG_TABLE_NAME = 'notifications' THEN INSERT INTO private\.business_contacts AS c \(employer_id, person_id, kind\) SELECT DISTINCT j\.employer_id, NEW\.user_id, 'message' /i.test(plain(remember?.body)))
        detail.push(`${remember?.rel ?? "supabase/migrations"}: business_contacts_remember must record a browser's card to someone who applied as a message from the job's business`);
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "interview-stays-on-its-application",
    why:
      "The job's owner, or a teammate who schedules interviews, could move an interview onto another application, and " +
      "the record of contact (written when an interview is booked) never saw it (the fifteenth Phase 5 review, probe " +
      "p2). Nobody but the server changes an interview's application.",
    run: async (ctx) => {
      const detail = [...(await triggerProblems(ctx, { name: "interviews_stay_on_their_application", table: "interviews", timing: "BEFORE", event: "UPDATE", fn: "interviews_stay_on_their_application" }))];
      const fn = await latestDefinition(ctx, "interviews_stay_on_their_application");
      if (!fn) detail.push("no migration defines interviews_stay_on_their_application");
      else {
        const body = plain(fn.body);
        if (!/IF NEW\.application_id IS DISTINCT FROM OLD\.application_id AND coalesce\(auth\.role\(\), ''\) <> 'service_role' AND \(coalesce\(auth\.role\(\), ''\) <> '' OR current_user IN \('anon', 'authenticated'\)\) THEN RAISE EXCEPTION 'interview_application_fixed'/i.test(body))
          detail.push(`${fn.rel}: interviews_stay_on_their_application must refuse any change of an interview's application but the server's (interview_application_fixed), as written`);
        // A trigger fired only for some columns would miss a change made alongside others.
        const made = (await migrationTexts(ctx)).flatMap(({ rel, sql }) => [...sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?interviews_stay_on_their_application"?\s[^;]*;/gi)].map((m) => ({ rel, text: m[0] }))).at(-1);
        if (made && /\bUPDATE\s+OF\b/i.test(made.text)) detail.push(`${made.rel}: interviews_stay_on_their_application must run for every update (no UPDATE OF)`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
];
