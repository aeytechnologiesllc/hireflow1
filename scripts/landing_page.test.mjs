#!/usr/bin/env node
/**
 * HireFlow's front page at hireflownow.com/ (docs/LANDING.md).
 *
 * The owner, 2026-10-09: "the landing is on hireflownow.com"; not
 * sweepstakes-only ("a very niche market") but with sweepstakes as the
 * highlight; and "make sure I still have the job application open": nothing
 * an applicant uses may move or show the landing.
 *
 * Run with: node scripts/landing_page.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("\nServed at hireflownow.com/, and nowhere an applicant goes");
const { default: middleware, config } = await import(pathToFileURL(path.join(ROOT, "middleware.js")).href);
check("the middleware only ever sees \"/\"", config.matcher === "/");
const main = middleware(new Request("https://hireflownow.com/"));
check("hireflownow.com/ is the landing page", main.headers.get("x-middleware-rewrite") === "https://hireflownow.com/landing.html");
const staff = middleware(new Request("https://staff.hireflownow.com/"));
check("staff.hireflownow.com/ is left to the app (sign-in or the dashboard)", staff.headers.get("x-middleware-next") === "1" && !staff.headers.get("x-middleware-rewrite"));
const vercel = JSON.parse(await read("vercel.json"));
check("job links and short links still go to the job page's own render", vercel.rewrites.some((r) => r.source === "/candidate/job/:id" && r.destination.startsWith("/api/job-prerender")) && vercel.rewrites.some((r) => r.source === "/:slug"));

console.log("\nThe careers page and every applicant link");
const app = await read("src/App.tsx");
const hosts = await read("src/lib/hosts.ts");
check("the careers page is at /careers", /export const CAREERS_PATH = "\/careers";/.test(hosts) && /<Route path=\{CAREERS_PATH\} element=\{<Index \/>\} \/>/.test(app));
check("\"/\" inside the app goes there on the applicants' site; the staff site keeps its doorway", /<Route path="\/" element=\{isStaffHost\(\) \? <StaffDoorway \/> : <Navigate to=\{CAREERS_PATH\} replace \/>\} \/>/.test(app));
check("…the staff doorway is a small screen of its own, still sending a role-less account to /auth/callback", /function StaffDoorway\(\)/.test(app) && /navigate\("\/auth\/callback\?role=employer", \{ replace: true \}\)/.test(app));
check("/careers belongs on the applicants' site (the staff site sends it there)", /\/\^\\\/careers\\\/\?\$\//.test(hosts));
// Since 2026-10-11 "see open roles" is the roles of the business whose job
// the applicant last opened (src/lib/openRoles.ts), so another business's
// applicant is never sent to the home business. When none is known (a fresh
// device) it is every business's live jobs, /open-jobs: /careers is the home
// business's own page, and sent a fresh device there.
const openRoles = await read("src/lib/openRoles.ts");
check(
  "\"see open roles\" falls back to /open-jobs (every business's jobs), never /careers, when no business is known",
  /return OPEN_JOBS_PATH;/.test(openRoles) && /return `\/c\/\$\{slug\}`;/.test(openRoles) && !/CAREERS_PATH/.test(openRoles) && /export const OPEN_JOBS_PATH = "\/open-jobs";/.test(hosts),
);
for (const [file, pattern] of [
  ["src/pages/JobDetails.tsx", /const strandedRoute = lookupBusiness \? `\/c\/\$\{lookupBusiness\}` : openRolesPath\(\);/],
  ["src/pages/Applications.tsx", /onClick: \(\) => navigate\(openRolesPath\(\)\)/],
  ["src/pages/CandidateContinue.tsx", /<Link to=\{openRolesPath\(\)\}[^>]*>See open roles<\/Link>/],
  ["src/pages/Index.tsx", /<Link to=\{CAREERS_PATH\} className="cr-brand"/],
  ["src/components/AppHeader.tsx", /navigate\(isStaffHost\(\) \? "\/" : openRolesPath\(\)\)/],
  ["src/pages/NotFound.tsx", /href=\{isStaffHost\(\) \? "\/" : openRolesPath\(\)\}/],
]) check(`"see open roles" goes to the applicant's own business: ${file}`, pattern.test(await read(file)));
check("the job page and a business's careers page remember that business", /rememberBusiness\(jobBusiness\)/.test(await read("src/pages/JobDetails.tsx")) && /rememberBusiness\(slug\)/.test(await read("src/pages/BusinessCareers.tsx")));
check("the careers page is listed as /careers", /path: CAREERS_PATH, description:/.test(await read("src/pages/Index.tsx")));

console.log("\nThe page itself");
const page = await read("public/landing.html");
check("its own address, title and description", /<link rel="canonical" href="https:\/\/hireflownow\.com\/">/.test(page) && /<title>HireFlow: hire customer service agents while you sleep<\/title>/.test(page) && /<meta name="description" content="[^"]{60,}">/.test(page));
check("its own share picture (HireFlow's), large", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/hireflow\.jpg">/.test(page) && /<meta name="twitter:card" content="summary_large_image">/.test(page));
// 2026-10-25 (docs/LAUNCH-PLAN.md, Phase 3, task 3): customer service, chat
// and phone, any business; no sweepstakes band, no casino story.
check("customer service hiring, chat and phone, for any business", /<span class="tag gold">Customer service hiring · chat and phone<\/span>/.test(page) && /<h1><span class="ln"><span>Hire customer service agents<\/span><\/span><span class="ln"><span><em>while you sleep\.<\/em><\/span><\/span><\/h1>/.test(page) && /For any business that answers customers\./.test(page));
check("…built for any team that answers customers, gaming one of them", /<span class="tag">Built for any team that answers customers<\/span>/.test(page) && ["Medical and dental", "Online stores", "Software", "Home services", "Gaming"].every((k) => page.includes(`<b>${k}</b>`)));
check("…and no sweepstakes, casino, payout or player wording anywhere on the page", !/sweepstake|casino|payout|withdrawal|\bplayers?\b/i.test(page.replace(/<li><b>Gaming<\/b> Players, payments and account checks\.<\/li>/, "")));
check("the story's test is an everyday one: an order six days late", /Her test: an order <em>six days late\.<\/em>/.test(page) && /Where is my order\?\?/.test(page) && /var REPLY = "I have your order from the 3rd open\./.test(page));
// Every business's live jobs, not one business's careers page (2026-10-11).
check("an applicant who lands here finds every open job, in the bar (on a phone too) and the footer", /<a class="plain" id="jobLink" href="\/open-jobs"><span class="long">Looking for a job\?<\/span><span class="short">Jobs<\/span><\/a>/.test(page) && /\.bar \.plain \.long, \.bar \.btn \.long \{ display: none; \} \.bar \.plain \.short, \.bar \.btn \.short \{ display: inline; \}/.test(page) && /<a href="\/open-jobs">Open jobs<\/a>/.test(page));
check("/open-jobs is a page of the applicants' site", /<Route path="\/open-jobs" element=\{<OpenJobs \/>\} \/>/.test(app) && /\/\^\\\/open-jobs\\\/\?\$\//.test(hosts));
check("no near-black button slab on the light section", /\.end \.btn\.solid \{ background: #8A6420;/.test(page));
check("…and one already signed in here is offered their applications", /localStorage\.getItem\("sb-yqklrkpptnhubsnijqze-auth-token"\)/.test(page) && /jobLink\.setAttribute\("href", "\/applications"\)/.test(page));
check("the three numbers are the real ones, and the story says it is a story", /<b>153<\/b>/.test(page) && /<b>71<\/b>/.test(page) && /<b>3<\/b>/.test(page) && /We hired from those three\./.test(page) && /Maria, Jun and Ana are not real applicants/.test(page));
check("no mock-up leftovers", !/mock-up|Mock-up|__LAND__|Post a role/.test(page));
// The owner, 2026-10-10: he could not find a way to sign in once "Get early access"
// took the bar's button; there is no early-access offer.
check("the bar has Sign in, to the hiring team's sign-in", /<a class="plain" href="https:\/\/staff\.hireflownow\.com\/auth" id="signIn">Sign in<\/a>/.test(page));
// The 2026-10-11 mock-ups (#1): a business can make its account.
check("…and the bar's button is Post your first job free, opening the sign-up tab", /<a class="btn solid" href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="startFree"><span class="long">Post your first job free<\/span><span class="short">Start free<\/span><\/a>/.test(page));
// One button, everywhere (2026-10-25): pinned at the top for the whole page,
// the opening's main button (the film second), and again at the end.
check("one button: the bar stays pinned for the whole page", /\.bar \{ position: fixed;/.test(page) && /<main>\s*<div class="bar" id="bar">/.test(page));
check("…the opening's main button, the film second, then 'First job free. No card.'", /<a class="btn solid" href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="heroStart">Post your first job free<\/a>\s*<button class="btn ghost" type="button" id="watch">Watch one night<\/button>/.test(page) && /<p class="nocard">First job free\. No card\.<\/p>/.test(page));
check("…and again at the end, instead of 'Watch it again'", /id="endStart">Post your first job free<\/a><small>First job free\. No card\.<\/small>/.test(page) && !/Watch it again/.test(page));
check("no prices while billing is off", !/\$\d|per month|\/mo\b|pricing/i.test(page));
check("the headline is there from the first paint (it no longer rises in, hidden)", !/translateY\(112%\)/.test(page) && /\.ln > span \{ display: block; \}/.test(page));
check("the fonts never block the first paint", /fonts\.googleapis\.com\/css2[^"]*" media="print" onload="this\.media='all'">/.test(page));
check("one logo: the brass rising line on the ink tile, not the old 'H'", /<path d="M13 46 L25 19 L37 39 L51 17" fill="none" stroke="#E0B96A"/.test(page) && !/<b>H<\/b>HireFlow/.test(page));
check("structured data: the organisation (with its legal name) and the app", /"@type":"Organization"[^}]*"legalName":"Southern Digital Technologies LLC"/.test(page) && /"@type":"SoftwareApplication"/.test(page));
check("an About line in the footer", /<a href="#about">About<\/a>/.test(page) && /HireFlow is made by Southern Digital Technologies LLC\./.test(page));
check("no early-access wording or buttons anywhere", !/early access|data-cta/i.test(page));
check("Privacy, Terms and Team sign in are linked", /<a href="\/privacy">Privacy<\/a>/.test(page) && /<a href="\/terms">Terms<\/a>/.test(page) && /href="https:\/\/staff\.hireflownow\.com\/auth">Team sign in<\/a>/.test(page));
check("nothing moves forever (docs: no endless animations)", !/infinite/.test(page));
check("the Earth is drawn only while something changes", /if \(moving\) loop = requestAnimationFrame\(frame\);/.test(page));
// The opening at rest (the owner, 2026-10-21: "there's no animation while
// it's sitting still"): one short night of arrivals, then it stops, and none
// of it for anyone who asks for less motion.
check(
  "at rest the opening plays one short night, then stops",
  /var IDLE_MS = 20000, WIND_MS = 2600/.test(page) &&
    /function startIdle\(\) \{\s*if \(calm\) return;/.test(page) &&
    /if \(next === 0 && before !== 0\) startIdle\(\);/.test(page) &&
    /if \(age > IDLE_MS \+ WIND_MS && idle\.arcs\.length === 0\) \{ idle = null; return false; \}/.test(page) &&
    /if \(stepIdle\(now\)\) moving = true;/.test(page),
);

console.log("\nApplicant links show the applicants' picture, never HireFlow's");
const shell = await read("index.html");
// Since 2026-10-11 (other businesses): the shell is every business's, so it
// carries the plain applicants' picture; a careers page and a job link get
// their own from their server render. Never HireFlow's landing image.
check("the app's shell: the plain applicants' picture, never the landing's", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/careers\.jpg" \/>/.test(shell) && !/hireflow\.jpg/.test(shell) && !/Zulu/.test(shell));
const prerender = await read("api/job-prerender.mjs");
check("a job page's server render: the same, large, named by the render itself (not left to the shell)", /<meta name="twitter:card" content="summary_large_image" \/>/.test(prerender) && /<meta property="og:image" content="\$\{origin\}\/share\/\$\{home \? "zulu-careers" : "careers"\}\.jpg" \/>/.test(prerender) && /og:\(title\|description\|url\|image\(:\[a-z\]\+\)\?\)/.test(prerender) && !/hireflow\.jpg/.test(prerender));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
