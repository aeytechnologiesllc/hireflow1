/**
 * api/page-prerender.mjs: the first HTML of /open-jobs, /privacy and /terms
 * carries each page's own title, description and canonical (the Phase 7
 * growth audit, round 2: before scripts ran they said "HireFlow" and "Apply
 * for jobs online…", with no canonical). Run against a stand-in shell: no
 * network.
 *
 *   - each page's head says the same words the page sets once it runs;
 *   - the shell's own title, description, share tags and canonical are
 *     replaced, never doubled;
 *   - the legal pages carry no picture (they show no brand);
 *   - an unknown page, or any failure, is the plain shell;
 *   - vercel.json sends the three addresses here, before the crawler rule.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler, { PAGES, inject } from "../api/page-prerender.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const SHELL =
  '<!doctype html><html><head><title>HireFlow</title><meta name="description" content="Apply for jobs online" />' +
  '<meta property="og:title" content="HireFlow" /><meta property="og:image" content="https://hireflownow.com/share/x.jpg" />' +
  '<meta name="twitter:card" content="summary_large_image" /><link rel="canonical" href="https://hireflownow.com/" />' +
  '</head><body><div id="root"></div></body></html>';

let shellStatus = 200;
globalThis.fetch = async (url) => {
  if (String(url) === "https://hireflownow.com/index.html") return new Response(shellStatus === 200 ? SHELL : "", { status: shellStatus });
  throw new Error(`unexpected fetch ${url}`);
};
async function run(query) {
  const res = { statusCode: 0, body: "", headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = String(b ?? ""); } };
  await handler({ query }, res);
  return res;
}
const count = (text, re) => (text.match(re) ?? []).length;

const openJobs = read("src/pages/OpenJobs.tsx");
const legal = read("src/content/legal.ts");
const head = /usePageHead\(\{\s*title: "([^"]+)",\s*path: "([^"]+)",\s*description: "([^"]+)"/.exec(openJobs);
check("Open jobs: the same title, address and description the page sets", head && PAGES["open-jobs"].title === head[1] && PAGES["open-jobs"].path === head[2] && PAGES["open-jobs"].description === head[3], JSON.stringify(head?.slice(1)));
for (const [key, docTitle] of [["privacy", "Privacy Policy"], ["terms", "Terms and Conditions"]]) {
  const at = legal.indexOf(`title: "${docTitle}"`);
  const intro0 = at < 0 ? null : JSON.parse(/intro: \[\s*("(?:[^"\\]|\\.)*")/.exec(legal.slice(at))?.[1] ?? "null");
  check(`${docTitle}: the document's own title and first line (no company name, as the page)`, PAGES[key].title === docTitle && PAGES[key].description === intro0 && PAGES[key].path === `/${key}`, JSON.stringify([PAGES[key], intro0]));
}

for (const key of Object.keys(PAGES)) {
  const res = await run({ page: key });
  const page = PAGES[key];
  const b = res.body;
  check(`/${key}: 200 with its own title`, res.statusCode === 200 && b.includes(`<title>${page.title}</title>`) && count(b, /<title>/g) === 1);
  check(`/${key}: its own canonical, once`, b.includes(`<link rel="canonical" href="https://hireflownow.com${page.path}" />`) && count(b, /rel="canonical"/g) === 1);
  check(`/${key}: its own description, once, for search and share previews`, count(b, /<meta name="description"/g) === 1 && !b.includes("Apply for jobs online") && count(b, /og:title/g) === 1);
  check(`/${key}: the app still boots`, b.includes('<div id="root"></div>'));
}
check("Open jobs carries the share picture and HireFlow's site name (the third growth review)", (await run({ page: "open-jobs" })).body.includes('og:image" content="https://hireflownow.com/share/hireflow.jpg"') && (await run({ page: "open-jobs" })).body.includes('og:site_name" content="HireFlow"'));
const privacy = (await run({ page: "privacy" })).body;
check("…the legal pages carry none (they show no brand)", !/og:image/.test(privacy) && !/og:site_name/.test(privacy) && /twitter:card" content="summary"/.test(privacy));
check("an unknown page is the plain shell", (await run({ page: "admin" })).body === SHELL && (await run({ page: "__proto__" })).body === SHELL);
shellStatus = 500;
const broken = await run({ page: "privacy" });
check("no shell: a plain page, never an error", broken.statusCode === 200 && /<title>HireFlow<\/title>/.test(broken.body));
check("escapes what it writes", inject("<head></head>", { title: 'A "b" <c>', description: "d & e", path: "/x" }).includes("A &quot;b&quot; &lt;c&gt;"));

const rewrites = JSON.parse(read("vercel.json")).rewrites;
const at = (source) => rewrites.findIndex((r) => r.source === source);
for (const key of Object.keys(PAGES)) {
  check(`vercel.json sends /${key} here, before the crawler rule and the app`, at(`/${key}`) >= 0 && rewrites[at(`/${key}`)].destination === `/api/page-prerender?page=${key}` && at(`/${key}`) < at("/:slug") && at(`/${key}`) < at("/:path+"));
}

// The fourth growth review: short addresses a video can say, and a business's guesses.
const redirects = JSON.parse(read("vercel.json")).redirects ?? [];
// A redirect's `source` as Vercel matches it (path-to-regexp, case-sensitive):
// a "( … )" group is a regular expression, everything else is literal. A
// named segment (":name") is not used here and fails the test.
function sourceMatches(source, pathname) {
  let re = "";
  for (let i = 0; i < source.length; ) {
    if (source[i] === "(") {
      let depth = 0;
      let j = i;
      for (; j < source.length; j += 1) {
        if (source[j] === "(") depth += 1;
        else if (source[j] === ")" && (depth -= 1) === 0) break;
      }
      re += source.slice(i, j + 1);
      i = j + 1;
    } else if (source[i] === ":" || source[i] === "*" || source[i] === "+" || source[i] === "?") {
      throw new Error(`unexpected source ${source}`);
    } else {
      re += source[i].replace(/[.^$|[\]{}\\/-]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${re}$`).test(pathname);
}
const to = (pathname) => redirects.find((r) => sourceMatches(r.source, pathname));
for (const [name, dest] of [["/youtube", "/?utm_source=youtube&utm_medium=video"], ["/tiktok", "/?utm_source=tiktok&utm_medium=video"], ["/facebook", "/?utm_source=facebook&utm_medium=social"], ["/fb", "/?utm_source=facebook&utm_medium=social"]]) {
  check(`${name} lands on the front page tagged (${dest})`, to(name)?.destination === dest && to(name)?.permanent === false);
}
// The sixth growth review: "/YouTube" missed the exact-name redirect, reached
// the app, and was forwarded from inside it, so the front page took it for a
// move inside the site and dropped the tags.
check("…in any capitals, before the app loads (the sixth growth review)", to("/YouTube")?.destination === "/?utm_source=youtube&utm_medium=video" && to("/TikTok")?.destination === "/?utm_source=tiktok&utm_medium=video" && to("/YT")?.destination === "/?utm_source=youtube&utm_medium=video" && to("/LinkedIn")?.destination === "/?utm_source=linkedin&utm_medium=social" && to("/Sign-Up")?.destination.startsWith("https://staff.hireflownow.com/auth?mode=signup") && to("/POST-A-JOB")?.destination.startsWith("https://staff.hireflownow.com/auth?mode=signup"));
check("…and nothing else: a job's own name, a longer word or a deeper path is not a short way", !to("/team-lead") && !to("/youtubers") && !to("/my-youtube") && !to("/youtube/x") && !to("/signupx") && !to("/sign_up") && !to("/"));
check("a business's guesses reach the sign-up or sign-in page, or the front page", to("/signup")?.destination.startsWith("https://staff.hireflownow.com/auth?mode=signup") && to("/post-a-job")?.destination.startsWith("https://staff.hireflownow.com/auth?mode=signup") && to("/login")?.destination === "https://staff.hireflownow.com/auth" && to("/pricing")?.destination === "/");
check("…never on the staff site", redirects.length > 0 && redirects.every((r) => r.missing?.some((m) => m.type === "host" && m.value === "staff.hireflownow.com")));
const slugLib = read("src/lib/jobSlug.ts");
let shortNames = [];
{
  const { build } = await import("esbuild");
  const out = await build({ entryPoints: [path.join(ROOT, "src/lib/shortWays.ts")], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent" });
  const W = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  shortNames = Object.keys(W.SHORT_WAYS_IN);
  check("the app's list of short ways in is exactly vercel.json's redirects, each source made by shortWaySource (the fifth and sixth growth reviews)", shortNames.length === redirects.length && Object.entries(W.SHORT_WAYS_IN).every(([name, dest]) => redirects.some((r) => r.source === W.shortWaySource(name) && r.destination === dest)));
  check("…shortWaySource spells each letter both ways", W.shortWaySource("yt") === "/([yY][tT])" && W.shortWaySource("sign-up") === "/([sS][iI][gG][nN]-[uU][pP])");
  check("…and the job page sends them in any capitals", W.shortWayIn("YouTube") === "/?utm_source=youtube&utm_medium=video" && W.shortWayIn("Signup")?.startsWith("https://staff.hireflownow.com/auth?mode=signup") && W.shortWayIn("front-desk") === null && /const shortWay = !id && businessParam === undefined \? shortWayIn\(slugParam\) : null;/.test(read("src/pages/JobDetails.tsx")));
}
check("…and no job can take one of those names", shortNames.length > 0 && shortNames.every((name) => new RegExp(`"${name}"`).test(slugLib)) && shortNames.every((name) => read("api/job-prerender.mjs").includes(`"${name}"`)));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
