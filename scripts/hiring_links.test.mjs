#!/usr/bin/env node
/**
 * "Hiring? Post a job free" (src/lib/hiringLink.ts; docs/LAUNCH-PLAN.md,
 * Phase 3, task 6): tagged links back to HireFlow from the pages other
 * businesses' applicants see, and the flyer.
 *
 * Run with: node scripts/hiring_links.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const H = await import(path.join(ROOT, "src/lib/hiringLink.ts"));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

check("the link goes to the front page, tagged with where it came from, with the hiring-link mark the counter looks for (the sixth growth review)", H.hiringLink("job_page") === "https://hireflownow.com/?utm_source=job_page&utm_medium=hiring_link&hiring_link=1");
check("the words", H.HIRING_LINK_WORDS === "Hiring? Post a job free");
check("a business's careers page footer", /href=\{withVisitorTags\(hiringLink\("careers_page"\), window\.location\.href, document\.referrer\)\}/.test(read("src/pages/BusinessCareers.tsx")));
check("the open-jobs page's link (the Phase 7 growth audit: it went untagged)", /hiringLink\("open_jobs"\)/.test(read("src/pages/OpenJobs.tsx")));
check("the job page, for applicants (not the business's own preview)", /\{job && !isEmployer && \(\s*<p[^>]*>\s*<a href=\{withVisitorTags\(hiringLink\("job_page"\), window\.location\.href, document\.referrer\)\}/.test(read("src/pages/JobDetails.tsx")));
check("the 'You've finished every step' screen", /href=\{hiringLink\("application_done"\)\}/.test(read("src/components/EvaluationScreen.tsx")));
// The printed flyer names the plain address: a tagged link printed in capitals
// looked broken, and typed as printed its tags never registered (the Phase 7
// growth review).
check("the printed flyer carries the plain address", /Powered by HireFlow · hireflownow\.com</.test(read("src/cockpit/components/ShareKitDialog.tsx")) && !/hiringLink\("flyer"\)/.test(read("src/cockpit/components/ShareKitDialog.tsx")));
check("the front page carries the tags on to sign-up (so Admin → Growth sees them)", /utm_source/.test(read("public/carry-source.js")) && /staff\.hireflownow\.com\/auth/.test(read("public/carry-source.js")));

// The third growth review: Open jobs carries a visitor's own tags on.
check("Open jobs' links keep a visitor's own tags (they replace the page's)", H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?utm_source=youtube&utm_campaign=v1") === "https://hireflownow.com/?utm_source=youtube&utm_campaign=v1&hiring_link=1");
check("…tags with no campaign keep the page's own name as the campaign (a business found through a shared job still shows as job_page)", H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/front-desk?utm_source=facebook&utm_medium=job_share") === "https://hireflownow.com/?utm_source=facebook&utm_medium=job_share&utm_campaign=job_page&hiring_link=1");
check("…the logo too, as a path", H.withVisitorTags("/", "https://hireflownow.com/open-jobs?utm_source=youtube&utm_medium=video") === "/?utm_source=youtube&utm_medium=video");
// The fourth growth review: the site that sent them is the source, the page kept as the campaign.
check("…an untagged visitor's site is the source, the page's own tag kept as the campaign", H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?ref=www.quora.com") === "https://hireflownow.com/?utm_source=www.quora.com&utm_medium=referral&utm_campaign=open_jobs&ref=www.quora.com&hiring_link=1");
check("…the page's own referrer counts when nothing was carried (a site linking straight to it)", H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/front-desk", "https://www.facebook.com/groups/x") === "https://hireflownow.com/?utm_source=www.facebook.com&utm_medium=referral&utm_campaign=job_page&ref=www.facebook.com&hiring_link=1" && H.withVisitorTags("/", "https://hireflownow.com/open-jobs", "https://www.quora.com/q") === "/?ref=www.quora.com");
// The sixth growth review: a hiring link counts once, the first time. The mark
// the front page's counter looks for is on a visitor's first hiring link only,
// whatever channel they brought, and never on any other link.
check("…a visitor whose tags already name a hiring link gets no mark on the next one (Open jobs' after a job page's)", H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?utm_source=job_page&utm_medium=hiring_link") === "https://hireflownow.com/?utm_source=job_page&utm_medium=hiring_link&utm_campaign=open_jobs");
check("…nor one who brought a channel and has been through a hiring link (Share Kit, a Facebook post)", H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?utm_source=facebook&utm_medium=job_share&utm_campaign=job_page") === "https://hireflownow.com/?utm_source=facebook&utm_medium=job_share&utm_campaign=job_page" && H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/c/acme/front-desk?utm_source=www.facebook.com&utm_medium=referral&utm_campaign=job_page") === "https://hireflownow.com/?utm_source=www.facebook.com&utm_medium=referral&utm_campaign=job_page");
// The seventh growth review: a page opened from another of HireFlow's pages
// gets no mark either, so a visitor counted on the front page is not counted
// again from Open jobs, whatever tags they carry (a campaign tag never names a
// hiring link, so it counted on every click).
check("…nor a page opened from another HireFlow page: tags with no campaign, a campaign tag, or none at all", !H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?utm_source=youtube&utm_medium=video", "https://hireflownow.com/?utm_source=youtube&utm_medium=video").includes("hiring_link=1") && !H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?utm_source=youtube&utm_campaign=v1", "https://hireflownow.com/").includes("hiring_link=1") && !H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs?ref=www.facebook.com", "https://hireflownow.com/").includes("hiring_link=1") && H.withVisitorTags(H.hiringLink("open_jobs"), "https://hireflownow.com/open-jobs", "https://hireflownow.com/") === "https://hireflownow.com/?utm_source=open_jobs&utm_medium=hiring_link" && !H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/c/acme/front-desk", "https://staff.hireflownow.com/auth").includes("hiring_link=1"));
check("…while a visitor who arrived on the page from outside, tagged or not, still has their first one counted", H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/c/acme/front-desk?utm_source=youtube&utm_campaign=v1", "https://www.youtube.com/").endsWith("&hiring_link=1") && H.withVisitorTags(H.hiringLink("job_page"), "https://hireflownow.com/c/acme/front-desk").endsWith("&hiring_link=1"));
check("…the mark is only ever on a hiring link", !H.withVisitorTags("/", "https://hireflownow.com/open-jobs?utm_source=youtube").includes("hiring_link") && !H.withVisitorTags("/c/acme/front-desk", "https://hireflownow.com/open-jobs", "https://www.quora.com/").includes("hiring_link") && H.hiringLink("application_done").endsWith("&hiring_link=1"));
check("…and carry-source.js never carries it on (it copies the three tags and a ref, nothing else)", /\["utm_source", "utm_medium", "utm_campaign"\]\.forEach\(function \(key\) \{\s*var v = tidy\(params\.get\(key\)\);/.test(read("public/carry-source.js")) && !/params\.get\("hiring_link"\)|"hiring_link"\]/.test(read("public/carry-source.js")));
check("/careers (the home business's page) carries the channel to its job too: its job cards and its one-role forward (the sixth growth review)", /<Link to=\{withVisitorTags\(jobPagePath\(job\), window\.location\.href, document\.referrer\)\} className="cr-role"/.test(read("src/pages/Index.tsx")) && /navigate\(withVisitorTags\(singleRole, window\.location\.href, document\.referrer\), \{ replace: true \}\)/.test(read("src/pages/Index.tsx")) && /<Navigate to=\{`\$\{CAREERS_PATH\}\$\{location\.search\}`\} replace \/>/.test(read("src/pages/BusinessCareers.tsx")));
check("…HireFlow's own pages are no referrer", H.withVisitorTags("/", "https://hireflownow.com/open-jobs", "https://hireflownow.com/") === "/");
check("…capitals and spaces are tidied as the counter does, never dropped", H.withVisitorTags("/", "https://hireflownow.com/open-jobs?utm_source=Facebook&utm_campaign=Group%20Post") === "/?utm_source=facebook&utm_campaign=group-post");
check("…nothing carried: the link as it was", H.withVisitorTags("/", "https://hireflownow.com/open-jobs") === "/" && H.withVisitorTags("/", "https://hireflownow.com/open-jobs?utm_source=%3C%3E") === "/" && H.withVisitorTags("/", "https://hireflownow.com/open-jobs?ref=staff.hireflownow.com") === "/");
check("Open jobs' and careers pages' job cards carry the channel to the job page (the fifth growth review)", /to=\{withVisitorTags\(jobPagePath\(job\), window\.location\.href, document\.referrer\)\}/.test(read("src/pages/OpenJobs.tsx")) && /to=\{withVisitorTags\(jobPagePath\(role\), window\.location\.href, document\.referrer\)\}/.test(read("src/pages/BusinessCareers.tsx")) && H.withVisitorTags("/c/acme/front-desk", "https://hireflownow.com/open-jobs?ref=www.youtube.com") === "/c/acme/front-desk?ref=www.youtube.com");
check("…job pages and careers pages carry it too", /withVisitorTags\(hiringLink\("job_page"\), window\.location\.href, document\.referrer\)/.test(read("src/pages/JobDetails.tsx")));
// The seventh growth review: an applicant who signs up from a "Sign in" link,
// not Apply, read "Applicant · unknown".
check("…and every applicant Sign in link on a public page carries it (Open jobs, careers, the safety note, the report dialog)", /to=\{withVisitorTags\("\/candidate\/auth\?redirect=%2Fapplications", window\.location\.href, document\.referrer\)\}/.test(read("src/pages/OpenJobs.tsx")) && /to: withVisitorTags\("\/candidate\/auth", window\.location\.href, document\.referrer\), label: "Sign in"/.test(read("src/pages/Index.tsx")) && /to=\{withVisitorTags\(`\/candidate\/auth\?redirect=\$\{encodeURIComponent\(back\)\}`, window\.location\.href, document\.referrer\)\}/.test(read("src/components/trust/SafetyNote.tsx")) && /const signIn = withVisitorTags\(`\/candidate\/auth\?redirect=/.test(read("src/components/trust/ReportJobDialog.tsx")));
check("Admin → Growth's note says the front-page total leaves out the staff site (20261025520000)", /not counted in the page kinds, the campaigns or the front-page total \(the sign-in total still holds them\)/.test(read("src/cockpit/pages/Admin.tsx")));
check("Open jobs uses it for its logo and its Post a job free", /href=\{withVisitorTags\("\/", window\.location\.href, document\.referrer\)\}/.test(read("src/pages/OpenJobs.tsx")) && /href=\{withVisitorTags\(hiringLink\("open_jobs"\), window\.location\.href, document\.referrer\)\}/.test(read("src/pages/OpenJobs.tsx")));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
