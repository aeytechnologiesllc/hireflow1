/**
 * The nineteenth Phase 5 review and the eighteenth security review
 * (2026-10-27), locked (20261025720000_text_a_business_changes_is_contact.sql).
 *
 * Rounds 15 to 19 each found one more place where a business shows its
 * applicants words it can change after they applied, with nothing recorded
 * as contact. This round closes the class: a business's browser edit of the
 * words an applicant reads, while those applicants can read it and the
 * public cannot, is contact with them; where the application's own snapshot
 * covers a page cheaply, the page shows it.
 *
 *   - step-pages-name-the-job-as-applied: the nine step pages, the step
 *     gate and "Continue on your computer" ("Email me the link") name the
 *     job by the application's applied_job_title, never the job's title
 *     today (the Phase 5 review's finding 2: a closed job renamed "PAY 500
 *     PHP GCASH 0917 000 0000 FIRST - Chat support agent" topped every step).
 *   - job-text-edit-is-contact: a browser's change of a job's applicant-facing
 *     words (title, description, requirements, responsibilities, benefits,
 *     skills, experience level, location, type, the form's questions, the
 *     quiz, every step's title, description and settings) records a "message"
 *     for everyone still waiting on the job, when the job is off its public
 *     page, or the words are ones the public page never shows, or the job
 *     leaves its public page within a day of the change
 *     (business_contacts_remember_text; probes p1_steps_closed and
 *     s1_residual).
 *   - business-rename-is-contact: a business's browser rename of itself
 *     records a "message" for everyone still waiting on any of its jobs
 *     (business_contacts_remember_name; probe p2_messages).
 *   - report-names-the-business: a report can name the business when its job
 *     is gone, for a business the reporter has a recorded contact or a
 *     message thread with (report_choices), with one open report per
 *     business when there is no job; Report is offered on the applicant's
 *     Messages thread and on the screens of an application that is gone
 *     (the Phase 5 review's finding 3, probe p3_nowhere_to_report).
 *
 * Proved by behaviour too: launch_locks_behaviour section 28 and
 * scripts/applicant_job_words.test.mjs.
 */

import { grantsToBrowser, latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL without comments, spaces collapsed. */
const plain = (sql) => (sql ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
/** Code without comments (JSX ones too), spaces collapsed. */
const code = (text) =>
  (text ?? "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s+/g, " ");

export const STEP_PAGES = [
  "src/pages/ApplicationFormPhase.tsx",
  "src/pages/VideoIntroPhase.tsx",
  "src/pages/QuizPhase.tsx",
  "src/pages/TypingTestPhase.tsx",
  "src/pages/ChatSimulationPhase.tsx",
  "src/pages/ChatInterviewPhase.tsx",
  "src/pages/ConnectionCheckPhase.tsx",
  "src/pages/PortfolioUploadPhase.tsx",
  "src/pages/SalesSimulationPhase.tsx",
];

/** The applicant-facing columns the trigger must watch (and job_applicant_words must read). */
const TEXT_COLUMNS = ["title", "description", "requirements", "responsibilities", "benefits", "skills_required", "experience_level", "location", "job_type", "application_questions", "quiz_questions", "workflow_steps"];

/** The last CREATE TRIGGER <name> statement, comments removed. */
async function lastTrigger(ctx, name) {
  let found = null;
  for (const { rel, sql } of await migrationTexts(ctx)) {
    for (const m of sql.matchAll(new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+"?${name}"?\\s[^;]*;`, "gi"))) found = { rel, text: m[0].replace(/\s+/g, " ") };
  }
  return found;
}

export default [
  {
    id: "step-pages-name-the-job-as-applied",
    why:
      "Every step page put the job's title today at its top, and so did \"Continue on your computer\" beside \"Email me " +
      "the link\": a business closed its job and renamed it \"PAY 500 PHP GCASH 0917 000 0000 FIRST - Chat support agent\" " +
      "(the nineteenth Phase 5 review, finding 2, probe p1_steps_closed). They name the job as the applicant applied to it.",
    run: async ({ read }) => {
      const detail = [];
      for (const rel of STEP_PAGES) {
        const page = code(await read(rel));
        if (!page) {
          detail.push(`${rel}: missing`);
          continue;
        }
        // The job's title may still go to the server as a request's jobTitle
        // (the server reads the job itself); nowhere else.
        const shown = page.replace(/\bjobTitle:\s*[^,}]+/g, " ");
        if (/\bjobs?\s*\??\.\s*title\b/.test(shown)) detail.push(`${rel}: shows the job's title today (jobs?.title / job.title); name it by the application's applied_job_title through appliedNames`);
        if (!page.includes('import { appliedNames } from "@/lib/appliedNames";') || !/appliedNames\(application\)\.jobTitle/.test(page))
          detail.push(`${rel}: must name the job through appliedNames(application).jobTitle (src/lib/appliedNames.ts)`);
        if (!/applied_job_title\?: string \| null;/.test(page)) detail.push(`${rel}: its application type must carry applied_job_title`);
      }
      const gate = code(await read("src/components/candidate/CandidateStepGate.tsx"));
      if (
        !/\.select\("phase, status, notes, voice_interview_result, applied_job_title, jobs:job_id \( workflow_steps, quiz_questions, is_remote \)"\)/.test(gate) ||
        !/setAppliedTitle\(appliedNames\(app\)\.jobTitle\);/.test(gate) ||
        !/jobTitle=\{appliedTitle\}/.test(gate) ||
        /\bjob\??\.title\b|gateJob\??\.title/.test(gate)
      )
        detail.push("src/components/candidate/CandidateStepGate.tsx: \"Continue on your computer\" must name the job by the application's applied_job_title, never the job's title today");
      const screen = code(await read("src/components/candidate/ContinueOnComputer.tsx"));
      if (/\.from\(|\bjobs?\??\.title\b/.test(screen)) detail.push("src/components/candidate/ContinueOnComputer.tsx: names the job only from the title the gate hands it (the application's own)");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "job-text-edit-is-contact",
    why:
      "A business could rewrite a closed job's title, steps, prompts, form questions, location and type into a fee ask, " +
      "read by everyone still waiting on it and by nobody else, and nothing recorded it as contact, so their three reports " +
      "left it open (the nineteenth Phase 5 review, finding 2, probe p1_steps_closed; the eighteenth security review, " +
      "finding 1, probe s1_residual). Such an edit is now a message from the business to each of them.",
    run: async (ctx) => {
      const detail = [
        ...(await triggerProblems(ctx, { name: "business_contacts_remember_text", table: "jobs", timing: "AFTER", event: "UPDATE", fn: "business_contacts_remember_text", when: "current_user = 'authenticated'" })),
      ];
      const made = await lastTrigger(ctx, "business_contacts_remember_text");
      const of = made ? /\bAFTER\s+UPDATE\s+OF\s+(.*?)\s+ON\s/i.exec(made.text) : null;
      const watched = of ? of[1].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase()) : null;
      if (!watched) detail.push(`${made?.rel ?? "supabase/migrations"}: business_contacts_remember_text must fire AFTER UPDATE OF the job's applicant-facing columns`);
      else {
        const missing = [...TEXT_COLUMNS, "status", "exclude_from_feed", "application_deadline"].filter((c) => !watched.includes(c));
        if (missing.length) detail.push(`${made.rel}: business_contacts_remember_text no longer watches ${missing.join(", ")}`);
      }
      const fn = await latestDefinition(ctx, "business_contacts_remember_text");
      const body = plain(fn?.body);
      if (!fn?.securityDefiner) detail.push(`${fn?.rel ?? "supabase/migrations"}: business_contacts_remember_text must run as its owner (it writes private.business_contacts)`);
      for (const [rule, words] of [
        [/IF auth\.uid\(\) IS NULL OR NOT \(public\.is_job_owner\(NEW\.id, auth\.uid\(\)\) OR public\.is_active_team_member_for_job\(NEW\.id, auth\.uid\(\)\)\) THEN RETURN NULL; END IF;/, "only the job's owner or an active teammate on it"],
        [/words_changed := public\.job_applicant_words\(OLD, false\) IS DISTINCT FROM public\.job_applicant_words\(NEW, false\);/, "a change of the job's applicant-facing words"],
        [/IF words_changed THEN IF NOT was_public OR NOT is_public OR public\.job_applicant_words\(OLD, true\) IS DISTINCT FROM public\.job_applicant_words\(NEW, true\) THEN record_it := true;/, "recorded when the job is off its public page, or the words are ones it never shows"],
        [/IF NOT record_it AND was_public AND NOT is_public THEN record_it := EXISTS \( SELECT 1 FROM private\.job_public_text_edits e WHERE e\.job_id = NEW\.id AND e\.edited_at > now\(\) - interval '1 day' \); END IF;/, "and when the job leaves its public page within a day of a public change"],
        [/INSERT INTO private\.business_contacts AS c \(employer_id, person_id, kind\) SELECT DISTINCT NEW\.employer_id, a\.candidate_id, 'message' FROM public\.applications a WHERE a\.job_id = NEW\.id AND a\.candidate_id IS NOT NULL AND a\.candidate_id IS DISTINCT FROM NEW\.employer_id AND a\.candidate_id IS DISTINCT FROM auth\.uid\(\) AND a\.status NOT IN \('rejected', 'hired'\) ON CONFLICT \(employer_id, person_id, kind\) DO UPDATE SET last_at = greatest\(c\.last_at, EXCLUDED\.last_at\);/, "as a message from the job's business to everyone still waiting on it"],
      ]) {
        if (!rule.test(body)) detail.push(`${fn?.rel ?? "supabase/migrations"}: business_contacts_remember_text must be ${words}, as written`);
      }
      const words = plain((await latestDefinition(ctx, "job_applicant_words"))?.body);
      const all = /ELSE jsonb_build_array\( (.*?) \) END, 'strict \$\.\*\* \? \(@\.type\(\) == "string"\)'\)/.exec(words);
      const read = all ? all[1] : "";
      const unread = TEXT_COLUMNS.filter((c) => !new RegExp(`p_job\\.${c}\\b`).test(read));
      if (!all || unread.length) detail.push(`supabase/migrations: job_applicant_words must read every string of the job's applicant-facing columns${unread.length ? ` (not ${unread.join(", ")})` : ""}`);
      if (!/s\.value - ARRAY\['id', 'type', 'title', 'description', 'required'\]/.test(words) || !/q\.value - ARRAY\['id', 'type', 'question', 'required', 'placeholder', 'time_limit_seconds', 'category'\]/.test(words))
        detail.push("supabase/migrations: job_applicant_words(…, true) must keep only what published_jobs_public leaves out (a step's settings, a question's options)");
      const shown = plain((await latestDefinition(ctx, "job_text_public"))?.body);
      if (!/p_job\.status = 'published' AND NOT coalesce\(p_job\.exclude_from_feed, false\) AND \(p_job\.application_deadline IS NULL OR p_job\.application_deadline > now\(\) \+ interval '1 day'\) AND public\.business_status_of\(p_job\.employer_id\) IS DISTINCT FROM 'suspended'/.test(shown))
        detail.push("supabase/migrations: job_text_public must be published_jobs_public's rule, with its deadline a day away");
      for (const f of ["business_contacts_remember_text", "job_applicant_words", "job_text_public"]) {
        const browser = await grantsToBrowser(ctx, f);
        if (browser.length) detail.push(`${browser.join(", ")}: grants ${f} to a browser role`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "business-rename-is-contact",
    why:
      "A business's name today is read wherever an applicant's page has no snapshot, and a business could rename itself " +
      "\"Fee Clinic: pay 500 PHP to GCash 0917 000 0000 to stay in the pool\" with nothing recorded (the nineteenth Phase 5 " +
      "review, finding 1, probe p2_messages). A rename from its browser is a message to everyone still waiting on any of its jobs.",
    run: async (ctx) => {
      const detail = [
        ...(await triggerProblems(ctx, { name: "business_contacts_remember_name", table: "profiles", timing: "AFTER", event: "UPDATE", fn: "business_contacts_remember_name", when: "current_user = 'authenticated' AND NEW.company_name IS DISTINCT FROM OLD.company_name" })),
      ];
      const made = await lastTrigger(ctx, "business_contacts_remember_name");
      if (!made || !/\bAFTER\s+UPDATE\s+OF\s+company_name\s+ON\s/i.test(made.text)) detail.push(`${made?.rel ?? "supabase/migrations"}: business_contacts_remember_name must fire AFTER UPDATE OF company_name`);
      const fn = await latestDefinition(ctx, "business_contacts_remember_name");
      const body = plain(fn?.body);
      if (
        !fn?.securityDefiner ||
        !/IF auth\.uid\(\) IS NULL OR auth\.uid\(\) IS DISTINCT FROM NEW\.user_id THEN RETURN NULL; END IF;/.test(body) ||
        !/INSERT INTO private\.business_contacts AS c \(employer_id, person_id, kind\) SELECT DISTINCT NEW\.user_id, a\.candidate_id, 'message' FROM public\.jobs j JOIN public\.applications a ON a\.job_id = j\.id WHERE j\.employer_id = NEW\.user_id AND a\.candidate_id IS NOT NULL AND a\.candidate_id IS DISTINCT FROM NEW\.user_id AND a\.status NOT IN \('rejected', 'hired'\) ON CONFLICT/.test(body)
      )
        detail.push(`${fn?.rel ?? "supabase/migrations"}: business_contacts_remember_name must record, as its owner, a message from the business to everyone still waiting on any of its jobs, as written`);
      const browser = await grantsToBrowser(ctx, "business_contacts_remember_name");
      if (browser.length) detail.push(`${browser.join(", ")}: grants business_contacts_remember_name to a browser role`);
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "report-names-the-business",
    why:
      "A business that asked three people for money and then deleted its job left them nowhere to report it: " +
      "report_employer refused a job that no longer exists, the job's deletion took their applications and every Report " +
      "button with them, and it posted the same job again (the nineteenth Phase 5 review, finding 3, probe " +
      "p3_nowhere_to_report). A report can name the business, from the Messages thread or the screens of an application that is gone.",
    run: async (ctx) => {
      const detail = [];
      const report = await latestDefinition(ctx, "report_employer");
      const header = plain(report?.header);
      const body = plain(report?.body);
      if (!/report_employer\(p_job_id uuid, p_reason text, p_details text DEFAULT NULL, p_employer uuid DEFAULT NULL\)/.test(header))
        detail.push(`${report?.rel ?? "supabase/migrations"}: report_employer must take p_employer (DEFAULT NULL) after its three arguments`);
      if (!/ELSIF p_employer IS NOT NULL THEN SELECT c\.employer_id INTO owner FROM public\.report_choices\(\) c WHERE c\.employer_id = public\.report_business_of\(p_employer\) LIMIT 1;/.test(body))
        detail.push(`${report?.rel ?? "supabase/migrations"}: with no job, report_employer must take only a business from the reporter's own report_choices()`);
      if (!/WHERE r\.reporter_id = me AND r\.status = 'open' AND \(r\.job_id = report_job OR \(report_job IS NULL AND r\.job_id IS NULL AND r\.employer_id = owner\)\) LIMIT 1;/.test(body))
        detail.push(`${report?.rel ?? "supabase/migrations"}: report_employer must keep one open report per person per job, or per business when there is no job`);
      if (!/INSERT INTO public\.employer_reports \(employer_id, job_id, reporter_id, reason, details\) VALUES \(owner, report_job, me, p_reason, left\(clean, 1000\)\)/.test(body) || !/IF recent >= 5 THEN RAISE EXCEPTION 'report_too_many'/.test(body))
        detail.push(`${report?.rel ?? "supabase/migrations"}: report_employer must file the report under its business, its job or none, five a day`);
      const choices = plain((await latestDefinition(ctx, "report_choices"))?.body);
      if (!/FROM private\.business_contacts c WHERE c\.person_id = auth\.uid\(\)/.test(choices) || !/WHERE \(m\.sender_id = auth\.uid\(\) OR m\.receiver_id = auth\.uid\(\)\)/.test(choices) || !/WHERE a\.candidate_id = auth\.uid\(\) AND j\.employer_id = b\.business/.test(choices))
        detail.push("supabase/migrations: report_choices must list only the caller's own businesses (their record of contact and their message threads), named from their own application");
      if (/\bp\.company_name\b|employer_public_branding/.test(choices)) detail.push("supabase/migrations: report_choices must never name a business by its name today");
      if ((await grantsToBrowser(ctx, "report_business_of")).length) detail.push("supabase/migrations: report_business_of is the database's own (no browser grant)");
      const messages = code(await ctx.read("src/cockpit/pages/Messages.tsx"));
      if (!/data-chat-report/.test(messages) || !/<ReportJobDialog open=\{reportOpen\} onClose=\{\(\) => setReportOpen\(false\)\} about="business" targets=\{\[\{ key: partner\.id, label: partner\.name, employerId: partner\.id,/.test(messages))
        detail.push("src/cockpit/pages/Messages.tsx: an applicant's chat with a business must offer Report, naming the business (the chat's contact)");
      for (const rel of ["src/pages/CandidateApplicationDetail.tsx", "src/components/candidate/CandidateStepGate.tsx"]) {
        if (!/<ReportBusinessNote \/>/.test(code(await ctx.read(rel)))) detail.push(`${rel}: the screen of an application that is gone must offer Report (ReportBusinessNote)`);
      }
      const note = code(await ctx.read("src/components/trust/ReportBusinessNote.tsx"));
      if (!/supabase\.rpc\("report_choices" as never\)/.test(note) || /company_name\s*\?\?\s*[^"]|employer_public_branding/.test(note))
        detail.push("src/components/trust/ReportBusinessNote.tsx: must list the reporter's own report_choices(), named as they applied");
      const dialog = code(await ctx.read("src/components/trust/ReportJobDialog.tsx"));
      if (!/p_employer: target\.employerId/.test(dialog)) detail.push("src/components/trust/ReportJobDialog.tsx: a business target must send p_employer");
      return { ok: detail.length === 0, detail };
    },
  },
];
