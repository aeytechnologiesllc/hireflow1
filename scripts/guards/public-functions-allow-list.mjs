/**
 * Every edge function reachable without sign-in is on a reviewed list
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 9).
 *
 * The gateway lets the site's public key through as a bearer token, so a
 * function with verify_jwt = false in supabase/config.toml is open to
 * anyone unless it checks its caller itself. Each one here was read on
 * 2026-10-25 and its check is written in docs/BACKEND-SCHEMA.md, "Reachable
 * without sign-in". A new public function: add it there and here, with what
 * stops it being misused.
 */

const PUBLIC_FUNCTIONS = new Set([
  "ai-chat-interview", // practice turn: signed-in applicant's own application only
  "ai-chat-simulation", // same
  "ai-sales-simulation", // same
  "ai-generate-job-content", // requires a signed-in user
  "ai-generate-workflow", // requires a signed-in user
  "trigger-ava-analysis", // resolves the caller; applicant calls limited
  "autopilot-batch", // resolves the caller
  "ava-voice-session", // resolves the caller; platform_admins only
  "ava-voice-tools", // same
  "delete-account", // resolves the caller; asks for the password
  "deduct-voice-minutes", // resolves the caller
  "get-subscription", // resolves the caller
  "verify-document", // public check by design; rate-limited
  "client-errors", // crash reports; size caps, limits, sanitised
  "page-views", // page counter; size caps, limits, sanitised
  "geolocate-ip", // connection check; rate-limited
  "sitemap", // published jobs only
  "send-push-notification", // database trigger; one stored row, once
  "interview-reminders", // pg_cron; Vault secret
  "document-cleanup", // pg_cron; Vault secret
  "check-email-exists", // retired: 410
  "elevenlabs-tts", // retired: 410
]);

export default [
  {
    id: "public-functions-allow-list",
    why:
      "A function in supabase/config.toml has verify_jwt = false but is not on the reviewed list in " +
      "scripts/guards/public-functions-allow-list.mjs. Anyone holding the site's public key can call " +
      "it. Make it check its caller, then add it to the list and to docs/BACKEND-SCHEMA.md " +
      "(\"Reachable without sign-in\") with what limits it.",
    run: async ({ read }) => {
      const config = (await read("supabase/config.toml")) ?? "";
      const detail = [];
      for (const m of config.matchAll(/\[functions\.([a-z0-9-]+)\]([^[]*)/g)) {
        if (/verify_jwt\s*=\s*false/.test(m[2]) && !PUBLIC_FUNCTIONS.has(m[1])) detail.push(`${m[1]} is public and not reviewed`);
      }
      const doc = (await read("docs/BACKEND-SCHEMA.md")) ?? "";
      for (const fn of PUBLIC_FUNCTIONS) {
        if (!doc.includes(`\`${fn}\``)) detail.push(`${fn} is missing from docs/BACKEND-SCHEMA.md, "Reachable without sign-in"`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
