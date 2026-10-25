/**
 * Phase 2 of docs/LAUNCH-PLAN.md, locked (2026-10-25): what another business
 * sees, and what the owner counts.
 *
 *   - landing-has-beacon: the front page counts its visits and passes the
 *     visitor's source on to the sign-up links.
 *   - signup-carries-utm: a new account keeps where it came from.
 *   - publish-requires-verified-email: a business confirms its email before
 *     its first job goes live, in the database, and both publish pages open
 *     the code screen when it has not.
 *   - no-player-wording-outside-home-business: "player" (the owner's own
 *     gaming customers) appears in code only in the files that pick the word
 *     per job or belong to the owner's own pages.
 *   - showcase-tables-not-read: /candidate/continue's phone lookup (the old
 *     prototype's tables, no sign-in) runs only on the prototype schema.
 *   - preview-pages-noindex: the founder's review pages stay out of search.
 */

/** Code with comments removed, so a comment may still say "player". */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/**
 * The only files whose code may say "player", and why. Anything else that
 * says it can reach another business's applicants or hiring team.
 */
const PLAYER_ALLOWED = [
  ["supabase/functions/_shared/ageWording.ts", "a pattern for the age-preference wording \"young team player\", dropped from job posts; never a word shown to anyone"],
  ["src/pages/Index.tsx", "the owner's own /careers page"],
  ["src/components/careers/", "the owner's own careers page"],
  ["src/dev-preview/", "fixtures of the owner's own job"],
  ["src/lib/interviewGuide.ts", "the owner's home plan; withoutHomeSpecifics cleans it for anyone else"],
  ["supabase/functions/_shared/interviewGuide.ts", "the same, server copy"],
  ["supabase/functions/_shared/counterpart.ts", "picks the word per job"],
  ["src/cockpit/lib/assessmentRecord.ts", "picks the word per job (counterpartOf)"],
  ["src/cockpit/components/AssessmentRecordSheet.tsx", "shows the word the record picked"],
  ["supabase/functions/ai-chat-simulation/prompts.ts", "every reviewer text goes through withCounterpart"],
  ["supabase/functions/_shared/reviewText.ts", "neutralises a PLAYER label typed inside a line"],
  ["supabase/functions/_shared/autopilot.ts", "recognises a \"player support\" job title"],
  ["supabase/functions/ai-analyze/index.ts", "\"team player\", the everyday phrase"],
  ["src/content/scenarioPacks/packs.ts", "the gaming pack's word (no-gaming-nouns-in-generic-packs keeps it to that pack)"],
  ["supabase/functions/_shared/scenarioPacks.ts", "the same, server copy"],
  ["src/lib/avaEngine/playbook.ts", "recognises a \"player support\" job title"],
  ["src/lib/avaEngine/customerService.ts", "recognises a gaming business from its words"],
  ["supabase/functions/generate-flow/index.ts", "tells the model never to say player unless it is the pack's word"],
  ["supabase/functions/ai-generate-job-content/index.ts", "tells the model never to say players unless it is a game company"],
];

export default [
  {
    id: "showcase-tables-not-read",
    why:
      "/candidate/continue looked applications up by phone number in the old prototype's tables " +
      "(src/lib/showcaseSchema.ts), with no sign-in. Live, those tables do not exist (it always " +
      "failed), and if they did it would list anyone's applications. On the real schema the page " +
      "sends the applicant to sign in; the lookup runs only when useSchemaMode says showcase.",
    run: async ({ read, walk }) => {
      const detail = [];
      const page = (await read("src/pages/CandidateContinue.tsx")) ?? "";
      if (!/if \(mode !== "showcase"\) return <Navigate to=\{SIGN_IN_TO_APPLICATIONS\} replace \/>;/.test(page)) {
        detail.push("src/pages/CandidateContinue.tsx: the phone lookup must run only on the prototype schema");
      }
      for (const rel of await walk("src", [".ts", ".tsx"])) {
        if (rel === "src/lib/showcaseApply.ts" || rel === "src/pages/CandidateContinue.tsx") continue;
        const text = code((await read(rel)) ?? "");
        if (/fetchApplicationsByPhone\(/.test(text)) detail.push(`${rel}: calls fetchApplicationsByPhone (no sign-in, prototype tables)`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "preview-pages-noindex",
    why:
      "/ava-preview and /flow-lab are the founder's review pages, reachable in production on purpose " +
      "(opened from a phone). They must carry X-Robots-Tag: noindex in vercel.json so search engines " +
      "never list a page of canned data as HireFlow.",
    run: async ({ read }) => {
      const detail = [];
      let v = null;
      try {
        v = JSON.parse((await read("vercel.json")) ?? "{}");
      } catch {
        return { ok: false, detail: ["vercel.json does not parse"] };
      }
      for (const path of ["/ava-preview", "/flow-lab"]) {
        const block = (v.headers ?? []).find((b) => b.source === path);
        const tag = block?.headers?.find((h) => h.key === "X-Robots-Tag")?.value ?? "";
        if (!/noindex/.test(tag)) detail.push(`vercel.json: ${path} has no X-Robots-Tag noindex`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "landing-has-beacon",
    why:
      "public/landing.html must load /beacon.js (the front page's visit count) and /carry-source.js " +
      "(the visitor's campaign tags and referring site onto the sign-up links). Without them the owner " +
      "cannot tell which channel brings businesses (docs/ANALYTICS.md).",
    run: async ({ read }) => {
      const html = (await read("public/landing.html")) ?? "";
      const carry = (await read("public/carry-source.js")) ?? "";
      const detail = [];
      if (!/<script src="\/beacon\.js" defer><\/script>/.test(html)) detail.push("public/landing.html: no <script src=\"/beacon.js\" defer>");
      if (!/<script src="\/carry-source\.js" defer><\/script>/.test(html)) detail.push("public/landing.html: no <script src=\"/carry-source.js\" defer>");
      if (!/staff\.hireflownow\.com\/auth/.test(carry) || !/utm_source/.test(carry)) detail.push("public/carry-source.js: no longer carries utm_* onto the staff sign-up links");
      if (!/globalPrivacyControl/.test(carry)) detail.push("public/carry-source.js: must do nothing under Do Not Track / Global Privacy Control");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "signup-carries-utm",
    why:
      "A new account keeps where it came from: useAuth's signUp stores signupSourceFrom(...) as " +
      "signup_source in the account's metadata, and admin_growth reads it (src/lib/signupSource.ts).",
    run: async ({ read }) => {
      const auth = (await read("src/hooks/useAuth.tsx")) ?? "";
      const lib = (await read("src/lib/signupSource.ts")) ?? "";
      const detail = [];
      if (!/signupSourceFrom\(/.test(auth) || !/signup_source/.test(auth)) detail.push("src/hooks/useAuth.tsx: signUp no longer stores signup_source");
      if (!/export function signupSourceFrom/.test(lib)) detail.push("src/lib/signupSource.ts: signupSourceFrom is gone");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "publish-requires-verified-email",
    why:
      "A business confirms its email (a 6-digit code) before its first job goes live. The rule is the " +
      "jobs_publish_needs_email_check trigger (20261025100000_business_email_check.sql); both publish " +
      "pages (CreateJob, AvaCreateJob) must open the code screen on its refusal; the code goes only to the " +
      "signed-in caller (send-notification-email, business_email_code).",
    run: async ({ read, walk }) => {
      const detail = [];
      // Each piece is checked in its LATEST definition, so a later migration
      // cannot quietly weaken it with a `create or replace` (second Pass C
      // review, 2026-10-25), and its trigger cannot be dropped.
      // Each piece is read from its own body (create ... $$ ... $$;), so a later
      // migration that weakens it cannot pass on words found elsewhere in the
      // file, and a redefinition without "public." is seen too (third Pass C
      // review). Grants are read from the file that holds the latest body.
      const files = (await walk("supabase/migrations", [".sql"])).sort();
      const latest = new Map();
      // Bodies between their own dollar-quote tags ($$ or $function$), with
      // "--" and "/* */" comments taken out, so words in a comment or in the
      // next function never count (fourth and fifth Pass C reviews). Names may
      // be quoted, pg_dump style ("public"."fn").
      // One left-to-right pass, so "/* -- */" and "-- /*" each end where they should (sixth review).
      const noComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, " ");
      const WATCHED = /^(jobs_publish_needs_email_check|business_email_verified|my_business_email_verified|profiles_email_verified_from_server|issue_business_email_code|verify_business_email_code|inbox_key|is_platform_admin)$/i;
      const header = /create\s+(?:or\s+replace\s+)?function\s+(?:"?(?:public|private)"?\s*\.\s*)?"?(\w+)"?\s*\(/gi;
      const trigger = /create\s+(?:or\s+replace\s+)?trigger\s+"?(jobs_publish_needs_email_check|profiles_email_verified_from_server)"?\s+([\s\S]*?)\s+execute\s/gi;
      const latestTrigger = new Map();
      for (const rel of files) {
        const text = noComments((await read(rel)) ?? "");
        for (const h of text.matchAll(header)) {
          const name = h[1].toLowerCase();
          const rest = text.slice(h.index);
          const body = /^[\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\1/i.exec(rest);
          const nextHeader = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
          if (!body || (nextHeader >= 0 && body.index + body[0].length > nextHeader + 1)) {
            if (WATCHED.test(name)) detail.push(`${rel}: ${name} is defined without a $$ body this guard can read (write it as $$ ... $$)`);
            continue;
          }
          latest.set(name, { rel, text: body[2], file: text });
        }
        for (const t of text.matchAll(trigger)) latestTrigger.set(t[1].toLowerCase(), { rel, events: t[2].replace(/\s+/g, " ").toLowerCase() });
        // A grant anywhere, in any later file, that lets anyone but the system make a code.
        if (/grant\s+(?:execute|all(?:\s+privileges)?)\s+on\s+(?:function\s+[\w."]*?\bissue_business_email_code\b|all\s+functions\s+in\s+schema\s+"?public"?)[^;]*?\bto\s+[^;]*?"?\b(?:authenticated|anon|public)\b"?/i.test(text)) {
          detail.push(`${rel}: lets someone other than the system make a code (a grant on issue_business_email_code or on all functions)`);
        }
        if (/\bdisable\s+trigger\s+(?:all|"?(?:jobs_publish_needs_email_check|profiles_email_verified_from_server)"?)\b/i.test(text) || /\bsession_replication_role\b/i.test(text)) {
          detail.push(`${rel}: switches off a trigger of the business email check`);
        }
        if (/drop\s+trigger\s+(?:if\s+exists\s+)?"?(jobs_publish_needs_email_check|profiles_email_verified_from_server)"?/i.test(text) &&
            !/create\s+(?:or\s+replace\s+)?trigger\s+"?(jobs_publish_needs_email_check|profiles_email_verified_from_server)"?/i.test(text)) {
          detail.push(`${rel}: drops a trigger of the business email check without creating it again`);
        }
        if (/drop\s+function\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?(jobs_publish_needs_email_check|business_email_verified|profiles_email_verified_from_server|issue_business_email_code|verify_business_email_code)"?/i.test(text)) {
          detail.push(`${rel}: drops a function of the business email check`);
        }
      }
      const publishTrigger = latestTrigger.get("jobs_publish_needs_email_check");
      // AFTER, on every insert and update: a column trigger "of status" never
      // fires when another trigger sets status (sixth review), and a BEFORE
      // trigger can be overruled by one that runs after it.
      if (!publishTrigger || !/^after insert or update on public\.jobs for each row$/.test(publishTrigger.events)) {
        detail.push(`${publishTrigger?.rel ?? "migrations"}: the publish trigger must be "after insert or update on public.jobs for each row" (found: ${publishTrigger?.events ?? "none"})`);
      }
      const stampTrigger = latestTrigger.get("profiles_email_verified_from_server");
      if (!stampTrigger || !/^before insert or update on public\.profiles for each row$/.test(stampTrigger.events)) {
        detail.push(`${stampTrigger?.rel ?? "migrations"}: the trigger keeping the stamp the server's must be "before insert or update on public.profiles for each row"`);
      }
      const admin = latest.get("is_platform_admin");
      if (admin && !(/platform_admins/.test(admin.text) && /auth\.uid\(\)/.test(admin.text))) {
        detail.push(`${admin.rel}: is_platform_admin no longer asks platform_admins about auth.uid() (every publish goes through it)`);
      }
      const test = (await read("scripts/business_email_check.pglite.test.mjs")) ?? "";
      if (!/const NOT_THE_CHECK = \{/.test(test) || !/name >= "20261025100000_business_email_check\.sql"/.test(test) || !/\.filter\(\(name\) => !\(name in NOT_THE_CHECK\)\)/.test(test)) {
        detail.push("scripts/business_email_check.pglite.test.mjs: must replay EVERY later migration except the ones it lists with a reason (NOT_THE_CHECK), the real lock behind this guard");
      }
      const must = [
        ["jobs_publish_needs_email_check", /if not public\.business_email_verified\(new\.employer_id\) then/, "refuses a publish for a business that has not confirmed"],
        ["jobs_publish_needs_email_check", /hint = 'email_not_verified'/, "keeps its HINT email_not_verified"],
        ["business_email_verified", /lower\(p\.email_verified_for\) = lower\(u\.email\)/, "passes only while the confirmed address is still the sign-in address"],
        ["profiles_email_verified_from_server", /new\.email_verified_at := old\.email_verified_at/, "keeps email_verified_at the server's"],
        ["profiles_email_verified_from_server", /new\.email_verified_for := old\.email_verified_for/, "keeps email_verified_for the server's"],
        ["issue_business_email_code", /'not_a_business'/, "gives codes to business accounts only"],
        ["issue_business_email_code", /private\.inbox_key\(/, "limits each inbox, however it is written"],
        ["issue_business_email_code", /business_email_code:/, "serialises one account's requests"],
        ["issue_business_email_code", /business_email_inbox:/, "serialises one inbox's requests"],
        ["issue_business_email_code", /business_email_all/, "serialises the overall count"],
        ["business_email_verified", /lower\(coalesce\(i\.identity_data ->> 'email', ''\)\) = lower\(u\.email\)/, "passes a Google sign-in only while its Google address is the sign-in address"],
        ["verify_business_email_code", /'address_changed'/, "takes a code only for the address it went to"],
      ];
      for (const [fn, pattern, what] of must) {
        const def = latest.get(fn);
        if (!def) detail.push(`no migration defines ${fn}`);
        else if (!pattern.test(def.text)) detail.push(`${def.rel}: ${fn} no longer ${what}`);
      }
      const issueDef = latest.get("issue_business_email_code");
      if (issueDef && !/'email', v_email/.test(issueDef.text)) detail.push(`${issueDef.rel}: issue_business_email_code no longer says which address the code is for`);
      if (issueDef && !/grant\s+execute\s+on\s+function\s+public\.issue_business_email_code\(uuid\)\s+to\s+service_role;/i.test(issueDef.file)) {
        detail.push(`${issueDef.rel}: only the system may make a code`);
      }
      // The inbox and overall locks only serialise anything if they are taken
      // before the counts are read and the code is written.
      if (issueDef) {
        const at = (re) => issueDef.text.search(re);
        const locks = Math.max(at(/business_email_inbox:/), at(/business_email_all/));
        const reads = [at(/from\s+private\.business_email_code_sends/i), at(/insert\s+into\s+private\.business_email_codes/i)].filter((i) => i >= 0);
        if (locks < 0 || reads.length < 2 || reads.some((i) => i < locks)) detail.push(`${issueDef.rel}: issue_business_email_code must take the inbox and overall locks before it counts sends or writes the code`);
      }
      for (const page of ["src/pages/CreateJob.tsx", "src/pages/AvaCreateJob.tsx"]) {
        const src = (await read(page)) ?? "";
        if (!/isEmailNotVerifiedError\(/.test(src) || !/<EmailCheckDialog/.test(src)) detail.push(`${page}: no longer opens the code screen when the publish is refused`);
      }
      const fn = (await read("supabase/functions/send-notification-email/index.ts")) ?? "";
      const branch = /if \(type === BUSINESS_EMAIL_CODE_TYPE\) \{([\s\S]*?)\n    \/\/ "Email me the link"/.exec(fn)?.[1] ?? "";
      if (!/if \(caller\.kind !== "user"\)/.test(branch) || !/checkRateLimit\("business-email-code-ip"/.test(branch) || !/const to = issued\.email;/.test(branch) || /getUserById/.test(branch)) {
        detail.push("send-notification-email: the code goes to the signed-in caller only, at the address the database recorded it for (never looked up again), with a per-IP limit");
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "no-player-wording-outside-home-business",
    why:
      "\"player\" is the owner's own gaming customers. Any other business's applicants and hiring team " +
      "must read \"customer\" (or the job's own word: _shared/counterpart.ts). Only the files in " +
      "PLAYER_ALLOWED in this guard may say it in code; comments are fine.",
    run: async ({ read, walk }) => {
      const detail = [];
      const files = [...(await walk("src", [".ts", ".tsx"])), ...(await walk("supabase/functions", [".ts"]))];
      for (const rel of files) {
        if (PLAYER_ALLOWED.some(([allowed]) => rel === allowed || (allowed.endsWith("/") && rel.startsWith(allowed)))) continue;
        const text = code((await read(rel)) ?? "");
        const m = /\bplayers?\b/i.exec(text);
        if (m) {
          const line = text.slice(0, m.index).split("\n").length;
          detail.push(`${rel}:${line}: says "${m[0]}" (use the job's word, or add the file to PLAYER_ALLOWED with the reason)`);
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
