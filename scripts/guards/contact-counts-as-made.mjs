/**
 * The fourteenth Phase 5 review (2026-10-26, finding 1), locked.
 *
 *   - contact-counts-as-made: the automatic pause counts the contact a
 *     business made, whatever it deletes since. The Terms promise that three
 *     different people a business has been in touch with pause it by their
 *     reports; the code read the contact rows as they stood at the third
 *     report, and the business can delete every one of them (its messages,
 *     a request nobody answered, an interview, an unsigned document, Delete
 *     their information, the whole job). Contact is recorded when it is made,
 *     in private.business_contacts (20261025670000_contact_kept_when_made.sql):
 *     an AFTER INSERT trigger for each row on applications, messages,
 *     document_requests, documents and interviews, with its own rights, the
 *     business read from the application's job (for a message, a job the
 *     receiver applied to whose owner or team sent it; never from a column
 *     the business writes); no API role may touch the
 *     table and no migration deletes from it, so its rows go only with an
 *     account they name (ON DELETE CASCADE); business_has_contacted and both
 *     of employer_reports_auto_pause's "applied" checks read it.
 *
 * Proved by behaviour too: launch_locks_behaviour section 22 (the review's
 * probe p2, cases (a) to (e)) and section 5.
 */

import { latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL without comments, spaces collapsed. */
const plain = (sql) => (sql ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
const TABLE = String.raw`"?private"?\s*\.\s*"?business_contacts"?`;

export default [
  {
    id: "contact-counts-as-made",
    why:
      "A business that asked applicants for a fee and then deleted its messages, cancelled its requests, deleted its " +
      "interviews or removed the applicants with Delete their information was never paused by their three reports, and " +
      "the admins' \"reported 3 times\" bell never rang for removed applicants (the fourteenth Phase 5 review, probe " +
      "p2). Contact is recorded when it is made (private.business_contacts), nothing a business can delete removes it, " +
      "and the pause reads it.",
    run: async (ctx) => {
      const detail = [];
      const texts = await migrationTexts(ctx);

      // The record: made once, both ids accounts whose deletion alone takes a row.
      const made = texts.filter(({ sql }) => new RegExp(String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${TABLE}\s*\(`, "i").test(sql));
      if (made.length !== 1) detail.push(`supabase/migrations: private.business_contacts must be made once (found ${made.length})`);
      else {
        const def = plain(new RegExp(String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${TABLE}\s*\(([\s\S]*?)\);`, "i").exec(made[0].sql)?.[1]);
        for (const col of ["employer_id", "person_id"]) {
          if (!new RegExp(`\\b${col} uuid NOT NULL REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE\\b`, "i").test(def)) detail.push(`${made[0].rel}: private.business_contacts.${col} must name an account and go only with it (REFERENCES auth.users(id) ON DELETE CASCADE)`);
        }
        if (!/PRIMARY KEY \(employer_id, person_id, kind\)/i.test(def)) detail.push(`${made[0].rel}: private.business_contacts keeps one row per business, person and kind`);
      }
      // Nothing deletes from it, empties it, changes it or hands it to an API role.
      for (const { rel, sql } of texts) {
        if (new RegExp(String.raw`\b(DELETE\s+FROM|UPDATE|TRUNCATE(?:\s+TABLE)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+(?:ONLY\s+)?${TABLE}`, "i").test(sql)) detail.push(`${rel}: deletes, changes or drops rows of private.business_contacts (only an account's own deletion may take a row)`);
        if (new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${TABLE}\s[^;]*\b(DROP\s+CONSTRAINT|ON\s+DELETE|DISABLE)`, "i").test(sql)) detail.push(`${rel}: changes how private.business_contacts' rows go`);
        for (const m of sql.matchAll(/\bGRANT\s+([^;]*?)\s+ON\s+([\s\S]*?)\s+TO\s+([^;]*);/gi)) {
          const on = m[2].trim();
          const toApi = /(?:^|[\s,"])(anon|authenticated|service_role|public)(?:$|[\s,"])/i.test(m[3]);
          if (toApi && (new RegExp(String.raw`^(?:TABLE\s+)?(?:[^;]*,\s*)?${TABLE}\b`, "i").test(on) || /^ALL\s+TABLES\s+IN\s+SCHEMA\s+[^;]*\bprivate\b/i.test(on) || /^SCHEMA\s+[^;]*\bprivate\b/i.test(on))) detail.push(`${rel}: grants private.business_contacts (or the private schema) to an API role`);
        }
      }

      // The trigger that writes it, on each table where contact is made.
      const remember = await latestDefinition(ctx, "business_contacts_remember");
      if (!remember) detail.push("no migration defines business_contacts_remember");
      else {
        const body = plain(remember.body);
        if (!remember.securityDefiner) detail.push(`${remember.alteredIn ?? remember.rel}: business_contacts_remember must run with its own rights (a browser's insert cannot write the record)`);
        for (const [what, re] of [
          ["an application, from its job", /SELECT j\.employer_id, NEW\.candidate_id, 'applied' FROM public\.jobs j WHERE j\.id = NEW\.job_id/i],
          ["a message to someone who applied, from the business itself or its team", /SELECT DISTINCT j\.employer_id, NEW\.receiver_id, 'message' FROM public\.applications a JOIN public\.jobs j ON j\.id = a\.job_id WHERE a\.candidate_id = NEW\.receiver_id AND \(j\.employer_id = NEW\.sender_id OR EXISTS \(SELECT 1 FROM public\.team_members tm WHERE tm\.employer_id = j\.employer_id AND tm\.user_id = NEW\.sender_id\)\)/i],
          ["a request, a document or an interview, from its application's job", /TG_TABLE_NAME IN \('document_requests', 'documents', 'interviews'\) THEN INSERT INTO private\.business_contacts \(employer_id, person_id, kind\) SELECT j\.employer_id, a\.candidate_id, CASE TG_TABLE_NAME WHEN 'document_requests' THEN 'document_request' WHEN 'documents' THEN 'document' ELSE 'interview' END FROM public\.applications a JOIN public\.jobs j ON j\.id = a\.job_id WHERE a\.id = NEW\.application_id/i],
        ]) if (!re.test(body)) detail.push(`${remember.rel}: business_contacts_remember no longer records ${what} as written`);
        if ((body.match(/ON CONFLICT DO NOTHING/gi) ?? []).length !== 3) detail.push(`${remember.rel}: business_contacts_remember must keep the first time of each contact (ON CONFLICT DO NOTHING)`);
        if (/\bDELETE\b|\bUPDATE\b/i.test(body)) detail.push(`${remember.rel}: business_contacts_remember must only add to the record`);
        for (const table of ["applications", "messages", "document_requests", "documents", "interviews"]) {
          detail.push(...(await triggerProblems(ctx, { name: "business_contacts_remember", table, timing: "AFTER", event: "INSERT", fn: "business_contacts_remember" })));
        }
      }

      // The pause reads it: "applied" from the record, never from live applications.
      const pause = await latestDefinition(ctx, "employer_reports_auto_pause");
      const pauseBody = plain(pause?.body);
      if ((pauseBody.match(/SELECT 1 FROM private\.business_contacts c WHERE c\.employer_id = NEW\.employer_id AND c\.person_id = (r\.reporter_id|NEW\.reporter_id)/gi) ?? []).length !== 2 || /public\.applications/i.test(pauseBody))
        detail.push(`${pause?.rel ?? "supabase/migrations"}: employer_reports_auto_pause must count a reporter as having applied from the record (private.business_contacts), both for the pause and for the "reported 3 times" bell, never from live applications (a removed applicant would not count)`);
      return { ok: detail.length === 0, detail };
    },
  },
];
