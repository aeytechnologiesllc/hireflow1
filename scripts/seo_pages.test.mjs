#!/usr/bin/env node
/**
 * The public site as a search engine and a phone see it (SEO check,
 * 2026-10-09; docs/SEO.md).
 *
 * What the check found, and what this keeps fixed:
 *  - every applicant downloaded the whole staff side before the job appeared
 *    (about 1.1 MB compressed): the team's pages were imported eagerly, and
 *    Vite's on-demand loader had been packed into the PDF bundle;
 *  - the sitemap still used the removed Google Jobs rule, so the one open
 *    (worldwide remote) role was not in it;
 *  - Privacy, Terms and every mistyped address carried the homepage's title
 *    and canonical;
 *  - the job page's server render copied its HTML from "/", which is about to
 *    become the HireFlow landing page.
 *
 * Run with: node scripts/seo_pages.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}`);
  }
}

console.log("\nA phone opening the careers site does not download the staff side");
const app = await read("src/App.tsx");
const prefetch = await read("src/lib/prefetchRoutes.ts");
for (const page of ["Dashboard", "Jobs", "Applicants", "ApplicantDetails", "Messages", "Documents"]) {
  check(`${page} is not imported up front`, !new RegExp(`^import ${page} from "\\./pages/${page}";`, "m").test(app) && new RegExp(`const ${page} = lazyWithReload\\((routeImporters\\["/|applicantDetailsImporter)`).test(app));
}
check("More is not imported up front", !/^import More from/m.test(app) && /const More = lazyWithReload\(routeImporters\["\/more"\]\)/.test(app));
check("…on the staff host the page being opened (and the dashboard) is fetched as the app starts", /if \(typeof window !== "undefined" && isStaffHost\(\)\) warmStaffPages\(window\.location\.pathname\);/.test(app) && /else prefetchForPath\(pathname\);\s*prefetchRoute\("\/dashboard"\);/.test(prefetch));
check("…but not for a first-time visitor on the sign-in and sign-up page (the form first)", /if \(SIGNED_OUT_PAGES\.test\(pathname\) && !signedIn\) return;/.test(prefetch) && /const SIGNED_OUT_PAGES = \/\^\\\/\(auth\|/.test(prefetch));
check("…the rest once the first screen is up, so the team's navigation stays instant", /const STAFF_PAGES_LATER: RoutePrefix\[\] = \["\/dashboard", "\/applicants", "\/jobs", "\/messages", "\/interviews", "\/more"\];/.test(prefetch) && /requestIdleCallback\(later/.test(prefetch));
check("…and Documents, with the PDF tools, only on a hover or a tap (never at start-up)", !/STAFF_PAGES_LATER[^;]*documents/.test(prefetch) && /"\/documents": \(\) => import\("@\/pages\/Documents"\)/.test(prefetch));
const vite = await read("vite.config.ts");
check("Vite's on-demand loader and the CommonJS helpers live with React, never in the PDF or charts bundle", /if \(id\.includes\("vite\/preload-helper"\) \|\| id\.includes\("commonjsHelpers"\)\) return "vendor-react";/.test(vite));
check("…the vendor groups are kept", /'vendor-pdf': \['jspdf', 'pdf-lib', '@react-pdf\/renderer', 'react-pdf'\]/.test(vite) && /for \(const \[chunk, pkgs\] of Object\.entries\(VENDOR_CHUNKS\)\)/.test(vite));

console.log("\nThe sitemap lists every open job");
const sitemap = await read("supabase/functions/sitemap/index.ts");
check("published, unexpired, not marked exclude_from_feed", /status: "eq\.published"/.test(sitemap) && /exclude_from_feed: "eq\.false"/.test(sitemap) && /application_deadline\.is\.null,application_deadline\.gt\./.test(sitemap));
check("only jobs the public can open (published_jobs_public leaves out a suspended business's; the Phase 7 growth audit)", /published_jobs_public\?select=id/.test(sitemap) && /if \(!publicIds\.has\(job\.id\)\) return false;/.test(sitemap));
check("no country, city or company rule (a worldwide remote role has no country)", !/hasCountry|cityOf|company_name/.test(sitemap));
check("each under its job page's own canonical", /const loc = `\$\{SITE\}\/candidate\/job\/\$\{j\.id\}`;/.test(sitemap));
check("plus the homepage, Privacy and Terms", /\{ path: "\/", priority: "1\.0" \}/.test(sitemap) && /\{ path: "\/privacy"/.test(sitemap) && /\{ path: "\/terms"/.test(sitemap));

console.log("\nEach page under its own name");
const head = await read("src/components/seo/usePageHead.ts");
check("a page sets its title, robots rule, canonical and share title, and puts them back when left", /document\.title = title;/.test(head) && /setMeta\("name", "robots", noindex \? "noindex, follow" : "index, follow"\)/.test(head) && /setCanonical\(url\)/.test(head) && /cleanups\.forEach\(\(cleanup\) => cleanup\(\)\);/.test(head));
check("…no canonical on a page kept out of search", /if \(path && !noindex\)/.test(head));
const legal = await read("src/components/LegalPage.tsx");
check("Privacy and Terms: their own title and address (no name in the frame, docs/LEGAL-PAGES.md)", /usePageHead\(\{ title: doc\.title, path: pathname, description: doc\.intro\[0\] \}\);/.test(legal));
check("an address that does not exist: kept out of search", /usePageHead\(\{ title: "Page not found", noindex: true \}\);/.test(await read("src/pages/NotFound.tsx")));
check("a one-word address that is no open job (/nope, a closed role): kept out of search", /<PageHeadTags title=\{"This role isn\\u2019t open"\} noindex \/>/.test(await read("src/pages/JobDetails.tsx")));
// Every business's applicants sign in here (2026-10-10): HireFlow's name, not Zulu's.
check("the applicants' sign-in: its own title, kept out of search", /usePageHead\(\{ title: "Sign in \| HireFlow", noindex: true \}\);/.test(await read("src/pages/CandidateAuth.tsx")));
const jobHead = await read("src/components/seo/JobPageHead.tsx");
check("the job page shares the same tag helpers", /from "@\/lib\/headTags";/.test(jobHead) && !/function setMeta/.test(jobHead));
const shell = await read("index.html");
check("the shell carries no stale keywords tag", !/name="keywords"/.test(shell));

console.log("\nThe job page's server render");
const prerender = await read("api/job-prerender.mjs");
check("takes the app's shell from /index.html, never from \"/\" (the landing page)", /fetch\(`\$\{origin\}\/index\.html`/.test(prerender) && !/fetch\(`\$\{origin\}\/`/.test(prerender));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
