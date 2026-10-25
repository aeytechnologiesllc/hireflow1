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
 *     runs the site and end with how to reach it.
 *   - applicant-data-can-be-removed: a business can delete an applicant's
 *     information (the Terms ask it to act on such a request), only through
 *     the remove-applicant function, which names the actor from the sign-in.
 */

const ENTITY = "Southern Digital Technologies LLC";

/** Each call of `fn(` with its object argument, as text (balanced braces). */
function callsOf(text, fn) {
  const out = [];
  const re = new RegExp(`\\b${fn}(?:<[^>(]*>)?\\(\\s*\\{`, "g");
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
          }
        }
      }
      const openai = (await read("supabase/functions/_shared/openai.ts")) ?? "";
      if (!/takeDailyAiBudget\(1, business\)/.test(openai)) detail.push("_shared/openai.ts: callOpenAIChat no longer passes the business to the budget");
      const json = /export async function callOpenAIJson[\s\S]*?const \{ validator, fallback, throwWhenUnavailable = false, retries = 2, \.\.\.chatOptions \} = options;[\s\S]*?callOpenAIChat\(\{\s*\.\.\.chatOptions,/.test(openai);
      if (!json) detail.push("_shared/openai.ts: callOpenAIJson no longer passes its options (and the business) to callOpenAIChat");
      const streaming = (await read("supabase/functions/_shared/openaiStreaming.ts")) ?? "";
      if (!/takeDailyAiBudget\(1, business\)/.test(streaming)) detail.push("_shared/openaiStreaming.ts: the streaming helper no longer passes the business to the budget");
      const flow = (await read("supabase/functions/generate-flow/index.ts")) ?? "";
      if (!/takeDailyAiBudget\(1, user\.id\)/.test(flow)) detail.push("generate-flow: does not take from the asking business's budget");
      const helper = (await read("supabase/functions/_shared/aiBudget.ts")) ?? "";
      if (!/p_business: business/.test(helper)) detail.push("_shared/aiBudget.ts: does not send the business to ai_budget_take");
      const migration = (await read("supabase/migrations/20261025160000_ai_business_budget.sql")) ?? "";
      if (!/create or replace function public\.ai_budget_take\(p_calls integer default 1, p_business uuid default null\)/.test(migration) || !/drop function if exists public\.ai_budget_take\(integer\);/.test(migration)) {
        detail.push("20261025160000_ai_business_budget.sql: the two-argument budget (and the old one dropped) is missing");
      }
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
      if (!/href="\/privacy"/.test(formNotice) || !/hiring team for this job sees it/.test(formNotice)) detail.push("ApplicationFormPhase.tsx: the application form no longer says who sees it and links the Privacy Policy");
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
      }
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
    run: async ({ read }) => {
      const detail = [];
      const sql = (await read("supabase/migrations/20261025170000_remove_applicant.sql")) ?? "";
      if (!/grant execute on function public\.remove_applicant\(uuid, uuid, text\) to service_role;/.test(sql) || !/revoke all on function public\.remove_applicant\(uuid, uuid, text\) from public, anon, authenticated;/.test(sql)) {
        detail.push("remove_applicant must be callable by the system only (it trusts the actor it is given)");
      }
      if (!/tm\.can_manage_pipeline is true/.test(sql) || !/p_actor = v_app\.employer_id/.test(sql)) detail.push("remove_applicant no longer limits it to the owner and teammates who manage applicants");
      if (!/insert into private\.applicant_removals/.test(sql)) detail.push("remove_applicant no longer logs the removal");
      const fn = (await read("supabase/functions/remove-applicant/index.ts")) ?? "";
      if (!/p_actor: caller\.userId/.test(fn) || !/requireSignedInUser\(req, corsHeaders\)/.test(fn)) detail.push("remove-applicant: the actor must come from the caller's sign-in");
      const menu = (await read("src/cockpit/components/ApplicantRowMenu.tsx")) ?? "";
      if (!/key: "delete", label: "Delete their information"/.test(menu)) detail.push("ApplicantRowMenu.tsx: 'Delete their information' is gone from the ⋯ menu");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
