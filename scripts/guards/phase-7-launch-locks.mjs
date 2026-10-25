/**
 * Phase 7 of docs/LAUNCH-PLAN.md, locked (2026-10-25): what the security
 * audit before launch found, fixed.
 *
 *   - reports-pause-needs-contact: three reports pause a business by itself
 *     only from people it has been in touch with (a message from it or its
 *     team, a document or a request for one, an interview). Three throwaway
 *     accounts that applied could pause any business before
 *     (20261025290000_reports_need_contact.sql).
 *   - own-jobs-have-their-own-ai-day: HireFlow's own jobs count against
 *     their own daily AI budget, so their applicants cannot take the whole
 *     platform's day (20261025300000_ai_budget_own_jobs.sql).
 *   - portfolio-review-checks-before-spending: the portfolio's AI review runs
 *     only for a step open to the applicant, within its limits.
 *   - client-notifications-and-messages-limited: what one account writes to
 *     someone else's bell or inbox is bounded in size and rate, links only
 *     inside HireFlow, and an applicant's card is never a HireFlow "system"
 *     card (20261025310000_notification_and_message_limits.sql).
 *   - sales-grading-own-case: the sales practice is graded only on one of
 *     its step's own cases, with the applicant's words fenced, and a grade
 *     from the page's own transcript says so.
 *   - voice-session-reads-only-own-resume: ava-voice-session reads the
 *     resume through _shared/resume.ts, the applicant's own file only.
 */

/** The body of the last migration (by file name) that defines public.<fn>, with its file. */
async function latestDefinition({ read, walk }, fn) {
  const files = (await walk("supabase/migrations", [".sql"])).sort();
  let found = null;
  for (const rel of files) {
    const text = (await read(rel)) ?? "";
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?"?${fn}"?\\s*\\(`, "gi");
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const open = text.indexOf("$$", start);
      const close = open < 0 ? -1 : text.indexOf("$$", open + 2);
      if (close > 0) found = { rel, body: text.slice(open + 2, close) };
    }
  }
  return found;
}

/** SQL without comments, spaces collapsed. */
const plain = (sql) => sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");

export default [
  {
    id: "reports-pause-needs-contact",
    why:
      "Applying costs nothing (no email confirmation, no bot check), so three throwaway accounts could apply to any " +
      "business's job, report it and close all its jobs (the Phase 7 security audit ran it). Reports pause a business " +
      "only from people it has been in touch with: employer_reports_auto_pause counts business_has_contacted(...) and " +
      "pauses only at three, and business_has_contacted looks only at what the business itself makes (messages from it " +
      "or its team, documents and requests on the applicant's application, interviews).",
    run: async (ctx) => {
      const detail = [];
      const pause = await latestDefinition(ctx, "employer_reports_auto_pause");
      if (!pause) detail.push("no migration defines employer_reports_auto_pause");
      else {
        const body = plain(pause.body);
        if (!/count\(\*\) FILTER \(WHERE public\.business_has_contacted\(NEW\.employer_id, people\.reporter_id\)\)/i.test(body))
          detail.push(`${pause.rel}: employer_reports_auto_pause no longer counts the reporters the business contacted (business_has_contacted)`);
        const gate = body.search(/IF contacted >= 3 THEN/i);
        const call = body.search(/PERFORM public\.business_pause\(/i);
        if (gate < 0 || call < 0 || call < gate || (body.match(/business_pause\(/gi) ?? []).length !== 1)
          detail.push(`${pause.rel}: employer_reports_auto_pause must call business_pause once, only inside IF contacted >= 3`);
        if (!/FROM public\.platform_admins a WHERE a\.user_id = NEW\.employer_id\) THEN RETURN NULL;/i.test(body))
          detail.push(`${pause.rel}: HireFlow's own account must never be paused by reports`);
      }
      const contact = await latestDefinition(ctx, "business_has_contacted");
      if (!contact) detail.push("no migration defines business_has_contacted");
      else {
        const body = plain(contact.body);
        for (const [what, re] of [
          ["a message to them from the business or its team", /FROM public\.messages m WHERE m\.receiver_id = p_person AND m\.sender_id IS DISTINCT FROM p_person AND \(m\.sender_id = p_employer OR EXISTS \(SELECT 1 FROM public\.team_members tm WHERE tm\.employer_id = p_employer AND tm\.user_id = m\.sender_id\)\)/i],
          ["their application to this business", /WHERE a\.candidate_id = p_person AND j\.employer_id = p_employer AND/i],
          ["document requests", /FROM public\.document_requests dr WHERE dr\.application_id = a\.id/i],
          ["documents", /FROM public\.documents d WHERE d\.application_id = a\.id/i],
          ["interviews", /FROM public\.interviews i WHERE i\.application_id = a\.id/i],
        ]) if (!re.test(body)) detail.push(`${contact.rel}: business_has_contacted no longer reads ${what} as written`);
        if (/\b(OR\s+true|applications\s+a\s+WHERE\s+a\.candidate_id\s*=\s*p_person\s*\))/i.test(body))
          detail.push(`${contact.rel}: business_has_contacted counts something the applicant can make alone`);
        const file = plain((await ctx.read(contact.rel)) ?? "");
        if (!/REVOKE ALL ON FUNCTION public\.business_has_contacted\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/i.test(file))
          detail.push(`${contact.rel}: business_has_contacted must not be callable from a client`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "own-jobs-have-their-own-ai-day",
    why:
      "ai_budget_take skipped the per-business cap for a platform admin's business, so the applicants on HireFlow's " +
      "own open job spent straight from the platform's day and one account looping a step there left every business's " +
      "applicants waiting until midnight. HireFlow's own business is counted against ai_platform_business_daily_call_cap " +
      "(20261025300000_ai_budget_own_jobs.sql).",
    run: async (ctx) => {
      const detail = [];
      const take = await latestDefinition(ctx, "ai_budget_take");
      if (!take) return { ok: false, detail: ["no migration defines ai_budget_take"] };
      const body = plain(take.body);
      if (/platform_admins a where a\.user_id = v_business\) then v_business := null;/i.test(body) || /v_business := null/i.test(body))
        detail.push(`${take.rel}: ai_budget_take stops counting a business again (v_business := null)`);
      if (!/if v_own then v_business_cap := coalesce\(\(select \(value #>> '\{\}'\)::integer from public\.app_settings where key = 'ai_platform_business_daily_call_cap'\), \d+\);/i.test(body))
        detail.push(`${take.rel}: HireFlow's own business no longer takes its cap from ai_platform_business_daily_call_cap`);
      if (!/insert into private\.ai_business_daily_usage/i.test(body) || !/if v_business_calls > v_business_cap then/i.test(body))
        detail.push(`${take.rel}: a business (HireFlow's own included) is no longer refused past its cap`);
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "portfolio-review-checks-before-spending",
    why:
      "The portfolio's AI review (up to 20 MB of files per call) ran before anything checked the step, and had no limit: " +
      "one account could loop it against its business's AI budget, or the platform's on HireFlow's own jobs. " +
      "ai-analyze-portfolio checks the step is open to the applicant (stepOpenForResult: not decided, reached, not " +
      "already handed in) and its per-account and per-application limits before it downloads a file or calls the model.",
    run: async ({ read }) => {
      const detail = [];
      const rel = "supabase/functions/ai-analyze-portfolio/index.ts";
      const text = (await read(rel)) ?? "";
      const code = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const handler = code.slice(code.indexOf("serve("));
      const at = (re) => handler.search(re);
      const open = at(/const open = await stepOpenForResult\(admin as unknown as MinimalSupabaseAdmin, \{\s*applicationId,\s*callerUserId,\s*stepId,\s*stepType: "portfolio_upload",\s*\}\);\s*if \(!open\.ok\) \{\s*return /);
      const perAccount = at(/\["ai-analyze-portfolio", `user:\$\{callerUserId\}`, PORTFOLIO_REVIEWS_PER_ACCOUNT_PER_HOUR, 3600\]/);
      const perApplication = at(/\["ai-analyze-portfolio-per-application", `application:\$\{applicationId\}`, PORTFOLIO_REVIEWS_PER_APPLICATION_PER_DAY, 86400\]/);
      const limited = at(/const limited = await checkRateLimit\(bucket, identifier, limit, windowSecs\);\s*if \(!limited\.allowed\) \{/);
      const download = at(/\.storage\.from\("portfolios"\)\.download\(/);
      const review = at(/await runPortfolioAnalysis\(/);
      if (open < 0) detail.push(`${rel}: no longer checks the step is open (stepOpenForResult) and refuses when it is not`);
      if (perAccount < 0 || perApplication < 0 || limited < 0) detail.push(`${rel}: the per-account or per-application review limit is gone`);
      for (const [name, pos] of [["the open-step check", open], ["the limits", limited]]) {
        if (pos >= 0 && ((download >= 0 && pos > download) || (review >= 0 && pos > review))) detail.push(`${rel}: ${name} must come before any download and before the review`);
      }
      const m = code.match(/PORTFOLIO_REVIEWS_PER_ACCOUNT_PER_HOUR = (\d+);[\s\S]*?PORTFOLIO_REVIEWS_PER_APPLICATION_PER_DAY = (\d+);/);
      if (!m || Number(m[1]) > 10 || Number(m[2]) > 20) detail.push(`${rel}: the portfolio review limits are missing or raised past 10 an hour / 20 a day`);
      const shared = (await read("supabase/functions/_shared/trustedResults.ts")) ?? "";
      if (!/const DECIDED_STATUSES = new Set\(\["offered", "hired", "rejected"\]\);/.test(shared) || !/code: "already_submitted"/.test(shared))
        detail.push("supabase/functions/_shared/trustedResults.ts: stepOpenFor no longer refuses a decided application or a step already handed in");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "client-notifications-and-messages-limited",
    why:
      "In one request an applicant put 500 notifications of 54 KB each, typed 'system' and titled \"HireFlow: your " +
      "account is suspended\", in a business's bell, each one a push to every device; a card's link could be any " +
      "http(s) address, and messages had no length limit. notifications_client_limits and messages_client_limits " +
      "bound what a signed-in account writes for someone else (20261025310000).",
    run: async (ctx) => {
      const detail = [];
      const notif = await latestDefinition(ctx, "notifications_client_limits");
      const msg = await latestDefinition(ctx, "messages_client_limits");
      const allowed = await latestDefinition(ctx, "client_send_allowed");
      if (!notif || !msg || !allowed) return { ok: false, detail: ["notifications_client_limits, messages_client_limits or client_send_allowed is not defined"] };
      const n = plain(notif.body);
      for (const [what, re] of [
        ["only browser rows are limited", /IF current_user NOT IN \('anon', 'authenticated'\) THEN RETURN NEW; END IF;/i],
        ["the title and message are trimmed", /NEW\.title := left\(NEW\.title, 160\); NEW\.message := left\(NEW\.message, 600\);/i],
        ["a link outside HireFlow is dropped", /IF NEW\.link IS NOT NULL AND NEW\.link !~ '\^\/\(\[\^\/\\\\\]\|\$\)' THEN NEW\.link := NULL; END IF;/i],
        ["an applicant's system card becomes an application card", /NEW\.type := 'application';/i],
        ["the writer's allowance is counted", /IF NOT public\.client_send_allowed\('notification', NEW\.user_id\) THEN RAISE LOG [^;]+; RETURN NULL; END IF;/i],
      ]) if (!re.test(n)) detail.push(`${notif.rel}: notifications_client_limits: ${what} no longer as written`);
      const m = plain(msg.body);
      if (!/IF char_length\(coalesce\(NEW\.content, ''\)\) > 10000 THEN RAISE EXCEPTION 'message_too_long'/i.test(m)) detail.push(`${msg.rel}: messages_client_limits no longer refuses a message over 10,000 characters`);
      if (!/NOT public\.client_send_allowed\('message', NEW\.receiver_id\) THEN RAISE EXCEPTION 'too_many_messages'/i.test(m)) detail.push(`${msg.rel}: messages_client_limits no longer counts the sender's messages`);
      const a = plain(allowed.body);
      const nums = a.match(/IF p_kind = 'notification' THEN pair_limit := (\d+); total_limit := (\d+); ELSIF p_kind = 'message' THEN pair_limit := (\d+); total_limit := (\d+);/i);
      if (!nums || Number(nums[1]) > 30 || Number(nums[2]) > 300 || Number(nums[3]) > 120 || Number(nums[4]) > 600) detail.push(`${allowed.rel}: client_send_allowed's limits are missing or raised (30/300 notifications, 120/600 messages an hour)`);
      if (!/me uuid := auth\.uid\(\);/.test(a)) detail.push(`${allowed.rel}: client_send_allowed must count for the signed-in account only`);
      const file = plain((await ctx.read(notif.rel)) ?? "");
      for (const trig of ["CREATE TRIGGER notifications_client_limits BEFORE INSERT ON public.notifications", "CREATE TRIGGER messages_client_limits BEFORE INSERT ON public.messages"]) {
        if (!file.includes(trig)) detail.push(`${notif.rel}: missing ${trig}`);
      }
      for (const def of [notif, msg]) {
        const head = plain(((await ctx.read(def.rel)) ?? "").slice(0, ((await ctx.read(def.rel)) ?? "").indexOf(def.body)));
        const tail = head.slice(head.lastIndexOf("CREATE OR REPLACE FUNCTION"));
        if (/SECURITY DEFINER/i.test(tail)) detail.push(`${def.rel}: a limit trigger function is SECURITY DEFINER (it must see the writer's own role)`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "sales-grading-own-case",
    why:
      "The sales practice does not record its turns, so its grader read the scenario, prospect and product text from " +
      "the request straight into its instructions. The case must be one of the step's own, the applicant's words are " +
      "fenced, and a grade made from the page's transcript is marked transcriptSource \"browser\" so the scorer never trusts it.",
    run: async ({ read }) => {
      const detail = [];
      const rel = "supabase/functions/submit-sales-simulation/index.ts";
      const code = ((await read(rel)) ?? "").replace(/\/\/[^\n]*/g, "");
      const check = code.search(/if \(!isKnownSalesCase\(salesScenariosOf\(salesStep\.config\), body\)\) \{\s*return jsonResponse\(/);
      const grade = code.search(/evaluation = await gradeTranscript\(/);
      if (check < 0) detail.push(`${rel}: no longer refuses a case that is not one of the step's own`);
      else if (grade >= 0 && check > grade) detail.push(`${rel}: the case is checked only after the grading`);
      if (/jobTitle = "",|candidateName = "the sales representative",\s*messages/.test(code)) detail.push(`${rel}: the job title or the applicant's name comes from the request again`);
      if (!/transcriptSource: transcript\.source === "stored" \? undefined : "browser",/.test(code)) detail.push(`${rel}: a grade from the page's own transcript no longer says so`);
      const grading = (await read("supabase/functions/submit-sales-simulation/grading.ts")) ?? "";
      if (!/return withApplicantTextRule\(`You are roleplaying as/.test(grading)) detail.push("submit-sales-simulation/grading.ts: the grading instructions lost the fence rule");
      if (!/content: fenceApplicantText\(m\.role === "user" \? "sales rep message" : "prospect message", m\.content\),/.test(grading)) detail.push("submit-sales-simulation/grading.ts: the transcript is no longer fenced");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "voice-session-reads-only-own-resume",
    why:
      "ava-voice-session kept its own resume reader: it fetched resume_url (which the applicant can edit) as a raw " +
      "address and signed any bucket and path with the service key, and the text went into the session details the " +
      "browser receives. It reads the resume only through _shared/resume.ts's fetchResumeText, for the applicant's own file.",
    run: async ({ read }) => {
      const rel = "supabase/functions/ava-voice-session/index.ts";
      const code = ((await read(rel)) ?? "").replace(/\/\/[^\n]*/g, "");
      const detail = [];
      if (!/import \{ fetchResumeText \} from "\.\.\/_shared\/resume\.ts";/.test(code)) detail.push(`${rel}: does not take fetchResumeText from _shared/resume.ts`);
      if (/function fetchResumeText|createSignedUrl\(|function parseStorageUrl/.test(code)) detail.push(`${rel}: has its own resume reader or signs storage paths again`);
      for (const call of code.match(/fetchResumeText\([^)]*\)/g) ?? []) {
        if (!/fetchResumeText\(resumeUrl, adminClient, application\.candidate_id\)/.test(call)) detail.push(`${rel}: ${call} does not name the applicant whose resume it reads`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
];
