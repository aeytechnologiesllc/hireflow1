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
      const sql = (await read("supabase/migrations/20261025100000_business_email_check.sql")) ?? "";
      if (!/create trigger jobs_publish_needs_email_check\s+before insert or update of status on public\.jobs/i.test(sql)) {
        detail.push("20261025100000_business_email_check.sql: the publish trigger is missing or no longer covers insert and status updates");
      }
      if (!/hint = 'email_not_verified'/.test(sql)) detail.push("20261025100000_business_email_check.sql: the refusal lost its HINT email_not_verified");
      if (!/grant execute on function public\.issue_business_email_code\(uuid\) to service_role;/.test(sql) || /issue_business_email_code\(uuid\) to authenticated/.test(sql)) {
        detail.push("20261025100000_business_email_check.sql: only the system may make a code");
      }
      for (const rel of await walk("supabase/migrations", [".sql"])) {
        const name = rel.split("/").pop() ?? "";
        if (name <= "20261025100000_business_email_check.sql") continue;
        const later = (await read(rel)) ?? "";
        if (/drop\s+(trigger|function)\s+(if\s+exists\s+)?(public\.)?(jobs_publish_needs_email_check|business_email_verified)/i.test(later)) {
          detail.push(`${name}: drops the business email check`);
        }
      }
      for (const page of ["src/pages/CreateJob.tsx", "src/pages/AvaCreateJob.tsx"]) {
        const src = (await read(page)) ?? "";
        if (!/isEmailNotVerifiedError\(/.test(src) || !/<EmailCheckDialog/.test(src)) detail.push(`${page}: no longer opens the code screen when the publish is refused`);
      }
      const fn = (await read("supabase/functions/send-notification-email/index.ts")) ?? "";
      if (!/if \(type === BUSINESS_EMAIL_CODE_TYPE\) \{[\s\S]*?if \(caller\.kind !== "user"\)[\s\S]*?getUserById\(caller\.id\)/.test(fn)) {
        detail.push("send-notification-email: the code must go to the signed-in caller's own sign-in address");
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
