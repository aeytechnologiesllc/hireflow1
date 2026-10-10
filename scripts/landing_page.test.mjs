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
check("\"/\" inside the app goes there on the applicants' site; the staff site keeps its doorway", /<Route path="\/" element=\{isStaffHost\(\) \? <Index \/> : <Navigate to=\{CAREERS_PATH\} replace \/>\} \/>/.test(app));
check("/careers belongs on the applicants' site (the staff site sends it there)", /\/\^\\\/careers\\\/\?\$\//.test(hosts));
for (const [file, pattern] of [
  ["src/pages/JobDetails.tsx", /const strandedRoute = CAREERS_PATH;/],
  ["src/pages/Applications.tsx", /onClick: \(\) => navigate\(CAREERS_PATH\)/],
  ["src/pages/CandidateContinue.tsx", /<Link to=\{CAREERS_PATH\}[^>]*>See open roles<\/Link>/],
  ["src/pages/Index.tsx", /<Link to=\{CAREERS_PATH\} className="cr-brand"/],
  ["src/components/AppHeader.tsx", /navigate\(isStaffHost\(\) \? "\/" : CAREERS_PATH\)/],
  ["src/pages/NotFound.tsx", /href=\{isStaffHost\(\) \? "\/" : CAREERS_PATH\}/],
]) check(`"see open roles" goes to /careers: ${file}`, pattern.test(await read(file)));
check("the careers page is listed as /careers", /path: CAREERS_PATH, description:/.test(await read("src/pages/Index.tsx")));

console.log("\nThe page itself");
const page = await read("public/landing.html");
check("its own address, title and description", /<link rel="canonical" href="https:\/\/hireflownow\.com\/">/.test(page) && /<title>HireFlow: hire remote chat support agents while you sleep<\/title>/.test(page) && /<meta name="description" content="[^"]{60,}">/.test(page));
check("its own share picture (HireFlow's), large", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/hireflow\.jpg">/.test(page) && /<meta name="twitter:card" content="summary_large_image">/.test(page));
check("for support teams in general (not sweepstakes-only)", /<span class="tag gold">Hiring remote chat support<\/span>/.test(page) && /For any team hiring remote chat agents and team leaders\./.test(page) && !/For sweepstakes support teams/.test(page));
check("…with sweepstakes as the highlight", /<span class="tag">Sweepstakes &amp; social casino<\/span>/.test(page) && /Made by an operator, for operators\./.test(page));
check("an applicant who lands here finds the open roles, in the bar (on a phone too) and the footer", /<a class="plain" id="jobLink" href="\/careers"><span class="long">Looking for a job\?<\/span><span class="short">Jobs<\/span><\/a>/.test(page) && /\.bar \.plain \.long \{ display: none; \} \.bar \.plain \.short \{ display: inline; \}/.test(page) && /<a href="\/careers">Open jobs<\/a>/.test(page));
check("no near-black button slab on the light section", /\.end \.btn\.solid \{ background: #8A6420;/.test(page));
check("…and one already signed in here is offered their applications", /localStorage\.getItem\("sb-yqklrkpptnhubsnijqze-auth-token"\)/.test(page) && /jobLink\.setAttribute\("href", "\/applications"\)/.test(page));
check("the three numbers are the real ones, and the story says it is a story", /<b>153<\/b>/.test(page) && /<b>71<\/b>/.test(page) && /<b>3<\/b>/.test(page) && /Maria, Jun and Ana are not real applicants/.test(page));
check("no mock-up leftovers", !/mock-up|Mock-up|__LAND__|Post a role/.test(page));
check("Privacy, Terms and Team sign in are linked", /<a href="\/privacy">Privacy<\/a>/.test(page) && /<a href="\/terms">Terms<\/a>/.test(page) && /href="https:\/\/staff\.hireflownow\.com\/auth">Team sign in<\/a>/.test(page));
check("nothing moves forever (docs: no endless animations)", !/infinite/.test(page));
check("the Earth is drawn only while something changes", /if \(moving\) loop = requestAnimationFrame\(frame\);/.test(page));

console.log("\nApplicant links show the applicants' picture, never HireFlow's");
const shell = await read("index.html");
check("the app's shell (careers, job links): the Zulu Support Team picture", /<meta property="og:image" content="https:\/\/hireflownow\.com\/share\/zulu-careers\.jpg" \/>/.test(shell) && !/hireflow\.jpg/.test(shell));
const prerender = await read("api/job-prerender.mjs");
check("a job page's server render: the same, large, named by the render itself (not left to the shell)", /<meta name="twitter:card" content="summary_large_image" \/>/.test(prerender) && /<meta property="og:image" content="\$\{origin\}\/share\/zulu-careers\.jpg" \/>/.test(prerender) && /og:\(title\|description\|url\|image\(:\[a-z\]\+\)\?\)/.test(prerender) && !/hireflow\.jpg/.test(prerender));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
