/**
 * The eighteenth Phase 5 review and the seventeenth security review
 * (2026-10-27), locked.
 *
 * What reaches an applicant about a job they applied to names the job and
 * the business as they were when they applied (the application's own
 * applied_job_title and applied_company_name, set by the database and kept
 * from every browser: 20261025700000), never as they are now. A business can
 * close a job and rename it, or rename itself, to a fee ask, and nothing
 * records that as contact. Round 17 did this for the decline and the
 * server's cards; this round finishes it:
 *
 *   - applicant-emails-name-the-job-as-applied: "Application received" and
 *     "Email me the link", the applicant's own emails, sent from the business
 *     by name (the Phase 5 review's finding 1, probes pq_submit_closed,
 *     pr_received and pr_continue: "Application Submitted: Chat support
 *     agent. To finish, pay the 500 PHP processing fee by GCash ...", and a
 *     902-character ask in the link email).
 *   - applicant-pages-name-the-job-as-applied: Your applications and the
 *     application page the decline's link opens (the security review's
 *     finding 1, probe s5: the renamed title as the page's heading, the
 *     renamed business under it).
 *   - decline-card-says-team-once: "The Zulu Support Team team has made a
 *     decision ..." (the Phase 5 review's finding 3).
 *
 * Widened by the nineteenth Phase 5 review and the eighteenth security
 * review (2026-10-27): applicant-pages-name-the-job-as-applied also holds
 *   - the two pages' location and type (since the twentieth Phase 5 review
 *     the application's own applied_location and applied_job_type, through
 *     appliedNames; the security review's s1_residual) and steps' titles (the
 *     job's own, which no browser can change once anyone has applied:
 *     jobs_applicant_words_fixed);
 *   - the applicant's Messages page (src/hooks/useMessages.ts: each business
 *     and role from their own application; the Phase 5 review's finding 1,
 *     probe p2_messages);
 *   - the Improvement Report, a turned-down card's one action: its heading
 *     and PDF name the job as they applied, and the job's own words go into
 *     its prompt only while the job is on its public page
 *     (ai-generate-performance-report, _shared/performanceReportJob.ts,
 *     src/hooks/useImprovementBlueprint.ts).
 * The step pages have their own guard, step-pages-name-the-job-as-applied
 * (applicant-words-stay-as-applied.mjs).
 *
 * Proved by behaviour too: scripts/notification_access.test.mjs (section 4),
 * scripts/continue_link_email.test.mjs (section 4) and
 * launch_locks_behaviour section 27.
 */

import { latestDefinition } from "./phase-7-launch-locks.mjs";

/** Code without comments (JSX ones too), spaces collapsed. */
const code = (text) =>
  (text ?? "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s+/g, " ");
const plain = (text) => (text ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");

export default [
  {
    id: "applicant-emails-name-the-job-as-applied",
    why:
      "An applicant's own emails (\"Application received\", \"Email me the link\") come from the business by name and are " +
      "no contact, and they named the job's title and the business's name as they are now: a closed job renamed \"Chat " +
      "support agent. To finish, pay the 500 PHP processing fee by GCash ...\" reached every applicant who sent the form " +
      "(the eighteenth Phase 5 review, finding 1). They name the job and the business as they were when they applied.",
    run: async ({ read }) => {
      const detail = [];
      const access = code(await read("supabase/functions/_shared/notificationAccess.ts"));
      const selfAt = access.indexOf('if (rule.who === "self") {');
      const self = selfAt >= 0 ? access.slice(selfAt, access.indexOf("if (!named) return", selfAt)) : "";
      if (
        !self.includes("job_title: plainLine(about.applied_job_title, 200),") ||
        !self.includes("company_name: plainLine(about.applied_company_name, 120),") ||
        // The request's title only picks which of their applications it is.
        /\.job_title\b|profileOf\(|jobTitleFor\(/.test(self.replace(/plainLine\(asked\.job_title, 200\)/g, ""))
      )
        detail.push(
          "supabase/functions/_shared/notificationAccess.ts: \"application received\" must name the application's applied_job_title and applied_company_name (cut to 200 and 120), never the job's title or the business's name today",
        );
      const link = code(await read("supabase/functions/_shared/continueOnComputerEmail.ts"));
      const decideAt = link.indexOf("export async function decideContinueLinkEmail(");
      const decide = decideAt >= 0 ? link.slice(decideAt) : "";
      if (
        !decide.includes("const jobTitle = line(application!.applied_job_title, 200);") ||
        !decide.includes("const companyName = line(application!.applied_company_name, 120);") ||
        /application!\.job_title|lookups\.companyName|employer_id/.test(decide) ||
        /companyName: \(employerId/.test(link)
      )
        detail.push(
          "supabase/functions/_shared/continueOnComputerEmail.ts: \"Email me the link\" must name the application's applied_job_title and applied_company_name (cut to 200 and 120), and look up neither the job's title nor the business's name",
        );
      const fn = code(await read("supabase/functions/send-notification-email/index.ts"));
      const gateAt = fn.indexOf("if (type === CONTINUE_ON_COMPUTER_TYPE) {");
      const gate = gateAt >= 0 ? fn.slice(gateAt, fn.indexOf("if (type !== CONTINUE_ON_COMPUTER_TYPE) {", gateAt)) : "";
      if (!gate.includes('.select("id, candidate_id, status, applied_job_title, applied_company_name")') || /jobs\(title|select\("company_name"\)/.test(gate))
        detail.push("supabase/functions/send-notification-email/index.ts: \"Email me the link\" must read the application's applied_job_title and applied_company_name, never the job's title or the profile's company_name");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "applicant-pages-name-the-job-as-applied",
    why:
      "The decline's link opens the applicant's application page, and it and the applications list showed the job's " +
      "title and the business's name as they are now: renamed after the decline to \"Chat support agent (reconsideration: " +
      "send 500 PHP to GCash ...)\" and \"Fee Clinic: pay 500 PHP ...\", as the page's heading (the seventeenth security " +
      "review, finding 1, probe s5). Both pages name the job and the business as they were when they applied.",
    run: async ({ read }) => {
      const detail = [];
      for (const rel of ["src/pages/CandidateApplicationDetail.tsx", "src/pages/Applications.tsx"]) {
        const page = code(await read(rel));
        if (!page) {
          detail.push(`${rel}: missing`);
          continue;
        }
        if (/\bjobs?\s*\??\.\s*title\b/.test(page)) detail.push(`${rel}: reads the job's title today (job.title / jobs?.title); name the application's applied_job_title through appliedNames`);
        if (/employer_public_branding|\bcompany_name\b/.test(page)) detail.push(`${rel}: reads the business's name today (employer_public_branding / company_name); name the application's applied_company_name through appliedNames`);
        if (!/import \{ appliedNames \} from "@\/lib\/appliedNames";/.test(page) || !/appliedNames\(/.test(page.replace(/import \{ appliedNames \}/, "")))
          detail.push(`${rel}: must name the job and the business through appliedNames (src/lib/appliedNames.ts)`);
      }
      const names = code(await read("src/lib/appliedNames.ts"));
      if (!names.includes("jobTitle: plain(application?.applied_job_title),") || !names.includes("companyName: plain(application?.applied_company_name),") || /\bjobs\b|(?<!applied_)company_name/.test(names))
        detail.push("src/lib/appliedNames.ts: must give the application's applied_job_title and applied_company_name, and nothing else");
      // Both pages read the whole application row, so the two columns come with it.
      const hook = code(await read("src/hooks/useApplications.ts"));
      const candidateAt = hook.indexOf("export function useCandidateApplications(");
      if (!/\.from\("applications"\) \.select\("\*, jobs\(\*\)"\) \.eq\("candidate_id", user!\.id\)/.test(hook.slice(candidateAt, candidateAt + 600)))
        detail.push("src/hooks/useApplications.ts: the applicant's list must read the whole application row (applied_job_title and applied_company_name with it)");
      if (!/\.from\("applications"\) \.select\("\*, jobs\(\*\)"\) \.eq\("id", id!\)/.test(code(await read("src/pages/CandidateApplicationDetail.tsx"))))
        detail.push("src/pages/CandidateApplicationDetail.tsx: the application page must read the whole application row (applied_job_title and applied_company_name with it)");
      // The job's location and type as they were when they applied (the
      // application's own applied_location and applied_job_type, since the
      // twentieth Phase 5 review), never the job's today: a closed job's
      // location can say anything (the eighteenth security review's
      // s1_residual). Its steps are the job's own: no browser can change a
      // word of them once anyone has applied (jobs_applicant_words_fixed).
      for (const rel of ["src/pages/CandidateApplicationDetail.tsx", "src/pages/Applications.tsx"]) {
        const page = code(await read(rel));
        if (/\bjobs?\s*\??\.\s*(location|job_type)\b/.test(page))
          detail.push(`${rel}: shows the job's location or type today; show the application's own (appliedNames(application).location / .jobType)`);
        if (/liveJobWords|liveJobText/.test(page)) detail.push(`${rel}: still reads src/lib/liveJobText.ts (gone since the twentieth Phase 5 review)`);
        if (!/\{words\.location && \(/.test(page) || !/\{words\.jobType && \(/.test(page)) detail.push(`${rel}: must show the location and type the application kept (words = appliedNames(application))`);
      }
      if (!/const words = named;/.test(code(await read("src/pages/CandidateApplicationDetail.tsx"))) || !/const named = appliedNames\(application\);/.test(code(await read("src/pages/CandidateApplicationDetail.tsx"))))
        detail.push("src/pages/CandidateApplicationDetail.tsx: the location and type must be the application's own (named = appliedNames(application))");
      if (!/const words = appliedNames\(application\); const \{ jobTitle, companyName \} = words;/.test(code(await read("src/pages/Applications.tsx"))))
        detail.push("src/pages/Applications.tsx: the card's location and type must be the application's own (appliedNames(application))");
      const live = await read("src/lib/liveJobText.ts").catch(() => null);
      if (live) detail.push("src/lib/liveJobText.ts: is back; the overview pages show the application's own location and type (appliedNames)");
      // Messages: each business and role from the applicant's own application.
      const messages = code(await read("src/hooks/useMessages.ts"));
      const employersAt = messages.indexOf("export function useMessageableEmployers(");
      const employers = employersAt >= 0 ? messages.slice(employersAt, messages.indexOf("export function useMessageableCandidates(", employersAt)) : "";
      if (
        !employers ||
        !/\.from\("applications"\) \.select\("id, job_id, created_at, applied_job_title, applied_company_name, jobs\(employer_id\)"\) \.eq\("candidate_id", user!\.id\) \.order\("created_at", \{ ascending: false \}\)/.test(employers) ||
        !/const named = appliedNames\(app\);/.test(employers) ||
        !/company_name: named\.companyName,/.test(employers) ||
        !/job_title: named\.jobTitle \?\? "Your application",/.test(employers) ||
        /employer_public_branding|jobs\(title|\.title\b/.test(employers)
      )
        detail.push("src/hooks/useMessages.ts: the applicant's Messages must name each business and role from their own (newest) application to it (applied_company_name, applied_job_title through appliedNames), never employer_public_branding or the job's title today");
      // The Improvement Report.
      const reportFn = code(await read("supabase/functions/ai-generate-performance-report/index.ts"));
      if (
        !reportFn.includes("jobTitle: reportJobTitle(application.applied_job_title),") ||
        !reportFn.includes("- Position: ${reportJobTitle(application.applied_job_title, 'Unknown')}") ||
        !reportFn.includes("const jobSection = reportJobSection(jobData);") ||
        /jobData\??\.(title|description|requirements|skills_required)\b/.test(reportFn) ||
        !/jobs \( description, requirements, skills_required, workflow_steps, passing_score, status, exclude_from_feed, application_deadline \)/.test(reportFn)
      )
        detail.push("supabase/functions/ai-generate-performance-report/index.ts: the report must name the job as they applied (reportJobTitle(applied_job_title)) and take the job's own words only through reportJobSection");
      const reportJob = code(await read("supabase/functions/_shared/performanceReportJob.ts"));
      if (
        !/const shown = jobOnItsPublicPage\(job, now\);/.test(reportJob) ||
        !/if \(shown && job\.description\)/.test(reportJob) ||
        !/if \(shown && job\.requirements\)/.test(reportJob) ||
        !/if \(shown && Array\.isArray\(job\.skills_required\) && job\.skills_required\.length\)/.test(reportJob) ||
        !/\.filter\(\(name: unknown\) => shown \|\| \(typeof name === "string" && KNOWN_STEP_KINDS\.has\(name\)\)\)/.test(reportJob)
      )
        detail.push("supabase/functions/_shared/performanceReportJob.ts: the job's description, requirements and skills go into the report only while the job is on its public page, and its steps only by the kinds HireFlow knows otherwise");
      const blueprint = code(await read("src/hooks/useImprovementBlueprint.ts"));
      if ((blueprint.match(/namedAsApplied\(/g) ?? []).length < 3 || !/\.select\("notes, applied_job_title"\)/.test(blueprint))
        detail.push("src/hooks/useImprovementBlueprint.ts: a report, kept or new, must name the job as they applied (namedAsApplied)");
      const types = (await read("src/integrations/supabase/types.ts")) ?? "";
      const row = types.slice(types.indexOf("      applications: {\n        Row: {"), types.indexOf("        Insert: {", types.indexOf("      applications: {\n        Row: {")));
      if (!/applied_company_name: string \| null/.test(row) || !/applied_job_title: string \| null/.test(row))
        detail.push("src/integrations/supabase/types.ts: applications' Row must carry applied_job_title and applied_company_name");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "decline-card-says-team-once",
    why:
      "The server's decline card read \"The Zulu Support Team team has made a decision on your application ...\" (61 of " +
      "63 live; the eighteenth Phase 5 review, finding 3). A name that already ends in the word \"team\" gets no second " +
      "one, as the decline email has long done.",
    run: async (ctx) => {
      const detail = [];
      const def = await latestDefinition(ctx, "notify_application_status_change");
      const body = plain(def?.body);
      if (
        !/team_label := CASE WHEN NULLIF\(TRIM\(company_name\), ''\) IS NULL THEN 'The hiring team' WHEN TRIM\(company_name\) ~\* '\\yteam\$' THEN 'The ' \|\| TRIM\(company_name\) ELSE 'The ' \|\| TRIM\(company_name\) \|\| ' team' END;/.test(body)
      )
        detail.push(`${def?.rel ?? "supabase/migrations"}: notify_application_status_change must say "team" once ("The Zulu Support Team", never "The Zulu Support Team team"), as the decline email does`);
      return { ok: detail.length === 0, detail };
    },
  },
];
