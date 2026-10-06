/**
 * Google Jobs is removed (owner, 2026-10-05: "remove google jobs").
 *
 * It was the JobPosting JSON-LD on every job page (client and prerender), the
 * Google Indexing API pings on publish / edit / close / delete (the
 * google-indexing edge function and two helpers), a "Google for Jobs" chip and
 * a country nag on the Jobs page, an "Eligible for Google Jobs" card after
 * publishing, and two publish checks that refused a role with no country "for
 * Google Jobs" — which also blocked saving edits to his own worldwide remote
 * role. The job page itself, its title and link-preview tags, the sitemap and
 * the job-board feeds (jobs.xml / adzuna.xml / jooble.xml) are unaffected.
 *
 * Left in place on purpose: the google_indexing_notifications table (its rows
 * are history) and the GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON secret (deleting a
 * key cannot be undone); nothing reads either.
 */

/** Text with comments removed, so a note about the removal never trips the check. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export default [
  {
    id: "google-jobs-stays-removed",
    why:
      "Google Jobs was removed on 2026-10-05 at the owner's request. Its files must stay deleted, " +
      "no page may emit JobPosting structured data, nothing may ping the Indexing API, and no screen " +
      "or publish check may mention Google Jobs or demand a country for it.",
    run: async ({ read, sources }) => {
      const bad = [];
      for (const gone of [
        "supabase/functions/google-indexing/index.ts",
        "supabase/functions/_shared/googleIndexing.ts",
        "supabase/functions/_shared/deletedJobTeamMemberAccess.ts",
        "src/lib/googleIndexing.ts",
        "src/components/seo/JobPostingJsonLd.tsx",
      ]) {
        if ((await read(gone)) != null) bad.push(`${gone} exists again`);
      }
      const config = (await read("supabase/config.toml")) ?? "";
      if (/\[functions\.google-indexing\]/.test(config)) bad.push("supabase/config.toml lists google-indexing again");

      for (const { rel, text } of await sources([".ts", ".tsx", ".mjs", ".js"])) {
        const body = code(text);
        if (/application\/ld\+json/.test(body) && /JobPosting/.test(body)) {
          bad.push(`${rel} emits JobPosting structured data`);
        }
        if (/indexing\.googleapis\.com|notifyGoogle(Job)?Indexing|google-indexing/.test(body)) {
          bad.push(`${rel} pings the Google Indexing API`);
        }
        if (rel.startsWith("src/") && /Google (for )?Jobs/.test(body)) {
          bad.push(`${rel} mentions Google Jobs on screen or in a message`);
        }
        // The Share Kit kept saying "Google has already been told" after the
        // pings were removed: no screen may claim they still happen.
        if (rel.startsWith("src/") && /Google (has|was|is) (already )?(been )?(told|notified|pinged)/i.test(body)) {
          bad.push(`${rel} claims Google is told about a job`);
        }
        if (/so Google can place the job|For Google Jobs, add/.test(body)) {
          bad.push(`${rel} blocks publishing for Google Jobs`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
