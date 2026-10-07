/**
 * Every edge function names the EXACT release of each remote module it
 * imports, and the Supabase client is one agreed release.
 *
 * What happened (2026-10-07, 12:40 UTC): a go-live of send-notification-email
 * failed with "Failed to bundle the function (reason: Module not found
 * https://esm.sh/@supabase/auth-js@2.117.3/denonext/auth-js.mjs)". The
 * function imported "https://esm.sh/@supabase/supabase-js@2", which follows
 * the newest 2.x release. 2.117.3 had been published six minutes earlier and
 * esm.sh could not serve one of its parts, so nothing importing "@2" could be
 * deployed at all: an urgent fix on a live hiring site would have been
 * blocked by someone else's release. Nineteen more functions imported the
 * same floating "@2".
 *
 * The second problem with "@2" is quieter: every deploy moved that function
 * to whatever was newest that minute, so code checked locally against one
 * release (deno.lock mapped "@2" to 2.112.3) ran in production on another.
 *
 * So:
 *  - every remote import in supabase/functions (esm.sh, deno.land, npm:,
 *    jsr:) carries a full x.y.z version;
 *  - the Supabase client is SUPABASE_JS, below: the release production was
 *    running when this was written. To move to a newer one, change the
 *    constant, replace the version in every import that carries the old one,
 *    run `node scripts/deno_check_functions.mjs`, and commit deno.lock with
 *    it. A function picks the new release up at its next deploy, not before;
 *  - eleven functions were already pinned to older releases (2.45.0, 2.49.1)
 *    and stay there: moving one changes the library under code nobody is
 *    otherwise touching, so it is done with that function's own tests, one
 *    function at a time. They are named below; a new function cannot join
 *    them.
 */

/** The Supabase client release edge functions import. */
const SUPABASE_JS = "2.117.2";

/** Functions still on an older exact release, and which. */
const OLDER_SUPABASE_JS = {
  "supabase/functions/ai-analyze-portfolio/index.ts": "2.45.0",
  "supabase/functions/ai-chat-interview/index.ts": "2.45.0",
  "supabase/functions/ava-voice-session/index.ts": "2.45.0",
  "supabase/functions/ava-voice-tools/index.ts": "2.45.0",
  "supabase/functions/client-errors/index.ts": "2.45.0",
  "supabase/functions/get-subscription/index.ts": "2.45.0",
  "supabase/functions/page-views/index.ts": "2.45.0",
  "supabase/functions/autopilot-batch/index.ts": "2.49.1",
  "supabase/functions/connection-test/index.ts": "2.49.1",
  "supabase/functions/submit-typing-test/index.ts": "2.49.1",
  "supabase/functions/trigger-ava-analysis/index.ts": "2.49.1",
};

const EXACT = /^\d+\.\d+\.\d+$/;

/** Every module specifier a file imports, re-exports or loads on demand. */
function specifiers(text) {
  const out = [];
  const patterns = [
    /\bfrom\s*["']([^"'\n]+)["']/g,
    /\bimport\s*["']([^"'\n]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  ];
  for (const pattern of patterns) for (const m of text.matchAll(pattern)) out.push(m[1]);
  return out;
}

/** A remote specifier's package and version, or why it cannot be read. */
function remoteVersion(spec) {
  let m = /^https:\/\/esm\.sh\/((?:@[^/@]+\/)?[^/@?]+)(?:@([^/?]+))?/.exec(spec);
  if (m) return { pkg: m[1], version: m[2] ?? null };
  m = /^https:\/\/deno\.land\/(std|x\/[^/@]+)(?:@([^/?]+))?/.exec(spec);
  if (m) return { pkg: `deno.land/${m[1]}`, version: m[2] ?? null };
  m = /^(?:npm|jsr):((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?/.exec(spec);
  if (m) return { pkg: m[1], version: m[2] ?? null };
  return null;
}

export default [
  {
    id: "edge-functions-pin-their-remote-imports",
    why:
      "An edge function that imports a remote module without a full x.y.z version (\"@2\", \"@latest\", no version) " +
      "is rebuilt on whatever was published that minute: on 2026-10-07 a six-minute-old supabase-js release that " +
      "esm.sh could not serve blocked a deploy outright. Name the exact release, and for the Supabase client use the " +
      "one in scripts/guards/edge-function-pinned-imports.mjs.",
    async run({ read, walk }) {
      const bad = [];
      const files = await walk("supabase/functions", [".ts"]);
      if (files.length === 0) return { ok: false, detail: ["no files found under supabase/functions"] };
      let clientImports = 0;
      for (const rel of files) {
        const text = (await read(rel)) ?? "";
        for (const spec of specifiers(text)) {
          if (!/^(https?:|npm:|jsr:)/.test(spec)) continue;
          const found = remoteVersion(spec);
          if (!found) {
            bad.push(`${rel}: imports ${spec}, from a place this guard cannot read a version in. Pin it and teach the guard.`);
            continue;
          }
          if (!found.version || !EXACT.test(found.version)) {
            bad.push(`${rel}: imports ${found.pkg}${found.version ? `@${found.version}` : ""} without an exact x.y.z version (${spec})`);
            continue;
          }
          if (found.pkg === "@supabase/supabase-js") {
            clientImports += 1;
            const allowed = OLDER_SUPABASE_JS[rel] ?? SUPABASE_JS;
            if (found.version !== allowed) {
              bad.push(
                `${rel}: imports @supabase/supabase-js@${found.version}; it should be @${allowed}` +
                  (OLDER_SUPABASE_JS[rel] ? " (its recorded older release: move it on purpose, with its own tests, and update this guard)" : " (the one release every function uses)"),
              );
            }
          }
        }
      }
      // The list of older pins must stay true, or it quietly permits nothing or anything.
      for (const [rel, version] of Object.entries(OLDER_SUPABASE_JS)) {
        const text = await read(rel);
        if (text == null) bad.push(`${rel} is named as still on supabase-js@${version} but no longer exists: take it off the list`);
        else if (!text.includes(`@supabase/supabase-js@${version}"`) && !text.includes(`@supabase/supabase-js@${version}'`)) {
          bad.push(`${rel} is named as still on supabase-js@${version} but does not import it: take it off the list`);
        }
      }
      if (clientImports === 0) bad.push("found no import of @supabase/supabase-js in any edge function: this guard is reading nothing");
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
