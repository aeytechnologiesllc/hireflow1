/**
 * Phase 5 of docs/LAUNCH-PLAN.md, locked (2026-10-25): legal pages, consent,
 * and cost guardrails.
 *
 *   - ai-budget-enforced: every OpenAI call names the business it is for, so
 *     it is counted against that business's daily budget as well as the
 *     platform's (20261025160000_ai_business_budget.sql).
 *   - applicant-signup-shows-privacy-notice: an applicant is told where their
 *     information goes before they hand it over (sign-up and the form), and
 *     the business and team-member sign-ups link the Privacy Policy as well
 *     as the Terms.
 *   - legal-pages-name-entity-and-contact: both pages name the company that
 *     runs the site and end with how to reach it: Contact us (an applicant's
 *     own Help thread) or Help (a hiring team), never Messages to the
 *     hiring business.
 *   - applicant-data-can-be-removed: a business can delete an applicant's
 *     information (the Terms ask it to act on such a request), only through
 *     the remove-applicant function, which names the actor from the sign-in
 *     (no browser delete rule but the applicant's own withdrawal); a deleted
 *     application queues the files storage holds for it, and one account
 *     starts at most 20 applications an hour (the eleventh Phase 5 review),
 *     10 with one business on any of its jobs, and queues at most 200 exact
 *     paths a day (the eighth security review).
 *   - file-queue-fair-and-bounded: document-cleanup takes the removal queue
 *     fairly (storage_file_trash_fair_pick: a few from each person a run, a
 *     note that failed behind every note that is due until its back-off ends,
 *     each person's oldest note, people in turn by when the pick last took
 *     them, which it records itself, then the people with the fewest waiting
 *     first) and clears exact paths in bulk, so one account's uploads hold up
 *     only itself (the eighth security review), many accounts hold up nobody
 *     for good, and a note that is not a plain path is dropped, not retried
 *     every hour (the ninth); a burst by many accounts delays a later removal
 *     by about a run for every 200 of them, not for as long as their notes
 *     last, and a record is pruned only once its person holds nothing (the
 *     tenth).
 *   - applications-stay-on-their-job: nobody but the server changes an
 *     application's job (moving it to a throwaway job and deleting that was
 *     a way round Delete their information), and a deleted document's kept
 *     copies are queued for removal however the row goes (the eighth
 *     security review).
 *   - named-papers-kept-until-the-application-goes: the Terms and the request
 *     screen never promise the business can delete a paper it named itself;
 *     once something is sent, only Delete their information (or a deleted
 *     account) removes it (the sixth product review).
 */

import { grantsToBrowser, latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

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
      "business sign-up's agreement links both, and so does the team-member sign-up's (the eleventh Phase 5 " +
      "review). (docs/LAUNCH-PLAN.md, Phase 5, task 2.)",
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
      // The team-member sign-up too (the eleventh Phase 5 review: "Create
      // Account & Join Team" made an account without either): the same
      // agreement, and no account until it is ticked.
      const team = (await read("src/pages/JoinTeam.tsx")) ?? "";
      const teamAgree = /data-signup-agree>([\s\S]*?)<\/label>/.exec(team)?.[1] ?? "";
      const teamSignUp = /const handleSignUp = async[\s\S]*?\n  };/.exec(team)?.[0] ?? "";
      if (!/hireflownow\.com\/terms/.test(teamAgree) || !/hireflownow\.com\/privacy/.test(teamAgree)) detail.push("JoinTeam.tsx: the team-member sign-up must link the Terms and the Privacy Policy");
      if (!/if \(!agreed\) \{[\s\S]*?return;\s*\}[\s\S]*signUp\(email, password, fullName, "team_member"\)/.test(teamSignUp) || !/disabled=\{isSubmitting \|\| !agreed\}/.test(team)) detail.push("JoinTeam.tsx: the team-member account is made only once the agreement is ticked");
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
      "applicants), log it and delete the application before any file goes. No browser may delete an application " +
      "but the applicant withdrawing their own, and a deleted application queues the files storage holds for it " +
      "(the eleventh Phase 5 review).",
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
      // Since the eleventh Phase 5 review each folder is queued where storage
      // holds a file there, and whenever the database cannot look
      // (private.storage_holds answers NULL, read as "queue it"): an unsent
      // form queued three empty rows, and one account looping "start,
      // withdraw" buried every real removal behind them.
      const tuples = [["voice-interview-recordings", "old\\.id::text", "''"], ["videos", "old\\.candidate_id::text", "old\\.id::text \\|\\| '-'"], ["portfolios", "old\\.candidate_id::text", "old\\.id::text \\|\\| '-'"]].map(([bucket, folder, prefix]) => `\\('${bucket}', ${folder}, ${prefix}\\)`);
      // Each row names its applicant (candidate_id), for document-cleanup's
      // fair pick (the eighth security review).
      if (!new RegExp(`^\\s*declare [^$]*? begin begin insert into public\\.storage_file_trash \\(bucket, folder, starts_with, application_id, candidate_id\\) select t\\.bucket, t\\.folder, t\\.starts_with, old\\.id, old\\.candidate_id from \\(values ${tuples.join(", ")} \\) as t \\(bucket, folder, starts_with\\) where t\\.folder is not null and coalesce\\(private\\.storage_holds\\(t\\.bucket, t\\.folder \\|\\| '/' \\|\\| t\\.starts_with\\), true\\); exception when others then raise log [^;]*; end; `, "i").test(queue)) {
        detail.push(`${queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must queue the recordings, videos and portfolios folders of a deleted application where storage holds a file (or cannot say), first thing, each naming its applicant, as written`);
      }
      // …and the files sent with its form (the eleventh review, finding 4), at
      // most 40 a deleted application and 200 a day for one applicant (the
      // eighth security review: one account's uploads queued 800 an hour),
      // each only where storage holds a file of exactly that name (the ninth
      // security review: checked as a prefix, "<uid>/." was there because
      // "<uid>/.x" was).
      if (!/continue when not coalesce\(private\.storage_holds\('resumes', v_path, p_exact => true\), true\); exit when not coalesce\(\(public\.check_rate_limit\('file-queue-paths', old\.candidate_id::text, 200, 86400\) ->> 'allowed'\)::boolean, true\); insert into public\.storage_file_trash \(bucket, path, application_id, candidate_id\) values \('resumes', v_path, old\.id, old\.candidate_id\); end loop;/.test(queue) || !/ return old; end;?\s*$/.test(queue)) {
        detail.push(`${queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must queue the resume and the form's files a deleted application lists, at most 200 a day for one applicant (check_rate_limit 'file-queue-paths', 200, 86400)`);
      }
      if (!/foreach v_path in array v_paths\[1:40\] loop/.test(queue)) detail.push(`${queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must queue at most 40 files a deleted application (v_paths[1:40])`);
      // A plain path as isPlainObjectPath reads one, which document-cleanup
      // holds every note to: no "." part either (the ninth security review: a
      // thousand accounts' "<uid>/." notes were refused every hour, for good).
      if (!queue.includes("and listed.p not like '%..%' and listed.p !~ '(^|/)\\.(/|$)' and listed.p not like '%//%' and right(listed.p, 1) <> '/';")) {
        detail.push(`${queueDef?.rel ?? "supabase/migrations"}: applications_queue_voice_recordings must queue only plain paths: no "..", "." part, "//" or trailing "/"`);
      }
      const holds = await latestDefinition({ read, walk }, String.raw`"?private"?\s*\.\s*"?storage_holds`);
      const holdsBody = (holds?.body ?? "").replace(/\s+/g, " ");
      if (!holds?.securityDefiner || !/r\.rolsuper or r\.rolbypassrls\)\) then return null; end if;/.test(holdsBody) || !/exception when others then return null; end;?\s*$/.test(holdsBody)) {
        detail.push(`${holds?.rel ?? "supabase/migrations"}: private.storage_holds must run with its own rights and answer NULL (\"cannot say\") whenever it cannot read storage, so the queue never skips a file it could not see`);
      }
      if (!/\(\s*p_bucket text, p_prefix text, p_exact boolean default false\s*\)/i.test(holds?.header ?? "") || !holdsBody.includes("if coalesce(p_exact, false) then return exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_prefix); end if;")) {
        detail.push(`${holds?.rel ?? "supabase/migrations"}: private.storage_holds must check an exact path (p_exact) by its exact name, not as a prefix`);
      }
      // One account starts at most 10 applications an hour with one business
      // and 20 in all (the eleventh review: nothing limited it).
      detail.push(...(await triggerProblems({ read, walk }, { name: "applications_start_limit", table: "applications", timing: "BEFORE", event: "INSERT", fn: "applications_start_limit" })));
      const startLimit = ((await latestDefinition({ read, walk }, "applications_start_limit"))?.body ?? "").replace(/\s+/g, " ");
      const allowance = ((await latestDefinition({ read, walk }, "client_send_allowed"))?.body ?? "").replace(/\s+/g, " ");
      if (!/IF NOT public\.client_send_allowed\('application', coalesce\(business, NEW\.job_id\)\) THEN RAISE EXCEPTION 'too_many_applications'/i.test(startLimit) || !/ELSIF p_kind = 'application' THEN pair_limit := 10; total_limit := 20;/i.test(allowance)) {
        detail.push("supabase/migrations: a browser must start at most 10 applications an hour with one business and 20 in all (applications_start_limit, client_send_allowed 'application')");
      }
      // The business is read where an applicant may read it (the eighth
      // security review: from the jobs row, hidden from an applicant before
      // they apply, it was always NULL and the limit was per job).
      if (!/SELECT p\.employer_id INTO business FROM public\.published_jobs_public p WHERE p\.id = NEW\.job_id;/i.test(startLimit)) {
        detail.push("supabase/migrations: applications_start_limit must read the job's business from published_jobs_public (an applicant cannot read the jobs row before applying, so the limit became one per job)");
      }
      // A business deletes an application only through remove_applicant (the
      // eleventh review, finding 3): the only DELETE rule left on applications
      // is the applicant's own withdrawal.
      const deleteRules = new Map();
      for (const { rel, sql } of await migrationTexts({ read, walk })) {
        for (const m of sql.matchAll(/\b(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:"?public"?\s*\.\s*)?"?applications"?(?![\w"])([^;]*);/gi)) {
          if (m[1].toUpperCase() === "DROP") deleteRules.delete(m[2]);
          else if (/\bFOR\s+(?:DELETE|ALL)\b/i.test(m[3]) || !/\bFOR\s+(?:SELECT|INSERT|UPDATE)\b/i.test(m[3])) deleteRules.set(m[2], rel);
        }
      }
      for (const [name, rel] of deleteRules) {
        if (name !== "Candidates can delete their own applications") detail.push(`${rel}: "${name}" lets a browser delete applications; a business removes one only through Delete their information (remove-applicant)`);
      }
      const fn = (await read("supabase/functions/remove-applicant/index.ts")) ?? "";
      if (!/p_actor: caller\.userId/.test(fn) || !/requireSignedInUser\(req, corsHeaders\)/.test(fn)) detail.push("remove-applicant: the actor must come from the caller's sign-in");
      const menu = (await read("src/cockpit/components/ApplicantRowMenu.tsx")) ?? "";
      if (!/key: "delete", label: "Delete their information"/.test(menu)) detail.push("ApplicantRowMenu.tsx: 'Delete their information' is gone from the ⋯ menu");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "file-queue-fair-and-bounded",
    why:
      "One account's uploads hold up only its own removals (the eighth security review: one throwaway account queued " +
      "860 rows an hour while document-cleanup took 200 a run, oldest first and one remove() a path, so every real " +
      "withdrawal, Delete Account and remove-applicant leftover after it waited days). document-cleanup reads the " +
      "queue only through storage_file_trash_fair_pick (service role only: a few from each person a run, the people " +
      "with the fewest waiting first) and clears exact paths in one remove() a bucket. Many accounts hold up nobody " +
      "for good (the ninth security review: a thousand accounts' notes that failed every hour, or 200 accounts with " +
      "one note each, kept a real withdrawal out of every run): a note that failed never comes before one that is due, " +
      "and a note that is not a plain path is dropped. People take turns (the tenth security review: ranked by each " +
      "note's age, 200 accounts' one-hour burst queued before a real withdrawal kept a place ahead of it for 30 runs, " +
      "and a real note that failed once was never tried again while a flood went on): each run records whom it took, " +
      "a person's first note is ranked by when they were last taken or it became due, whichever is later, a note that " +
      "failed waits out a back-off, and a person's record goes only once they hold nothing in that queue.",
    run: async ({ read, walk }) => {
      const detail = [];
      const pick = await latestDefinition({ read, walk }, "storage_file_trash_fair_pick");
      const body = (pick?.body ?? "").replace(/\s+/g, " ");
      if (!pick) detail.push("supabase/migrations: no storage_file_trash_fair_pick (document-cleanup's fair pick, 20261025560000)");
      else {
        if (!/row_number\(\) over \(partition by m\.person order by m\.attempts, m\.queued_at, m\.id\) as nth, count\(\*\) over \(partition by m\.person\) as waiting/i.test(body)) detail.push(`${pick.rel}: storage_file_trash_fair_pick must number each person's notes (fewest tries, oldest first) and count how many each has waiting`);
        // A note that failed is due an hour a try after its last try (up to a
        // day) and half an hour more; until then it waits behind every note
        // that is due (the ninth and tenth security reviews).
        if (!body.includes("case when m.attempts > 0 then coalesce(m.last_tried_at, m.queued_at) + least(m.attempts, 24) * interval '1 hour' + interval '30 minutes' else m.queued_at end as due_at")) detail.push(`${pick.rel}: storage_file_trash_fair_pick must make a note that failed due an hour a try after its last try (up to a day) and half an hour more, and one never tried due when it was queued`);
        if (!/row_number\(\) over \(order by r\.due_at > now\(\), r\.nth > 1, case when r\.nth = 1 then greatest\(s\.served_at, r\.due_at\) end, r\.waiting, r\.nth, r\.attempts, r\.queued_at, r\.id\) as place from ranked r left join public\.storage_file_trash_served s on s\.exact = coalesce\(p_exact, false\) and s\.person = r\.person where r\.nth <= case when coalesce\(p_exact, false\) then 40 else 6 end \), picked as materialized \( select p\.id, p\.person, p\.place from placed p where p\.place <= case when coalesce\(p_exact, false\) then 1000 else 200 end \)/i.test(body)) detail.push(`${pick.rel}: storage_file_trash_fair_pick must take at most 6 folders and 40 exact paths from one person, a note that failed behind every note that is due, each person's first note in turn (by when they were last taken or it became due, whichever is later), then the people with the fewest waiting first, 200 folders and 1,000 paths a run`);
        // Each run records whom it took, in the same statement, and answers in
        // that order (the tenth security review).
        if (!/served as \( insert into public\.storage_file_trash_served \(exact, person, served_at\) select distinct coalesce\(p_exact, false\), p\.person, now\(\) from picked p on conflict \(exact, person\) do update set served_at = excluded\.served_at \) select t\.\* from picked p join public\.storage_file_trash t on t\.id = p\.id order by p\.place\s*$/i.test(body)) detail.push(`${pick.rel}: storage_file_trash_fair_pick must record whom each run took (storage_file_trash_served, now()) and answer with exactly those notes, in their order`);
        if (/\bperson\s*=(?!\s*r\.person\b)|where false|limit 0\b|place <= 0\b/i.test(body)) detail.push(`${pick.rel}: storage_file_trash_fair_pick is narrowed to nothing or to one person`);
        if (pick.securityDefiner) detail.push(`${pick.alteredIn ?? pick.rel}: storage_file_trash_fair_pick must run with the caller's rights (only the server may read the queue)`);
        const sql = (await read(pick.rel)) ?? "";
        if (!/grant execute on function public\.storage_file_trash_fair_pick\(boolean\) to service_role;/i.test(sql) || !/revoke all on function public\.storage_file_trash_fair_pick\(boolean\) from public, anon, authenticated;/i.test(sql)) detail.push(`${pick.rel}: storage_file_trash_fair_pick must be the service role's only`);
        for (const rel of await grantsToBrowser({ read, walk }, "storage_file_trash_fair_pick")) detail.push(`${rel}: storage_file_trash_fair_pick granted to a browser role`);
      }
      // Whom each run took is the server's own record: row-level security on,
      // nothing for a browser (a browser that could write it could give its
      // accounts the front of the queue, or send a real person to its back).
      const texts = await migrationTexts({ read, walk });
      const all = texts.map((t) => t.sql).join("\n").replace(/\s+/g, " ");
      if (!/create table if not exists public\.storage_file_trash_served \( exact boolean not null, person text not null, served_at timestamptz not null default now\(\), primary key \(exact, person\) \);/i.test(all)) detail.push("supabase/migrations: no public.storage_file_trash_served (exact, person, served_at), one row for each person and kind of note (20261025590000)");
      if (!/alter table public\.storage_file_trash_served enable row level security;/i.test(all) || !/revoke all on table public\.storage_file_trash_served from public, anon, authenticated;/i.test(all)) detail.push("supabase/migrations: public.storage_file_trash_served must have row-level security on and nothing for public, anon or authenticated");
      for (const { rel, sql } of texts) {
        const flat = sql.replace(/\s+/g, " ");
        for (const m of flat.matchAll(/\bgrant\s+[^;]*?\bon\s+(?:table\s+)?([^;]*?)\s+to\s+([^;]*);/gi)) {
          if (/(?:^|[\s,"])(?:"?public"?\s*\.\s*)?"?storage_file_trash_served"?(?:$|[\s,"])|^all\s+tables\s+in\s+schema\s+[^;]*\bpublic\b/i.test(m[1]) && /(?:^|[\s,"])(anon|authenticated|public)(?:$|[\s,"])/i.test(m[2])) detail.push(`${rel}: public.storage_file_trash_served granted to a browser role`);
        }
        if (/\bstorage_file_trash_served\b[^;]*\b(?:disable|no force) row level security\b|\bcreate policy\b[^;]*\bon\s+(?:"?public"?\s*\.\s*)?"?storage_file_trash_served"?\b/i.test(flat)) detail.push(`${rel}: public.storage_file_trash_served opened to a browser (row-level security off, or a policy)`);
      }
      // …and a person's record goes only once they hold nothing in that
      // queue, a day after their last turn, by the same person as the pick
      // reads (dropping it while they hold a note would rank them by its age
      // again, ahead of everyone who waited since).
      const prune = await latestDefinition({ read, walk }, "prune_storage_file_trash_served");
      const pruneBody = (prune?.body ?? "").replace(/\s+/g, " ");
      if (!prune?.securityDefiner || !pruneBody.includes("delete from public.storage_file_trash_served s where s.served_at < now() - interval '1 day' and not exists ( select 1 from public.storage_file_trash t where (t.path is not null) = s.exact and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = s.person );") || !body.includes("coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) as person")) {
        detail.push(`${prune?.rel ?? "supabase/migrations"}: prune_storage_file_trash_served must drop a person's record only a day after their last turn and once they hold nothing in that queue, read as the pick reads a person`);
      }
      if (prune && (!/revoke all on function public\.prune_storage_file_trash_served\(\) from public, anon, authenticated;/i.test((await read(prune.rel)) ?? "") || (await grantsToBrowser({ read, walk }, "prune_storage_file_trash_served")).length)) detail.push(`${prune.rel}: prune_storage_file_trash_served must be the server's only`);
      const scheduledAt = all.search(/perform cron\.schedule\('prune-storage-file-trash-served', '\d{1,2} \d{1,2} \* \* \*', 'select public\.prune_storage_file_trash_served\(\)'\);(?![\s\S]*cron\.schedule\('prune-storage-file-trash-served')/i);
      const unscheduledAt = Math.max(-1, ...[...all.matchAll(/cron\.unschedule\('prune-storage-file-trash-served'\)/gi)].map((m) => m.index));
      if (scheduledAt < 0 || unscheduledAt > scheduledAt) detail.push("supabase/migrations: prune_storage_file_trash_served must run daily (pg_cron, prune-storage-file-trash-served), and no later migration may unschedule it");
      // document-cleanup: the queue read only through the pick, both kinds;
      // exact paths in bulk; a refused batch tried one path at a time, with a
      // stop when storage itself refuses.
      const fn = ((await read("supabase/functions/document-cleanup/index.ts")) ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!/admin\.rpc\("storage_file_trash_fair_pick", \{ p_exact: false \}\)/.test(fn) || !/admin\.rpc\("storage_file_trash_fair_pick", \{ p_exact: true \}\)/.test(fn)) detail.push("document-cleanup: the removal queue must be read through storage_file_trash_fair_pick, folders and exact paths");
      if (/from\("storage_file_trash"\)\s*\.select\("[^"]*\b(?:path|folder)\b/.test(fn)) detail.push("document-cleanup: reads the removal queue's notes straight from the table, not through the fair pick");
      if (!/const REMOVE_BATCH = 1000;/.test(fn) || !/\.remove\(batch\.map\(\(n\) => String\(n\.path\)\)\)/.test(fn)) detail.push("document-cleanup: exact paths must go in one remove() a bucket, up to 1,000");
      if (!/if \(refusedInARow >= REFUSED_IN_A_ROW\) \{/.test(fn) || !/\.remove\(\[String\(note\.path\)\]\)/.test(fn)) detail.push("document-cleanup: a batch storage refuses must be tried one path at a time, stopping once storage itself refuses");
      if (!/isPlainObjectPath\(p\)/.test(fn) || !/!p\.includes\("\.\."\)/.test(fn)) detail.push("document-cleanup: a removal note must be a plain path (no \"..\", \"%\", backslash or control character) before it reaches storage");
      // …and one that is not goes, rather than failing every hour for good
      // (the ninth security review).
      if (!/if \(!REMOVAL_BUCKETS\.has\(bucket\) \|\| !\(note\.path \? plain\(note\.path\) : plain\(note\.folder\)\)\) \{\s*console\.error\([^;]*\);\s*dropped\.push\(note\.id\);\s*continue;\s*\}/.test(fn) || !/\.from\("storage_file_trash"\)\.delete\(\)\.in\("id", dropped\.slice\(i, i \+ IDS_PER_REQUEST\)\)/.test(fn)) {
        detail.push("document-cleanup: a removal note that is not a plain path must be dropped (logged), not marked failed and retried every hour");
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "applications-stay-on-their-job",
    why:
      "A business could delete one chosen application without Delete their information: move it to a throwaway job " +
      "of its own, then delete that job (the eighth security review; the protect triggers return early for the hiring " +
      "team and the UPDATE policies have no WITH CHECK). Nobody but the server changes an application's job " +
      "(applications_stay_on_their_job), and a deleted document's kept copies (documents/<id>/) are queued for " +
      "removal however the row goes (documents_queue_files, with its own rights, never failing the delete).",
    run: async ({ read, walk }) => {
      const detail = [];
      detail.push(...(await triggerProblems({ read, walk }, { name: "applications_stay_on_their_job", table: "applications", timing: "BEFORE", event: "UPDATE", fn: "applications_stay_on_their_job" })));
      // On every update, never UPDATE OF some columns (an update that leaves
      // them out would pass by).
      let made = "";
      for (const { sql } of await migrationTexts({ read, walk })) {
        for (const m of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?applications_stay_on_their_job"?\s[^;]*;/gi)) made = m[0].replace(/\s+/g, " ");
      }
      if (made && !/\bBEFORE UPDATE ON\b/i.test(made)) detail.push("supabase/migrations: applications_stay_on_their_job must run on every update of an application (BEFORE UPDATE ON, not UPDATE OF)");
      const stay = await latestDefinition({ read, walk }, "applications_stay_on_their_job");
      const stayBody = (stay?.body ?? "").replace(/\s+/g, " ");
      if (!/^\s*begin if new\.job_id is distinct from old\.job_id and coalesce\(auth\.role\(\), ''\) <> 'service_role' and \(coalesce\(auth\.role\(\), ''\) <> '' or current_user in \('anon', 'authenticated'\)\) then raise exception 'application_job_fixed'/i.test(stayBody)) {
        detail.push(`${stay?.rel ?? "supabase/migrations"}: applications_stay_on_their_job must refuse any change of an application's job but the server's, first thing`);
      }
      detail.push(...(await triggerProblems({ read, walk }, { name: "documents_queue_files", table: "documents", timing: "AFTER", event: "DELETE", fn: "documents_queue_files" })));
      const docs = await latestDefinition({ read, walk }, "documents_queue_files");
      const docsBody = (docs?.body ?? "").replace(/\s+/g, " ");
      if (!docs?.securityDefiner) detail.push(`${docs?.alteredIn ?? docs?.rel ?? "supabase/migrations"}: documents_queue_files must run with its own rights (a business's delete cannot write storage_file_trash)`);
      if (!/^\s*begin begin if old\.id is not null and coalesce\(private\.storage_holds\('documents', 'documents\/' \|\| old\.id::text \|\| '\/'\), true\) then insert into public\.storage_file_trash \(bucket, folder, starts_with, application_id, candidate_id\) values \('documents', 'documents\/' \|\| old\.id::text, '', old\.application_id, old\.recipient_id\); end if; exception when others then raise log [^;]*; end; return old; end;?\s*$/i.test(docsBody)) {
        detail.push(`${docs?.rel ?? "supabase/migrations"}: documents_queue_files must queue documents/<id>/ of every deleted document where storage holds a file (or cannot say), in its own exception block, as written`);
      }
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
