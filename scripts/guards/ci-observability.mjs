/**
 * Guards for the CI/observability safety nets: .github/workflows/ci.yml,
 * crash-alert capture (src/lib/crashReporter.ts + client-errors), and
 * cookieless visitor counting (public/beacon.js + page-views).
 *
 * None of these existed before this change, so "the bug this prevents" is
 * simply the safety net quietly disappearing later — CI getting weakened to
 * skip a check, a crash source losing its wiring, or the visitor beacon
 * regressing into something that sets an identifier. Each guard was proven
 * to fail against the pre-this-change tree (no .github/workflows/ci.yml,
 * no crashReporter.ts, no beacon.js) and pass against the tree this change
 * ships.
 */

const REQUIRED_CI_STEPS = [
  "npm ci",
  "npm run build",
  "npm run typecheck:ratchet",
  "node scripts/guardrails.mjs",
  "deno_check_functions.mjs",
];

export default [
  {
    id: "ci-workflow-runs-every-required-check",
    why:
      "The whole point of .github/workflows/ci.yml is that a pull request or a push to main " +
      "can't merge without build + typecheck:ratchet + guardrails.mjs + the node/PGlite test " +
      "suite + deno check all passing. If any one of those steps is quietly dropped from the " +
      "workflow (e.g. someone trims it down to 'just build' to make CI faster), that safety net " +
      "is gone even though the file still exists and still looks green.",
    async run({ read }) {
      const workflow = await read(".github/workflows/ci.yml");
      if (workflow == null) {
        return { ok: false, detail: [".github/workflows/ci.yml is missing"] };
      }

      const bad = [];
      if (!/on:\s*\n(?:.*\n)*?\s*pull_request:/m.test(workflow)) {
        bad.push("workflow does not trigger on pull_request");
      }
      if (!/push:\s*\n\s*branches:\s*\[main\]/.test(workflow)) {
        bad.push("workflow does not trigger on push to main");
      }
      for (const step of REQUIRED_CI_STEPS) {
        if (!workflow.includes(step)) {
          bad.push(`workflow is missing required step: ${step}`);
        }
      }
      if (!/denoland\/setup-deno/.test(workflow)) {
        bad.push("workflow does not install Deno (denoland/setup-deno) before the deno check step");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "deno-check-skip-list-has-no-stale-entries",
    why:
      "scripts/deno-check-skip.json is how CI stays green today despite pre-existing edge " +
      "function type errors — but every entry is a promise that the function is still broken " +
      "for the stated reason. An entry that silently outlives the function it names (renamed, " +
      "deleted) would hide that function's real deno-check status from CI forever without " +
      "anyone noticing. scripts/deno_check_functions.mjs itself already fails on this at run " +
      "time; this guard catches it statically too, without needing Deno installed.",
    async run({ read }) {
      const skipFile = await read("scripts/deno-check-skip.json");
      if (skipFile == null) return { ok: false, detail: ["scripts/deno-check-skip.json is missing"] };

      let parsed;
      try {
        parsed = JSON.parse(skipFile);
      } catch (e) {
        return { ok: false, detail: [`scripts/deno-check-skip.json is not valid JSON: ${e.message}`] };
      }
      const skip = parsed.skip ?? {};
      const bad = [];
      for (const [name, reason] of Object.entries(skip)) {
        if (typeof reason !== "string" || reason.trim().length < 10) {
          bad.push(`scripts/deno-check-skip.json: "${name}" has no real reason recorded`);
        }
      }
      const runner = await read("scripts/deno_check_functions.mjs");
      if (runner == null || !runner.includes("staleSkips")) {
        bad.push("scripts/deno_check_functions.mjs must reject skip-list entries for functions that no longer exist");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "crash-reporter-is-wired-into-all-three-sources",
    why:
      "src/lib/crashReporter.ts only captures anything if it's actually installed: " +
      "installCrashReporter() (window 'error'/'unhandledrejection') must run from src/main.tsx, " +
      "and ErrorBoundary.componentDidCatch must call reportError() for a React render-time " +
      "throw. Losing either wiring silently blinds the client-errors pipeline for that whole " +
      "class of crash while the dashboard keeps looking fine (just quiet).",
    async run({ read }) {
      const bad = [];
      const main = await read("src/main.tsx");
      if (main == null || !/installCrashReporter\s*\(/.test(main)) {
        bad.push("src/main.tsx must call installCrashReporter() so window error/unhandledrejection are captured");
      }
      const boundary = await read("src/components/ErrorBoundary.tsx");
      if (boundary == null || !/reportError\s*\(/.test(boundary)) {
        bad.push("src/components/ErrorBoundary.tsx componentDidCatch must call reportError() from crashReporter.ts");
      }
      const reporter = await read("src/lib/crashReporter.ts");
      if (reporter == null) {
        bad.push("src/lib/crashReporter.ts is missing");
      } else {
        if (!/addEventListener\(\s*["']error["']/.test(reporter)) {
          bad.push("crashReporter.ts must listen for window 'error'");
        }
        if (!/addEventListener\(\s*["']unhandledrejection["']/.test(reporter)) {
          bad.push("crashReporter.ts must listen for window 'unhandledrejection'");
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "client-errors-endpoint-is-rate-limited-and-sanitized",
    why:
      "client-errors is a public (verify_jwt = false), unauthenticated write endpoint. Without " +
      "the shared rate limiter it's an open invoice for anyone to spam; without routing every " +
      "field through _shared/telemetry.ts's sanitizer, a crafted payload could write an " +
      "unbounded message/stack or leak PII (an email, a session token embedded in a stack " +
      "trace) straight into a table a 'developer'-role user reads.",
    async run({ read }) {
      const fn = await read("supabase/functions/client-errors/index.ts");
      if (fn == null) return { ok: false, detail: ["supabase/functions/client-errors/index.ts is missing"] };

      const bad = [];
      if (!/await\s+guardPublicAiCall\(/.test(fn)) {
        bad.push("client-errors must call guardPublicAiCall (the shared rate limiter)");
      }
      if (!/sanitizeClientErrorPayload\(/.test(fn)) {
        bad.push("client-errors must sanitize the payload via _shared/telemetry.ts's sanitizeClientErrorPayload");
      }
      if (!/MAX_BODY_BYTES/.test(fn)) {
        bad.push("client-errors must enforce a hard request-body size limit");
      }
      // The body is untrusted; identity must come from the server-verified
      // JWT (auth.getUser()), never a client-supplied userId/userRole field.
      if (/body\.(userId|user_id)\b/.test(fn)) {
        bad.push("client-errors must not trust a client-supplied user id from the request body");
      }
      if (!/auth\.getUser\(\)/.test(fn)) {
        bad.push("client-errors must resolve the caller's identity server-side via auth.getUser()");
      }

      const config = await read("supabase/config.toml");
      if (config == null || !/\[functions\.client-errors\]\s*\nverify_jwt\s*=\s*false/.test(config)) {
        bad.push("supabase/config.toml must set verify_jwt = false for [functions.client-errors]");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "client-error-events-table-is-developer-read-only",
    why:
      "client_error_events/page_view_daily can carry a signed-in user's id and browsing " +
      "behavior. If RLS on either table ever loses its developer-only SELECT policy, or gains " +
      "an INSERT/UPDATE/DELETE policy for anon/authenticated, any signed-in (or signed-out) " +
      "caller could read or forge rows directly via PostgREST, bypassing record_client_error_" +
      "event()/record_page_view() entirely.",
    async run({ read }) {
      const migration = await read("supabase/migrations/20260916165000_client_error_events_and_page_views.sql");
      if (migration == null) {
        return { ok: false, detail: ["supabase/migrations/20260916165000_client_error_events_and_page_views.sql is missing"] };
      }
      const bad = [];
      for (const table of ["client_error_events", "page_view_daily"]) {
        if (!new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i").test(migration)) {
          bad.push(`${table} must have RLS enabled`);
        }
        if (!new RegExp(`ON public\\.${table} FOR SELECT[\\s\\S]{0,200}has_role\\(auth\\.uid\\(\\), 'developer'\\)`).test(migration)) {
          bad.push(`${table} must have a SELECT policy gated on has_role(auth.uid(), 'developer')`);
        }
        if (new RegExp(`ON public\\.${table} FOR (INSERT|UPDATE|DELETE)`).test(migration)) {
          bad.push(`${table} must have NO INSERT/UPDATE/DELETE policy for any client role — writes go only through the SECURITY DEFINER record_* function`);
        }
      }
      for (const fn of ["record_client_error_event", "record_page_view"]) {
        if (!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`).test(migration)) {
          bad.push(`${fn} must be granted to service_role only`);
        }
        if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`).test(migration)) {
          bad.push(`${fn} must revoke PUBLIC/anon/authenticated execute`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "beacon-js-never-sets-an-identifier-and-honors-opt-out",
    why:
      "public/beacon.js is described to users as cookieless and identifier-free. Regressing it " +
      "to set a cookie, write to localStorage, or skip the DNT/GPC check would silently turn a " +
      "privacy-friendly counter into exactly the kind of per-visitor tracking it was built to " +
      "avoid — and nothing about the page-views table's schema (aggregated counts, no per-visit " +
      "rows) would catch that from the server side.",
    async run({ read }) {
      const beacon = await read("public/beacon.js");
      if (beacon == null) return { ok: false, detail: ["public/beacon.js is missing"] };

      const bad = [];
      if (/document\.cookie\s*=/.test(beacon)) {
        bad.push("beacon.js must never set document.cookie");
      }
      if (/localStorage\.setItem|sessionStorage\.setItem/.test(beacon)) {
        bad.push("beacon.js must never write to localStorage/sessionStorage");
      }
      if (!/doNotTrack/.test(beacon)) {
        bad.push("beacon.js must check navigator.doNotTrack (DNT)");
      }
      if (!/globalPrivacyControl/.test(beacon)) {
        bad.push("beacon.js must check navigator.globalPrivacyControl (GPC)");
      }
      if (!/isOptedOut\s*\(\s*\)/.test(beacon) || !/if\s*\(\s*isOptedOut\s*\(\s*\)\s*\)/.test(beacon)) {
        bad.push("beacon.js must actually branch on its own opt-out check before sending");
      }

      const pageViews = await read("supabase/functions/page-views/index.ts");
      if (pageViews == null) {
        bad.push("supabase/functions/page-views/index.ts is missing");
      } else {
        if (!/isBotUserAgent\(/.test(pageViews)) bad.push("page-views must bot-filter via _shared/telemetry.ts's isBotUserAgent");
        if (!/await\s+guardPublicAiCall\(/.test(pageViews)) bad.push("page-views must call the shared rate limiter");
        if (/req\.headers\.get\(["']x-forwarded-for["']\)/.test(pageViews)) {
          bad.push("page-views must not read/store the caller's IP — this endpoint is meant to stay identifier-free");
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "telemetry-route-is-pii-redacted-not-just-capped",
    why:
      "client-errors/index.ts's own header comment claims the payload is 'sanitized " +
      "(message/stack/route capped and PII-redacted...)'. If normalizeRoute() ever goes back to " +
      "capping/stripping-query only, without running the path through redactPii()/a bearer-code " +
      "rule, a live capability embedded in a route segment (e.g. /join-team/TEAM-A1B2C3D4 — " +
      "team_invitations.invite_code, a real bearer code per 20251215054759_*.sql) would be " +
      "stored verbatim in client_error_events.route and become readable by EVERY developer-role " +
      "account, even though RLS on team_invitations deliberately restricts SELECT to the " +
      "inviter only (20260915120000_team_invitations_lockdown.sql). This is a real escalation " +
      "path, not a theoretical one: reproduce with sanitizeClientErrorPayload({message:'x', " +
      "route:'/join-team/TEAM-A1B2C3D4'}).route and it must not contain 'TEAM-A1B2C3D4'.",
    async run({ read }) {
      const telemetry = await read("supabase/functions/_shared/telemetry.ts");
      if (telemetry == null) return { ok: false, detail: ["supabase/functions/_shared/telemetry.ts is missing"] };

      const bad = [];
      // normalizeRoute must itself call the PII/code redactor, not just cap/strip.
      const fnMatch = telemetry.match(/export function normalizeRoute\([\s\S]*?\n\}/);
      const fnBody = fnMatch ? fnMatch[0] : "";
      if (!fnMatch || !/redactPii\(/.test(fnBody)) {
        bad.push("normalizeRoute() must run the path through redactPii() before capping length");
      }
      // A dedicated rule for short PREFIX-CODE bearer capabilities (team
      // invite / document codes), since the general 24-char TOKEN_RE alone
      // does not catch a 13-char code like "TEAM-A1B2C3D4".
      if (!/CODE_RE\s*=/.test(telemetry)) {
        bad.push("telemetry.ts must have a dedicated short bearer-code redaction rule (e.g. CODE_RE for PREFIX-CODE formats like TEAM-XXXXXXXX), not just the 24+ char TOKEN_RE");
      }

      // Behavioral proof: actually run it.
      try {
        const mod = await import(new URL("../../supabase/functions/_shared/telemetry.ts", import.meta.url));
        const result = mod.sanitizeClientErrorPayload({
          message: "TypeError: x is not a function",
          stack: "at foo (bar.js:1:1)",
          route: "/join-team/TEAM-A1B2C3D4",
        });
        if (!result || typeof result.route !== "string" || result.route.includes("TEAM-A1B2C3D4")) {
          bad.push(`sanitizeClientErrorPayload must redact a team-invite code embedded in route; got route=${result && result.route}`);
        }
        const normal = mod.normalizeRoute ? mod.normalizeRoute("/jobs/apply") : null;
        if (normal !== "/jobs/apply") {
          bad.push(`normalizeRoute must leave an ordinary lowercase, dash-separated route segment untouched; got ${normal}`);
        }
      } catch (e) {
        bad.push(`could not import/execute telemetry.ts to verify redaction behavior: ${e.message}`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "beacon-js-does-not-auto-fire-from-inside-the-landing-iframe",
    why:
      "src/pages/Index.tsx renders route '/' as <iframe src=/landing.html>, a separate " +
      "same-origin browsing context. public/landing.html carries its own <script src=/beacon.js " +
      "defer> tag (added alongside this feature), so without a same-origin-iframe guard, " +
      "beacon.js's auto-firing IIFE runs in BOTH the outer document (path '/') and the iframe's " +
      "own document (path '/landing.html') on every single homepage view — double-counting the " +
      "site's single most-trafficked page in page_view_daily and splitting it across two rows " +
      "in the Developer > Visitors 'top pages' list. usePageViewTracking.ts's own dedup logic " +
      "only prevents the OUTER document's SPA-route-change effect from double-reporting; it has " +
      "no visibility into the iframe's independently-executing script.",
    async run({ read }) {
      const beacon = await read("public/beacon.js");
      if (beacon == null) return { ok: false, detail: ["public/beacon.js is missing"] };

      const bad = [];
      if (!/window\.self\s*!==\s*window\.top/.test(beacon)) {
        bad.push("beacon.js must check `window.self !== window.top` to detect running inside an iframe");
      }
      // The guard must actually gate the auto-fire call, not just exist as
      // dead code: the initial track() call must appear AFTER the check.
      const selfTopIdx = beacon.indexOf("window.self !== window.top");
      const autoFireIdx = beacon.lastIndexOf("track(window.location.pathname)");
      if (selfTopIdx === -1 || autoFireIdx === -1 || autoFireIdx < selfTopIdx) {
        bad.push("the window.self !== window.top guard must run BEFORE the automatic initial track(window.location.pathname) call");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
