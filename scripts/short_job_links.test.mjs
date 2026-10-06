/**
 * Short job links: hireflownow.com/<slug> (docs/SHORT-JOB-LINKS.md).
 *
 * Runs the rules the app runs: src/lib/jobSlug.ts is imported straight into
 * Node (it has no imports of its own, so nothing is copied), and React
 * Router's own matcher is asked which page each path opens. The wiring in the
 * pages is checked from their source.
 *
 *   node scripts/short_job_links.test.mjs
 *
 * The Back-button behaviour in a real browser is
 * scripts/short_job_links_back_check.mjs (it needs a browser and the live
 * job, so it is not part of this suite).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { matchRoutes } from "react-router";
import {
  HELD_BACK,
  RESERVED_SLUGS,
  ROUTE_SEGMENTS,
  SITE_PATHS,
  SLUG_MESSAGES,
  SLUG_PATTERN,
  applyWithCodePath,
  jobPageFromRedirect,
  jobPagePath,
  jobRefFromPagePath,
  jobShareLink,
  rootDestination,
  shortLinkFor,
  slugCandidates,
  slugFromParam,
  slugProblem,
  slugSaveProblem,
  suggestJobSlug,
  tidySlugInput,
  usableSlug,
  withApplyAsk,
} from "../src/lib/jobSlug.ts";
import { COMPUTER_STEP_TYPES, hasComputerSteps } from "../src/lib/candidateJourney.ts";
import { hostRedirect, isCandidateOnlyPath, isSharedPrivatePath, isStaffOnlyPath } from "../src/lib/hosts.ts";

// fileURLToPath, not URL.pathname: the repo folder has a space in its name.
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
console.log("\nThe editor's four messages, in the doc's words");
check("format", SLUG_MESSAGES.format === "Use lowercase letters, numbers and hyphens");
check("length", SLUG_MESSAGES.length === "3 to 40 characters");
check("taken", SLUG_MESSAGES.taken === "That name is taken by another job");
check("reserved", SLUG_MESSAGES.reserved === "That name is part of the site; pick another");

// ---------------------------------------------------------------------------
console.log("\nValidating a name");
const cases = [
  ["team-lead", null],
  ["", null], // no short link: the job keeps its old link
  ["abc", null],
  ["a".repeat(40), null],
  ["cook-2", null],
  ["Team-Lead", "format"],
  ["team_lead", "format"],
  ["team lead", "format"],
  ["café", "format"],
  ["-team", "format"],
  ["team-", "format"],
  ["ab", "length"],
  ["a".repeat(41), "length"],
  ["jobs", "reserved"],
  ["apply", "reserved"],
  ["candidate", "reserved"],
  ["applications", "reserved"],
  ["privacy", "reserved"],
  ["api", "reserved"],
  ["assets", "reserved"],
  ["careers", "reserved"],
];
for (const [value, expected] of cases) {
  check(`"${value.length > 20 ? `${value.slice(0, 8)}… (${value.length})` : value}" → ${expected ?? "fine"}`, slugProblem(value) === expected, `got ${slugProblem(value)}`);
}
check("every name the editor accepts also passes the database's own check", cases.every(([v, e]) => e !== null || v === "" || SLUG_PATTERN.test(v)));

// The pattern is the migration's CHECK, not a guess at it.
{
  const migration = await read("supabase/migrations/20261006145832_job_short_links_and_view_write_lock.sql");
  const dbPattern = /slug ~ '([^']+)'/.exec(migration)?.[1];
  check("SLUG_PATTERN is the database's jobs_slug_format regex", dbPattern === SLUG_PATTERN.source, `db ${dbPattern} / app ${SLUG_PATTERN.source}`);
}

check("typing: uppercase becomes lowercase, spaces become hyphens", tidySlugInput("Team Lead") === "team-lead");
check("typing: anything else stays, so the error can point at it", tidySlugInput("team_lead!") === "team_lead!");

// ---------------------------------------------------------------------------
console.log("\nSuggesting a name from the title");
const suggestions = [
  ["Chat Support Team Leader (Zulu Royal & Zulu Rush)", "chat-support-team-leader"],
  ["Team Lead", "team-lead"],
  ["Café Manager", "cafe-manager"],
  ["Barista / Cashier", "barista-cashier"],
  ["Sales & Marketing Rep", "sales-and-marketing-rep"],
  ["QA", "qa-job"],
  ["Analytics", "analytics-job"],
  ["", ""],
  ["(Remote)", "remote"],
  // A cut at a word never leaves a small word dangling.
  ["Customer Experience Representative for Night Shift Weekends", "customer-experience-representative"],
  ["Senior Customer Experience and Player Support Specialist for Night Shifts", "senior-customer-experience-and-player"],
];
for (const [title, expected] of suggestions) {
  check(`"${title}" → "${expected}"`, suggestJobSlug(title) === expected, `got "${suggestJobSlug(title)}"`);
}
{
  const long = "Senior Customer Experience and Player Support Specialist for Night Shifts";
  const s = suggestJobSlug(long);
  check(`a long title is cut to 40 at a word ("${s}")`, s.length <= 40 && !s.endsWith("-") && long.toLowerCase().replace(/ /g, "-").startsWith(s));
  const titles = [
    long, "Line Cook", "Customer Support Chat Agent (Zulu Royal & Zulu Rush)", "Ünïcödé Jöb Títle", "!!!",
    "a b", "Dashboard", "Jobs", "Help Desk", "x".repeat(80), "Night-Shift Supervisor -- Remote",
  ];
  const bad = titles.map((t) => [t, suggestJobSlug(t)]).filter(([, s]) => s !== "" && slugProblem(s) !== null);
  check("every suggestion is a name the editor accepts", bad.length === 0, JSON.stringify(bad));
}
{
  const c = slugCandidates("team-lead", 4);
  check("next names: team-lead, team-lead-2, -3, -4", same(c, ["team-lead", "team-lead-2", "team-lead-3", "team-lead-4"]));
  const longBase = suggestJobSlug("x".repeat(80));
  check("next names never grow past 40", slugCandidates(longBase, 12).every((n) => n.length <= 40 && slugProblem(n) === null));
}

// ---------------------------------------------------------------------------
console.log("\nThe reserved list covers every path the site serves");
const app = await read("src/App.tsx");
const routePaths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const topSegments = [...new Set(routePaths.map((p) => p.split("/")[1]).filter((s) => s && !s.startsWith(":") && s !== "*"))];
check(`read ${topSegments.length} top-level segments from App.tsx`, topSegments.length >= 25);
const unreserved = topSegments.filter((s) => !RESERVED_SLUGS.has(s));
check("every top-level route in App.tsx is reserved", unreserved.length === 0, `missing: ${unreserved.join(", ")}`);
check("and ROUTE_SEGMENTS lists exactly those (no stale entries)", same([...ROUTE_SEGMENTS].sort(), [...topSegments].sort()), `extra: ${ROUTE_SEGMENTS.filter((s) => !topSegments.includes(s)).join(", ")}`);
for (const name of ["api", "assets", "sitemap.xml", "jobs.xml", "adzuna.xml", "jooble.xml", "robots.txt", "favicon.ico", "manifest.webmanifest"]) {
  check(`"${name}" is reserved (docs/SHORT-JOB-LINKS.md §4)`, RESERVED_SLUGS.has(name));
}
{
  const publicNames = (await readdir(path.join(ROOT, "public"))).filter((n) => SLUG_PATTERN.test(n));
  const loose = publicNames.filter((n) => !RESERVED_SLUGS.has(n));
  check("every slug-shaped file or folder in public/ is reserved", loose.length === 0, loose.join(", "));
  const vercel = JSON.parse(await read("vercel.json"));
  const rewritten = vercel.rewrites.map((r) => r.source.split("/")[1]).filter((s) => s && !s.startsWith(":"));
  const looseRewrites = rewritten.filter((s) => !RESERVED_SLUGS.has(s) && !topSegments.includes(s));
  check("every vercel.json rewrite's first segment is reserved", looseRewrites.length === 0, looseRewrites.join(", "));
}
check("held-back words are reserved too", HELD_BACK.every((w) => RESERVED_SLUGS.has(w)) && SITE_PATHS.every((w) => RESERVED_SLUGS.has(w)));

// The database checks only the name's shape, so a name written without the
// editor could be one of the site's own paths. Such a name is no short link.
check("usableSlug: a real name passes", usableSlug("team-lead") === "team-lead");
check("usableSlug: a site path, a held-back word or a bad shape is no short link", usableSlug("dashboard") === null && usableSlug("careers") === null && usableSlug("Team_Lead") === null && usableSlug(null) === null);
check("a job named after a site path keeps its old link everywhere", jobPagePath({ id: "j9", slug: "auth" }) === "/candidate/job/j9" && shortLinkFor({ slug: "login" }) === null && jobShareLink("https://hireflownow.com", { id: "j9", slug: "jobs", roleCode: "JOB-1" }) === "https://hireflownow.com/candidate/apply?code=JOB-1" && rootDestination([{ id: "j9", slug: "apply" }]) === "/candidate/job/j9");

// ---------------------------------------------------------------------------
console.log("\nReact Router: every existing route still wins over /:slug");
{
  check("App.tsx registers /:slug", routePaths.includes("/:slug"));
  check(
    "only on the candidates' site",
    /\{!isStaffHost\(\) && <Route path="\/:slug" element=\{<JobDetails \/>\} \/>\}/.test(app) && /import \{ isStaffHost \} from "@\/lib\/hosts";/.test(app),
  );
  const slugAt = app.indexOf('path="/:slug"');
  const catchAllAt = app.indexOf('path="*"');
  check("and above the catch-all", slugAt > 0 && catchAllAt > slugAt);

  // Ask React Router itself, with the app's own paths (flattened: ranking does
  // not depend on the layout routes, which carry no path).
  const candidateRoutes = routePaths.map((p) => ({ path: p }));
  const staffRoutes = candidateRoutes.filter((r) => r.path !== "/:slug");
  const winner = (routes, url) => matchRoutes(routes, url)?.at(-1)?.route.path ?? null;
  const losers = [];
  for (const p of routePaths) {
    if (p === "*" || p === "/:slug") continue;
    const concrete = p.replace(/:[^/]+/g, "x");
    if (winner(candidateRoutes, concrete) !== p) losers.push(`${concrete} → ${winner(candidateRoutes, concrete)}`);
  }
  check(`all ${routePaths.length - 2} other routes still open their own page`, losers.length === 0, losers.join("; "));
  check("/team-lead opens the job page", winner(candidateRoutes, "/team-lead") === "/:slug");
  check("/no-such-role opens the job page (its 'this role isn't open' state)", winner(candidateRoutes, "/no-such-role") === "/:slug");
  check("/team-lead/ (trailing slash) opens the job page", winner(candidateRoutes, "/team-lead/") === "/:slug");
  check("/a/b (two segments) is still NotFound", winner(candidateRoutes, "/a/b") === "*");
  check("staff host: /no-such-page is NotFound", winner(staffRoutes, "/no-such-page") === "*");
  check("staff host: /team-lead is NotFound (the short link is the candidates' site)", winner(staffRoutes, "/team-lead") === "*");
}

// ---------------------------------------------------------------------------
console.log("\nThe two front doors leave a short link alone (src/lib/hosts.ts)");
{
  const origins = { candidate: "https://hireflownow.com", staff: "https://staff.hireflownow.com" };
  const base = { rest: "", authLoading: false, signedIn: false, role: null };
  // Names that start like a staff or candidate path but are not one.
  for (const p of ["/team-lead", "/jobs-coordinator", "/apply-now", "/candidates-desk", "/applicants-lead"]) {
    check(`${p} is neither side's path`, !isStaffOnlyPath(p) && !isCandidateOnlyPath(p) && !isSharedPrivatePath(p));
    check(`${p} stays on hireflownow.com with the staff split on`, hostRedirect({ ...base, hostname: "hireflownow.com", path: p, splitOn: true }, origins) === null);
  }
}

// ---------------------------------------------------------------------------
console.log("\nThe root: 0, 1 or many open jobs");
check("no open jobs → the careers page (its empty state)", rootDestination([]) === null);
check("no data yet → stay", rootDestination(undefined) === null && rootDestination(null) === null);
check("one open job with a short link → /team-lead", rootDestination([{ id: "j1", slug: "team-lead" }]) === "/team-lead");
check("one open job without one → its job page", rootDestination([{ id: "j1", slug: null }]) === "/candidate/job/j1");
check("several open jobs → the careers page lists them", rootDestination([{ id: "j1", slug: "a-job" }, { id: "j2", slug: "b-job" }]) === null);
check("each listed role links to its short link", jobPagePath({ id: "j2", slug: "b-job" }) === "/b-job" && jobPagePath({ id: "j3" }) === "/candidate/job/j3");
{
  const index = await read("src/pages/Index.tsx");
  check("Index.tsx goes to the one job with replace", /rootDestination\(roles\)/.test(index) && /navigate\(singleRole, \{ replace: true \}\)/.test(index));
  check("Index.tsx reads the whole row and links roles by jobPagePath", /\.from\("published_jobs_public"\)\s*\.select\("\*"\)/.test(index) && /<Link to=\{jobPagePath\(job\)\}/.test(index));
  check("...and hands the one role to the job page, which opens without a skeleton", /queryClient\.setQueryData\(\["job-details", slug \? `slug:\$\{slug\}` : only\.id, true\], only\)/.test(index));
  check("the root's waiting ground follows the theme (not the always-Night careers ground)", /className="grid min-h-\[100dvh\] place-items-center bg-background" aria-busy="true"/.test(index));
}

// ---------------------------------------------------------------------------
console.log("\nOld links forward to the short link");
check("a job with a slug → its short link", shortLinkFor({ slug: "team-lead" }) === "/team-lead");
check("a job without → stay on the old page", shortLinkFor({ slug: null }) === null && shortLinkFor(null) === null);
check("/Team-Lead finds team-lead", slugFromParam("Team-Lead") === "team-lead");
check("a path that cannot be a name finds nothing", slugFromParam("no_such.role") === null && slugFromParam("") === null && slugFromParam(undefined) === null);
{
  const code = await read("src/pages/ApplyWithCode.tsx");
  check("/candidate/apply?code=X reads slug and forwards", /select\("id, slug, /.test(code) && /const shortLink = shortLinkFor\(data\)/.test(code));
  check("a code from the link REPLACES the entry (Back never lands on the code box)", /navigate\(shortLink, fromLink \? \{ replace: true \} : undefined\)/.test(code) && /handleSearch\(normalizedInitialCode, true\)/.test(code));
  check("the forward happens before the deadline check (the job page says closed itself)", code.indexOf("shortLinkFor(data)") < code.indexOf("isPast(new Date(data.application_deadline))"));
  const job = await read("src/pages/JobDetails.tsx");
  check("/candidate/job/:id forwards to the short link with replace", /navigate\(`\$\{forwardTo\}\$\{location\.search\}\$\{location\.hash\}`, \{ replace: true \}\)/.test(job));
  check("...but not on the staff host", /shortPath && !isStaffHost\(\) && location\.pathname !== shortPath/.test(job));
  check("...and never to a name the site cannot open", /const shortPath = shortLinkFor\(job\);/.test(job));
  check("the job page reads by slug on the short link", /base\.eq\("slug", lookupSlug!\)/.test(job));
}

// ---------------------------------------------------------------------------
console.log("\nApply → sign in → the form, and Back");
check("Apply carries ?apply=1 back from sign-in", withApplyAsk("/team-lead") === "/team-lead?apply=1" && withApplyAsk("/x?y=1") === "/x?y=1&apply=1");
check("sign-in's way back: the job, without the ask", jobPageFromRedirect("/team-lead?apply=1") === "/team-lead");
check("...for an old job link too", jobPageFromRedirect("/candidate/job/abc?apply=1") === "/candidate/job/abc");
check("...never into the signed-in steps (that would loop to sign-in)", jobPageFromRedirect("/applications/abc") === null && jobPageFromRedirect("/applications") === null);
check("...never off the site", jobPageFromRedirect("//evil.example") === null && jobPageFromRedirect("https://evil.example/x") === null && jobPageFromRedirect(null) === null);
{
  const job = await read("src/pages/JobDetails.tsx");
  const start = job.indexOf("const handleStartApplication = async () => {");
  const body = job.slice(start, job.indexOf("const isLoading", start));
  check("a stranger's Apply goes to /candidate/auth with the ask, on Sign Up", /navigate\(`\/candidate\/auth\?redirect=\$\{encodeURIComponent\(withApplyAsk\(jobPagePath\(job\)\)\)\}&tab=signup`\)/.test(body));
  check("an automatic start replaces every move", /const go = \(to: string\) => navigate\(to, automatic \? \{ replace: true \} : undefined\)/.test(body) && /go\(`\/applications\/\$\{newApp\.id\}\/application\/application`\)/.test(body) && /go\(`\/applications\/\$\{existingApp\.id\}`\)/.test(body));
  check("the ask is answered once, only on the job's own page, only for a signed-in candidate", /if \(!wantsToApply \|\| autoStartedRef\.current \|\| authLoading \|\| !job \|\| forwardTo\) return;/.test(job) && /if \(user && role === "candidate" && !isDeadlinePassed\)/.test(job));
  check("a stranger sees no 'Back to Apply' (the code box)", !/"Back to Apply"\s*\}/.test(job.slice(job.indexOf("return (\n    <>"))));
  check("a stranger's loading skeleton has no Back-button bar", /\{\(isEmployer \|\| role === "candidate"\) && <Skeleton className="h-8 w-32" \/>\}/.test(job));
  check("the job code is shown to the team only", /\{isEmployer && job\.job_code && \(/.test(job));
  check("'See open roles' points forward", /See open roles\s*<ArrowRight/.test(job));
  check("on a phone, Apply follows the reader down a long page", /data-testid="sticky-apply"/.test(job) && /ref=\{mobileApplyRef\}/.test(job) && /const stickyApply = standalone && !isEmployer && !isDeadlinePassed;/.test(job));

  const auth = await read("src/pages/CandidateAuth.tsx");
  check("sign-in moves on with replace", /navigate\(nextRoute, \{ replace: true(, state: AFTER_SIGN_IN_STATE)? \}\)/.test(auth));
  const reset = auth.slice(auth.indexOf("const handleSetNewPassword"), auth.indexOf("const handleSignIn"));
  check("a password reset moves on with replace, to where they were going", /const target = safeRedirectTarget \?\? stashed;/.test(reset) && /navigate\(target, \{ replace: true \}\)/.test(reset));
  check("...and with nowhere in particular, to their own home (never /candidate's code box)", /await routeAuthenticatedUser\(\);/.test(reset) && !/"\/candidate"/.test(reset));
  const forgot = auth.slice(auth.indexOf("const handleForgotPassword"), auth.indexOf("if (authLoading || isRedirecting)"));
  check("asking for a reset keeps the job, in this browser AND in the link", /stashResetRedirect\(safeRedirectTarget\);/.test(forgot) && /&redirect=\$\{encodeURIComponent\(safeRedirectTarget\)\}/.test(forgot));
  check("sign-in names the job instead of 'Candidate Portal' when Apply sent them", /backToJob \? \(applyingForTitle \? "Applying for" : "Your application"\) : "Candidate Portal"/.test(auth));
  const routing = await read("src/lib/authRouting.ts");
  check("a signed-in candidate's home is their applications, not the code box", /if \(role === "candidate"\) \{\s*return "\/applications";/.test(routing));
  const applications = await read("src/pages/Applications.tsx");
  check("no applications yet: 'See open roles', not 'Enter Job Code'", /label: "See open roles",\s*onClick: \(\) => navigate\("\/"\)/.test(applications) && !/navigate\("\/apply"\)/.test(applications));
  check("sign-in's back link is the job when Apply sent them", /to=\{backToJob \?\? "\/candidate"\}/.test(auth));

  const callback = await read("src/pages/AuthCallback.tsx");
  check("the auth callback moves on with replace", /navigate\(requested && role === portalRole \? requested : route, \{ replace: true(, state: AFTER_SIGN_IN_STATE)? \}\)/.test(callback));

  const card = await read("src/components/candidate/NextStepCard.tsx");
  check("'Start <next step>' replaces the sent step", /window\.location\.replace\(route\)/.test(card) && /window\.location\.replace\(nextRoute\)/.test(card) && /navigate\(nextRoute, \{ replace: true \}\)/.test(card) && !/location\.assign\(/.test(card));

  const gate = await read("src/components/candidate/CandidateStepGate.tsx");
  check("the step gate's refusals replace their entry", /navigate\("\/applications", \{ replace: true \}\)/.test(gate) && /navigate\(`\/applications\/\$\{applicationId\}`, \{ replace: true \}\)/.test(gate));

  const stepPages = ["ApplicationFormPhase", "TypingTestPhase", "ConnectionCheckPhase", "QuizPhase", "VideoIntroPhase", "PortfolioUploadPhase"];
  for (const page of stepPages) {
    const text = await read(`src/pages/${page}.tsx`);
    check(`${page}: the hop after a send replaces`, !/^\s+navigate\(`\/applications\/\$\{id\}`\);$/m.test(text) && /navigate\(`\/applications\/\$\{id\}`, \{ replace: true \}\)/.test(text));
  }
}

// ---------------------------------------------------------------------------
console.log("\nThe share-link builder");
const ORIGIN = "https://hireflownow.com";
check("a slug → the short link", jobShareLink(ORIGIN, { id: "j1", slug: "team-lead", roleCode: "JOB-C84E85" }) === "https://hireflownow.com/team-lead");
check("no slug, a code → the code link it always had", jobShareLink(ORIGIN, { id: "j1", roleCode: "JOB-C84E85" }) === "https://hireflownow.com/candidate/apply?code=JOB-C84E85");
check("neither → the job page", jobShareLink(ORIGIN, { id: "j1" }) === "https://hireflownow.com/candidate/job/j1");
check("a code is URL-encoded", applyWithCodePath("A B&C") === "/candidate/apply?code=A%20B%26C");
{
  const shareCard = await read("src/cockpit/components/ShareJobCard.tsx");
  check("ShareJobCard: applyLinkFor and 'see it' go through the shared builder", /return jobShareUrl\(job\);/.test(shareCard) && /window\.open\(jobPageUrl\(job\)/.test(shareCard) && !/candidate\/job\//.test(shareCard));
  const kit = await read("src/cockpit/components/ShareKitDialog.tsx");
  const mappers0 = await read("src/cockpit/lib/mappers.ts");
  check("Share Kit: a job with a short link is shared by it, whoever opened the kit", /const applyUrl = shortLinkFor\(job\) \? jobShareUrl\(job\) : callerUrl;/.test(kit));
  check("Share Kit: the QR code, flyer, copy and post all use that one link", /<QRCodeCanvas value=\{applyUrl\}/.test(kit) && /printFlyer\(job, applyUrl,/.test(kit) && /copy\(applyUrl, "link"\)/.test(kit) && /buildPostText\(job, applyUrl\)/.test(kit));
  const prose = kit.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
  check("the ready-to-paste post is true: no '3 minutes', no 'no account needed'", !/3 minutes/i.test(prose) && !/no account needed/i.test(prose));
  check("it says what is true, in the owner's words", /"It's all online, on your computer\. Apply here:"/.test(kit) && /"It's all online, on your computer\."/.test(kit));
  check("...and only for a job with computer steps (an in-person job gets the plain line)", /job\.onComputer \? SHARE_POST_LEAD : SHARE_POST_LEAD_PLAIN/.test(kit) && /\$\{job\.onComputer \? `<div class="sub">/.test(kit));
  check("computer steps are the connection check and the tests that matter", [...COMPUTER_STEP_TYPES].sort().join() === "chat_interview,chat_simulation,equipment_check,sales_simulation,typing_test,voice_interview");
  check("a job's computer steps are read from its own workflow", hasComputerSteps([{ type: "quiz" }, { type: "typing_test" }]) && !hasComputerSteps([{ type: "portfolio_upload" }, { type: "video_intro" }]) && !hasComputerSteps(null) && !hasComputerSteps("x"));
  check("the job row carries it to the kit", /onComputer: hasComputerSteps\(job\.workflow_steps\),/.test(mappers0));
  check("Print flyer opens a window it can write to (no 'noopener', which makes window.open return null)", /window\.open\("", "_blank", "width=800,height=1000"\)/.test(kit) && !/noopener/.test(kit.replace(/\/\/.*$/gm, "")) && /w\.opener = null;/.test(kit));
  check("the kit no longer says Google was told", !/Google/.test(prose));
  check("the link breaks after its last slash, never inside the job's name", /<LinkText url=\{applyUrl\.replace/.test(kit) && /<LinkText url=\{applyUrl\} \/>/.test(kit) && !/break-all/.test(kit));
  const jobs = await read("src/cockpit/pages/Jobs.tsx");
  check("Jobs page: the Share link uses the shared builder", /applyUrl=\{kitJob \? jobShareUrl\(kitJob\) : ""\}/.test(jobs) && !/candidateApplyUrl/.test(jobs));
  check("Jobs page: deleting a role says its short link stops working", /const link = shortLinkFor\(job\)/.test(jobs) && /stops working too, including links and flyers you already shared/.test(jobs));
  const mappers = await read("src/cockpit/lib/mappers.ts");
  check("the job row carries slug next to its code", /roleCode: job\.job_code \?\? null,\s*\n\s*slug: job\.slug \?\? null,/.test(mappers));
  const published = await read("src/components/JobPublishedDialog.tsx");
  check("the publish dialog shares the job page by its short link", /const shareLink = job \? jobPageUrl\(job\) : "";/.test(published));
  const ava = await read("src/pages/AvaCreateJob.tsx");
  check("a job published through Ava gets a short link", /claimSuggestedSlug\(created\.id, created\.title\)/.test(ava));
  const head = await read("src/components/seo/JobPageHead.tsx");
  const prerender = await read("api/job-prerender.mjs");
  // Until /<slug> has its own prerender it is served the plain shell, whose
  // canonical and og:url are the homepage: naming it would send search and
  // link previews from the job to the homepage (docs/SHORT-JOB-LINKS.md §7).
  check("the canonical stays /candidate/job/:id (client)", /const url = `\$\{CANONICAL_ORIGIN\}\/candidate\/job\/\$\{job\.id\}`;/.test(head) && !/jobPagePath/.test(head));
  check("the canonical and og:url stay /candidate/job/:id (prerender)", /const url = `\$\{origin\}\/candidate\/job\/\$\{job\.id\}`;/.test(prerender) && !/\$\{origin\}\/\$\{job\.slug\}/.test(prerender));
  const types = await read("src/integrations/supabase/types.ts");
  const jobsBlock = types.slice(types.indexOf("      jobs: {"), types.indexOf("      Relationships", types.indexOf("      jobs: {")));
  const viewBlock = types.slice(types.indexOf("      published_jobs_public: {"), types.indexOf("Relationships", types.indexOf("      published_jobs_public: {")));
  check("types: jobs has slug in Row, Insert and Update", (jobsBlock.match(/\bslug\??: string \| null/g) ?? []).length === 3);
  check("types: published_jobs_public has slug", (viewBlock.match(/\bslug\??: string \| null/g) ?? []).length === 3);
}

// ---------------------------------------------------------------------------
console.log("\nSaving the name");
check("the unique index → 'taken'", slugSaveProblem({ code: "23505", message: 'duplicate key value violates unique constraint "jobs_slug_unique"' }) === "taken");
check("the format check → 'format'", slugSaveProblem({ code: "23514", message: 'new row for relation "jobs" violates check constraint "jobs_slug_format"' }) === "format");
check("any other error is not the name's", slugSaveProblem({ code: "23505", message: "jobs_pkey" }) === null && slugSaveProblem(null) === null && slugSaveProblem(new Error("x")) === null);
{
  // Every insert that copies a job row must leave the unique slug behind, or
  // copying any job with a short link fails (Ava's duplicate_job did).
  const tools = await read("supabase/functions/ava-voice-tools/index.ts");
  const dup = tools.slice(tools.indexOf('case "duplicate_job":'), tools.indexOf("break;", tools.indexOf('case "duplicate_job":')));
  check("duplicating a job does not copy its short link", /const \{ id, created_at, updated_at, job_code, slug: _slug, \.\.\.jobData \} = job;/.test(dup) && /\.\.\.jobData,/.test(dup));
}
check("the sign-in screen can name the job from its page path", same(jobRefFromPagePath("/team-lead"), { slug: "team-lead" }) && same(jobRefFromPagePath("/candidate/job/abc"), { id: "abc" }) && jobRefFromPagePath("/dashboard") === null && jobRefFromPagePath(null) === null);
{
  const editor = await read("src/pages/CreateJob.tsx");
  const saveStart = editor.indexOf("// #region job-edit-save");
  const saveBlock = editor.slice(saveStart, editor.indexOf("// #endregion job-edit-save"));
  check("an edit writes slug only when it changed (it is its own column in the edit map)", /\n  slug: \["slug"\],/.test(saveBlock));
  check("the loaded snapshot holds the job's slug", /slug: existingJob\.slug \?\? ""/.test(editor));
  check("the job row carries the name (empty = no short link)", /\n        slug: slug \|\| null,/.test(editor));
  check("the field is on create AND edit (step 0, not behind isEditMode)", /data-testid="short-link-field"/.test(editor) && /<Label htmlFor="slug">Short link<\/Label>/.test(editor));
  check("a new job's name follows its title until typed in", /if \(slugFollowsTitle\) setSlug\(suggestJobSlug\(formData\.title\)\)/.test(editor) && /useState\(!isEditMode\)/.test(editor));
  check("a save the database refuses shows the field's own words", /slugSaveProblem\(error\)/.test(editor) && /SLUG_MESSAGES\[slugIssue\]/.test(editor));
  check("a name the database refused stays refused (the browser's check cannot see that job)", /slug && \(slugTaken === slug \|\| refusedSlugs\.has\(slug\)\)/.test(editor) && /setRefusedSlugs\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.refusedThisSave, slug\]\)\)/.test(editor));
  check("a refused SUGGESTION moves on to the next name by itself", /createJob\.mutateAsync\(\{ \.\.\.jobData, slug: name \|\| null \}\)/.test(editor) && /slugCandidates\(suggestJobSlug\(formData\.title\), 8\)/.test(editor));
  check("renaming or removing a live short link warns on the field and asks before saving", /const slugLeaving = isEditMode && !!loadedSlug && slug !== loadedSlug;/.test(editor) && /will stop working\. Links, QR codes and flyers you already shared/.test(editor) && /setPendingSlugChange\(\{ status, companyNameOverride \}\)/.test(editor));
  check("the field's error and its focus ring agree", /slugError \? "border-destructive focus-within:ring-destructive" : "border-input focus-within:ring-ring"/.test(editor));
  check("the empty field's placeholder is plainly an example", /placeholder="your-job-name"/.test(editor) && /placeholder:italic/.test(editor));
  check("the help line spells out the whole link (a long name is cut in the box on a phone)", /The link you share: <span className="font-medium text-foreground">\{linkHost\}\/\{slug\}<\/span>/.test(editor));
  check("a bad name stops the save before anything is written", editor.indexOf("if (slugError) {") > editor.indexOf("const handleSubmit = async") && editor.indexOf("if (slugError) {") < editor.indexOf("const jobData = {"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
