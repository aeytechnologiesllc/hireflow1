/**
 * The Jobs list rendered a fixed LISTINGS constant ("Your job page", "Google
 * for Jobs", "Job boards") at full opacity for EVERY live job, with a
 * tooltip claiming "Your job page and Google go up automatically — boards
 * list you once you send them your link". That was false for any published
 * job the real gates hold back: api/job-feed.mjs's loadFeedJobs() quality
 * gate (a real company name, a real country, a real city unless explicitly
 * remote, and >= 100 plain-text characters of description) and
 * supabase/functions/sitemap/index.ts's indexableJobs gate (the same, minus
 * the description-length check, and with a looser inferred-country rule).
 *
 * Fixed with a pure mirror of both gates (src/cockpit/lib/listingEligibility.ts),
 * computed per live job in mapJobRow using the JOB'S employer's company name
 * from employer_public_branding, and rendered as per-chip opacity + a
 * truthful tooltip in Jobs.tsx's JobListRow.
 */
export default [
  {
    id: "listing-eligibility-module-exists-and-mirrors-both-gates",
    why:
      "src/cockpit/lib/listingEligibility.ts must exist, export listingEligibility(), and keep " +
      "mirroring the real MIN_DESCRIPTION_CHARS / country-vs-city rules — losing any of these " +
      "silently makes the Jobs list's chips lie again about what api/job-feed.mjs and " +
      "supabase/functions/sitemap/index.ts actually do.",
    run: async ({ read }) => {
      const src = (await read("src/cockpit/lib/listingEligibility.ts")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/cockpit/lib/listingEligibility.ts not found");
        return { ok: false, detail: bad };
      }
      if (!/export function listingEligibility\(/.test(src)) {
        bad.push("listingEligibility.ts no longer exports listingEligibility()");
      }
      if (!/MIN_DESCRIPTION_CHARS\s*=\s*100/.test(src)) {
        bad.push("listingEligibility.ts's MIN_DESCRIPTION_CHARS no longer matches api/job-feed.mjs's 100");
      }
      if (!/const boards = google && countryLiteral && descLen >= MIN_DESCRIPTION_CHARS;/.test(src)) {
        bad.push("listingEligibility.ts's boards gate no longer requires a literal country and the description-length floor on top of google's gate");
      }
      if (!/const google = !excluded && !deadlinePassed && hasCompany && countryInferred && hasLocation;/.test(src)) {
        bad.push("listingEligibility.ts's google gate no longer requires company + country + city-or-remote (with excluded/deadline checks)");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "job-row-carries-per-job-listing-eligibility",
    why:
      "JobRow.listings must exist and mapJobRow must compute it via listingEligibility() only for " +
      "LIVE jobs (using the JOB'S OWN employer's company name, not the viewer's) — otherwise the " +
      "cockpit has no truthful per-job signal to render chips from and Jobs.tsx falls back to the " +
      "old always-true LISTINGS behavior.",
    run: async ({ read }) => {
      const bad = [];
      const data = (await read("src/cockpit/data.ts")) ?? "";
      if (!/listings\?:\s*\{\s*google:\s*boolean;\s*boards:\s*boolean;\s*reason:\s*string\s*\|\s*null\s*\}/.test(data)) {
        bad.push("src/cockpit/data.ts's JobRow no longer declares an optional `listings: { google, boards, reason }` field");
      }
      const mappers = (await read("src/cockpit/lib/mappers.ts")) ?? "";
      if (!/import\s*\{\s*listingEligibility\s*\}\s*from\s*"\.\/listingEligibility";/.test(mappers)) {
        bad.push("src/cockpit/lib/mappers.ts no longer imports listingEligibility");
      }
      if (!/listings:\s*status === "live" \? listingEligibility\(job, companyName\) : undefined,/.test(mappers)) {
        bad.push("mapJobRow() no longer computes listings via listingEligibility() for live jobs only");
      }
      const hook = (await read("src/cockpit/hooks/useCockpitData.ts")) ?? "";
      if (!/employer_public_branding/.test(hook)) {
        bad.push("useCockpitJobsData no longer fetches employer_public_branding company names for the jobs it maps");
      }
      if (!/mapJobRow\(j, applications, j\.employer_id \? companies\.get\(j\.employer_id\) : null\)/.test(hook)) {
        bad.push("useCockpitJobsData no longer passes each job's own employer's company name into mapJobRow");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "jobs-list-chips-are-truthful-per-chip",
    why:
      "Jobs.tsx's JobListRow must dim whichever chip a live job hasn't actually earned (per " +
      "job.listings) and must drop the old blanket claim (\"Your job page and Google go up " +
      "automatically — boards list you once you send them your link\") — a live job failing a gate " +
      "must never render that chip at full opacity with a tooltip implying it is already listed there.",
    run: async ({ read }) => {
      const src = (await read("src/cockpit/pages/Jobs.tsx")) ?? "";
      const bad = [];
      if (!src) {
        bad.push("src/cockpit/pages/Jobs.tsx not found");
        return { ok: false, detail: bad };
      }
      if (/Your job page and Google go up automatically — boards list you once you send them your link/.test(src)) {
        bad.push("Jobs.tsx still renders the stale blanket tooltip claiming boards list you once you send them your link");
      }
      if (!/job\.listings\?\.google/.test(src) || !/job\.listings\?\.boards/.test(src)) {
        bad.push("JobListRow no longer branches per chip on job.listings.google / job.listings.boards");
      }
      if (!/Your job page is live\. \$\{job\.listings\.reason\}/.test(src)) {
        bad.push("JobListRow no longer renders a truthful per-job reason in the live tooltip");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
