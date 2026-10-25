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
 *   - phase-7-low-fixes-hold: strong server-made invite codes, the blueprint
 *     PDF for a signed-in account only, the geocode lookup limited, no late
 *     video result on a decided application.
 *   - product-audit-fixes-hold: the product audit's fixes that no test
 *     reads: posts that print each list once, a fallback post in sentences,
 *     the first-step email that says what is left, the legal page's Back.
 *   - service-key-signers-use-plain-paths: applicant-file-url and
 *     requested-document-url sign only plain paths, and the database refuses
 *     a "%", backslash or control character in the paths an applicant stores
 *     (the sixth security review; 20261025500000_plain_file_paths.sql).
 *   - alerts-reach-the-right-people: the business is told when its AI day is
 *     used (the new-business card says how to get the full day), and the
 *     server's "told today" records are its own, never a card in a bell.
 *   - product-audit-round-2-holds: the second product audit's wording and
 *     defaults: what applicants are told is shared, no warnings on the form,
 *     email switches that do something, the editor's own first screen, the
 *     offer letter from the job, the certificate's claim, plain step buttons
 *     and sign-up autocomplete.
 */

/* -------------------------------------------------------------------------
 * Reading the migrations as Postgres reads them (the sixth security review).
 *
 * The first versions found a function's body only between "$$" quotes, read
 * only the header before it, and matched grants only as "ON FUNCTION
 * public.<fn>": a redefinition quoted $function$ was not seen at all (the
 * older body was checked instead), SECURITY DEFINER written after the body
 * or a lower-case header passed, and so did a grant without "public." or ON
 * ROUTINE. These read the latest CREATE of a function or trigger in any case
 * and with any dollar-quote tag, the whole statement (options may follow the
 * body), and every later ALTER, DROP, DISABLE or GRANT that changes it.
 * scripts/launch_locks_behaviour.pglite.test.mjs proves the same locks by
 * what they do; these catch the cheap ways of writing a weakening without a
 * database. Exported for phase-5-launch-locks.mjs.
 * ---------------------------------------------------------------------- */

/** A name as SQL may write it: with or without "public.", quoted or not. */
const sqlName = (name) => `(?:"?public"?\\s*\\.\\s*)?"?${name}"?`;

/** SQL without comments, in one pass (whichever of /* or -- starts first wins): a rule kept only in a comment is no rule. */
const noComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, " ");

/** Every migration in file-name order, comments removed (read once per guard run). */
const textsByReader = new WeakMap();
export async function migrationTexts({ read, walk }) {
  if (!textsByReader.has(read)) {
    textsByReader.set(read, (async () => {
      const out = [];
      for (const rel of (await walk("supabase/migrations", [".sql"])).sort()) out.push({ rel, sql: noComments((await read(rel)) ?? "") });
      return out;
    })());
  }
  return textsByReader.get(read);
}

/**
 * The CREATE FUNCTION statement that starts at `at`: the header before its
 * body, the body (between any dollar-quote tag, in single quotes, or a SQL
 * standard RETURN / BEGIN ATOMIC body) and the options after it.
 */
function functionStatement(sql, at) {
  const rest = sql.slice(at);
  const open = /\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$|')|\bBEGIN\s+ATOMIC\b|\bRETURN\b|;/i.exec(rest);
  if (!open || open[0] === ";") return { header: rest.slice(0, open ? open.index : rest.length), body: "", options: "", statement: rest.slice(0, open ? open.index + 1 : rest.length) };
  const header = rest.slice(0, open.index);
  let bodyStart = open.index + open[0].length;
  let bodyEnd;
  let after;
  if (open[1] && open[1] !== "'") {
    bodyEnd = rest.indexOf(open[1], bodyStart);
    if (bodyEnd < 0) bodyEnd = rest.length;
    after = bodyEnd + open[1].length;
  } else if (open[1] === "'") {
    let i = bodyStart;
    while (i < rest.length && !(rest[i] === "'" && rest[i + 1] !== "'")) i += rest[i] === "'" ? 2 : 1;
    bodyEnd = i;
    after = i + 1;
  } else if (/^BEGIN/i.test(open[0])) {
    const end = /\bEND\s*;/i.exec(rest.slice(bodyStart));
    bodyEnd = end ? bodyStart + end.index : rest.length;
    after = bodyEnd;
  } else {
    bodyStart = open.index + open[0].length;
    bodyEnd = rest.indexOf(";", bodyStart);
    if (bodyEnd < 0) bodyEnd = rest.length;
    after = bodyEnd;
  }
  let end = rest.indexOf(";", after);
  if (end < 0) end = rest.length - 1;
  return { header, body: rest.slice(bodyStart, bodyEnd), options: rest.slice(after, end), statement: rest.slice(0, end + 1) };
}

/**
 * The last migration's (by file name) definition of public.<fn>: its file,
 * header, body, the options after the body and the whole statement, and
 * whether it runs as its owner (SECURITY DEFINER before or after the body,
 * or set by a later ALTER FUNCTION … SECURITY DEFINER | INVOKER).
 */
export async function latestDefinition(ctx, fn) {
  const texts = await migrationTexts(ctx);
  let found = null;
  texts.forEach(({ rel, sql }, file) => {
    for (const m of sql.matchAll(new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${sqlName(fn)}\\s*\\(`, "gi"))) {
      const statement = functionStatement(sql, m.index);
      found = { rel, file, at: m.index, ...statement, securityDefiner: /\bSECURITY\s+DEFINER\b/i.test(`${statement.header} ${statement.options}`) };
    }
  });
  if (!found) return null;
  texts.forEach(({ rel, sql }, file) => {
    if (file < found.file) return;
    for (const m of sql.matchAll(new RegExp(`\\bALTER\\s+(?:FUNCTION|ROUTINE|PROCEDURE)\\s+${sqlName(fn)}\\s*(?:\\([^)]*\\))?([^;]*);`, "gi"))) {
      if (file === found.file && m.index < found.at) continue;
      const security = /\bSECURITY\s+(DEFINER|INVOKER)\b/i.exec(m[1]);
      if (security) {
        found.securityDefiner = security[1].toUpperCase() === "DEFINER";
        found.alteredIn = rel;
      }
    }
  });
  return found;
}

/**
 * Each migration that grants public.<fn> to a browser role (anon,
 * authenticated or PUBLIC), however it is written: with or without
 * "public.", ON FUNCTION | ROUTINE | PROCEDURE or neither, in a list, as ALL
 * PRIVILEGES, or ON ALL FUNCTIONS | ROUTINES IN SCHEMA public.
 */
export async function grantsToBrowser(ctx, fn) {
  const out = [];
  for (const { rel, sql } of await migrationTexts(ctx)) {
    for (const m of sql.matchAll(/\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+([\s\S]*?)\s+TO\s+([^;]*);/gi)) {
      const target = m[1];
      const named = new RegExp(`^(?:(?:FUNCTION|ROUTINE|PROCEDURE)\\s+)?(?:[^;]*,\\s*)?${sqlName(fn)}\\s*(?:\\(|,|$)`, "i").test(target.trim());
      const everyFunction = /^ALL\s+(?:FUNCTIONS|ROUTINES|PROCEDURES)\s+IN\s+SCHEMA\s+[^;]*\bpublic\b/i.test(target.trim());
      if ((named || everyFunction) && /(?:^|[\s,"])(anon|authenticated|public)(?:$|[\s,"])/i.test(m[2])) out.push(rel);
    }
  }
  return out;
}

/**
 * What keeps trigger <name> from working as made: its latest CREATE on
 * public.<table> must be <timing> <event> … FOR EACH ROW EXECUTE FUNCTION
 * public.<fn>() with no WHEN, and no later migration may drop it, drop its
 * function with CASCADE, or switch it off, to replica only or to always
 * (DISABLE, ENABLE REPLICA, ENABLE ALWAYS: by name, ALL or USER). A CREATE
 * of the same name on another table does not make it.
 */
export async function triggerProblems(ctx, { name, table, timing, event, fn }) {
  const events = [];
  (await migrationTexts(ctx)).forEach(({ rel, sql }, file) => {
    for (const m of sql.matchAll(new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+"?${name}"?\\s[^;]*;`, "gi"))) {
      const on = /\bON\s+(?:ONLY\s+)?((?:"?\w+"?\s*\.\s*)?"?\w+"?)/i.exec(m[0]);
      if (on && new RegExp(`^${sqlName(table)}$`, "i").test(on[1])) events.push({ rel, file, at: m.index, kind: "create", text: m[0] });
    }
    for (const m of sql.matchAll(new RegExp(`\\bDROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?"?${name}"?\\s+ON\\s+(?:ONLY\\s+)?${sqlName(table)}\\b[^;]*;`, "gi"))) events.push({ rel, file, at: m.index, kind: "drop" });
    for (const m of sql.matchAll(new RegExp(`\\bDROP\\s+(?:FUNCTION|ROUTINE)\\s+(?:IF\\s+EXISTS\\s+)?[^;]*${sqlName(fn)}\\b[^;]*\\bCASCADE\\b[^;]*;`, "gi"))) events.push({ rel, file, at: m.index, kind: "drop" });
    for (const m of sql.matchAll(new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${sqlName(table)}\\s[^;]*;`, "gi"))) {
      for (const a of m[0].matchAll(new RegExp(`\\b(DISABLE|ENABLE(?:\\s+(?:REPLICA|ALWAYS))?)\\s+TRIGGER\\s+("?${name}"?|ALL|USER)\\b`, "gi"))) {
        events.push({ rel, file, at: m.index, kind: /^ENABLE$/i.test(a[1]) ? "on" : "off", text: a[0] });
      }
    }
  });
  events.sort((a, b) => a.file - b.file || a.at - b.at);
  const creates = events.filter((e) => e.kind === "create");
  const made = creates[creates.length - 1];
  if (!made) return [`supabase/migrations: no ${timing} ${event} trigger ${name} on public.${table}`];
  const problems = [];
  const def = made.text.replace(/\s+/g, " ");
  const firing = /\b(BEFORE|AFTER|INSTEAD\s+OF)\s+([\s\S]*?)\s+ON\s/i.exec(def);
  if (!firing || firing[1].toUpperCase() !== timing || !new RegExp(`\\b${event}\\b`, "i").test(firing[2])) problems.push(`${made.rel}: ${name} is made again other than ${timing} ${event}`);
  if (!/\bFOR\s+EACH\s+ROW\b/i.test(def)) problems.push(`${made.rel}: ${name} is made again FOR EACH STATEMENT (it must run for each row)`);
  if (/\bWHEN\s*\(/i.test(def)) problems.push(`${made.rel}: ${name} is made again with a WHEN`);
  if (!new RegExp(`\\bEXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+${sqlName(fn)}\\s*\\(\\s*\\)`, "i").test(def)) problems.push(`${made.rel}: ${name} no longer runs public.${fn}()`);
  // A CREATE (OR REPLACE) switches it on again; a plain ENABLE TRIGGER too.
  let off = null;
  for (const e of events) {
    if (e.file < made.file || (e.file === made.file && e.at <= made.at)) continue;
    if (e.kind === "drop") problems.push(`${e.rel}: ${name} (or its function, CASCADE) is dropped after it was made`);
    else if (e.kind === "off") off = e;
    else if (e.kind === "on") off = null;
  }
  if (off) problems.push(`${off.rel}: ${name} is switched off, or to fire only as a replica or always (${off.text})`);
  return problems;
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
        // It reads every report and pauses with its own rights, and its trigger
        // runs for each report (the sixth security review).
        if (!pause.securityDefiner) detail.push(`${pause.alteredIn ?? pause.rel}: employer_reports_auto_pause must run with its own rights (SECURITY DEFINER)`);
        detail.push(...(await triggerProblems(ctx, { name: "employer_reports_auto_pause", table: "employer_reports", timing: "AFTER", event: "INSERT", fn: "employer_reports_auto_pause" })));
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
        for (const rel of await grantsToBrowser(ctx, "business_has_contacted")) detail.push(`${rel}: business_has_contacted granted to a browser role`);
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
      // Made, and not dropped, switched off, remade with a WHEN, for each
      // statement or on another table by a later migration (the eighth, ninth
      // and tenth Phase 5 reviews; the sixth security review: FOR EACH
      // STATEMENT and lower case passed).
      for (const [name, table] of [["notifications_client_limits", "notifications"], ["messages_client_limits", "messages"]]) {
        detail.push(...(await triggerProblems(ctx, { name, table, timing: "BEFORE", event: "INSERT", fn: name })));
      }
      if (!/NEW\.created_at := now\(\);/.test(n)) detail.push(`${notif.rel}: notifications_client_limits no longer gives a browser's card the database's own time`);
      // Each limit function keeps the writer's own role: SECURITY DEFINER,
      // before its body or after it, or from a later ALTER FUNCTION, makes
      // current_user the owner and skips every limit (the sixth security
      // review: "$$ SECURITY DEFINER;" and a lower-case header passed).
      for (const [name, def] of [["notifications_client_limits", notif], ["messages_client_limits", msg]]) {
        if (def.securityDefiner) detail.push(`${def.alteredIn ?? def.rel}: ${name}() is SECURITY DEFINER (it must see the writer's own role)`);
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
  {
    id: "phase-7-low-fixes-hold",
    why:
      "The security audit's low findings, fixed: invite codes were 32 bits of md5(random()) and kept a code the " +
      "insert chose; generate-blueprint-pdf made a HireFlow-lettered PDF of any text for the public key alone; " +
      "geocode was an open, unlimited Nominatim proxy; a late video moved an offered or hired applicant back to reviewing.",
    run: async (ctx) => {
      const detail = [];
      const invite = await latestDefinition(ctx, "generate_invite_code");
      const body = invite ? plain(invite.body) : "";
      if (!invite || /md5\s*\(\s*random/i.test(body) || !/IF NEW\.invite_code IS NULL OR current_user IN \('anon', 'authenticated'\) THEN NEW\.invite_code := 'TEAM-' \|\| upper\(encode\(extensions\.gen_random_bytes\((\d+)\), 'hex'\)\);/i.test(body) || Number(body.match(/gen_random_bytes\((\d+)\)/)?.[1] ?? 0) < 12)
        detail.push(`${invite?.rel ?? "supabase/migrations"}: generate_invite_code must make 'TEAM-' + gen_random_bytes(12 or more) for every browser insert`);
      // It tells a browser's insert by current_user, so it runs with the
      // writer's own role, for every invitation (the sixth security review).
      if (invite?.securityDefiner) detail.push(`${invite.alteredIn ?? invite.rel}: generate_invite_code() is SECURITY DEFINER (current_user would be its owner, and a browser's own code kept)`);
      detail.push(...(await triggerProblems(ctx, { name: "generate_team_invite_code", table: "team_invitations", timing: "BEFORE", event: "INSERT", fn: "generate_invite_code" })));
      const strip = (t) => (t ?? "").replace(/\/\/[^\n]*/g, "");
      const pdf = strip(await ctx.read("supabase/functions/generate-blueprint-pdf/index.ts"));
      const handler = pdf.slice(pdf.indexOf("serve(async"));
      const signed = handler.search(/const userId = await signedInUserId\(req\);\s*if \(!userId\) \{/);
      const parsed = handler.search(/JSON\.parse\(bodyText\)|req\.json\(\)/);
      if (signed < 0 || parsed < 0 || signed > parsed || !/guardAuthenticatedAiCall\('generate-blueprint-pdf', userId,/.test(handler))
        detail.push("supabase/functions/generate-blueprint-pdf/index.ts: must refuse a caller who is not signed in, and limit them, before reading the body");
      const geo = strip(await ctx.read("supabase/functions/geocode/index.ts"));
      const geoHandler = geo.slice(geo.indexOf("Deno.serve("));
      const g = geoHandler.search(/const limited = await guardPublicAiCall\(req, "geocode", cors, \d+, 3600\);\s*if \(limited\) return limited;/);
      if (g < 0 || g > geoHandler.search(/fetch\(url/)) detail.push("supabase/functions/geocode/index.ts: the per-connection limit is gone or comes after the lookup");
      const video = strip(await ctx.read("supabase/functions/complete-video-intro/index.ts"));
      const decided = video.search(/\["offered", "hired", "rejected"\]\.includes\(String\(\(appRow as \{ status\?: unknown \}\)\.status\)\)\) \{\s*return jsonResponse\(/);
      if (decided < 0 || decided > video.search(/await recordStepResult\(/)) detail.push("supabase/functions/complete-video-intro/index.ts: a decided application must be refused before the result is recorded");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "product-audit-fixes-hold",
    why:
      "The Phase 7 product audit: builder posts printed every list twice; the fallback post put raw notes on public " +
      "posts (\"Key context: Phone; Medical or dental office\", \"Work mode: onsite\", \"Openings: 1\"); applicants " +
      "were emailed \"submitted, we'll get back to you\" after step 1 of 5; Back from a legal page opened HireFlow's own job.",
    run: async ({ read }) => {
      const detail = [];
      const strip = (t) => (t ?? "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const flow = strip(await read("src/lib/jobFromFlow.ts"));
      const compose = flow.slice(flow.indexOf("function composeDescription"), flow.indexOf("function composeDescription") + 1200);
      if (/What you'll do:|What we're looking for:|jobPost\.responsibilities\.map|jobPost\.requirements\.map/.test(compose)) detail.push("src/lib/jobFromFlow.ts: composeDescription writes the responsibilities or requirements into the description again (they are printed from their own columns)");
      const template = strip(await read("src/lib/avaEngine/templateGenerator.ts"));
      if (/Key context:|Work mode:|`Start: |Openings: /.test(template)) detail.push("src/lib/avaEngine/templateGenerator.ts: the fallback post puts raw notes on the public post again");
      const email = strip(await read("supabase/functions/send-notification-email/index.ts"));
      if (!/application_received: data\.more_steps === "1"/.test(email)) detail.push("send-notification-email: the first-step email no longer says what is left");
      const form = strip(await read("src/pages/ApplicationFormPhase.tsx"));
      if (!/moreSteps: journeyStep\.total > 2,/.test(form)) detail.push("src/pages/ApplicationFormPhase.tsx: the submitted email is no longer told when more steps follow");
      const legal = strip(await read("src/components/LegalPage.tsx"));
      if (/navigate\(-1\) : navigate\("\/"\)\)/.test(legal) || !/window\.location\.assign\("\/"\)/.test(legal)) detail.push("src/components/LegalPage.tsx: Back from a tab with no history goes to the app's \"/\" (HireFlow's own job) again");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "product-audit-round-2-holds",
    why:
      "The second Phase 7 product audit: applicants were told only what they submit is shared while the team reads the " +
      "form as they type; the form warned \"That's been noted\" and showed \"1 thing flagged\" though nobody is told; " +
      "Settings offered email switches for emails that never come; Edit job opened on \"Ava will draft the role\" and said " +
      "the passing score moves people on; the offer letter said Full-time and remote on part-time and on-site jobs; the " +
      "signing certificate claimed ESIGN compliance and pointed at a bare /verify; buttons read \"Start Chat Sim\" and " +
      "\"Start Handle a rush-hour order\"; the applicant sign-up had no autocomplete.",
    run: async ({ read }) => {
      const detail = [];
      const say = (rel, ok, what) => { if (!ok) detail.push(`${rel}: ${what}`); };
      const wizard = (await read("src/components/candidate/CandidateOnboardingWizard.tsx")) ?? "";
      say("CandidateOnboardingWizard.tsx", !/Only what you choose to submit/i.test(wizard), "promises again that only what is submitted is shared");
      const form = (await read("src/pages/ApplicationFormPhase.tsx")) ?? "";
      say("ApplicationFormPhase.tsx", !/flagged during this session/.test(form) && !/saved to your application when you continue/.test(form), "shows the \"flagged\" strip again, or says answers save only when they continue");
      const integrity = (await read("src/hooks/useTestIntegrity.ts")) ?? "";
      say("useTestIntegrity.ts", !/That's been noted/.test(integrity) && !/Looks like you switched tabs/.test(integrity), "warns the applicant on the form for switching away again");
      const legal = (await read("src/content/legal.ts")) ?? "";
      say("src/content/legal.ts", !/You can turn some emails off in Settings/.test(legal) && /Answers save as you type/.test(legal), "tells applicants they can turn emails off in Settings, or no longer says form answers are read as typed");
      const settings = (await read("src/pages/Settings.tsx")) ?? "";
      say("src/pages/Settings.tsx", !/Receive reminders before scheduled interviews/.test(settings) && /\{voiceAccount && \(\s*<>\s*<Separator \/>\s*<div[^>]*>\s*<div[^>]*>\s*<p[^>]*>Phase Updates</.test(settings), "offers interview reminders a business never gets, or Phase Updates to accounts without the voice interview");
      const editor = (await read("src/pages/CreateJob.tsx")) ?? "";
      say("src/pages/CreateJob.tsx", !/Minimum Ava score to auto-advance/.test(editor) && !/moves those who pass on/.test(editor) && /isEditMode \? "Job basics" : "Ava Setup"/.test(editor) && /\{!isEditMode && \(\s*<AvaGuidedSetupFields/.test(editor), "the passing score claims to move people on again, or Edit job shows the setup it never saves");
      const offer = (await read("src/cockpit/components/OfferLetterDialog.tsx")) ?? "";
      say("OfferLetterDialog.tsx", /person\.jobType === "part-time" \? "part" : "full"/.test(offer) && !/The usual terms for a remote role are filled in/.test(offer) && /help=\{remote \? "Twice a month/.test(offer), "full or part time no longer comes from the job, or remote wording shows on on-site jobs");
      // No certificate, audit export or burner in the app or the server claims a law is complied with (the third product audit).
      const claim = /in compliance with the U\.S\.|ESIGN Act|\bUETA\b|legally binding|UETA compliant/;
      const codeLines = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      for (const rel of ["src/components/documents/AuditCertificate.tsx", "src/lib/auditExport.ts", "src/lib/completionCertificate.ts", "src/lib/certificatePDF.ts", "src/lib/pdfSignatureBurner.ts", "supabase/functions/_shared/completionCertificateServer.ts"]) {
        say(rel, !claim.test(codeLines((await read(rel)) ?? "")), "claims ESIGN/UETA compliance or a \"legally binding\" record again");
      }
      const cert = (await read("supabase/functions/_shared/renderFinalPdf.ts")) ?? "";
      say("_shared/renderFinalPdf.ts", !/ESIGN/.test(cert) && !/in compliance with/i.test(cert) && /\$\{VERIFY_ORIGIN\}\/verify\/\$\{cert\.documentCode\}/.test(cert), "the certificate claims legal compliance again, or its check link lost the document's code");
      for (const rel of ["src/components/candidate/NextStepCard.tsx", "src/pages/CandidateApplicationDetail.tsx"]) {
        say(rel, !/`Start \$\{/.test((await read(rel)) ?? ""), "builds \"Start \" + the step's own title again (use startLabelFor)");
      }
      for (const rel of ["src/utils/getApplicationDisplayState.ts", "src/lib/terminology.ts"]) {
        say(rel, !/Start Chat Sim|Take Assessment|Start Sales Pitch/.test((await read(rel)) ?? ""), "jargon button labels are back");
      }
      const auth = (await read("src/pages/CandidateAuth.tsx")) ?? "";
      for (const [id, ac] of [["signin-email", "email"], ["signin-password", "current-password"], ["signup-name", "name"], ["signup-email", "email"], ["signup-password", "new-password"], ["forgot-email", "email"]]) {
        const at = auth.indexOf(`id="${id}"`);
        const props = at < 0 ? "" : auth.slice(at, auth.indexOf("/>", at));
        say("src/pages/CandidateAuth.tsx", new RegExp(`autoComplete="${ac}"`).test(props), `#${id} lost autoComplete="${ac}"`);
      }
      // …and the business's own sign-in and reset fields (the third product audit).
      const bizAuth = (await read("src/pages/Auth.tsx")) ?? "";
      for (const [id, ac] of [["signin-email", "email"], ["signin-password", "current-password"], ["forgot-email", "email"], ["new-password", "new-password"], ["confirm-password", "new-password"], ["signup-email", "email"], ["signup-password", "new-password"]]) {
        const at = bizAuth.indexOf(`id="${id}"`);
        const props = at < 0 ? "" : bizAuth.slice(at, bizAuth.indexOf("/>", at));
        say("src/pages/Auth.tsx", new RegExp(`autoComplete="${ac}"`).test(props), `#${id} lost autoComplete="${ac}"`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "alerts-reach-the-right-people",
    why:
      "A business on a busy day saw applicants stop part-way and never learned why (the second product audit): " +
      "ai_budget_take now tells it once a day, and a new business is told that confirming its email gives the full " +
      "day (the eighth Phase 5 review). document-cleanup's \"told today\" was a card in the admins' bells, which an " +
      "applicant to HireFlow's own job could write to silence the ID-deletion alerts: it is the server's own record " +
      "now (claim_daily_alert, service role only).",
    run: async ({ read, walk }) => {
      const detail = [];
      const noComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
      let take = "";
      let claim = "";
      for (const rel of (await walk("supabase/migrations", [".sql"])).sort()) {
        const text = noComments((await read(rel)) ?? "");
        if (/create (?:or replace )?function public\.ai_budget_take\(/i.test(text)) take = text;
        if (/create (?:or replace )?function public\.claim_daily_alert\(/i.test(text)) claim = text;
      }
      if (!/values \(v_today, 'business-told:' \|\| case when v_new_business then 'new:' else '' end \|\| v_business::text\)/.test(take) || !/if not v_own then/.test(take)) detail.push("ai_budget_take no longer tells the business (once a day for each card, never HireFlow's own) when its AI day is used");
      if (!/set refused = refused \+ 1,\s*calls = greatest\(0, calls - v_take\)\s*where business_id = v_business/.test(take)) detail.push("ai_budget_take: a refused call must give the business its units back (the ninth Phase 5 review)");
      if (!/if v_new_business then[\s\S]*Confirm your email[\s\S]*else[\s\S]*paused until tomorrow/.test(take)) detail.push("ai_budget_take's card no longer tells a new business that confirming its email gives the full day");
      if (!/exception\s+when others then\s+raise log 'ai_budget_take: telling business/.test(take)) detail.push("ai_budget_take's business card must never turn the budget's answer into an error");
      if (!/revoke all on function public\.claim_daily_alert\(text\) from public, anon, authenticated;/.test(claim) || !/grant execute on function public\.claim_daily_alert\(text\) to service_role;/.test(claim)) detail.push("claim_daily_alert must be the server's only");
      if (!/on conflict do nothing;\s*return found;/.test(claim)) detail.push("claim_daily_alert must answer true only the first time a key is claimed that day");
      // No later migration grants it to a browser (the ninth Phase 5 review),
      // with or without "public." or as ON ROUTINE (the sixth security review).
      for (const rel of await grantsToBrowser({ read, walk }, "claim_daily_alert")) detail.push(`${rel}: claim_daily_alert (or every function) granted to a browser role`);
      const cleanup = (await read("supabase/functions/document-cleanup/index.ts")) ?? "";
      if (!/admin\.rpc\("claim_daily_alert"/.test(cleanup) || !/if \(first !== true\) return;/.test(cleanup) || /from\(\s*["'`]notifications["'`]\s*\)\s*\.select/.test(cleanup)) detail.push("document-cleanup must decide \"told today\" with claim_daily_alert and heed its answer, never by reading the admins' bells");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "service-key-signers-use-plain-paths",
    why:
      "applicant-file-url and requested-document-url sign a stored path with the service key, and storage-js puts it " +
      "into the request address as it is: a \"%2e%2e\" part became a parent step and signed a file in another person's " +
      "folder (the sixth security review). Both check isPlainObjectPath before signing, and the database refuses a " +
      "\"%\", backslash or control character in the resume link, the form's file paths and a requested paper's file " +
      "(20261025500000_plain_file_paths.sql).",
    run: async (ctx) => {
      const detail = [];
      const strip = (t) => (t ?? "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const paths = strip(await ctx.read("supabase/functions/applicant-file-url/filePaths.ts"));
      const from = paths.slice(paths.indexOf("export function storagePathFrom"), paths.indexOf("export function listedApplicantFilePaths"));
      if (!/import \{ isPlainObjectPath \} from "\.\.\/_shared\/ownDocumentFile\.ts";/.test(paths) || !/if \(!isPlainObjectPath\(path\)\) return null;\s*return path;\s*\}$/.test(from.trim()))
        detail.push("supabase/functions/applicant-file-url/filePaths.ts: storagePathFrom must refuse a path that is not plain (isPlainObjectPath) before it returns one");
      const own = strip(await ctx.read("supabase/functions/requested-document-url/ownFolder.ts"));
      if (!/import \{ isPlainObjectPath \} from "\.\.\/_shared\/ownDocumentFile\.ts";/.test(own) || !/path\.startsWith\(`\$\{candidateId\}\/`\)[^;]*&& isPlainObjectPath\(path\);/.test(own))
        detail.push("supabase/functions/requested-document-url/ownFolder.ts: inOwnFolder must hold the path to the applicant's folder and to isPlainObjectPath");
      const fn = strip(await ctx.read("supabase/functions/requested-document-url/index.ts"));
      const guard = fn.search(/if \(!inOwnFolder\(request\.file_url, request\.candidate_id\)\) return jsonResponse\(/);
      if (!/import \{ inOwnFolder \} from "\.\/ownFolder\.ts";/.test(fn) || guard < 0 || guard > fn.search(/\.createSignedUrl\(request\.file_url/)) detail.push("supabase/functions/requested-document-url/index.ts: the stored path must pass ownFolder.ts's inOwnFolder before it is signed");
      const shared = strip(await ctx.read("supabase/functions/_shared/ownDocumentFile.ts"));
      if (!/if \(\/\[%\\\\\\u0000-\\u001f\\u007f\]\/\.test\(path\)\) return false;/.test(shared)) detail.push("supabase/functions/_shared/ownDocumentFile.ts: isPlainObjectPath no longer refuses %, backslash and control characters");
      // The database's rules, as Postgres reads them (latestDefinition).
      const NOT_PLAIN = "~ '[%\\\\\\x01-\\x1f\\x7f]'";
      for (const [name, column, count] of [["applications_applicant_write_rules", "NEW.resume_url", 1], ["applications_insert_resume_own_file", "NEW.resume_url", 1], ["document_requests_guard_update", "NEW.file_url", 1]]) {
        const def = await latestDefinition(ctx, name);
        const body = def?.body ?? "";
        if (body.split(`${column} ${NOT_PLAIN}`).length - 1 < count) detail.push(`${def?.rel ?? "supabase/migrations"}: ${name} no longer refuses a "%", backslash or control character in ${column}`);
      }
      const rules = (await latestDefinition(ctx, "applications_applicant_write_rules"))?.body ?? "";
      if (!rules.includes(`(listed.p #>> '{}') ${NOT_PLAIN}`) || !/RAISE EXCEPTION 'file_path_not_plain'/.test(rules) || !["'lax $.uploads.*.url'", "'lax $.uploads.*.fileUrl'", "'lax $.uploads.*.imageUrls[*]'", "'lax $.pages[*]'"].every((p) => rules.includes(p)))
        detail.push("applications_applicant_write_rules no longer refuses a form file path (fileUploads' url, fileUrl, imageUrls, resumeImageUrls) that is not plain");
      return { ok: detail.length === 0, detail };
    },
  },
];
