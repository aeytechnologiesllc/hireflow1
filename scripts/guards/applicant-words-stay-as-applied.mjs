/**
 * What an applicant already relies on stops changing under them (the
 * nineteenth and twentieth Phase 5 reviews and the eighteenth security
 * review, 2026-10-27), locked.
 *
 * Rounds 15 to 19 each found one more place where a business shows its
 * applicants words it can change after they applied, with nothing recorded
 * as contact. Round 19 (20261025720000) closed the class by recording a
 * browser's edit of a job's words, or a rename, as contact with everyone
 * still waiting; the twentieth review showed that one ordinary edit then
 * gave three throwaway accounts that only started an application the
 * contact they need to pause a real business (probe q3_blanket), and that a
 * live job's form, steps and quiz, which no public page shows, were still
 * open (probe q2_live_unshown). Round 20 (20261025730000) undoes the
 * broadcast and closes the class the other way:
 *
 *   - step-pages-name-the-job-as-applied: the ten step pages, the step
 *     gate and "Continue on your computer" ("Email me the link") name the
 *     job by the application's applied_job_title, never the job's title
 *     today (the nineteenth review's finding 2: a closed job renamed "PAY 500
 *     PHP GCASH 0917 000 0000 FIRST - Chat support agent" topped every step);
 *     the voice interview and the applicant's Documents page name the job and
 *     the business as they applied too (the twentieth review).
 *   - edits-are-no-broadcast-contact: an edit of a job's words, or a
 *     business's rename of itself, records no contact with anyone
 *     (business_contacts_remember_text and business_contacts_remember_name
 *     are dropped and never made again).
 *   - step-words-fixed-once-applied: once a job has any application, a
 *     browser cannot change a word of its form questions, quiz or steps, add
 *     or remove one, or change the quiz's answer key
 *     (jobs_applicant_words_fixed, HINT job_steps_fixed), and the editor shows
 *     the questions read-only then (src/lib/jobStepsFixed.ts).
 *   - applications-keep-place-and-type: an application keeps the job's
 *     location and type as they were when it was made (applied_location,
 *     applied_job_type), and the overview pages show those.
 *   - report-names-the-business: a report can name the business when its job
 *     is gone, for a business the reporter has a recorded contact or a
 *     message thread with (report_choices), with one open report per
 *     business when there is no job; Report is offered on the applicant's
 *     Messages thread, on the screens of an application that is gone, on
 *     Contact us and on Messages with no chat (the nineteenth review's
 *     finding 3, the twentieth's finding 3).
 *
 * Proved by behaviour too: launch_locks_behaviour sections 28 and 29 and
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

/** Every CREATE TRIGGER and DROP TRIGGER of <name> on public.<table>, in migration order. */
async function triggerEvents(ctx, name, table) {
  const events = [];
  (await migrationTexts(ctx)).forEach(({ rel, sql }, file) => {
    for (const m of sql.matchAll(new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+"?${name}"?\\s[^;]*?\\bON\\s+(?:"?public"?\\s*\\.\\s*)?"?${table}"?\\b[^;]*;`, "gi"))) events.push({ rel, file, at: m.index, kind: "create", text: m[0].replace(/\s+/g, " ") });
    for (const m of sql.matchAll(new RegExp(`\\bDROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?"?${name}"?\\s+ON\\s+(?:"?public"?\\s*\\.\\s*)?"?${table}"?\\b[^;]*;`, "gi"))) events.push({ rel, file, at: m.index, kind: "drop" });
  });
  return events.sort((a, b) => a.file - b.file || a.at - b.at);
}

export default [
  {
    id: "step-pages-name-the-job-as-applied",
    why:
      "Every step page put the job's title today at its top, and so did \"Continue on your computer\" beside \"Email me " +
      "the link\": a business closed its job and renamed it \"PAY 500 PHP GCASH 0917 000 0000 FIRST - Chat support agent\" " +
      "(the nineteenth Phase 5 review, finding 2, probe p1_steps_closed). They name the job as the applicant applied to it; " +
      "since the twentieth review, the voice interview and the applicant's Documents page do too.",
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
      const voice = code(await read("src/pages/VoiceInterviewPhase.tsx"));
      if (
        !voice.includes('import { appliedNames } from "@/lib/appliedNames";') ||
        !/const named = appliedNames\(app\); setJob\(\{ title: named\.jobTitle \?\? "", /.test(voice) ||
        !/company_name: named\.companyName \?\? undefined,/.test(voice) ||
        /title: app\.jobs\.title|\.select\("company_name"\)|profile\?\.company_name/.test(voice)
      )
        detail.push("src/pages/VoiceInterviewPhase.tsx: the voice interview's header and transcript must name the job and the business as they applied (appliedNames(app)), never the job's title or the business's name today");
      const docs = code(await read("src/pages/MyDocuments.tsx"));
      if (
        !/const named = appliedNames\(application\); return businessJobLine\(named\.companyName, named\.jobTitle\);/.test(docs) ||
        (docs.match(/askedBy=\{askedByLine\((doc|request)\.applications\)\}/g) ?? []).length !== 3 ||
        /useCompanyNames\(|companies\.get|jobs\?\.title/.test(docs)
      )
        detail.push("src/pages/MyDocuments.tsx: each paper's \"asked by\" line must name the business and the job as they applied (appliedNames of its application), never today's names");
      for (const [rel, select] of [
        ["src/hooks/useDocuments.ts", /applications\( id, candidate_id, status, jobs\(\*\), applied_job_title, applied_company_name \)/],
        ["src/hooks/useDocumentRequests.ts", /applications\( id, candidate_id, applied_job_title, applied_company_name, jobs\(id, title, employer_id\) \)/],
      ]) {
        if (!select.test(code(await read(rel)))) detail.push(`${rel}: must read the application's applied_job_title and applied_company_name for the Documents page`);
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
    id: "edits-are-no-broadcast-contact",
    why:
      "Round 19 recorded a browser's edit of a job's words, or a business's rename, as a message to everyone still waiting. " +
      "One ordinary edit (a \"Weekend\" choice, \"LLC\" in the name, a typo fixed on a job that closes the same day) then gave " +
      "three throwaway accounts that only started an application the contact they need to pause a real business, again " +
      "after every reopen (the twentieth Phase 5 review, finding 2, probe q3_blanket). Contact is the business reaching that " +
      "person; an edit reaches nobody in particular.",
    run: async (ctx) => {
      const detail = [];
      for (const [name, table, fn] of [
        ["business_contacts_remember_text", "jobs", "business_contacts_remember_text"],
        ["business_contacts_remember_name", "profiles", "business_contacts_remember_name"],
      ]) {
        const events = await triggerEvents(ctx, name, table);
        const last = events[events.length - 1];
        if (last && last.kind === "create") detail.push(`${last.rel}: ${name} on public.${table} is made again (an edit or a rename would be contact with everyone waiting)`);
        const def = await latestDefinition(ctx, fn);
        const dropped = (await migrationTexts(ctx)).some(({ sql }, file) => def && file >= def.file && new RegExp(`\\bDROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${fn}\\s*\\(\\s*\\)`, "i").test(sql.slice(file === def.file ? def.at : 0)));
        if (def && !dropped) detail.push(`${def.rel}: ${fn} is defined again after it was dropped`);
      }
      // Nothing on jobs or profiles writes the record of contact.
      for (const { rel, sql } of await migrationTexts(ctx)) {
        if (rel < "supabase/migrations/20261025730000") continue;
        for (const m of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?(\w+)"?\s[^;]*?\bON\s+(?:"?public"?\s*\.\s*)?"?(jobs|profiles)"?\b[^;]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?(\w+)\s*\(/gi)) {
          const body = plain((await latestDefinition(ctx, m[3]))?.body);
          if (/private\.business_contacts\b/.test(body)) detail.push(`${rel}: trigger ${m[1]} on public.${m[2]} writes private.business_contacts (an edit of a job or a profile is no contact)`);
        }
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "step-words-fixed-once-applied",
    why:
      "On a live job a business rewrote the form's question, a step's title and description and the quiz into a GCash fee " +
      "ask, which no public page shows, and a draft sent its form with \"GCash ref 1234567890\" (the twentieth Phase 5 " +
      "review, finding 1, probe q2_live_unshown). Once anyone has applied, a browser cannot change a word of a job's " +
      "questions, quiz or steps, nor its answer key; the editor says to copy the job to drafts instead.",
    run: async (ctx) => {
      const detail = [
        ...(await triggerProblems(ctx, { name: "jobs_applicant_words_fixed", table: "jobs", timing: "BEFORE", event: "UPDATE", fn: "jobs_applicant_words_fixed", when: "current_user IN ('anon', 'authenticated')" })),
      ];
      const events = await triggerEvents(ctx, "jobs_applicant_words_fixed", "jobs");
      const made = [...events].reverse().find((e) => e.kind === "create");
      if (!made || !/\bBEFORE UPDATE OF application_questions, quiz_questions, workflow_steps ON public\.jobs\b/i.test(made.text))
        detail.push(`${made?.rel ?? "supabase/migrations"}: jobs_applicant_words_fixed must fire BEFORE UPDATE OF application_questions, quiz_questions, workflow_steps`);
      // It must see what the browser sent: before every other BEFORE trigger
      // on jobs (extract_quiz_answer_keys strips the answer keys), which fire
      // in name order.
      const before = new Set();
      for (const { sql } of await migrationTexts(ctx)) {
        for (const m of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?(\w+)"?\s+BEFORE\s+([^;]*?)\s+ON\s+(?:"?public"?\s*\.\s*)?"?jobs"?\b/gi)) {
          if (/\bUPDATE\b/i.test(m[2])) before.add(m[1]);
        }
      }
      const later = [...before].filter((n) => n !== "jobs_applicant_words_fixed" && n < "jobs_applicant_words_fixed");
      if (later.length) detail.push(`supabase/migrations: BEFORE trigger(s) ${later.join(", ")} on public.jobs fire before jobs_applicant_words_fixed (it must see what the browser sent)`);
      const fn = await latestDefinition(ctx, "jobs_applicant_words_fixed");
      const body = plain(fn?.body);
      if (!fn?.securityDefiner) detail.push(`${fn?.rel ?? "supabase/migrations"}: jobs_applicant_words_fixed must run as its owner (it reads every application of the job and job_quiz_keys)`);
      for (const [rule, words] of [
        [/IF NOT EXISTS \(SELECT 1 FROM public\.applications a WHERE a\.job_id = NEW\.id\) THEN RETURN NEW; END IF;/, "held once the job has any application, a draft included"],
        [/IF public\.job_step_words\(OLD\.application_questions, OLD\.quiz_questions, OLD\.workflow_steps\) IS DISTINCT FROM public\.job_step_words\(NEW\.application_questions, NEW\.quiz_questions, NEW\.workflow_steps\) OR EXISTS \( SELECT 1 FROM public\.job_answer_keys_sent\(NEW\.quiz_questions, NEW\.workflow_steps\) k LEFT JOIN public\.job_quiz_keys s ON s\.job_id = NEW\.id AND s\.step_id = k\.step_id AND s\.question_id = k\.question_id WHERE s\.key IS DISTINCT FROM k\.key \) THEN RAISE EXCEPTION/, "a refusal of any change of a word of the questions, quiz or steps, or of the answer key"],
        [/USING ERRCODE = 'check_violation', HINT = 'job_steps_fixed';/, "refused with HINT job_steps_fixed"],
      ]) {
        if (!rule.test(body)) detail.push(`${fn?.rel ?? "supabase/migrations"}: jobs_applicant_words_fixed must be ${words}, as written`);
      }
      const words = plain((await latestDefinition(ctx, "job_step_words"))?.body);
      if (
        !/SELECT coalesce\(public\.job_words_tree\( jsonb_build_array\( p_questions,/.test(words) ||
        (words.match(/- ARRAY\['correct_answer', 'correctAnswer', 'correct_answers', 'fit_context'\]/g) ?? []).length !== 2
      )
        detail.push("supabase/migrations: job_step_words must read every string of the form questions, the quiz and the steps through job_words_tree, leaving out only the quiz's answer fields");
      // Each word with the key and place that hold it (the twenty-first Phase 5
      // review: a flat list let planted unused keys be swapped into view).
      const tree = await latestDefinition(ctx, "job_words_tree");
      const treeBody = plain(tree?.body);
      if (
        !/WHEN 'string' THEN RETURN p;/.test(treeBody) ||
        !/out_obj := out_obj \|\| jsonb_build_object\(k, e\);/.test(treeBody) ||
        !/out_arr := out_arr \|\| jsonb_build_array\(e\);/.test(treeBody) ||
        !/ELSE RETURN NULL; END CASE;/.test(treeBody)
      )
        detail.push(`${tree?.rel ?? "supabase/migrations"}: job_words_tree must keep every string at its key and place (an array's places kept), and read nothing else as a word`);
      const keys = plain((await latestDefinition(ctx, "job_answer_keys_sent"))?.body);
      if (!/'__quiz_questions__'::text AS step_id/.test(keys) || !/'__step_' \|\| \(s\.n - 1\)::text/.test(keys) || !/'__idx_' \|\| x\.idx::text/.test(keys))
        detail.push("supabase/migrations: job_answer_keys_sent must name each key as extract_quiz_answer_keys files it in job_quiz_keys");
      for (const f of ["jobs_applicant_words_fixed", "job_step_words", "job_answer_keys_sent", "job_words_tree"]) {
        const browser = await grantsToBrowser(ctx, f);
        if (browser.length) detail.push(`${browser.join(", ")}: grants ${f} to a browser role`);
      }
      // The editor.
      const editor = code(await ctx.read("src/pages/CreateJob.tsx"));
      if (
        !/const \{ data: stepsFixed = false \} = useJobHasApplications\(isEditMode \? id : undefined\);/.test(editor) ||
        !/const questionsLocked = isEditMode && stepsFixed;/.test(editor) ||
        !/\{!questionsLocked && \( <Button variant="outline" size="sm" onClick=\{addNewQuestion\}/.test(editor) ||
        !/\{questionsLocked && \( <p className="text-sm text-muted-foreground" data-steps-fixed> \{JOB_STEPS_FIXED_NOTE\} <\/p> \)\}/.test(editor) ||
        (editor.match(/\{!questionsLocked && \(/g) ?? []).length < 3 ||
        !/if \(isJobStepsFixedError\(error\)\) \{ toast\.error\(JOB_STEPS_FIXED_MESSAGE\);/.test(editor)
      )
        detail.push("src/pages/CreateJob.tsx: once the job has applications the questions must be read-only (no add, move, edit or delete), with the one line saying why and what to do, and a refused save must say so");
      const hook = code(await ctx.read("src/hooks/useJobs.ts"));
      if (!/export function useJobHasApplications\(id: string \| undefined\)/.test(hook) || !/\.from\("applications"\) \.select\("id", \{ count: "exact", head: true \}\) \.eq\("job_id", id!\);/.test(hook))
        detail.push("src/hooks/useJobs.ts: useJobHasApplications must count the job's applications, drafts included");
      const lib = code(await ctx.read("src/lib/jobStepsFixed.ts"));
      if (!/e\.hint === "job_steps_fixed"/.test(lib) || !/Copy to drafts/.test(lib)) detail.push("src/lib/jobStepsFixed.ts: must read HINT job_steps_fixed and point to Copy to drafts");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "applications-keep-place-and-type",
    why:
      "The overview pages showed a closed job's location and type as they are today: \"Remote. To be reconsidered, send the " +
      "500 PHP review fee to GCash 0917 000 0000 ...\" (the eighteenth security review's s1_residual). Since the twentieth " +
      "Phase 5 review an application keeps them as they were when it was made, as it keeps the title, and the pages show those.",
    run: async (ctx) => {
      const detail = [];
      const fn = await latestDefinition(ctx, "applications_as_applied");
      const body = plain(fn?.body);
      if (
        !fn?.securityDefiner ||
        !/SELECT j\.title, p\.company_name, j\.location, j\.job_type INTO NEW\.applied_job_title, NEW\.applied_company_name, NEW\.applied_location, NEW\.applied_job_type FROM public\.jobs j/.test(body) ||
        !/NEW\.applied_location := NULL; NEW\.applied_job_type := NULL;/.test(body) ||
        !/NEW\.applied_location := OLD\.applied_location; NEW\.applied_job_type := OLD\.applied_job_type;/.test(body)
      )
        detail.push(`${fn?.rel ?? "supabase/migrations"}: applications_as_applied must set applied_location and applied_job_type from the job on every insert, and keep them from every browser after`);
      detail.push(...(await triggerProblems(ctx, { name: "applications_as_applied", table: "applications", timing: "BEFORE", event: "INSERT", fn: "applications_as_applied" })));
      detail.push(...(await triggerProblems(ctx, { name: "applications_as_applied_kept", table: "applications", timing: "BEFORE", event: "UPDATE", fn: "applications_as_applied", when: "current_user IN ('anon', 'authenticated')" })));
      const names = code(await ctx.read("src/lib/appliedNames.ts"));
      if (!names.includes("location: plain(application?.applied_location),") || !names.includes("jobType: plain(application?.applied_job_type),"))
        detail.push("src/lib/appliedNames.ts: must give the application's applied_location and applied_job_type");
      const types = (await ctx.read("src/integrations/supabase/types.ts")) ?? "";
      const at = types.indexOf("      applications: {\n        Row: {");
      const row = types.slice(at, types.indexOf("        Insert: {", at));
      if (!/applied_location: string \| null/.test(row) || !/applied_job_type: string \| null/.test(row))
        detail.push("src/integrations/supabase/types.ts: applications' Row must carry applied_location and applied_job_type");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "report-names-the-business",
    why:
      "A business that asked three people for money and then deleted its job left them nowhere to report it: " +
      "report_employer refused a job that no longer exists, the job's deletion took their applications and every Report " +
      "button with them, and it posted the same job again (the nineteenth Phase 5 review, finding 3, probe " +
      "p3_nowhere_to_report). A report can name the business, from the Messages thread, the screens of an application " +
      "that is gone, Contact us, and Messages with no chat (the twentieth review, finding 3: the chat is there only if the " +
      "business messaged them).",
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
      if (!/<ReportBusinessNote place="anywhere" className="mt-5 max-w-\[520px\]" \/>/.test(messages))
        detail.push("src/cockpit/pages/Messages.tsx: an applicant's Messages with no chat must offer Report a business you were in touch with (ReportBusinessNote)");
      if (!/\{applicant && <ReportBusinessNote place="anywhere" \/>\}/.test(code(await ctx.read("src/cockpit/pages/Help.tsx"))))
        detail.push("src/cockpit/pages/Help.tsx: an applicant's Contact us must offer Report a business you were in touch with (ReportBusinessNote)");
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
