/**
 * C1: a remote job with a valid country but no city — exactly what "Remote -
 * United States" geocodes to, since geocode/index.ts never invents a city for
 * a country-only query — was silently dropped from every distribution
 * channel. The quality gates in api/job-feed.mjs (shared by /jobs.xml,
 * /jooble.xml, /adzuna.xml) and supabase/functions/sitemap/index.ts
 * (/sitemap.xml) both required a real city with no exception for is_remote,
 * so a fully-remote job never reached a single aggregator or Google's
 * sitemap-driven discovery, even though its own page already carried correct
 * TELECOMMUTE JobPosting markup (api/job-prerender.mjs was never broken).
 *
 * Fixed by letting is_remote stand in for a missing city in both gates (the
 * country requirement stays unconditional, and an on-site job with no city is
 * still excluded), teaching sitemap/index.ts's SELECT to actually fetch
 * is_remote, and emitting each feed's own remote convention: Indeed's
 * documented <remotetype> tag in jobs.xml, and a non-empty "Remote" fallback
 * for Jooble's free-text <region> and Adzuna's mandatory <location>.
 */
export default [
  {
    id: "job-feed-city-gate-exempts-remote",
    why:
      "api/job-feed.mjs's loadFeedJobs() quality gate must accept a job with no city " +
      "when it is explicitly is_remote — a bare `if (!city) return false` with no " +
      "is_remote exception silently drops every fully-remote job from jobs.xml, " +
      "jooble.xml and adzuna.xml (all three share this one loader). The country " +
      "requirement must stay unconditional — a remote job still needs a real country.",
    run: async ({ read }) => {
      const src = (await read("api/job-feed.mjs")) ?? "";
      const bad = [];
      if (!/if\s*\(\s*!city\s*&&\s*!job\.is_remote\s*\)\s*return false;/.test(src)) {
        bad.push("api/job-feed.mjs loadFeedJobs() no longer exempts is_remote jobs from the city requirement");
      }
      if (!/if\s*\(\s*!\(job\.location_country_code\s*\|\|\s*job\.location_country\)\s*\)\s*return false;/.test(src)) {
        bad.push("api/job-feed.mjs loadFeedJobs() no longer requires a country on every job (remote included)");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "job-feed-xml-emits-remotetype",
    why:
      "Indeed's own XML feed spec (docs.indeed.com/job-sync-xml/xml-feed) reads " +
      "<remotetype>, not the ad-hoc <isremote>/<remote> tags this feed also emits — " +
      "dropping it silently degrades a remote listing back to unclassified on the one " +
      "aggregator most likely to actually surface it.",
    run: async ({ read }) => {
      const src = (await read("api/job-feed.mjs")) ?? "";
      if (!/<remotetype>\$\{cdata\("Fully remote"\)\}<\/remotetype>/.test(src)) {
        return { ok: false, detail: ["api/job-feed.mjs jobs.xml handler no longer emits <remotetype> for a remote job"] };
      }
      return { ok: true };
    },
  },
  {
    id: "jooble-and-adzuna-remote-location-not-empty",
    why:
      "Jooble's <region> and Adzuna's <location> are both free text with no dedicated " +
      "remote flag, and <location> is a MANDATORY Adzuna field — a remote job with no " +
      "city must still send a non-empty value or Adzuna can reject the listing outright.",
    run: async ({ read }) => {
      const bad = [];
      const jooble = (await read("api/job-feed-jooble.mjs")) ?? "";
      if (!/e\.isRemote\s*\?\s*"Remote"\s*:\s*null/.test(jooble)) {
        bad.push("api/job-feed-jooble.mjs no longer prefixes region with \"Remote\" for a remote job");
      }
      const adzuna = (await read("api/job-feed-adzuna.mjs")) ?? "";
      if (!/\|\|\s*\(e\.isRemote\s*\?\s*"Remote"\s*:\s*""\)/.test(adzuna)) {
        bad.push("api/job-feed-adzuna.mjs no longer falls back to \"Remote\" when a remote job has no city/state");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "sitemap-selects-and-exempts-is-remote",
    why:
      "supabase/functions/sitemap/index.ts must SELECT is_remote from the jobs table " +
      "and let it stand in for a missing city in its indexableJobs gate — otherwise a " +
      "fully-remote job's page carries correct JobPosting markup (job-prerender.mjs) " +
      "but is never listed in sitemap.xml for Google to actually find it.",
    run: async ({ read }) => {
      const src = (await read("supabase/functions/sitemap/index.ts")) ?? "";
      const bad = [];
      if (!/select:\s*"[^"]*\bis_remote\b[^"]*"/.test(src)) {
        bad.push("sitemap/index.ts jobs query no longer SELECTs is_remote");
      }
      if (!/!!cityOf\(job\)\s*\|\|\s*!!job\.is_remote/.test(src)) {
        bad.push("sitemap/index.ts indexableJobs gate no longer exempts is_remote jobs from the city requirement");
      }
      if (!/if\s*\(\s*!hasCountry\(job\)\s*\)\s*return false;/.test(src)) {
        bad.push("sitemap/index.ts no longer requires a country on every job (remote included)");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
