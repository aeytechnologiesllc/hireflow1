/**
 * Phase 5 of docs/LAUNCH-PLAN.md, locked (2026-10-25): legal pages, consent,
 * and cost guardrails.
 *
 *   - ai-budget-enforced: every OpenAI call names the business it is for, so
 *     it is counted against that business's daily budget as well as the
 *     platform's (20261025160000_ai_business_budget.sql).
 *   - applicant-signup-shows-privacy-notice: an applicant is told where their
 *     information goes before they hand it over (sign-up and the form), and
 *     the business sign-up links the Privacy Policy as well as the Terms.
 *   - legal-pages-name-entity-and-contact: both pages name the company that
 *     runs the site and end with how to reach it: Contact us (an applicant's
 *     own Help thread) or Help (a hiring team), never Messages to the
 *     hiring business.
 *   - applicant-data-can-be-removed: a business can delete an applicant's
 *     information (the Terms ask it to act on such a request), only through
 *     the remove-applicant function, which names the actor from the sign-in.
 *   - named-papers-kept-until-the-application-goes: the Terms and the request
 *     screen never promise the business can delete a paper it named itself;
 *     once something is sent, only Delete their information (or a deleted
 *     account) removes it (the sixth product review).
 */

import { grantsToBrowser, latestDefinition, triggerProblems } from "./phase-7-launch-locks.mjs";

const ENTITY = "Southern Digital Technologies LLC";

/** Each call of `fn(` with its object argument, as text (balanced braces). */
function callsOf(text, fn) {
  const out = [];
  // Generic type arguments two levels deep (callOpenAIJson<Record<string, unknown>>({, the Phase 5 review).
  const re = new RegExp(`\\b${fn}(?:<(?:[^<>(]|<(?:[^<>(]|<[^<>(]*>)*>)*>)?\\(\\s*\\{`, "g");
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ at: text.slice(0, m.index).split("\n").length, body: text.slice(m.index, i + 1) });
  }
  return out;
}

export default [
  {
    id: "ai-budget-enforced",
    why:
      "Billing is off, so nothing stops one business from running up the AI bill but a budget. Every OpenAI call " +
      "takes from today's platform budget, and since 2026-10-25 from the business's own (ai_budget_take(p_calls, " +
      "p_business); app_settings ai_business_daily_call_cap). A call that does not say which business it is for " +
      "counts against nobody's own budget, so every callOpenAIChat / callOpenAIJson / streamOpenAIChatCompletion " +
      "call in an edge function passes `business` (a job's employer_id read by the server, or the asking account).",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of await walk("supabase/functions", [".ts"])) {
        if (rel === "supabase/functions/_shared/openai.ts") continue; // callOpenAIJson passes its options through
        const text = (await read(rel)) ?? "";
        for (const fn of ["callOpenAIChat", "callOpenAIJson", "streamOpenAIChatCompletion"]) {
          for (const call of callsOf(text, fn)) {
            if (!/\bbusiness\s*[:,]/.test(call.body)) detail.push(`${rel}:${call.at}: ${fn} does not say which business the call is for (business: ...)`);
            else if (/\bbusiness\s*:\s*(null|undefined)\b/.test(call.body)) detail.push(`${rel}:${call.at}: ${fn} names no business (business: null)`);
          }
        }
        // Every call made without the helpers, and every direct take from
        // the budget, names the business too.
        // Its arguments read with their own brackets (the units are an
        // expression since the second Phase 7 review: budgetUnitsFor(messages)).
        for (const m of text.matchAll(/\btakeDailyAiBudget\(/g)) {
          if (rel === "supabase/functions/_shared/aiBudget.ts") continue;
          const args = [];
          let depth = 0;
          let current = "";
          for (let i = m.index + m[0].length; i < text.length; i += 1) {
            const ch = text[i];
            if (ch === "(" || ch === "{" || ch === "[") depth += 1;
            if (ch === ")" || ch === "}" || ch === "]") {
              if (depth === 0) break;
              depth -= 1;
            }
            if (ch === "," && depth === 0) {
              args.push(current.trim());
              current = "";
            } else current += ch;
          }
          args.push(current.trim());
          if (args.length < 2 || !args[1] || /^(null|undefined)$/.test(args[1])) {
            detail.push(`${rel}:${text.slice(0, m.index).split("\n").length}: takeDailyAiBudget(${args.join(", ")}) does not say which business the call is for`);
          }
        }
        // Each OpenAI address in code (comments aside; a URL kept in a const
        // counts too, the third Phase 5 review) needs a take from the budget
        // that is not itself in a comment.
        const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
        const direct = (code.match(/api\.openai\.com/g) ?? []).length;
        const takes = (code.match(/\btakeDailyAiBudget\(/g) ?? []).length;
        if (direct > takes && rel !== "supabase/functions/_shared/openai.ts" && rel !== "supabase/functions/_shared/openaiStreaming.ts") {
          detail.push(`${rel}: ${direct} direct OpenAI requests but ${takes} takes from the daily budget`);
        }
      }
      const openai = (await read("supabase/functions/_shared/openai.ts")) ?? "";
      if (!/takeDailyAiBudget\((?:1|budgetUnitsFor\(messages\)|budgetUnitsForText\([^;]*?\)), business\)/.test(openai)) detail.push("_shared/openai.ts: callOpenAIChat no longer passes the business to the budget");
      const json = /export async function callOpenAIJson[\s\S]*?const \{ validator, fallback, throwWhenUnavailable = false, retries = 2, \.\.\.chatOptions \} = options;[\s\S]*?callOpenAIChat\(\{\s*\.\.\.chatOptions,/.test(openai);
      if (!json) detail.push("_shared/openai.ts: callOpenAIJson no longer passes its options (and the business) to callOpenAIChat");
      const streaming = (await read("supabase/functions/_shared/openaiStreaming.ts")) ?? "";
      if (!/takeDailyAiBudget\((?:1|budgetUnitsFor\(messages\)|budgetUnitsForText\([^;]*?\)), business\)/.test(streaming)) detail.push("_shared/openaiStreaming.ts: the streaming helper no longer passes the business to the budget");
      const flow = (await read("supabase/functions/generate-flow/index.ts")) ?? "";
      if (!/const business = await jobWritingBusiness\(user\.id\);/.test(flow) || !/takeDailyAiBudget\((?:1|budgetUnitsFor\(messages\)|budgetUnitsForText\([^;]*?\)), business\)/.test(flow)) detail.push("generate-flow: does not take from the asking business's budget (a hiring account's business, jobWritingBusiness)");
      for (const writer of ["ai-generate-job-content", "ai-generate-workflow"]) {
        const text = (await read(`supabase/functions/${writer}/index.ts`)) ?? "";
        if (!/const askedBy = await jobWritingBusiness\(signedIn\);/.test(text)) detail.push(`${writer}: job-writing AI is not limited to a hiring account (jobWritingBusiness)`);
      }
      const helper = (await read("supabase/functions/_shared/aiBudget.ts")) ?? "";
      if (!/p_business: business/.test(helper)) detail.push("_shared/aiBudget.ts: does not send the business to ai_budget_take");
      const migration = (await read("supabase/migrations/20261025160000_ai_business_budget.sql")) ?? "";
      if (!/create or replace function public\.ai_budget_take\(p_calls integer default 1, p_business uuid default null\)/.test(migration) || !/drop function if exists public\.ai_budget_take\(integer\);/.test(migration)) {
        detail.push("20261025160000_ai_business_budget.sql: the two-argument budget (and the old one dropped) is missing");
      }
      // The LATEST definition is the live one (the second Phase 5 review: the
      // guard read only the first): it still counts the business and refuses past its cap.
      // Its code, not its comments (the fifth, sixth and seventh reviews), read
      // in any case and with any dollar-quote tag (latestDefinition; the sixth
      // security review).
      const def = await latestDefinition({ read, walk }, "ai_budget_take");
      const latest = def?.statement ?? "";
      const latestFile = def?.rel ?? "supabase/migrations";
      // The business branch itself says no: the platform's own "return false"
      // further down used to satisfy this alone (the tenth Phase 5 review).
      const businessBranch = latest.slice(latest.search(/if v_business_calls > v_business_cap then/), latest.search(/select coalesce\(\(value #>> '\{\}'\)::integer, 10000\)/));
      if (!/insert into private\.ai_business_daily_usage/.test(latest) || !/v_business_calls > v_business_cap/.test(latest) || !/return false;\s*end if;\s*end if;\s*$/.test(businessBranch) || /return true/.test(businessBranch)) {
        detail.push(`${latestFile}: the live ai_budget_take no longer counts a business against its own cap`);
      }
      if (!/on conflict do nothing;\s*if found then/.test(businessBranch)) detail.push(`${latestFile}: ai_budget_take must card a business once a day, not on every refusal`);
      // A business that has not confirmed its email gets the smaller day (the third and fourth Phase 5 reviews).
      const code = latest.replace(/'(?:[^']|'')*'/g, (str) => (/^'(ai_new_business_daily_call_cap|published)'$/.test(str) ? str : "''"));
      if (
        !/if (?:not v_own\s+and\s+)?not public\.business_email_verified\(v_business\)\s+and not exists \(select 1 from public\.jobs j where j\.employer_id = v_business and j\.status = 'published'\)/.test(code) ||
        // HireFlow's own jobs skip the small day (Phase 7); v_own means a platform admin and nothing else.
        (/\bv_own\b/.test(code) && (code.match(/v_own :=/g) ?? []).length !== 1) ||
        (/\bv_own\b/.test(code) && !/v_own := exists \(select 1 from public\.platform_admins a where a\.user_id = v_business\);/.test(code)) ||
        !/where key = 'ai_new_business_daily_call_cap'\)/.test(code) ||
        !/v_business_cap := v_new_cap;/.test(code) ||
        // The smaller day only when smaller, never flipped; nothing or'd or and-ed away; HireFlow's own day still refused past its cap (the seventh review).
        !/and v_new_cap < v_business_cap then/.test(code) ||
        /\b(?:and\s*\(*\s*false|or\s*\(*\s*true)\b/i.test(code) ||
        /if v_own then\s+return true/i.test(code) ||
        /business_email_verified\(v_business\)\s+and\s+false/.test(code)
      ) {
        detail.push(`${latestFile}: the live ai_budget_take no longer gives an unconfirmed business the smaller day`);
      }
      // Nothing says yes before the counting, and nothing moves a cap or a
      // count after it is read (the sixth security review: an early
      // "return true;" and "v_business_cap := v_business_cap * 100000" passed).
      // The only yes is the last statement; the caps and counts are set only
      // as written, with defaults no larger than 300 / 2,000 / 6,000 / 10,000.
      const body = (def?.body ?? "").replace(/\s+/g, " ");
      if ((body.match(/\breturn\s+true\b/gi) ?? []).length !== 1 || !/\breturn true; end;?\s*$/i.test(body)) detail.push(`${latestFile}: ai_budget_take says yes somewhere other than its last statement`);
      const allowedSets = [
        /^v_take integer := greatest\(1, least\(coalesce\(p_calls, 1\), 100\)\)$/i,
        /^v_business_cap := coalesce\(\(select \(value #>> '\{\}'\)::integer from public\.app_settings where key = 'ai_platform_business_daily_call_cap'\), (\d+)\)$/i,
        /^v_business_cap := coalesce\(v_business_cap, (\d+)\)$/i,
        /^v_business_cap := v_new_cap$/i,
        /^v_cap := coalesce\(v_cap, (\d+)\)$/i,
      ];
      for (const m of body.matchAll(/\b(v_take|v_cap|v_calls|v_business_cap|v_business_calls)\b(?:\s+integer)?\s*:=\s*([^;]*)/gi)) {
        const set = m[0].trim();
        if (!allowedSets.some((re) => re.test(set))) detail.push(`${latestFile}: ai_budget_take sets ${m[1]} other than as written (${set.slice(0, 80)})`);
      }
      for (const [what, re, most] of [
        ["HireFlow's own day", /'ai_platform_business_daily_call_cap'\), (\d+)\)/i, 6000],
        ["a business's day", /v_business_cap := coalesce\(v_business_cap, (\d+)\)/i, 2000],
        ["a business's day (its setting)", /select coalesce\(\(value #>> '\{\}'\)::integer, (\d+)\) into v_business_cap/i, 2000],
        ["a new business's day", /'ai_new_business_daily_call_cap'\), (\d+)\)/i, 300],
        ["the platform's day", /v_cap := coalesce\(v_cap, (\d+)\)/i, 10000],
        ["the platform's day (its setting)", /select coalesce\(\(value #>> '\{\}'\)::integer, (\d+)\) into v_cap/i, 10000],
      ]) {
        const n = body.match(re);
        if (!n || Number(n[1]) > most) detail.push(`${latestFile}: ai_budget_take's default for ${what} is missing or above ${most}`);
      }
      if (!/values \(v_business, v_today, v_take\) on conflict \(business_id, day\) do update set calls = u\.calls \+ excluded\.calls, updated_at = now\(\) returning u\.calls into v_business_calls;/i.test(body) || !/values \(v_today, v_take\) on conflict \(day\) do update set calls = u\.calls \+ excluded\.calls, updated_at = now\(\) returning u\.calls into v_calls; if v_calls > v_cap then/i.test(body)) {
        detail.push(`${latestFile}: ai_budget_take no longer adds each call's units to the business's and the platform's day before comparing`);
      }
      // The server's only, however a grant is written.
      for (const rel of await grantsToBrowser({ read, walk }, "ai_budget_take")) detail.push(`${rel}: ai_budget_take granted to a browser role`);
      const latestText = ((await read(latestFile)) ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
      if (!/revoke all on function public\.ai_budget_take\(integer, uuid\) from public, anon, authenticated;/i.test(latestText)) detail.push(`${latestFile}: ai_budget_take must be revoked from public, anon and authenticated where it is made`);
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "applicant-signup-shows-privacy-notice",
    why:
      "An applicant is told where their information goes before they hand it over: the sign-up form links the " +
      "Terms and the Privacy Policy, and the application form says who sees it and links the Privacy Policy. The " +
      "business sign-up's agreement links both. (docs/LAUNCH-PLAN.md, Phase 5, task 2.)",
    run: async ({ read }) => {
      const detail = [];
      const candidate = (await read("src/pages/CandidateAuth.tsx")) ?? "";
      const notice = /data-signup-privacy>([\s\S]*?)<\/p>/.exec(candidate)?.[1] ?? "";
      if (!/href="\/terms"/.test(notice) || !/href="\/privacy"/.test(notice)) detail.push("CandidateAuth.tsx: the sign-up form no longer links the Terms and the Privacy Policy under Create Account");
      const form = (await read("src/pages/ApplicationFormPhase.tsx")) ?? "";
      const formNotice = /data-application-privacy>([\s\S]*?)<\/p>/.exec(form)?.[1] ?? "";
      if (!/href="\/privacy"/.test(formNotice) || !/hiring team for this job (?:sees it|can read them)/.test(formNotice)) detail.push("ApplicationFormPhase.tsx: the application form no longer says who sees it and links the Privacy Policy");
      const business = (await read("src/pages/Auth.tsx")) ?? "";
      const agree = /data-signup-agree>([\s\S]*?)<\/label>/.exec(business)?.[1] ?? "";
      if (!/hireflownow\.com\/terms/.test(agree) || !/hireflownow\.com\/privacy/.test(agree)) detail.push("Auth.tsx: the business sign-up's agreement must link the Terms and the Privacy Policy");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "legal-pages-name-entity-and-contact",
    why:
      `A privacy policy names who is responsible and how to reach them. Both pages name ${ENTITY} (the owner, ` +
      "2026-10-24) in their opening and end with how to reach us. The contact email and the governing-law state " +
      "are owner inputs still to come (docs/LEGAL-PAGES.md); this guard will require them once given.",
    run: async ({ read }) => {
      const detail = [];
      const legal = (await read("src/content/legal.ts")) ?? "";
      for (const doc of ["PRIVACY_POLICY", "TERMS"]) {
        const start = legal.indexOf(`export const ${doc}: LegalDocument = {`);
        const block = start >= 0 ? legal.slice(start, legal.indexOf("\n};", start)) : "";
        const intro = /intro: \[([\s\S]*?)\],\n  sections:/.exec(block)?.[1] ?? "";
        if (!intro.includes(ENTITY)) detail.push(`legal.ts: ${doc} does not name ${ENTITY} in its opening`);
        if (!/id: "contact",\s*title: "How to reach us",/.test(block)) detail.push(`legal.ts: ${doc} no longer ends with "How to reach us"`);
        // The company, not the hiring business (the Phase 5 review).
        const contact = block.slice(block.indexOf('id: "contact"'));
        if (!/chooses Contact us; a hiring team opens Help/.test(contact)) detail.push(`legal.ts: ${doc}'s "How to reach us" no longer names Contact us (an applicant) and Help (a hiring team)`);
        if (/write to the hiring team|message us in your account/i.test(block)) detail.push(`legal.ts: ${doc} sends people to Messages to reach us; Messages reach the business, not the company`);
      }
      const help = (await read("src/cockpit/pages/Help.tsx")) ?? "";
      const header = (await read("src/components/AppHeader.tsx")) ?? "";
      const layout = (await read("src/components/AppLayout.tsx")) ?? "";
      if (!/if \(role === "candidate"\) return user!\.id;/.test(help)) detail.push("Help.tsx: an applicant no longer has a thread of their own (Contact us)");
      if (!/role === "candidate" && \([\s\S]{0,120}navigate\("\/contact"\)[\s\S]{0,120}Contact us/.test(header)) detail.push("AppHeader.tsx: the applicant's account menu no longer has Contact us (/contact)");
      if (!/"\/contact",\n\];/.test(layout)) detail.push("AppLayout.tsx: an applicant can no longer open /contact");
      const app = (await read("src/App.tsx")) ?? "";
      const hosts = (await read("src/lib/hosts.ts")) ?? "";
      if (!/<Route path="\/contact" element=\{<HelpPage \/>\} \/>/.test(app)) detail.push("App.tsx: /contact no longer shows Contact us");
      if (/\\\/contact/.test(/const STAFF_ONLY = \[([\s\S]*?)\];/.exec(hosts)?.[1] ?? "")) detail.push("src/lib/hosts.ts: /contact must not be staff-only (an applicant has no session on the staff host)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "applicant-data-can-be-removed",
    why:
      "The Terms ask every business to act on an applicant's request to delete their information. 'Delete their " +
      "information' on the applicant's ⋯ menu calls remove-applicant, which takes the actor from the caller's " +
      "sign-in and lets public.remove_applicant (service role only) decide (owner, or a teammate who manages " +
      "applicants), log it and delete the application before any file goes.",
    run: async ({ read, walk }) => {
      const detail = [];
      // The latest migration that defines remove_applicant, not the first (the
      // seventh review: a later redefinition without the checks passed).
      // Comments stripped first: a rule kept only in a comment is no rule (the
      // eighth review: a later remove_applicant without the owner check, the
      // check mentioned in a comment, passed).
      // Its own body, read in any case and with any dollar-quote tag
      // (latestDefinition; the sixth security review), and its file.
      const noComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
      const removal = await latestDefinition({ read, walk }, "remove_applicant");
      const removalBody = (removal?.body ?? "").replace(/\s+/g, " ");
      const sql = removal ? noComments((await read(removal.rel)) ?? "") : "";
      if (!/grant execute on function public\.remove_applicant\(uuid, uuid, text\) to service_role;/.test(sql) || !/revoke all on function public\.remove_applicant\(uuid, uuid, text\) from public, anon, authenticated;/.test(sql)) {
        detail.push("remove_applicant must be callable by the system only (it trusts the actor it is given)");
      }
      if (!/tm\.can_manage_pipeline is true/.test(removalBody) || !/if not \( p_actor = v_app\.employer_id or exists \(/.test(removalBody) || !/then return jsonb_build_object\('ok', false, 'reason', 'not_allowed'\); end if;/.test(removalBody)) detail.push("remove_applicant no longer limits it to the owner and teammates who manage applicants");
      // A check written but switched off ("… or true") is no check, and no later
      // migration may hand the function to a browser (the ninth review), with or
      // without "public." or as ON ROUTINE (the sixth security review).
      if (/\bor\s*\(*\s*true\b|\bor\s*\(*\s*1\s*=\s*1\b|\bif\s+false\b|\bfalse\s+and\b/i.test(removalBody)) detail.push("remove_applicant's checks are switched off (\"or true\", \"false and\")");
      for (const rel of await grantsToBrowser({ read, walk }, "remove_applicant")) detail.push(`${rel}: remove_applicant granted to a browser role`);
      if (!/insert into private\.applicant_removals/.test(removalBody)) detail.push("remove_applicant no longer logs the removal");
      // A deleted application (a withdrawal, Delete Account, a job deleted) queues
      // its recordings, video introduction and work samples, always, with the
      // function's own rights: an applicant's own delete cannot write the queue
      // (the tenth Phase 5 review: nothing held this, and it ran only for rows
      // that named a recording).
      // Read as Postgres reads it (the sixth security review: WHEN (false), FOR
      // EACH STATEMENT, ENABLE REPLICA, ALTER FUNCTION … SECURITY INVOKER, a
      // trigger moved to another table, a body returning before its insert or
      // inserting "select … where false" all passed): the latest trigger is
      // AFTER DELETE ON public.applications FOR EACH ROW and in force, the
      // latest function runs with its own rights and inserts the three folders
      // as its first statement.
      detail.push(...(await triggerProblems({ read, walk }, { name: "applications_queue_voice_recordings", table: "applications", timing: "AFTER", event: "DELETE", fn: "applications_queue_voice_recordings" })));
      const queueDef = await latestDefinition({ read, walk }, "applications_queue_voice_recordings");
      const queue = (queueDef?.body ?? "").replace(/\s+/g, " ");
      if (!queueDef?.securityDefiner) detail.push(`${queueDef?.alteredIn ?? queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must run with its own rights (an applicant's own delete cannot write storage_file_trash)`);
      const tuples = [["voice-interview-recordings", "old\\.id::text", "''"], ["videos", "old\\.candidate_id::text", "old\\.id::text \\|\\| '-'"], ["portfolios", "old\\.candidate_id::text", "old\\.id::text \\|\\| '-'"]].map(([bucket, folder, prefix]) => `\\('${bucket}', ${folder}, ${prefix}, old\\.id\\)`);
      if (!new RegExp(`^\\s*begin begin insert into public\\.storage_file_trash \\(bucket, folder, starts_with, application_id\\) values ${tuples.join(", ")}; exception when others then raise log [^;]*; end; return old; end;?\\s*$`, "i").test(queue)) {
        detail.push(`${queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must queue the recordings, videos and portfolios folders of every deleted application, first thing, as written`);
      }
      const fn = (await read("supabase/functions/remove-applicant/index.ts")) ?? "";
      if (!/p_actor: caller\.userId/.test(fn) || !/requireSignedInUser\(req, corsHeaders\)/.test(fn)) detail.push("remove-applicant: the actor must come from the caller's sign-in");
      const menu = (await read("src/cockpit/components/ApplicantRowMenu.tsx")) ?? "";
      if (!/key: "delete", label: "Delete their information"/.test(menu)) detail.push("ApplicantRowMenu.tsx: 'Delete their information' is gone from the ⋯ menu");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "named-papers-kept-until-the-application-goes",
    why:
      "A paper the business names itself (\"Something else\") is not deleted after opening, and once anything is " +
      "sent its request cannot be deleted on its own (\"Employers can delete document requests\" allows it only " +
      "while it holds no file and no typed answer). The Terms and the request screen said it was \"kept until you " +
      "delete it\", a control that does not exist (the sixth product review). They say it is kept until the " +
      "application is deleted (Delete their information) or the account is.",
    run: async ({ read, walk }) => {
      const detail = [];
      // Comments out first: a sentence kept only in a comment shows no one anything.
      const noComments = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const rel of await walk("src", [".ts", ".tsx"])) {
        if (rel.startsWith("src/dev-preview/")) continue;
        const text = noComments((await read(rel)) ?? "");
        if (/kept until you delete|until you delete it\b|kept until it, the application/i.test(text)) detail.push(`${rel}: promises the business can delete a paper it named (\"until you delete it\"); say it is kept until the application or the account is deleted`);
      }
      const legal = noComments((await read("src/content/legal.ts")) ?? "");
      if (!/A paper you name yourself \(under \\"Something else\\"\) is kept, even if it is an ID, until the application is deleted \(Delete their information, in the applicant's ⋯ menu\) or the applicant's account is\./.test(legal)) detail.push("legal.ts: the Terms no longer say a named paper is kept until the application (Delete their information) or the account is deleted");
      if (!/Any other paper the team asks for by its own name is kept until the application or your account is deleted\./.test(legal)) detail.push("legal.ts: the Privacy Policy no longer says a named paper is kept until the application or the account is deleted");
      const dialog = noComments((await read("src/cockpit/components/RequestDocumentsDialog.tsx")) ?? "");
      if ((dialog.match(/is kept until their application is deleted \(⋯ → Delete their information\) or their account is\./g) ?? []).length !== 2) detail.push("RequestDocumentsDialog.tsx: the ID warning and the privacy note must both say a named paper is kept until their application (⋯ → Delete their information) or their account is deleted");
      // If a delete for a sent paper is ever added, these words change with it.
      let policy = "";
      for (const rel of (await walk("supabase/migrations", [".sql"])).sort()) {
        const text = (await read(rel)) ?? "";
        const at = text.search(/create policy "Employers can delete document requests"/i);
        if (at >= 0) policy = text.slice(at, text.indexOf(";", at));
      }
      if (!/file_url is null/i.test(policy) || !/answer_text is null/i.test(policy)) detail.push("supabase/migrations: a sent request can now be deleted; change the Terms and the request screen to say so (they say only the application's deletion removes a named paper)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
